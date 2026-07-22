import { auth, db } from './firebase-config.js';
import { DEFAULT_APPS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, THEME_PRESETS } from './default-data.js';
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
  appIconFile: byId('appIconFile'), appIconPreview: byId('appIconPreview'), removeAppIconImage: byId('removeAppIconImage'),
  appOpenMode: byId('appOpenMode'), primaryLabel: byId('primaryLabel'), primaryUrl: byId('primaryUrl'), secondaryLabel: byId('secondaryLabel'),
  secondaryUrl: byId('secondaryUrl'), appVisible: byId('appVisible'), appFeatured: byId('appFeatured'), appIsNew: byId('appIsNew'),
  saveAppButton: byId('saveAppButton'), cancelEditButton: byId('cancelEditButton'), categoryManager: byId('categoryManager'), categoryForm: byId('categoryForm'),
  newCategoryName: byId('newCategoryName'), settingsForm: byId('settingsForm'), settingTitle: byId('settingTitle'), settingSubtitle: byId('settingSubtitle'),
  settingNotice: byId('settingNotice'), settingFooter: byId('settingFooter'), backgroundFile: byId('backgroundFile'),
  backgroundPreview: byId('backgroundPreview'), removeBackgroundImage: byId('removeBackgroundImage'),
  settingBackgroundOverlay: byId('settingBackgroundOverlay'), backgroundOverlayValue: byId('backgroundOverlayValue'),
  settingThemePreset: byId('settingThemePreset'), settingBackgroundStyle: byId('settingBackgroundStyle'),
  settingThemeBackground: byId('settingThemeBackground'), settingThemeSurface: byId('settingThemeSurface'),
  settingThemePrimary: byId('settingThemePrimary'), settingThemeSecondary: byId('settingThemeSecondary'), settingThemeText: byId('settingThemeText'),
  settingDarkBackground: byId('settingDarkBackground'), settingDarkSurface: byId('settingDarkSurface'),
  settingDarkPrimary: byId('settingDarkPrimary'), settingDarkSecondary: byId('settingDarkSecondary'), settingDarkText: byId('settingDarkText'),
  settingCornerRadius: byId('settingCornerRadius'), cornerRadiusValue: byId('cornerRadiusValue'), themePreview: byId('themePreview'), resetThemeButton: byId('resetThemeButton'),
  toastContainer: byId('toastContainer')
};

const state = { user: null, apps: {}, categories: {}, settings: { ...DEFAULT_SETTINGS }, unsubscribers: [] };
let draftAppIconImage = '';
let draftBackgroundImage = '';
let imageTaskCount = 0;
let lastSettingsFormHash = '';
const SETTINGS_FORM_KEYS = ['title','subtitle','notice','footer','backgroundImage','backgroundOverlay','themePreset','backgroundStyle','themeBackground','themeSurface','themePrimary','themeSecondary','themeText','darkBackground','darkSurface','darkPrimary','darkSecondary','darkText','cornerRadius'];
function settingsFormHash(settings) { return JSON.stringify(Object.fromEntries(SETTINGS_FORM_KEYS.map(key => [key, settings?.[key] ?? null]))); }

function text(value, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function normalizeColor(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#36588e'; }
function validUrl(value) {
  const url = text(value);
  if (!url || /^(javascript|data|vbscript):/i.test(url)) return false;
  try { return ['http:', 'https:'].includes(new URL(url, window.location.href).protocol); } catch { return false; }
}

function isImageDataUrl(value) {
  return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function themeValue(id, fallback) { return normalizeColor(els[id]?.value || fallback); }
function themeFormValues() {
  return {
    themePreset: els.settingThemePreset.value || 'custom', backgroundStyle: els.settingBackgroundStyle.value || 'soft',
    themeBackground: themeValue('settingThemeBackground', DEFAULT_SETTINGS.themeBackground), themeSurface: themeValue('settingThemeSurface', DEFAULT_SETTINGS.themeSurface),
    themePrimary: themeValue('settingThemePrimary', DEFAULT_SETTINGS.themePrimary), themeSecondary: themeValue('settingThemeSecondary', DEFAULT_SETTINGS.themeSecondary), themeText: themeValue('settingThemeText', DEFAULT_SETTINGS.themeText),
    darkBackground: themeValue('settingDarkBackground', DEFAULT_SETTINGS.darkBackground), darkSurface: themeValue('settingDarkSurface', DEFAULT_SETTINGS.darkSurface),
    darkPrimary: themeValue('settingDarkPrimary', DEFAULT_SETTINGS.darkPrimary), darkSecondary: themeValue('settingDarkSecondary', DEFAULT_SETTINGS.darkSecondary), darkText: themeValue('settingDarkText', DEFAULT_SETTINGS.darkText),
    cornerRadius: Math.round(clamp(els.settingCornerRadius.value, 12, 42))
  };
}
function applyThemePreset(key) {
  const preset = THEME_PRESETS[key] || THEME_PRESETS.lavender;
  Object.entries(preset).forEach(([name, value]) => {
    if (name === 'label') return;
    const id = name.replace(/^./, char => char.toUpperCase());
    const element = els[`setting${id}`];
    if (element) element.value = value;
  });
  updateThemePreview();
}
function updateThemePreview() {
  const t = themeFormValues();
  els.cornerRadiusValue.textContent = `${t.cornerRadius}px`;
  const preview = els.themePreview;
  preview.style.setProperty('--preview-bg', t.themeBackground);
  preview.style.setProperty('--preview-surface', t.themeSurface);
  preview.style.setProperty('--preview-primary', t.themePrimary);
  preview.style.setProperty('--preview-secondary', t.themeSecondary);
  preview.style.setProperty('--preview-text', t.themeText);
  preview.style.setProperty('--preview-radius', `${t.cornerRadius}px`);
  preview.dataset.backgroundStyle = t.backgroundStyle;
}

function setImageTask(active) {
  imageTaskCount = Math.max(0, imageTaskCount + (active ? 1 : -1));
  const busy = imageTaskCount > 0;
  els.saveAppButton.disabled = busy;
  const settingsButton = els.settingsForm.querySelector('button[type="submit"]');
  if (settingsButton) settingsButton.disabled = busy;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지를 압축하지 못했습니다.')), type, quality);
  });
}

async function compressImage(file, { maxWidth, maxHeight, quality, maxBytes }) {
  if (!file || !file.type.startsWith('image/')) throw new Error('이미지 파일을 선택해주세요.');
  if (file.size > 15 * 1024 * 1024) throw new Error('원본 이미지가 너무 큽니다. 15MB 이하 파일을 선택해주세요.');

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('이미지 형식을 읽을 수 없습니다.'));
      image.src = sourceUrl;
    });

    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('이미지 크기를 확인할 수 없습니다.');

    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    let currentQuality = quality;
    let currentWidth = width;
    let currentHeight = height;
    let blob;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('이 브라우저에서는 이미지 처리를 사용할 수 없습니다.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, currentWidth, currentHeight);
      blob = await canvasToBlob(canvas, 'image/webp', currentQuality);
      if (blob.size <= maxBytes) break;
      currentQuality = Math.max(.55, currentQuality - .08);
      currentWidth = Math.max(120, Math.round(currentWidth * .88));
      currentHeight = Math.max(120, Math.round(currentHeight * .88));
    }

    if (!blob) throw new Error('이미지를 압축하지 못했습니다.');
    return blobToDataUrl(blob);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function renderImagePreview(container, dataUrl, emptyText, mode = 'icon') {
  container.replaceChildren();
  if (isImageDataUrl(dataUrl)) {
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = mode === 'background' ? '선택한 배경 미리보기' : '선택한 아이콘 미리보기';
    container.appendChild(image);
    container.classList.add('has-image');
  } else {
    const label = document.createElement('span');
    label.textContent = emptyText;
    container.appendChild(label);
    container.classList.remove('has-image');
  }
}

function updateIconPreview() {
  renderImagePreview(els.appIconPreview, draftAppIconImage, '사진 없음', 'icon');
  els.removeAppIconImage.disabled = !draftAppIconImage;
}

function updateBackgroundPreview() {
  renderImagePreview(els.backgroundPreview, draftBackgroundImage, '기본 배경 사용 중', 'background');
  els.removeBackgroundImage.disabled = !draftBackgroundImage;
}

function updateOverlayLabel() {
  const value = Math.round(clamp(els.settingBackgroundOverlay.value, 20, 90));
  els.settingBackgroundOverlay.value = String(value);
  els.backgroundOverlayValue.textContent = `${value}%`;
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
    if (isImageDataUrl(app.iconImage)) {
      const image = document.createElement('img');
      image.src = app.iconImage;
      image.alt = '';
      icon.appendChild(image);
      icon.classList.add('has-image');
    } else {
      icon.textContent = text(app.icon, '🔗');
    }

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
  draftBackgroundImage = isImageDataUrl(state.settings.backgroundImage) ? state.settings.backgroundImage : '';
  els.backgroundFile.value = '';
  els.settingBackgroundOverlay.value = String(Math.round(clamp(state.settings.backgroundOverlay ?? DEFAULT_SETTINGS.backgroundOverlay, 20, 90)));
  const theme = { ...DEFAULT_SETTINGS, ...state.settings };
  els.settingThemePreset.value = theme.themePreset || 'custom';
  els.settingBackgroundStyle.value = theme.backgroundStyle || 'soft';
  ['themeBackground','themeSurface','themePrimary','themeSecondary','themeText','darkBackground','darkSurface','darkPrimary','darkSecondary','darkText'].forEach(name => {
    const id = `setting${name.replace(/^./, char => char.toUpperCase())}`;
    if (els[id]) els[id].value = normalizeColor(theme[name]);
  });
  els.settingCornerRadius.value = String(Math.round(clamp(theme.cornerRadius, 12, 42)));
  updateBackgroundPreview();
  updateOverlayLabel();
  updateThemePreview();
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
  draftAppIconImage = '';
  els.appIconFile.value = '';
  updateIconPreview();
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
  draftAppIconImage = isImageDataUrl(app.iconImage) ? app.iconImage : '';
  els.appIconFile.value = '';
  updateIconPreview();
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
    iconImage: draftAppIconImage,
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
    onValue(ref(db, 'portal/settings'), snapshot => { const incoming = snapshot.val() || {}; state.settings = { ...DEFAULT_SETTINGS, ...incoming }; const nextHash = settingsFormHash(state.settings); if (nextHash !== lastSettingsFormHash) { lastSettingsFormHash = nextHash; fillSettings(); } }, error => toast(dbMessage(error), 'error'))
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

els.appIconFile.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  setImageTask(true);
  try {
    draftAppIconImage = await compressImage(file, {
      maxWidth: 220,
      maxHeight: 220,
      quality: .82,
      maxBytes: 60 * 1024
    });
    updateIconPreview();
    toast('아이콘 사진을 준비했습니다. 앱 정보를 저장해주세요.');
  } catch (error) {
    console.error(error);
    toast(error.message || '아이콘 사진을 처리하지 못했습니다.', 'error');
  } finally {
    event.target.value = '';
    setImageTask(false);
  }
});

els.removeAppIconImage.addEventListener('click', () => {
  draftAppIconImage = '';
  els.appIconFile.value = '';
  updateIconPreview();
});

els.backgroundFile.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  setImageTask(true);
  try {
    draftBackgroundImage = await compressImage(file, {
      maxWidth: 1600,
      maxHeight: 1050,
      quality: .8,
      maxBytes: 420 * 1024
    });
    updateBackgroundPreview();
    toast('배경 사진을 준비했습니다. 홈페이지 설정을 저장해주세요.');
  } catch (error) {
    console.error(error);
    toast(error.message || '배경 사진을 처리하지 못했습니다.', 'error');
  } finally {
    event.target.value = '';
    setImageTask(false);
  }
});

els.removeBackgroundImage.addEventListener('click', () => {
  draftBackgroundImage = '';
  els.backgroundFile.value = '';
  updateBackgroundPreview();
});

els.settingBackgroundOverlay.addEventListener('input', updateOverlayLabel);

els.appForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (imageTaskCount) return toast('이미지를 처리하는 중입니다. 잠시 후 다시 저장해주세요.', 'error');
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


els.settingThemePreset.addEventListener('change', () => {
  if (els.settingThemePreset.value !== 'custom') applyThemePreset(els.settingThemePreset.value);
  else updateThemePreview();
});
[els.settingBackgroundStyle, els.settingThemeBackground, els.settingThemeSurface, els.settingThemePrimary, els.settingThemeSecondary, els.settingThemeText,
 els.settingDarkBackground, els.settingDarkSurface, els.settingDarkPrimary, els.settingDarkSecondary, els.settingDarkText, els.settingCornerRadius]
  .forEach(element => element?.addEventListener('input', () => {
    if (element !== els.settingBackgroundStyle && element !== els.settingCornerRadius) els.settingThemePreset.value = 'custom';
    updateThemePreview();
  }));
els.resetThemeButton.addEventListener('click', () => {
  els.settingThemePreset.value = 'lavender';
  els.settingBackgroundStyle.value = 'soft';
  applyThemePreset('lavender');
  els.settingCornerRadius.value = String(DEFAULT_SETTINGS.cornerRadius);
  updateThemePreview();
  toast('기본 라벤더 테마로 되돌렸습니다. 저장 버튼을 눌러 적용하세요.');
});

els.settingsForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (imageTaskCount) return toast('이미지를 처리하는 중입니다. 잠시 후 다시 저장해주세요.', 'error');
  const submitButton = els.settingsForm.querySelector('button[type="submit"]');
  const settings = {
    title: text(els.settingTitle.value, DEFAULT_SETTINGS.title),
    subtitle: text(els.settingSubtitle.value, DEFAULT_SETTINGS.subtitle),
    notice: text(els.settingNotice.value),
    footer: text(els.settingFooter.value, DEFAULT_SETTINGS.footer),
    backgroundImage: draftBackgroundImage,
    backgroundOverlay: Math.round(clamp(els.settingBackgroundOverlay.value, 20, 90)),
    ...themeFormValues(),
    updatedAt: Date.now()
  };
  if (submitButton) submitButton.disabled = true;
  try {
    await update(ref(db, 'portal/settings'), settings);
    toast('홈페이지 설정을 저장했습니다.');
  } catch (error) {
    console.error(error);
    toast(dbMessage(error), 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
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
