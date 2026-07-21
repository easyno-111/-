import { auth, db } from './firebase-config.js';
import { DEFAULT_APPS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './default-data.js';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const byId = id => document.getElementById(id);
const els = {
  loginScreen: byId('loginScreen'), adminScreen: byId('adminScreen'), loginForm: byId('loginForm'),
  loginEmail: byId('loginEmail'), loginPassword: byId('loginPassword'), loginButton: byId('loginButton'), loginError: byId('loginError'),
  adminEmail: byId('adminEmail'), logoutButton: byId('logoutButton'), seedButton: byId('seedButton'), newAppButton: byId('newAppButton'),
  statTotal: byId('statTotal'), statVisible: byId('statVisible'), statFeatured: byId('statFeatured'), statCategories: byId('statCategories'),
  adminListCount: byId('adminListCount'), adminAppList: byId('adminAppList'), appForm: byId('appForm'), appId: byId('appId'), formTitle: byId('formTitle'),
  appTitle: byId('appTitle'), appDescription: byId('appDescription'), appCategory: byId('appCategory'), appIcon: byId('appIcon'), appColor: byId('appColor'),
  appOpenMode: byId('appOpenMode'), primaryLabel: byId('primaryLabel'), primaryUrl: byId('primaryUrl'), secondaryLabel: byId('secondaryLabel'),
  secondaryUrl: byId('secondaryUrl'), appVisible: byId('appVisible'), appFeatured: byId('appFeatured'), appIsNew: byId('appIsNew'),
  saveAppButton: byId('saveAppButton'), cancelEditButton: byId('cancelEditButton'), categoryManager: byId('categoryManager'), categoryForm: byId('categoryForm'),
  newCategoryName: byId('newCategoryName'), settingsForm: byId('settingsForm'), settingTitle: byId('settingTitle'), settingSubtitle: byId('settingSubtitle'),
  settingNotice: byId('settingNotice'), settingFooter: byId('settingFooter'), toastContainer: byId('toastContainer')
};

const state = { user: null, apps: {}, categories: {}, settings: { ...DEFAULT_SETTINGS }, unsubscribers: [] };

function text(value, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function normalizeColor(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#36588e'; }
function validUrl(value) {
  const url = text(value);
  if (!url || /^(javascript|data|vbscript):/i.test(url)) return false;
  try { return ['http:', 'https:'].includes(new URL(url, window.location.href).protocol); } catch { return false; }
}
function sortedApps() {
  return Object.entries(state.apps).map(([id, app]) => ({ id, ...app }))
    .sort((a, b) => num(a.order, 9999) - num(b.order, 9999) || text(a.title).localeCompare(text(b.title), 'ko'));
}
function sortedCategories() {
  return Object.entries(state.categories).map(([id, category]) => ({ id, ...category }))
    .sort((a, b) => num(a.order, 9999) - num(b.order, 9999) || text(a.name).localeCompare(text(b.name), 'ko'));
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  els.toastContainer.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}

function authMessage(code) {
  const map = {
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/invalid-email': '이메일 형식을 확인해주세요.',
    'auth/too-many-requests': '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '인터넷 연결을 확인해주세요.'
  };
  return map[code] || '로그인하지 못했습니다. 계정과 Firebase 설정을 확인해주세요.';
}

function dbMessage(error) {
  if (error?.code === 'PERMISSION_DENIED' || String(error?.message).includes('PERMISSION_DENIED')) {
    return '저장 권한이 없습니다. Realtime Database 규칙의 관리자 UID를 확인해주세요.';
  }
  return error?.message || '처리 중 오류가 발생했습니다.';
}

function updateStats() {
  const apps = Object.values(state.apps);
  els.statTotal.textContent = String(apps.length);
  els.statVisible.textContent = String(apps.filter(app => app.visible !== false).length);
  els.statFeatured.textContent = String(apps.filter(app => app.featured).length);
  els.statCategories.textContent = String(Object.keys(state.categories).length);
  els.adminListCount.textContent = `${apps.length}개`;
}

function categoryName(id) { return text(state.categories[id]?.name, '미분류'); }

function renderAppList() {
  updateStats();
  const apps = sortedApps();
  els.adminAppList.replaceChildren();

  if (!apps.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-admin';
    empty.innerHTML = '<strong>등록된 앱이 없습니다.</strong><span>위의 “현재 앱 한 번에 불러오기” 또는 “새 앱 추가”를 이용하세요.</span>';
    els.adminAppList.appendChild(empty);
    return;
  }

  apps.forEach((app, index) => {
    const row = document.createElement('div');
    row.className = `admin-app-row${app.visible === false ? ' is-hidden' : ''}`;
    row.dataset.id = app.id;

    const icon = document.createElement('div');
    icon.className = 'admin-app-icon';
    icon.textContent = text(app.icon, '🔗');

    const copy = document.createElement('div');
    copy.className = 'admin-app-copy';
    const title = document.createElement('div');
    title.className = 'admin-app-title';
    title.textContent = text(app.title, '이름 없는 앱');
    const meta = document.createElement('div');
    meta.className = 'admin-app-meta';
    const labels = [categoryName(app.category), app.visible === false ? '숨김' : '공개', app.featured ? '상단 고정' : '', app.isNew ? 'NEW' : ''].filter(Boolean);
    meta.textContent = labels.join(' · ');
    copy.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(
      rowButton('↑', 'up', '위로 이동', index === 0),
      rowButton('↓', 'down', '아래로 이동', index === apps.length - 1),
      rowButton(app.visible === false ? '공개' : '숨김', 'toggle', app.visible === false ? '공개하기' : '숨기기'),
      rowButton('수정', 'edit', '수정'),
      rowButton('삭제', 'delete', '삭제', false, true)
    );
    row.append(icon, copy, actions);
    els.adminAppList.appendChild(row);
  });
}

function rowButton(label, action, title, disabled = false, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `row-action${danger ? ' danger' : ''}`;
  button.dataset.action = action;
  button.title = title;
  button.textContent = label;
  button.disabled = disabled;
  if (label.length > 1) button.style.width = 'auto', button.style.padding = '0 9px';
  return button;
}

function renderCategoryOptions(selected = els.appCategory.value) {
  els.appCategory.replaceChildren();
  const categories = sortedCategories();
  if (!categories.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '카테고리를 먼저 추가하세요';
    els.appCategory.appendChild(option);
    return;
  }
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = text(category.name, '기타');
    option.selected = category.id === selected;
    els.appCategory.appendChild(option);
  });
}

function renderCategoryManager() {
  const categories = sortedCategories();
  els.categoryManager.replaceChildren();
  categories.forEach(category => {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.dataset.id = category.id;
    const input = document.createElement('input');
    input.value = text(category.name);
    input.maxLength = 30;
    input.setAttribute('aria-label', '카테고리 이름');
    const saveButton = document.createElement('button');
    saveButton.type = 'button'; saveButton.className = 'soft-button small-button'; saveButton.dataset.action = 'save-category'; saveButton.textContent = '저장';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button'; deleteButton.className = 'danger-button small-button'; deleteButton.dataset.action = 'delete-category'; deleteButton.textContent = '삭제';
    row.append(input, saveButton, deleteButton);
    els.categoryManager.appendChild(row);
  });
  renderCategoryOptions();
  updateStats();
}

function fillSettings() {
  els.settingTitle.value = text(state.settings.title, DEFAULT_SETTINGS.title);
  els.settingSubtitle.value = text(state.settings.subtitle, DEFAULT_SETTINGS.subtitle);
  els.settingNotice.value = text(state.settings.notice);
  els.settingFooter.value = text(state.settings.footer, DEFAULT_SETTINGS.footer);
}

function resetAppForm() {
  els.appForm.reset();
  els.appId.value = '';
  els.formTitle.textContent = '새 앱 추가';
  els.appColor.value = '#36588e';
  els.appOpenMode.value = 'new';
  els.primaryLabel.value = '실행';
  els.appVisible.checked = true;
  els.appFeatured.checked = false;
  els.appIsNew.checked = false;
  renderCategoryOptions(sortedCategories()[0]?.id || '');
}

function editApp(id) {
  const app = state.apps[id];
  if (!app) return;
  els.appId.value = id;
  els.formTitle.textContent = '앱 수정';
  els.appTitle.value = text(app.title);
  els.appDescription.value = text(app.description);
  renderCategoryOptions(app.category);
  els.appIcon.value = text(app.icon);
  els.appColor.value = normalizeColor(app.color);
  els.appOpenMode.value = app.openMode === 'same' ? 'same' : 'new';
  els.primaryLabel.value = text(app.primaryLabel, '실행');
  els.primaryUrl.value = text(app.primaryUrl);
  els.secondaryLabel.value = text(app.secondaryLabel);
  els.secondaryUrl.value = text(app.secondaryUrl);
  els.appVisible.checked = app.visible !== false;
  els.appFeatured.checked = Boolean(app.featured);
  els.appIsNew.checked = Boolean(app.isNew);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => els.appTitle.focus(), 250);
}

function collectAppData(existing = {}) {
  const primaryUrl = text(els.primaryUrl.value);
  const secondaryUrl = text(els.secondaryUrl.value);
  if (!validUrl(primaryUrl)) throw new Error('첫 번째 주소를 확인해주세요. HTML 파일명 또는 https:// 주소를 입력할 수 있습니다.');
  if (secondaryUrl && !validUrl(secondaryUrl)) throw new Error('두 번째 주소를 확인해주세요.');
  if (secondaryUrl && !text(els.secondaryLabel.value)) throw new Error('두 번째 주소를 사용하려면 버튼 이름도 입력해주세요.');
  return {
    title: text(els.appTitle.value),
    description: text(els.appDescription.value),
    category: els.appCategory.value,
    icon: text(els.appIcon.value, '🔗'),
    color: normalizeColor(els.appColor.value),
    primaryLabel: text(els.primaryLabel.value, '실행'),
    primaryUrl,
    secondaryLabel: secondaryUrl ? text(els.secondaryLabel.value) : '',
    secondaryUrl,
    openMode: els.appOpenMode.value === 'same' ? 'same' : 'new',
    visible: els.appVisible.checked,
    featured: els.appFeatured.checked,
    isNew: els.appIsNew.checked,
    order: num(existing.order, Math.max(0, ...Object.values(state.apps).map(app => num(app.order))) + 10),
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

function attachDatabaseListeners() {
  state.unsubscribers.forEach(unsubscribe => unsubscribe());
  state.unsubscribers = [
    onValue(ref(db, 'portal/apps'), snapshot => { state.apps = snapshot.val() || {}; renderAppList(); }, error => toast(dbMessage(error), 'error')),
    onValue(ref(db, 'portal/categories'), snapshot => { state.categories = snapshot.val() || {}; renderCategoryManager(); }, error => toast(dbMessage(error), 'error')),
    onValue(ref(db, 'portal/settings'), snapshot => { state.settings = { ...DEFAULT_SETTINGS, ...(snapshot.val() || {}) }; fillSettings(); }, error => toast(dbMessage(error), 'error'))
  ];
}

els.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  els.loginError.textContent = '';
  els.loginButton.disabled = true;
  els.loginButton.textContent = '로그인 중…';
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, text(els.loginEmail.value), els.loginPassword.value);
  } catch (error) {
    console.error(error);
    els.loginError.textContent = authMessage(error.code);
  } finally {
    els.loginButton.disabled = false;
    els.loginButton.textContent = '로그인';
  }
});

els.logoutButton.addEventListener('click', async () => { await signOut(auth); });
els.newAppButton.addEventListener('click', () => { resetAppForm(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => els.appTitle.focus(), 250); });
els.cancelEditButton.addEventListener('click', resetAppForm);

els.appForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!Object.keys(state.categories).length) return toast('카테고리를 먼저 추가해주세요.', 'error');
  const id = els.appId.value;
  const existing = id ? state.apps[id] || {} : {};
  els.saveAppButton.disabled = true;
  try {
    const data = collectAppData(existing);
    const appId = id || push(ref(db, 'portal/apps')).key;
    await set(ref(db, `portal/apps/${appId}`), data);
    toast(id ? '앱 정보를 수정했습니다.' : '새 앱을 등록했습니다.');
    resetAppForm();
  } catch (error) {
    console.error(error);
    toast(error.message?.startsWith('첫') || error.message?.startsWith('두') ? error.message : dbMessage(error), 'error');
  } finally {
    els.saveAppButton.disabled = false;
  }
});

els.adminAppList.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('[data-id]');
  if (!button || !row) return;
  const id = row.dataset.id;
  const action = button.dataset.action;
  const apps = sortedApps();
  const index = apps.findIndex(app => app.id === id);
  const app = state.apps[id];
  if (!app) return;

  try {
    if (action === 'edit') return editApp(id);
    if (action === 'toggle') {
      await update(ref(db, `portal/apps/${id}`), { visible: app.visible === false, updatedAt: Date.now() });
      return toast(app.visible === false ? '앱을 공개했습니다.' : '앱을 숨겼습니다.');
    }
    if (action === 'delete') {
      if (!confirm(`“${text(app.title)}” 앱 카드를 삭제할까요?\n실제 HTML 파일은 삭제되지 않습니다.`)) return;
      await remove(ref(db, `portal/apps/${id}`));
      if (els.appId.value === id) resetAppForm();
      return toast('앱 카드를 삭제했습니다.');
    }
    if (action === 'up' || action === 'down') {
      const otherIndex = action === 'up' ? index - 1 : index + 1;
      if (otherIndex < 0 || otherIndex >= apps.length) return;
      const other = apps[otherIndex];
      const currentOrder = num(app.order, (index + 1) * 10);
      const otherOrder = num(other.order, (otherIndex + 1) * 10);
      await update(ref(db, 'portal/apps'), {
        [`${id}/order`]: otherOrder,
        [`${id}/updatedAt`]: Date.now(),
        [`${other.id}/order`]: currentOrder,
        [`${other.id}/updatedAt`]: Date.now()
      });
      return toast('표시 순서를 변경했습니다.');
    }
  } catch (error) {
    console.error(error);
    toast(dbMessage(error), 'error');
  }
});

els.seedButton.addEventListener('click', async () => {
  const existingCount = Object.keys(state.apps).length;
  const message = existingCount
    ? '기본 목록 중 현재 없는 앱과 카테고리만 추가합니다. 기존에 수정한 앱은 유지됩니다. 계속할까요?'
    : '현재 GitHub 저장소의 앱 목록을 Firebase에 등록할까요?';
  if (!confirm(message)) return;
  els.seedButton.disabled = true;
  try {
    const appUpdates = {};
    Object.entries(DEFAULT_APPS).forEach(([id, app]) => {
      if (!state.apps[id]) appUpdates[id] = { ...app, createdAt: Date.now(), updatedAt: Date.now() };
    });
    const categoryUpdates = {};
    Object.entries(DEFAULT_CATEGORIES).forEach(([id, category]) => {
      if (!state.categories[id]) categoryUpdates[id] = category;
    });
    const tasks = [];
    if (Object.keys(appUpdates).length) tasks.push(update(ref(db, 'portal/apps'), appUpdates));
    if (Object.keys(categoryUpdates).length) tasks.push(update(ref(db, 'portal/categories'), categoryUpdates));
    const settingsSnapshot = await get(ref(db, 'portal/settings'));
    if (!settingsSnapshot.exists()) tasks.push(set(ref(db, 'portal/settings'), DEFAULT_SETTINGS));
    await Promise.all(tasks);
    toast(tasks.length ? '기존 앱 목록을 등록했습니다.' : '추가할 기본 앱이 없습니다.');
  } catch (error) {
    console.error(error);
    toast(dbMessage(error), 'error');
  } finally {
    els.seedButton.disabled = false;
  }
});

els.categoryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = text(els.newCategoryName.value);
  if (!name) return;
  if (sortedCategories().some(category => text(category.name).toLocaleLowerCase('ko') === name.toLocaleLowerCase('ko'))) return toast('같은 이름의 카테고리가 있습니다.', 'error');
  const id = push(ref(db, 'portal/categories')).key;
  const order = Math.max(0, ...Object.values(state.categories).map(category => num(category.order))) + 10;
  try {
    await set(ref(db, `portal/categories/${id}`), { name, order });
    els.newCategoryName.value = '';
    toast('카테고리를 추가했습니다.');
  } catch (error) { toast(dbMessage(error), 'error'); }
});

els.categoryManager.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('[data-id]');
  if (!button || !row) return;
  const id = row.dataset.id;
  const name = text(row.querySelector('input').value);
  try {
    if (button.dataset.action === 'save-category') {
      if (!name) return toast('카테고리 이름을 입력해주세요.', 'error');
      await update(ref(db, `portal/categories/${id}`), { name });
      return toast('카테고리 이름을 저장했습니다.');
    }
    if (button.dataset.action === 'delete-category') {
      const used = Object.values(state.apps).some(app => app.category === id);
      if (used) return toast('이 카테고리를 사용하는 앱이 있어 삭제할 수 없습니다.', 'error');
      if (!confirm(`“${name}” 카테고리를 삭제할까요?`)) return;
      await remove(ref(db, `portal/categories/${id}`));
      return toast('카테고리를 삭제했습니다.');
    }
  } catch (error) { toast(dbMessage(error), 'error'); }
});

els.settingsForm.addEventListener('submit', async event => {
  event.preventDefault();
  const settings = {
    title: text(els.settingTitle.value, DEFAULT_SETTINGS.title),
    subtitle: text(els.settingSubtitle.value, DEFAULT_SETTINGS.subtitle),
    notice: text(els.settingNotice.value),
    footer: text(els.settingFooter.value, DEFAULT_SETTINGS.footer),
    updatedAt: Date.now()
  };
  try {
    await set(ref(db, 'portal/settings'), settings);
    toast('홈페이지 설정을 저장했습니다.');
  } catch (error) { toast(dbMessage(error), 'error'); }
});

onAuthStateChanged(auth, user => {
  state.user = user;
  if (user) {
    els.loginScreen.classList.add('hidden');
    els.adminScreen.classList.remove('hidden');
    els.adminEmail.textContent = user.email || '관리자';
    attachDatabaseListeners();
    resetAppForm();
  } else {
    state.unsubscribers.forEach(unsubscribe => unsubscribe());
    state.unsubscribers = [];
    els.adminScreen.classList.add('hidden');
    els.loginScreen.classList.remove('hidden');
    els.loginPassword.value = '';
  }
});
