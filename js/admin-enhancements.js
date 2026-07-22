import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { get, onValue, push, ref, remove, set, update } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const $ = id => document.getElementById(id);
const state = {
  user: null,
  apps: {},
  categories: {},
  settings: {},
  loaded: { apps: false, categories: false, settings: false },
  selected: new Set(),
  editingLessonSetId: '',
  lessonSetAppIds: [],
  previousHash: '',
  automaticTimer: 0,
  initializedHash: false,
  localBackups: [],
  localLogs: []
};

const DRAFT_KEY = 'teacherPortalAdminAppDraftV2';
const PREVIEW_KEY = 'teacherPortalAppDraftPreviewV1';
const LOCAL_DB_NAME = 'teacherPortalAdminLocalV2';
const LOCAL_DB_VERSION = 1;
let deferredInstallPrompt = null;
let databaseAttached = false;
let dragState = null;

function text(value, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function nowLabel(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}
function toast(message, type = 'success') {
  const container = $('toastContainer');
  if (!container) return;
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}
function dbMessage(error) {
  if (String(error?.message || '').includes('PERMISSION_DENIED')) return 'Firebase 보안 규칙의 관리자 권한을 확인해주세요.';
  return error?.message || '처리 중 오류가 발생했습니다.';
}
function sortedApps() {
  return Object.entries(state.apps).map(([id, app]) => ({ id, ...app }))
    .sort((a, b) => num(a.order, 9999) - num(b.order, 9999) || text(a.title).localeCompare(text(b.title), 'ko'));
}
function sortedCategories() {
  return Object.entries(state.categories).map(([id, category]) => ({ id, ...category }))
    .sort((a, b) => num(a.order, 9999) - num(b.order, 9999));
}
function cleanSettings(settings = state.settings) { return { ...(settings || {}) }; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
function contentHash() {
  return JSON.stringify(stable({ apps: state.apps, categories: state.categories, settings: cleanSettings() }));
}
function allLoaded() { return Object.values(state.loaded).every(Boolean); }

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('backups')) database.createObjectStore('backups', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('logs')) database.createObjectStore('logs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('브라우저 저장소를 열지 못했습니다.'));
  });
}
async function localStore(mode, storeName, operation) {
  const database = await openLocalDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('브라우저 저장소 작업에 실패했습니다.'));
    });
  } finally { database.close(); }
}
async function refreshLocalHistory() {
  state.localBackups = (await localStore('readonly', 'backups', store => store.getAll())).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  state.localLogs = (await localStore('readonly', 'logs', store => store.getAll())).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  renderBackups();
  renderChangeLog();
}
async function addChangeLog(message) {
  if (!state.user) return;
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message, createdAt: Date.now(), user: state.user.email || '관리자' };
  await localStore('readwrite', 'logs', store => store.put(item));
  const logs = (await localStore('readonly', 'logs', store => store.getAll())).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  await Promise.all(logs.slice(50).map(entry => localStore('readwrite', 'logs', store => store.delete(entry.id))));
  await refreshLocalHistory();
}

async function createBackup(label = '수동 백업', silent = false) {
  if (!state.user || !allLoaded()) return;
  const backup = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    createdAt: Date.now(),
    apps: state.apps,
    categories: state.categories,
    settings: cleanSettings()
  };
  await localStore('readwrite', 'backups', store => store.put(backup));
  const backups = (await localStore('readonly', 'backups', store => store.getAll())).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  await Promise.all(backups.slice(5).map(entry => localStore('readwrite', 'backups', store => store.delete(entry.id))));
  await refreshLocalHistory();
  if (!silent) toast('현재 상태를 이 브라우저에 백업했습니다.');
}

function scheduleAutomaticSnapshot() {
  if (!allLoaded()) return;
  const hash = contentHash();
  if (!state.initializedHash) {
    state.previousHash = hash;
    state.initializedHash = true;
    return;
  }
  if (hash === state.previousHash) return;
  clearTimeout(state.automaticTimer);
  state.automaticTimer = window.setTimeout(async () => {
    const latestHash = contentHash();
    if (latestHash === state.previousHash) return;
    state.previousHash = latestHash;
    try {
      await createBackup('자동 백업', true);
      await addChangeLog('포털 데이터가 변경되었습니다.');
    } catch (error) {
      console.error(error);
    }
  }, 1200);
}

function renderBulkCategoryOptions() {
  const select = $('bulkCategory');
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  sortedCategories().forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
  if ([...select.options].some(option => option.value === current)) select.value = current;
}
function syncBulkToolbar() {
  const count = state.selected.size;
  if ($('selectedAppCount')) $('selectedAppCount').textContent = `${count}개 선택`;
  const allIds = sortedApps().map(app => app.id);
  const all = allIds.length > 0 && allIds.every(id => state.selected.has(id));
  if ($('selectAllApps')) {
    $('selectAllApps').checked = all;
    $('selectAllApps').indeterminate = count > 0 && !all;
  }
  document.querySelectorAll('.bulk-app-checkbox').forEach(input => { input.checked = state.selected.has(input.value); });
}

function decorateAppRows() {
  const list = $('adminAppList');
  if (!list) return;
  list.querySelectorAll('.admin-app-row[data-id]').forEach(row => {
    const id = row.dataset.id;
    if (!row.querySelector('.admin-row-select')) {
      const selectWrap = document.createElement('label');
      selectWrap.className = 'admin-row-select';
      selectWrap.title = '일괄 작업에 선택';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'bulk-app-checkbox';
      checkbox.value = id;
      checkbox.checked = state.selected.has(id);
      selectWrap.appendChild(checkbox);
      row.prepend(selectWrap);
    }
    if (!row.querySelector('.admin-drag-handle')) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'admin-drag-handle';
      handle.setAttribute('aria-label', '끌어서 순서 변경');
      handle.title = '끌어서 순서 변경';
      handle.textContent = '⠿';
      row.insertBefore(handle, row.querySelector('.admin-app-icon'));
    }
    const actions = row.querySelector('.row-actions');
    if (actions && !actions.querySelector('[data-enhance-action="clone"]')) {
      const clone = document.createElement('button');
      clone.type = 'button';
      clone.className = 'row-action';
      clone.dataset.enhanceAction = 'clone';
      clone.textContent = '복제';
      clone.title = '이 앱을 복제';
      clone.style.width = 'auto';
      clone.style.padding = '0 9px';
      actions.insertBefore(clone, actions.querySelector('[data-action="delete"]'));
    }
  });
  syncBulkToolbar();
}

function startRowDrag(event) {
  const handle = event.target.closest('.admin-drag-handle');
  if (!handle) return;
  const row = handle.closest('.admin-app-row[data-id]');
  if (!row) return;
  event.preventDefault();
  event.stopPropagation();
  dragState = { row, pointerId: event.pointerId, moved: false };
  handle.setPointerCapture?.(event.pointerId);
  row.classList.add('is-admin-dragging');
  document.body.classList.add('admin-row-drag-active');
}
function moveRowDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();
  dragState.moved = true;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.admin-app-row[data-id]');
  if (!target || target === dragState.row || target.parentElement !== dragState.row.parentElement) return;
  const rect = target.getBoundingClientRect();
  target.parentElement.insertBefore(dragState.row, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
}
async function endRowDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { row, moved } = dragState;
  dragState = null;
  row.classList.remove('is-admin-dragging');
  document.body.classList.remove('admin-row-drag-active');
  if (!moved) return;
  const rows = [...$('adminAppList').querySelectorAll('.admin-app-row[data-id]')];
  const updates = {};
  rows.forEach((item, index) => {
    updates[`${item.dataset.id}/order`] = (index + 1) * 10;
    updates[`${item.dataset.id}/updatedAt`] = Date.now();
  });
  try {
    await update(ref(db, 'portal/apps'), updates);
    toast('앱 표시 순서를 변경했습니다.');
  } catch (error) {
    toast(dbMessage(error), 'error');
  }
}

async function cloneApp(id) {
  const app = state.apps[id];
  if (!app) return;
  const newId = push(ref(db, 'portal/apps')).key;
  const order = Math.max(0, ...Object.values(state.apps).map(item => num(item.order))) + 10;
  await set(ref(db, `portal/apps/${newId}`), {
    ...app,
    title: `${text(app.title, '앱')} 복사본`,
    visible: false,
    featured: false,
    isNew: true,
    order,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  toast('앱을 복제했습니다. 복사본은 숨김 상태입니다.');
}

async function applyBulkAction() {
  const ids = [...state.selected];
  const action = $('bulkAction')?.value;
  if (!ids.length) return toast('먼저 앱을 선택해주세요.', 'error');
  if (!action) return toast('일괄 작업을 선택해주세요.', 'error');
  if (action === 'delete' && !confirm(`선택한 ${ids.length}개 앱 카드를 삭제할까요? 실제 HTML 파일은 삭제되지 않습니다.`)) return;
  const updates = {};
  ids.forEach(id => {
    if (action === 'show') updates[`${id}/visible`] = true;
    if (action === 'hide') updates[`${id}/visible`] = false;
    if (action === 'new-on') updates[`${id}/isNew`] = true;
    if (action === 'new-off') updates[`${id}/isNew`] = false;
    if (action === 'category') updates[`${id}/category`] = $('bulkCategory').value;
    updates[`${id}/updatedAt`] = Date.now();
    if (action === 'delete') updates[id] = null;
  });
  try {
    await update(ref(db, 'portal/apps'), updates);
    state.selected.clear();
    syncBulkToolbar();
    toast('선택한 앱에 일괄 작업을 적용했습니다.');
  } catch (error) { toast(dbMessage(error), 'error'); }
}

function lessonSets() { return state.settings.lessonSets || {}; }
function resetLessonSetForm() {
  state.editingLessonSetId = '';
  state.lessonSetAppIds = [];
  $('lessonSetId').value = '';
  $('lessonSetName').value = '';
  $('lessonSetForm').classList.add('hidden');
  renderLessonSetBuilder();
}
function openLessonSetForm(id = '') {
  const item = id ? lessonSets()[id] : null;
  state.editingLessonSetId = id;
  state.lessonSetAppIds = Array.isArray(item?.appIds) ? [...item.appIds] : [];
  $('lessonSetId').value = id;
  $('lessonSetName').value = text(item?.name);
  $('lessonSetForm').classList.remove('hidden');
  renderLessonSetBuilder();
  $('lessonSetName').focus();
}
function renderLessonSetList() {
  const container = $('lessonSetList');
  if (!container) return;
  const items = Object.entries(lessonSets()).map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => num(a.order, 9999) - num(b.order, 9999));
  container.replaceChildren();
  if (!items.length) {
    container.innerHTML = '<div class="empty-admin"><strong>수업 세트가 없습니다.</strong><span>자주 사용하는 앱을 순서대로 묶어보세요.</span></div>';
    return;
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'lesson-set-admin-row';
    row.dataset.lessonSetId = item.id;
    const info = document.createElement('div');
    const names = (item.appIds || []).map(id => state.apps[id]?.title).filter(Boolean);
    info.innerHTML = `<strong>${text(item.name, '이름 없는 세트')}</strong><span>${names.join(' → ') || '선택된 앱 없음'}</span>`;
    const actions = document.createElement('div');
    actions.innerHTML = '<button class="ghost-button small-button" data-set-action="edit" type="button">수정</button><button class="danger-button small-button" data-set-action="delete" type="button">삭제</button>';
    row.append(info, actions);
    container.appendChild(row);
  });
}
function renderLessonSetBuilder() {
  const choices = $('lessonSetAppChoices');
  const selected = $('lessonSetSelectedApps');
  if (!choices || !selected) return;
  choices.replaceChildren();
  sortedApps().forEach(app => {
    const label = document.createElement('label');
    label.className = 'lesson-set-choice';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = app.id;
    input.checked = state.lessonSetAppIds.includes(app.id);
    label.append(input, document.createTextNode(app.title));
    choices.appendChild(label);
  });
  selected.replaceChildren();
  state.lessonSetAppIds.forEach((id, index) => {
    const app = state.apps[id];
    if (!app) return;
    const row = document.createElement('div');
    row.className = 'lesson-set-selected-row';
    row.dataset.appId = id;
    row.innerHTML = `<span>${index + 1}</span><strong>${text(app.title)}</strong><div><button type="button" data-order="up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-order="down" ${index === state.lessonSetAppIds.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-order="remove">×</button></div>`;
    selected.appendChild(row);
  });
  if (!state.lessonSetAppIds.length) selected.innerHTML = '<div class="lesson-set-empty">왼쪽에서 앱을 선택하세요.</div>';
}

function renderBackups() {
  const container = $('backupList');
  if (!container) return;
  const items = state.localBackups;
  container.replaceChildren();
  if (!items.length) {
    container.innerHTML = '<div class="backup-empty">저장된 백업이 없습니다.</div>';
    return;
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'backup-row';
    row.dataset.backupId = item.id;
    row.innerHTML = `<div><strong>${text(item.label, '백업')}</strong><span>${nowLabel(item.createdAt)}</span></div><button class="ghost-button small-button" data-backup-action="restore" type="button">복원</button><button class="ghost-button small-button" data-backup-action="download" type="button">파일</button>`;
    container.appendChild(row);
  });
}
function renderChangeLog() {
  const container = $('changeLogList');
  if (!container) return;
  const items = state.localLogs.slice(0, 20);
  container.replaceChildren();
  if (!items.length) {
    container.innerHTML = '<div class="backup-empty">아직 변경 기록이 없습니다.</div>';
    return;
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'change-log-row';
    row.innerHTML = `<span>${nowLabel(item.createdAt)}</span><strong>${text(item.message)}</strong><small>${text(item.user)}</small>`;
    container.appendChild(row);
  });
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportPayload(label = '포털 백업') {
  return { version: 2, label, exportedAt: Date.now(), apps: state.apps, categories: state.categories, settings: cleanSettings() };
}
async function restorePayload(payload, label = '백업 복원') {
  if (!payload || typeof payload !== 'object' || !payload.apps || !payload.categories || !payload.settings) throw new Error('올바른 포털 백업 파일이 아닙니다.');
  await createBackup('복원 전 자동 백업', true);
  await Promise.all([
    set(ref(db, 'portal/apps'), payload.apps),
    set(ref(db, 'portal/categories'), payload.categories),
    set(ref(db, 'portal/settings'), payload.settings)
  ]);
  await addChangeLog(label);
}

function collectDraft() {
  const ids = ['appTitle','appDescription','appCategory','appIcon','appColor','appOpenMode','primaryLabel','primaryUrl','secondaryLabel','secondaryUrl'];
  const fields = Object.fromEntries(ids.map(id => [id, $(id)?.value || '']));
  fields.appVisible = Boolean($('appVisible')?.checked);
  fields.appFeatured = Boolean($('appFeatured')?.checked);
  fields.appIsNew = Boolean($('appIsNew')?.checked);
  return { ...fields, savedAt: Date.now() };
}
function draftHasContent(draft) {
  return Boolean(text(draft?.appTitle) || text(draft?.primaryUrl) || text(draft?.appDescription));
}
function saveDraft() {
  if ($('appId')?.value) return;
  const draft = collectDraft();
  if (draftHasContent(draft)) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
function restoreDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return; }
  if (!draftHasContent(draft)) return;
  Object.entries(draft).forEach(([id, value]) => {
    const element = $(id);
    if (!element) return;
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = value;
  });
  $('draftNotice')?.classList.add('hidden');
  toast('임시 저장 내용을 복원했습니다.');
}
function checkDraftNotice() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return; }
  $('draftNotice')?.classList.toggle('hidden', !draftHasContent(draft));
}
function createPreviewDraft() {
  const draft = collectDraft();
  draft.appCategoryName = $('appCategory')?.selectedOptions?.[0]?.textContent || '카테고리';
  if (!draftHasContent(draft)) return toast('미리 볼 앱 정보를 먼저 입력해주세요.', 'error');
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(draft));
  window.open('index.html?previewDraft=1', '_blank', 'noopener');
}

function attachEvents() {
  const list = $('adminAppList');
  const observer = new MutationObserver(decorateAppRows);
  observer.observe(list, { childList: true, subtree: true });
  decorateAppRows();

  list.addEventListener('change', event => {
    const checkbox = event.target.closest('.bulk-app-checkbox');
    if (!checkbox) return;
    checkbox.checked ? state.selected.add(checkbox.value) : state.selected.delete(checkbox.value);
    syncBulkToolbar();
  });
  list.addEventListener('click', event => {
    const clone = event.target.closest('[data-enhance-action="clone"]');
    if (!clone) return;
    event.preventDefault();
    event.stopPropagation();
    cloneApp(clone.closest('[data-id]')?.dataset.id).catch(error => toast(dbMessage(error), 'error'));
  });
  list.addEventListener('pointerdown', startRowDrag);
  list.addEventListener('pointermove', moveRowDrag);
  list.addEventListener('pointerup', endRowDrag);
  list.addEventListener('pointercancel', endRowDrag);

  $('selectAllApps')?.addEventListener('change', event => {
    state.selected = event.target.checked ? new Set(sortedApps().map(app => app.id)) : new Set();
    syncBulkToolbar();
  });
  $('bulkAction')?.addEventListener('change', event => $('bulkCategory')?.classList.toggle('hidden', event.target.value !== 'category'));
  $('applyBulkAction')?.addEventListener('click', applyBulkAction);

  $('newLessonSetButton')?.addEventListener('click', () => openLessonSetForm());
  $('cancelLessonSetButton')?.addEventListener('click', resetLessonSetForm);
  $('lessonSetAppChoices')?.addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.checked && !state.lessonSetAppIds.includes(input.value)) state.lessonSetAppIds.push(input.value);
    if (!input.checked) state.lessonSetAppIds = state.lessonSetAppIds.filter(id => id !== input.value);
    renderLessonSetBuilder();
  });
  $('lessonSetSelectedApps')?.addEventListener('click', event => {
    const button = event.target.closest('[data-order]');
    const row = event.target.closest('[data-app-id]');
    if (!button || !row) return;
    const index = state.lessonSetAppIds.indexOf(row.dataset.appId);
    if (button.dataset.order === 'remove') state.lessonSetAppIds.splice(index, 1);
    if (button.dataset.order === 'up' && index > 0) [state.lessonSetAppIds[index - 1], state.lessonSetAppIds[index]] = [state.lessonSetAppIds[index], state.lessonSetAppIds[index - 1]];
    if (button.dataset.order === 'down' && index < state.lessonSetAppIds.length - 1) [state.lessonSetAppIds[index + 1], state.lessonSetAppIds[index]] = [state.lessonSetAppIds[index], state.lessonSetAppIds[index + 1]];
    renderLessonSetBuilder();
  });
  $('lessonSetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const name = text($('lessonSetName').value);
    if (!name) return toast('수업 세트 이름을 입력해주세요.', 'error');
    if (!state.lessonSetAppIds.length) return toast('세트에 앱을 하나 이상 선택해주세요.', 'error');
    const id = state.editingLessonSetId || push(ref(db, 'portal/settings/lessonSets')).key;
    const existing = lessonSets()[id] || {};
    const order = existing.order || Math.max(0, ...Object.values(lessonSets()).map(item => num(item.order))) + 10;
    await set(ref(db, `portal/settings/lessonSets/${id}`), { name, appIds: state.lessonSetAppIds, order, visible: true, updatedAt: Date.now() });
    resetLessonSetForm();
    toast('수업 준비 세트를 저장했습니다.');
  });
  $('lessonSetList')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-set-action]');
    const row = event.target.closest('[data-lesson-set-id]');
    if (!button || !row) return;
    const id = row.dataset.lessonSetId;
    if (button.dataset.setAction === 'edit') return openLessonSetForm(id);
    if (button.dataset.setAction === 'delete' && confirm('이 수업 준비 세트를 삭제할까요?')) {
      await remove(ref(db, `portal/settings/lessonSets/${id}`));
      toast('수업 준비 세트를 삭제했습니다.');
    }
  });

  $('createBackupButton')?.addEventListener('click', () => createBackup('수동 백업').catch(error => toast(dbMessage(error), 'error')));
  $('exportBackupButton')?.addEventListener('click', () => downloadJson(exportPayload(), `teacher-portal-backup-${new Date().toISOString().slice(0, 10)}.json`));
  $('importBackupFile')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!confirm('현재 앱·카테고리·설정을 이 파일의 내용으로 교체할까요? 복원 전 상태는 자동 백업됩니다.')) return;
      await restorePayload(payload, '백업 파일을 불러왔습니다.');
      toast('백업 파일을 복원했습니다.');
    } catch (error) { toast(error.message || '백업 파일을 읽지 못했습니다.', 'error'); }
  });
  $('backupList')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-backup-action]');
    const row = event.target.closest('[data-backup-id]');
    if (!button || !row) return;
    const backup = state.localBackups.find(item => item.id === row.dataset.backupId);
    if (!backup) return;
    if (button.dataset.backupAction === 'download') return downloadJson({ version: 2, ...backup }, `teacher-portal-backup-${row.dataset.backupId}.json`);
    if (button.dataset.backupAction === 'restore' && confirm('이 시점의 상태로 되돌릴까요? 현재 상태는 먼저 자동 백업됩니다.')) {
      await restorePayload(backup, `“${text(backup.label)}” 백업을 복원했습니다.`);
      toast('선택한 백업으로 복원했습니다.');
    }
  });
  $('clearChangeLogButton')?.addEventListener('click', async () => {
    if (!confirm('최근 변경 기록을 모두 비울까요?')) return;
    await localStore('readwrite', 'logs', store => store.clear());
    await refreshLocalHistory();
  });

  $('appForm')?.addEventListener('input', () => { clearTimeout(saveDraft.timer); saveDraft.timer = setTimeout(saveDraft, 400); });
  $('appForm')?.addEventListener('submit', () => setTimeout(() => {
    if (!$('appId')?.value && !text($('appTitle')?.value)) { localStorage.removeItem(DRAFT_KEY); $('draftNotice')?.classList.add('hidden'); }
  }, 1200));
  $('restoreDraftButton')?.addEventListener('click', restoreDraft);
  $('discardDraftButton')?.addEventListener('click', () => { localStorage.removeItem(DRAFT_KEY); $('draftNotice')?.classList.add('hidden'); });
  $('previewDraftButton')?.addEventListener('click', createPreviewDraft);
  $('previewHomeButton')?.addEventListener('click', () => window.open('index.html', '_blank', 'noopener'));

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('adminInstallButton')?.classList.remove('hidden');
  });
  $('adminInstallButton')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    $('adminInstallButton')?.classList.add('hidden');
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
}

function attachDatabase() {
  onValue(ref(db, 'portal/apps'), snapshot => {
    state.apps = snapshot.val() || {};
    state.loaded.apps = true;
    state.selected = new Set([...state.selected].filter(id => state.apps[id]));
    decorateAppRows();
    renderLessonSetList();
    renderLessonSetBuilder();
    scheduleAutomaticSnapshot();
  });
  onValue(ref(db, 'portal/categories'), snapshot => {
    state.categories = snapshot.val() || {};
    state.loaded.categories = true;
    renderBulkCategoryOptions();
    scheduleAutomaticSnapshot();
  });
  onValue(ref(db, 'portal/settings'), snapshot => {
    state.settings = snapshot.val() || {};
    state.loaded.settings = true;
    renderLessonSetList();
    scheduleAutomaticSnapshot();
  });
}

attachEvents();
checkDraftNotice();
onAuthStateChanged(auth, user => {
  state.user = user;
  if (user) {
    if (!databaseAttached) { databaseAttached = true; attachDatabase(); }
    refreshLocalHistory().catch(console.error);
    setTimeout(checkDraftNotice, 300);
  }
});
