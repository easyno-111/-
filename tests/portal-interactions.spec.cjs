/* Run: node tests/portal-interactions.spec.cjs
 * Uses Playwright from the project or CODEX_PRIMARY_RUNTIME_NODE_MODULES.
 * Firebase is replaced with deterministic, read-only browser fixtures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch {
  const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if (!modules) throw new Error('Install playwright and run npx playwright install chromium first.');
  playwright = require(path.join(modules, 'playwright'));
}

const ROOT = path.resolve(__dirname, '..');
const ORDER_KEY = 'teacherPortalAppOrderV1';
const apps = {};
for (let i = 1; i <= 18; i++) {
  const id = `app${i}`;
  apps[id] = {
    title: `수업 도구 ${i}`, description: `${i}번 도구의 설명. 수업 시작에 함께 사용해요.`,
    category: i <= 10 ? 'tools' : 'games', order: i, color: '#487566', visible: true,
    primaryUrl: `/test-launched/${id}`, openMode: 'new'
  };
}
Object.assign(apps.app2, {
  primaryLabel: '교사용으로 열기', secondaryLabel: '학생용으로 참여',
  secondaryUrl: '/test-launched/student'
});
Object.assign(apps.app3, { primaryLabel: ' ', secondaryLabel: '', secondaryUrl: '/test-launched/blank-label' });
const fixture = {
  apps,
  categories: { tools: { name: '수업 도구', order: 1 }, games: { name: '교실 게임', order: 2 } },
  settings: { title: '수학 실험실', footer: '테스트 포털' }
};
const initialOrder = Object.keys(apps).filter(id => apps[id].category === 'tools');
let browser, server, baseURL;
const activeContexts = new Set();

async function setup(options = {}) {
  const { mobile = false, reducedMotion = 'no-preference', seed = {}, width } = options;
  const context = await browser.newContext({
    viewport: { width: width || (mobile ? 390 : 1280), height: mobile ? 760 : 900 },
    isMobile: mobile, hasTouch: mobile, reducedMotion, serviceWorkers: 'block'
  });
  context.setDefaultTimeout(7000);
  context.setDefaultNavigationTimeout(15000);
  activeContexts.add(context);
  await context.addInitScript(({ seed }) => {
    for (const [key, value] of Object.entries(seed)) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
    window.__launches = [];
    window.open = (url, target, features) => {
      window.__launches.push({ url, target, features });
      return null;
    };
  }, { seed });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/js/firebase-config.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: 'export const db = {};' });
    }
    if (url.hostname === 'www.gstatic.com' && url.pathname.endsWith('/firebase-database.js')) {
      return route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: `
        const fixtures = ${JSON.stringify(fixture)};
        export const ref = (db, path) => path;
        export function onValue(path, callback) {
          queueMicrotask(() => callback({ val: () => fixtures[path.split('/')[1]] }));
          return () => {};
        }
      ` });
    }
    if (url.origin !== new URL(baseURL).origin) {
      // External fonts and all unanticipated outside traffic are deliberately blocked.
      return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/test-launched/')) {
      return route.fulfill({ contentType: 'text/html', body: '<title>실행 완료</title><h1>실행 완료</h1>' });
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('.app-tile').first().waitFor();
  assert.equal(await page.locator('.app-tile').count(), 18);
  return { context, page, errors };
}

const tile = (page, id) => page.locator(`.app-tile[data-app-id="${id}"]`);
const opener = (page, id) => tile(page, id).locator('.app-tile-open');
const order = (page, category = 'tools') => page.locator(`[data-category-section="${category}"] .app-tile`).evaluateAll(nodes => nodes.map(node => node.dataset.appId));
const action = (page, name) => page.locator(`#appArrangeToolbar [data-reorder-action="${name}"]`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(condition, message, timeout = 2500) {
  const start = Date.now();
  do { if (await condition()) return; await sleep(25); } while (Date.now() - start < timeout);
  assert.fail(message);
}
async function closeScenario({ context, errors }) {
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await context.close();
  activeContexts.delete(context);
}
async function capture(page, name) {
  if (!process.env.PORTAL_TEST_ARTIFACTS) return;
  fs.mkdirSync(process.env.PORTAL_TEST_ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.PORTAL_TEST_ARTIFACTS, `${name}.png`), fullPage: true });
}
async function center(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function mouseDrag(page, from, to) {
  const a = await center(from), b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 16 });
  await page.mouse.up();
}

const tests = [
  ['desktop hover opens a stable, traversable explanation card', async () => {
    const s = await setup(); const { page } = s;
    const otherBefore = await tile(page, 'app3').boundingBox();
    await opener(page, 'app1').hover();
    const preview = page.locator('#appPreview');
    await preview.waitFor({ state: 'visible' });
    assert.match(await preview.innerText(), /1번 도구의 설명/);
    await preview.hover();
    await sleep(350);
    assert.ok(await preview.isVisible(), 'Moving into the card keeps it open');
    const otherAfter = await tile(page, 'app3').boundingBox();
    assert.equal(otherAfter.x, otherBefore.x); assert.equal(otherAfter.y, otherBefore.y);
    await capture(page, 'desktop-hover');
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'hidden' });
    await closeScenario(s);
  }],
  ['desktop keyboard opens details and Escape restores the app focus', async () => {
    const s = await setup(); const { page } = s;
    await opener(page, 'app1').focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('#launchChoiceDialog');
    await dialog.waitFor({ state: 'visible' });
    assert.match(await dialog.innerText(), /1번 도구의 설명/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await opener(page, 'app1').evaluate(node => node === document.activeElement));
    await closeScenario(s);
  }],
  ['mobile first tap explains; an explicit use action launches', async () => {
    const s = await setup({ mobile: true }); const { page, context } = s;
    const before = page.url();
    await opener(page, 'app1').tap();
    const dialog = page.locator('#launchChoiceDialog');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(page.url(), before);
    assert.equal(context.pages().length, 1);
    assert.deepEqual(await page.evaluate(() => window.__launches), []);
    assert.match(await dialog.innerText(), /1번 도구의 설명/);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Sheet fits narrow viewport');
    await capture(page, 'mobile-details');
    const launch = dialog.locator('a').filter({ hasText: /사용하기/ }).first();
    assert.equal(await launch.getAttribute('href'), apps.app1.primaryUrl);
    const popupPromise = context.waitForEvent('page');
    await launch.tap();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    assert.ok(popup.url().endsWith('/test-launched/app1'));
    await closeScenario(s);
  }],
  ['teacher and student destinations share the same details panel', async () => {
    const s = await setup({ mobile: true }); const { page } = s;
    await opener(page, 'app2').tap();
    const dialog = page.locator('#launchChoiceDialog');
    await dialog.waitFor({ state: 'visible' });
    const teacher = dialog.getByRole('link', { name: '교사용으로 열기' });
    const student = dialog.getByRole('link', { name: '학생용으로 참여' });
    assert.equal(await teacher.getAttribute('href'), apps.app2.primaryUrl);
    assert.equal(await student.getAttribute('href'), apps.app2.secondaryUrl);
    await page.keyboard.press('Escape');
    await opener(page, 'app3').tap();
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getByRole('link', { name: '사용하기', exact: true }).getAttribute('href'), apps.app3.primaryUrl);
    assert.equal(await dialog.getByRole('link', { name: '두 번째 화면 열기' }).getAttribute('href'), apps.app3.secondaryUrl);
    await closeScenario(s);
  }],
  ['frequent apps preserve direct launching', async () => {
    const s = await setup({ mobile: true, seed: { teacherPortalFavoritesV1: '["app1"]' } });
    const { page } = s;
    await page.locator('.quick-app-button').first().tap();
    assert.equal(await page.locator('#launchChoiceDialog').isVisible(), false);
    assert.equal((await page.evaluate(() => window.__launches))[0].url, apps.app1.primaryUrl);
    await closeScenario(s);
  }],
  ['keyboard arranging persists locally across reload and resets', async () => {
    const s = await setup(); const { page } = s;
    await action(page, 'edit').click();
    await opener(page, 'app1').focus();
    await page.keyboard.press('ArrowRight');
    await check(async () => (await order(page))[1] === 'app1', 'Arrow key changes order');
    assert.deepEqual((await order(page)).slice(0, 3), ['app2', 'app1', 'app3']);
    await action(page, 'done').click();
    assert.ok(await page.evaluate(key => localStorage.getItem(key), ORDER_KEY));
    await page.reload(); await tile(page, 'app1').waitFor();
    assert.deepEqual((await order(page)).slice(0, 3), ['app2', 'app1', 'app3']);
    await action(page, 'edit').click(); await action(page, 'reset').click();
    assert.deepEqual(await order(page), initialOrder);
    await action(page, 'done').click();
    await closeScenario(s);
  }],
  ['a separate browser profile keeps the original device order', async () => {
    const a = await setup(), b = await setup();
    await action(a.page, 'edit').click(); await opener(a.page, 'app1').focus();
    await a.page.keyboard.press('ArrowRight');
    await check(async () => (await order(a.page))[1] === 'app1', 'First profile reordered');
    assert.deepEqual(await order(b.page), initialOrder);
    await b.page.reload(); await tile(b.page, 'app1').waitFor();
    assert.deepEqual(await order(b.page), initialOrder);
    await closeScenario(a); await closeScenario(b);
  }],
  ['arranging search results preserves the unseen apps and reload order', async () => {
    const s = await setup(); const { page } = s;
    await page.locator('#searchInput').fill('수업 도구 1');
    assert.deepEqual(await order(page), ['app1', 'app10']);
    await action(page, 'edit').click();
    await opener(page, 'app1').focus(); await page.keyboard.press('ArrowRight');
    assert.deepEqual(await order(page), ['app10', 'app1']);
    await action(page, 'done').click();
    await page.locator('#searchInput').fill('');
    const expected = ['app10', ...initialOrder.slice(1, -1), 'app1'];
    assert.deepEqual(await order(page), expected);
    await page.reload(); await tile(page, 'app1').waitFor();
    assert.deepEqual(await order(page), expected);
    await closeScenario(s);
  }],
  ['long press enters arrange mode without opening or launching', async () => {
    const s = await setup(); const { page } = s;
    const p = await center(opener(page, 'app1'));
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(750); await page.mouse.up();
    assert.ok(await action(page, 'done').isVisible());
    assert.equal(await page.locator('#launchChoiceDialog').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.__launches), []);
    await page.keyboard.press('Escape');
    assert.ok(await action(page, 'edit').isVisible());
    await closeScenario(s);
  }],
  ['pointer dragging reorders only within the original category', async () => {
    const s = await setup(); const { page } = s;
    await action(page, 'edit').click();
    await mouseDrag(page, opener(page, 'app1'), opener(page, 'app3'));
    assert.notDeepEqual(await order(page), initialOrder, 'Pointer drag changes order');
    const before = await order(page), gamesBefore = await order(page, 'games');
    await mouseDrag(page, opener(page, 'app1'), opener(page, 'app11'));
    assert.deepEqual(await order(page), before, 'Other category is rejected');
    assert.deepEqual(await order(page, 'games'), gamesBefore);
    assert.equal(await page.locator('#launchChoiceDialog').isVisible(), false);
    await closeScenario(s);
  }],
  ['Escape during a drag rolls back the draft movement', async () => {
    const s = await setup(); const { page } = s;
    await action(page, 'edit').click();
    const a = await center(opener(page, 'app1')), b = await center(opener(page, 'app3'));
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 16 });
    assert.notDeepEqual(await order(page), initialOrder, 'Drag preview moves before cancellation');
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await order(page), initialOrder);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), ORDER_KEY), null);
    assert.equal(await page.locator('.reorder-ghost').count(), 0);
    assert.equal(await page.locator('#launchChoiceDialog').isVisible(), false);
    await closeScenario(s);
  }],
  ['mobile scrolling does not enter arrange mode or open details', async () => {
    const s = await setup({ mobile: true }); const { page, context } = s;
    const session = await context.newCDPSession(page);
    const p = await center(opener(page, 'app5'));
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    for (let i = 1; i <= 10; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y - i * 15 }] });
      await sleep(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
    assert.equal(await page.locator('#launchChoiceDialog').isVisible(), false);
    assert.equal(await action(page, 'done').isVisible(), false);
    assert.ok(await page.evaluate(() => window.scrollY > 0), 'Ordinary touch scroll remains available');
    await closeScenario(s);
  }],
  ['mobile long press and subsequent touch drag work with reduced motion', async () => {
    const s = await setup({ mobile: true, reducedMotion: 'reduce', width: 360 });
    const { page, context } = s;
    const session = await context.newCDPSession(page);
    const a = await center(opener(page, 'app1'));
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    await sleep(750);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await action(page, 'done').isVisible());
    assert.equal(await page.locator('#launchChoiceDialog').isVisible(), false);
    const from = await center(opener(page, 'app1')), to = await center(opener(page, 'app3'));
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 12; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.notDeepEqual(await order(page), initialOrder);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await closeScenario(s);
  }],
  ['malformed local arrangement data does not break the app list', async () => {
    const s = await setup({ seed: { [ORDER_KEY]: '{bad-json' } });
    assert.deepEqual(await order(s.page), initialOrder);
    await closeScenario(s);
  }],
  ['dark mobile details and edit controls fit a narrow screen', async () => {
    const s = await setup({ mobile: true, width: 360, seed: { teacherPortalTheme: 'dark' } });
    const { page } = s;
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await opener(page, 'app2').tap();
    const dialog = page.locator('#launchChoiceDialog');
    await dialog.waitFor({ state: 'visible' });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 361 && bounds.y >= 0);
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
    await capture(page, 'mobile-dark-details');
    await page.keyboard.press('Escape');
    await action(page, 'edit').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture(page, 'mobile-dark-arrange');
    await closeScenario(s);
  }]
];

async function main() {
  if (process.env.PORTAL_TEST_URL) baseURL = process.env.PORTAL_TEST_URL;
  else {
    server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const filename = path.resolve(ROOT, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(filename, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json' };
        res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(data);
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${server.address().port}/`;
  }
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  let failed = 0;
  let executed = 0;
  for (const [name, run] of tests) {
    if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) continue;
    executed++;
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) {
      failed++; console.error(`FAIL ${name}\n${error.stack}`);
      if (process.env.PORTAL_TEST_ARTIFACTS) {
        fs.mkdirSync(process.env.PORTAL_TEST_ARTIFACTS, { recursive: true });
        const page = [...activeContexts][0]?.pages()[0];
        if (page && !page.isClosed()) {
          const filename = path.join(process.env.PORTAL_TEST_ARTIFACTS, `${executed}-failure.png`);
          await page.screenshot({ path: filename, fullPage: true }).catch(() => {});
          console.error('Browser state:', await page.evaluate(() => ({
            url: location.href, bodyClass: document.body.className,
            status: document.getElementById('arrangeStatus')?.textContent,
            dialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.id)
          })).catch(() => null));
        }
      }
    }
    finally {
      for (const context of activeContexts) await context.close().catch(() => {});
      activeContexts.clear();
    }
  }
  console.log(`${executed - failed}/${executed} scenarios passed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
