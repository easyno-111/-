const $ = id => document.getElementById(id);
const state = { apps: {}, settings: {}, runner: null };
const PREVIEW_KEY = 'teacherPortalAppDraftPreviewV1';
const RUNNER_KEY = 'teacherPortalLessonRunnerV1';
let deferredInstallPrompt = null;

function text(value, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function safeColor(value, fallback = '#9a82d0') { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback; }
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
// 아이콘: 올린 그림 > 이모지 > 앱 이름 첫 글자 (포털 타일과 같은 규칙)
function appIcon(app, className = '') {
  const wrap = document.createElement('span');
  wrap.className = className;
  if (isImage(app?.iconImage)) {
    const img = document.createElement('img');
    img.src = app.iconImage;
    img.alt = '';
    wrap.appendChild(img);
  } else {
    const first = Array.from(text(app?.title))[0];
    wrap.textContent = text(app?.icon) || (first ? first.toUpperCase() : '●');
  }
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
    const title = escapeHtml(text(state.apps[id]?.title, '앱'));
    return `<button type="button" data-runner-step="${index}" class="${index === step ? 'active' : index < step ? 'done' : ''}"><span>${index + 1}</span>${title}</button>`;
  }).join('');
  const primary = safeUrl(app.primaryUrl);
  const secondary = safeUrl(app.secondaryUrl);
  container.innerHTML = `
    <p class="lesson-runner-kicker">수업 준비 세트</p>
    <h2>${escapeHtml(text(name, '수업 세트'))}</h2>
    <div class="lesson-runner-progress">${progress}</div>
    <section class="lesson-runner-current">
      <div class="lesson-runner-icon"></div>
      <div><span>${step + 1} / ${appIds.length}</span><h3>${escapeHtml(text(app.title, '앱'))}</h3><p>${escapeHtml(text(app.description))}</p></div>
    </section>
    <div class="lesson-runner-launches">
      ${primary ? `<a href="${escapeHtml(primary)}" target="_blank" rel="noopener" data-runner-launch="${escapeHtml(appIds[step])}">${escapeHtml(text(app.primaryLabel, '실행'))}</a>` : ''}
      ${secondary ? `<a href="${escapeHtml(secondary)}" target="_blank" rel="noopener" class="secondary" data-runner-launch="${escapeHtml(appIds[step])}">${escapeHtml(text(app.secondaryLabel, '두 번째 화면'))}</a>` : ''}
    </div>
    <div class="lesson-runner-nav">
      <button type="button" data-runner-nav="prev" ${step === 0 ? 'disabled' : ''}>이전 활동</button>
      <strong>다음: ${step < appIds.length - 1 ? escapeHtml(text(state.apps[appIds[step + 1]]?.title, '다음 활동')) : '수업 마무리'}</strong>
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
    <article class="draft-preview-card" style="--app-color:${safeColor(draft.appColor)}">
      <div class="draft-preview-icon">${escapeHtml(text(draft.appIcon, '✨'))}</div>
      <div><span>${escapeHtml(text(draft.appCategoryName, '카테고리'))}</span><h3>${escapeHtml(text(draft.appTitle))}</h3><p>${escapeHtml(text(draft.appDescription, '앱 설명이 여기에 표시됩니다.'))}</p></div>
      ${primary ? `<a href="${escapeHtml(primary)}" target="_blank" rel="noopener">${escapeHtml(text(draft.primaryLabel, '실행'))}</a>` : '<button disabled>주소 입력 필요</button>'}
    </article>`;
  $('closeDraftPreview')?.addEventListener('click', () => section.remove());
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
  });
  $('installPortalButton')?.addEventListener('click', requestInstall);
}

$('lessonSetCards')?.addEventListener('click', event => {
  const button = event.target.closest('[data-start-lesson-set]');
  if (button) startLessonSet(button.dataset.startLessonSet);
});
$('lessonRunnerContent')?.addEventListener('click', event => {
  const launch = event.target.closest('[data-runner-launch]');
  if (launch) {
    window.dispatchEvent(new CustomEvent('teacher-portal-launch', { detail: { appId: launch.dataset.runnerLaunch } }));
    return;
  }

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

renderDraftPreview();
setupPwa();

let runnerRestored = false;
function receivePortalData(detail) {
  if (!detail || typeof detail !== 'object') return;
  state.apps = detail.apps || {};
  state.settings = detail.settings || {};
  renderLessonSets();
  if (!runnerRestored && Object.keys(state.apps).length && Object.keys(state.settings).length) {
    runnerRestored = true;
    restoreRunner();
  }
}

window.addEventListener('teacher-portal-data', event => receivePortalData(event.detail));
if (window.__TEACHER_PORTAL_DATA__) receivePortalData(window.__TEACHER_PORTAL_DATA__);
