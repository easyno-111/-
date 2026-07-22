import { db } from './firebase-config.js';
import { onValue, ref } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const $ = id => document.getElementById(id);
const state = { apps: {}, settings: {}, runner: null };
const PREVIEW_KEY = 'teacherPortalAppDraftPreviewV1';
const RUNNER_KEY = 'teacherPortalLessonRunnerV1';
let deferredInstallPrompt = null;
let activeRailDrag = null;
let suppressRailClickUntil = 0;
let suppressRailClickTarget = null;

function text(value, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function isImage(value) { return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value); }
function safeUrl(value) {
  const url = text(value);
  if (!url || /^(javascript|data|vbscript):/i.test(url)) return '';
  try {
    const parsed = new URL(url, window.location.href);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}
function lessonSets() {
  return Object.entries(state.settings.lessonSets || {})
    .map(([id, item]) => ({ id, ...item }))
    .filter(item => item.visible !== false && Array.isArray(item.appIds) && item.appIds.some(id => state.apps[id]?.visible !== false))
    .sort((a, b) => num(a.order, 9999) - num(b.order, 9999));
}
function appIcon(app, className = '') {
  const wrap = document.createElement('span');
  wrap.className = className;
  if (isImage(app?.iconImage)) {
    const img = document.createElement('img');
    img.src = app.iconImage;
    img.alt = '';
    wrap.appendChild(img);
  } else wrap.textContent = text(app?.icon, '🔗');
  return wrap;
}
function renderLessonSets() {
  const section = $('lessonSetsSection');
  const container = $('lessonSetCards');
  if (!section || !container) return;
  const sets = lessonSets();
  section.classList.toggle('hidden', !sets.length);
  container.replaceChildren();
  sets.forEach(item => {
    const apps = item.appIds.map(id => ({ id, ...state.apps[id] })).filter(app => app.title && app.visible !== false);
    if (!apps.length) return;
    const card = document.createElement('article');
    card.className = 'lesson-set-card';
    card.dataset.lessonSetId = item.id;
    const icons = document.createElement('div');
    icons.className = 'lesson-set-card-icons';
    apps.slice(0, 5).forEach(app => icons.appendChild(appIcon(app, 'lesson-set-card-icon')));
    const copy = document.createElement('div');
    copy.className = 'lesson-set-card-copy';
    const title = document.createElement('h4');
    title.textContent = text(item.name, '수업 세트');
    const path = document.createElement('p');
    path.textContent = apps.map(app => app.title).join(' → ');
    copy.append(title, path);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-set-start-button';
    button.dataset.startLessonSet = item.id;
    button.textContent = `${apps.length}단계 시작`;
    card.append(icons, copy, button);
    container.appendChild(card);
  });
}

function saveRunner() {
  try { localStorage.setItem(RUNNER_KEY, JSON.stringify(state.runner)); } catch {}
}
function startLessonSet(id, step = 0) {
  const set = lessonSets().find(item => item.id === id);
  if (!set) return;
  const appIds = set.appIds.filter(appId => state.apps[appId]?.visible !== false);
  if (!appIds.length) return;
  state.runner = { setId: id, name: set.name, appIds, step: Math.min(Math.max(step, 0), appIds.length - 1) };
  saveRunner();
  renderRunner();
  const dialog = $('lessonRunnerDialog');
  if (dialog && !dialog.open) dialog.showModal();
}
function renderRunner() {
  const container = $('lessonRunnerContent');
  if (!container || !state.runner) return;
  const { name, appIds, step } = state.runner;
  const app = state.apps[appIds[step]];
  if (!app) return;
  const progress = appIds.map((id, index) => {
    const title = text(state.apps[id]?.title, '앱');
    return `<button type="button" data-runner-step="${index}" class="${index === step ? 'active' : index < step ? 'done' : ''}"><span>${index + 1}</span>${title}</button>`;
  }).join('');
  const primary = safeUrl(app.primaryUrl);
  const secondary = safeUrl(app.secondaryUrl);
  container.innerHTML = `
    <p class="lesson-runner-kicker">수업 준비 세트</p>
    <h2>${text(name, '수업 세트')}</h2>
    <div class="lesson-runner-progress">${progress}</div>
    <section class="lesson-runner-current">
      <div class="lesson-runner-icon"></div>
      <div><span>${step + 1} / ${appIds.length}</span><h3>${text(app.title, '앱')}</h3><p>${text(app.description)}</p></div>
    </section>
    <div class="lesson-runner-launches">
      ${primary ? `<a href="${primary}" target="_blank" rel="noopener">${text(app.primaryLabel, '실행')}</a>` : ''}
      ${secondary ? `<a href="${secondary}" target="_blank" rel="noopener" class="secondary">${text(app.secondaryLabel, '두 번째 화면')}</a>` : ''}
    </div>
    <div class="lesson-runner-nav">
      <button type="button" data-runner-nav="prev" ${step === 0 ? 'disabled' : ''}>이전 활동</button>
      <strong>다음: ${step < appIds.length - 1 ? text(state.apps[appIds[step + 1]]?.title, '다음 활동') : '수업 마무리'}</strong>
      <button type="button" data-runner-nav="next">${step < appIds.length - 1 ? '다음 활동' : '완료'}</button>
    </div>`;
  const iconSlot = container.querySelector('.lesson-runner-icon');
  iconSlot?.appendChild(appIcon(app));
}
function closeRunner() {
  state.runner = null;
  try { localStorage.removeItem(RUNNER_KEY); } catch {}
  $('lessonRunnerDialog')?.close();
}
function restoreRunner() {
  try {
    const saved = JSON.parse(localStorage.getItem(RUNNER_KEY) || 'null');
    if (saved?.setId && lessonSets().some(item => item.id === saved.setId)) {
      state.runner = saved;
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.className = 'resume-lesson-button';
      resume.textContent = `진행 중인 “${text(saved.name, '수업 세트')}” 이어서 하기`;
      resume.addEventListener('click', () => startLessonSet(saved.setId, num(saved.step)));
      $('lessonSetsSection')?.prepend(resume);
    }
  } catch {}
}

function renderDraftPreview() {
  if (!new URLSearchParams(location.search).has('previewDraft')) return;
  const section = $('draftPreviewSection');
  if (!section) return;
  let draft;
  try { draft = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null'); } catch { return; }
  if (!draft || !text(draft.appTitle)) return;
  section.classList.remove('hidden');
  const primary = safeUrl(draft.primaryUrl);
  section.innerHTML = `
    <div class="draft-preview-banner"><strong>저장 전 미리보기</strong><span>이 카드는 Firebase에 아직 저장되지 않았습니다.</span><button type="button" id="closeDraftPreview">닫기</button></div>
    <article class="draft-preview-card" style="--app-color:${draft.appColor || '#9a82d0'}">
      <div class="draft-preview-icon">${text(draft.appIcon, '✨')}</div>
      <div><span>${text(draft.appCategoryName, '카테고리')}</span><h3>${text(draft.appTitle)}</h3><p>${text(draft.appDescription, '앱 설명이 여기에 표시됩니다.')}</p></div>
      ${primary ? `<a href="${primary}" target="_blank" rel="noopener">${text(draft.primaryLabel, '실행')}</a>` : '<button disabled>주소 입력 필요</button>'}
    </article>`;
  $('closeDraftPreview')?.addEventListener('click', () => section.remove());
}

function removeRailButtons() {
  document.querySelectorAll('.category-section-controls').forEach(item => item.remove());
  document.querySelectorAll('.category-app-rail').forEach(rail => {
    if (rail.dataset.dragReady) return;
    rail.dataset.dragReady = 'true';
    rail.setAttribute('aria-description', '컴퓨터에서는 마우스로 끌고, 모바일에서는 손가락으로 자연스럽게 밀어 이동할 수 있습니다.');
  });
}
function railPointerDown(event) {
  const rail = event.target.closest('.category-app-rail');
  // 터치/펜 입력은 브라우저의 기본 스크롤에 전적으로 맡긴다.
  // 마우스도 아직은 포인터 캡처나 preventDefault를 하지 않아 일반 클릭이 그대로 살아 있다.
  if (!rail || event.pointerType !== 'mouse' || event.button !== 0) return;
  activeRailDrag = {
    rail,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startScroll: rail.scrollLeft,
    moved: false,
    horizontal: false,
    captured: false,
    distance: 0
  };
}
function railPointerMove(event) {
  if (!activeRailDrag || activeRailDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - activeRailDrag.startX;
  const dy = event.clientY - activeRailDrag.startY;
  activeRailDrag.distance = Math.max(activeRailDrag.distance, Math.abs(dx));

  // 세로로 움직이기 시작했다면 가로 드래그 후보를 즉시 취소한다.
  if (!activeRailDrag.horizontal && Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) {
    activeRailDrag = null;
    return;
  }

  if (!activeRailDrag.horizontal && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy)) {
    activeRailDrag.horizontal = true;
    activeRailDrag.moved = true;
    activeRailDrag.rail.classList.add('is-dragging');
    activeRailDrag.rail.setPointerCapture?.(event.pointerId);
    activeRailDrag.captured = true;
  }
  if (!activeRailDrag.horizontal) return;

  event.preventDefault();
  activeRailDrag.rail.scrollLeft = activeRailDrag.startScroll - dx;
}
function railPointerEnd(event) {
  if (!activeRailDrag || activeRailDrag.pointerId !== event.pointerId) return;
  const drag = activeRailDrag;
  drag.rail.classList.remove('is-dragging');
  if (drag.captured && drag.rail.hasPointerCapture?.(event.pointerId)) {
    drag.rail.releasePointerCapture?.(event.pointerId);
  }
  activeRailDrag = null;

  // 실제로 충분히 끌었을 때만, 같은 레일에서 바로 이어지는 유령 클릭을 한 번 막는다.
  if (drag.moved && drag.distance > 9) {
    suppressRailClickTarget = drag.rail;
    suppressRailClickUntil = Date.now() + 260;
  }
}

async function requestInstall() {
  if (deferredInstallPrompt) {
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    $('installPortalButton')?.classList.add('hidden');
    return;
  }
  alert('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해주세요.');
}
function setupPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('installPortalButton')?.classList.remove('hidden');
    $('quickInstallButton')?.classList.remove('hidden');
  });
  $('installPortalButton')?.addEventListener('click', requestInstall);
  $('quickInstallButton')?.addEventListener('click', requestInstall);
}
function setupQuickLauncher() {
  const button = $('quickLauncherButton');
  const menu = $('quickLauncherMenu');
  button?.addEventListener('click', () => {
    const open = menu.classList.toggle('hidden') === false;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? '×' : '＋';
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.portal-quick-launcher')) {
      menu?.classList.add('hidden');
      button?.setAttribute('aria-expanded', 'false');
      if (button) button.textContent = '＋';
    }
  });
  $('refreshPortalButton')?.addEventListener('click', async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.update()));
    }
    location.reload();
  });
}

$('lessonSetCards')?.addEventListener('click', event => {
  const button = event.target.closest('[data-start-lesson-set]');
  if (button) startLessonSet(button.dataset.startLessonSet);
});
$('lessonRunnerContent')?.addEventListener('click', event => {
  const stepButton = event.target.closest('[data-runner-step]');
  if (stepButton && state.runner) {
    state.runner.step = num(stepButton.dataset.runnerStep);
    saveRunner();
    renderRunner();
    return;
  }
  const nav = event.target.closest('[data-runner-nav]');
  if (!nav || !state.runner) return;
  if (nav.dataset.runnerNav === 'prev') state.runner.step = Math.max(0, state.runner.step - 1);
  if (nav.dataset.runnerNav === 'next') {
    if (state.runner.step >= state.runner.appIds.length - 1) return closeRunner();
    state.runner.step += 1;
  }
  saveRunner();
  renderRunner();
});
$('lessonRunnerDialog')?.addEventListener('close', () => {});

document.addEventListener('dragstart', event => { if (event.target.closest('.category-app-rail')) event.preventDefault(); });
document.addEventListener('pointerdown', railPointerDown);
document.addEventListener('pointermove', railPointerMove, { passive: false });
document.addEventListener('pointerup', railPointerEnd);
document.addEventListener('pointercancel', railPointerEnd);
document.addEventListener('click', event => {
  const rail = event.target.closest('.category-app-rail');
  if (rail && rail === suppressRailClickTarget && Date.now() < suppressRailClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressRailClickUntil = 0;
    suppressRailClickTarget = null;
  }
}, true);

const railObserver = new MutationObserver(removeRailButtons);
railObserver.observe($('categorySections'), { childList: true, subtree: true });
removeRailButtons();
renderDraftPreview();
setupPwa();
setupQuickLauncher();

let runnerRestored = false;
onValue(ref(db, 'portal/apps'), snapshot => {
  state.apps = snapshot.val() || {};
  renderLessonSets();
  if (!runnerRestored && Object.keys(state.settings).length) { runnerRestored = true; restoreRunner(); }
});
onValue(ref(db, 'portal/settings'), snapshot => {
  state.settings = snapshot.val() || {};
  renderLessonSets();
  if (!runnerRestored && Object.keys(state.apps).length) { runnerRestored = true; restoreRunner(); }
});
