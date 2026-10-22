import { DEFAULT_APPS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './default-data.js';
import { createAppPreview } from './portal-preview.js?v=20261022-app-details1';
import { createAppReorder } from './portal-reorder.js?v=20261022-app-details1';

const els = {
  brandTitle: document.getElementById('brandTitle'),
  todayDate: document.getElementById('todayDate'),
  notice: document.getElementById('notice'),
  searchInput: document.getElementById('searchInput'),
  categoryTabs: document.getElementById('categoryTabs'),
  searchStatus: document.getElementById('searchStatus'),
  categorySections: document.getElementById('categorySections'),
  quickSection: document.getElementById('quickAccessSection'),
  quickApps: document.getElementById('quickApps'),
  launchChoice: document.getElementById('launchChoiceDialog'),
  footerText: document.getElementById('footerText'),
  themeToggle: document.getElementById('themeToggle'),
  themeColor: document.getElementById('themeColor')
};

const state = {
  apps: {},
  categories: {},
  settings: { ...DEFAULT_SETTINGS },
  activeCategory: 'all',
  search: '',
  appsLoaded: false,
  categoriesLoaded: false,
  settingsLoaded: false,
  loadError: '',
  cacheAvailable: false,
  cacheRendered: false,
  initialFirebaseCommitted: false,
  dataSource: 'loading',
  favorites: new Set(),
  recentIds: []
};

const CACHE_KEY = 'teacherPortalCacheV1';
const THEME_KEY = 'teacherPortalTheme';
const FAVORITES_KEY = 'teacherPortalFavoritesV1';
const RECENTS_KEY = 'teacherPortalRecentsV1';
const PORTAL_VERSION = '2.1.0';
// 카테고리 제목 밑에 긋는 형광펜 색. 순서대로 돌아가며 쓴다.
const SECTION_PALETTE = ['#ffe66d', '#ffc9d9', '#c6f0d8', '#cfe6ff', '#ffd9b5', '#e4d6ff'];
const QUICK_ACCESS_LIMIT = 6;
// 상단 칠판 띠 색. 브라우저 주소창 색을 여기에 맞춘다.
const BOARD_THEME_COLOR = '#15352b';
const CACHE_FALLBACK_DELAY = 450;
const FIREBASE_STARTUP_TIMEOUT = 5000;
let cacheFallbackTimer = 0;
let firebaseStartupTimer = 0;
let realtimeRenderTimer = 0;
let preview;
const reorder = createAppReorder({
  container: els.categorySections,
  toolbar: document.getElementById('appArrangeToolbar'),
  status: document.getElementById('arrangeStatus'),
  onEditChange: () => preview?.close()
});
preview = createAppPreview({
  container: els.categorySections,
  panel: document.getElementById('appPreview'),
  getApp: appById,
  renderContent: renderAppInfo,
  isEditing: () => reorder.isEditing()
});

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, save = false) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  const isDark = nextTheme === 'dark';
  document.documentElement.dataset.theme = nextTheme;

  if (els.themeToggle) {
    els.themeToggle.setAttribute('aria-pressed', String(isDark));
    els.themeToggle.setAttribute('aria-label', isDark ? '밝은 화면으로 변경' : '어두운 화면으로 변경');
    els.themeToggle.title = isDark ? '밝은 화면으로 변경' : '어두운 화면으로 변경';
  }
  applyVisualTheme(state.settings);

  if (save) {
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.warn('화면 모드 설정을 저장하지 못했습니다.', error);
    }
  }
}

applyTheme(currentTheme());

els.themeToggle?.addEventListener('click', () => {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
});

function renderTodayDate() {
  if (!els.todayDate) return;
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  els.todayDate.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  els.todayDate.dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!cached || typeof cached !== 'object') return false;
    state.apps = cached.apps || {};
    state.categories = cached.categories || {};
    state.settings = { ...DEFAULT_SETTINGS, ...(cached.settings || {}) };
    state.cacheAvailable = Boolean(Object.keys(state.apps).length || Object.keys(state.categories).length);
    applySettings();
    return state.cacheAvailable;
  } catch (error) {
    console.warn('포털 캐시를 읽지 못했습니다.', error);
    return false;
  }
}

function renderCachedFallback() {
  if (!state.cacheAvailable || state.initialFirebaseCommitted || state.cacheRendered) return;
  state.cacheRendered = true;
  state.dataSource = 'cache';
  commitPortalView();
}

function allInitialDataSettled() {
  return state.appsLoaded && state.categoriesLoaded && state.settingsLoaded;
}

function commitPortalView() {
  applySettings();
  renderCategories();
  renderCategorySections();
  renderQuickAccess();
  publishPortalData();
}

function commitInitialFirebaseView() {
  if (!allInitialDataSettled() || state.initialFirebaseCommitted) return;
  state.initialFirebaseCommitted = true;
  window.clearTimeout(cacheFallbackTimer);
  window.clearTimeout(firebaseStartupTimer);
  commitPortalView();
  saveCache();
}

function scheduleRealtimeRender() {
  if (!state.initialFirebaseCommitted) return commitInitialFirebaseView();
  window.clearTimeout(realtimeRenderTimer);
  realtimeRenderTimer = window.setTimeout(() => {
    commitPortalView();
    saveCache();
  }, 60);
}

function saveCache() {
  try {
    const cacheApps = Object.fromEntries(Object.entries(state.apps).map(([id, app]) => {
      const { iconImage, ...cacheApp } = app || {};
      return [id, cacheApp];
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      apps: cacheApps,
      categories: state.categories,
      settings: state.settings
    }));
  } catch (error) {
    console.warn('포털 캐시를 저장하지 못했습니다.', error);
  }
}

function cloneData(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}

function publishPortalData() {
  const detail = {
    apps: state.apps,
    categories: state.categories,
    settings: state.settings,
    source: state.dataSource,
    version: PORTAL_VERSION
  };
  window.__TEACHER_PORTAL_DATA__ = detail;
  window.dispatchEvent(new CustomEvent('teacher-portal-data', { detail }));
}

function loadUserPreferences() {
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    state.favorites = new Set(Array.isArray(favorites) ? favorites.filter(id => typeof id === 'string') : []);
  } catch { state.favorites = new Set(); }
  try {
    const recents = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    state.recentIds = Array.isArray(recents) ? recents.filter(id => typeof id === 'string').slice(0, QUICK_ACCESS_LIMIT) : [];
  } catch { state.recentIds = []; }
}

function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); } catch {}
}

function saveRecents() {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(state.recentIds)); } catch {}
}

function recordAppLaunch(appId) {
  if (!appId || !state.apps[appId]) return;
  state.recentIds = [appId, ...state.recentIds.filter(id => id !== appId)].slice(0, QUICK_ACCESS_LIMIT);
  saveRecents();
  renderQuickAccess();
}

function toggleFavorite(appId) {
  if (!appId || !state.apps[appId]) return false;
  if (state.favorites.has(appId)) state.favorites.delete(appId);
  else state.favorites.add(appId);
  saveFavorites();
  renderQuickAccess();
  return state.favorites.has(appId);
}

function appById(id) {
  return state.apps[id] ? { id, ...state.apps[id] } : null;
}

// "자주 쓰는" 줄: 즐겨찾기 먼저, 그다음 최근 실행. 비어 있으면 줄 자체를 숨긴다.
function quickAccessIds() {
  const favorites = [...state.favorites];
  const recents = state.recentIds.filter(id => !state.favorites.has(id));
  return [...favorites, ...recents]
    .filter(id => state.apps[id] && state.apps[id].visible !== false)
    .slice(0, QUICK_ACCESS_LIMIT);
}

function createQuickAppButton(app) {
  if (!safeUrl(app.primaryUrl)) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `quick-app-button${state.favorites.has(app.id) ? ' is-favorite' : ''}`;
  button.style.setProperty('--app-color', normalizeColor(app.color));

  const icon = document.createElement('span');
  icon.className = 'quick-app-icon';
  fillIcon(icon, app);

  const title = document.createElement('span');
  title.className = 'quick-app-name';
  title.textContent = cleanText(app.title, '앱');
  button.append(icon, title);
  button.addEventListener('click', () => requestLaunch(app));
  return button;
}

function renderQuickAccess() {
  if (!els.quickApps || !els.quickSection) return;
  els.quickApps.replaceChildren();
  quickAccessIds().forEach(id => {
    const button = createQuickAppButton(appById(id));
    if (button) els.quickApps.appendChild(button);
  });
  els.quickSection.classList.toggle('hidden', !els.quickApps.children.length);
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#8f79c1';
}

function iconFallback(app) {
  const own = cleanText(app.icon);
  if (own) return own;
  const first = Array.from(cleanText(app.title))[0];
  return first ? first.toUpperCase() : '●';
}

// 아이콘 칸 채우기: 올린 그림 > 이모지 > 앱 이름 첫 글자. 그림이 깨지면 글자로 바꾼다.
function fillIcon(icon, app) {
  const useLetter = () => {
    icon.classList.remove('has-image');
    icon.classList.toggle('is-letter', !cleanText(app.icon));
    icon.replaceChildren(document.createTextNode(iconFallback(app)));
  };
  if (isImageDataUrl(app.iconImage)) {
    const image = document.createElement('img');
    image.alt = '';
    image.addEventListener('error', useLetter, { once: true });
    image.src = app.iconImage;
    icon.appendChild(image);
    icon.classList.add('has-image');
  } else {
    useLetter();
  }
}

function isImageDataUrl(value) {
  return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function themeHex(value, fallback) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback; }
function applyVisualTheme(rawSettings = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
  const dark = currentTheme() === 'dark';
  const background = themeHex(dark ? settings.darkBackground : settings.themeBackground, dark ? '#17141f' : '#fff8fb');
  const surface = themeHex(dark ? settings.darkSurface : settings.themeSurface, dark ? '#282233' : '#ffffff');
  const primary = themeHex(dark ? settings.darkPrimary : settings.themePrimary, dark ? '#c7b5f3' : '#9a82d0');
  const secondary = themeHex(dark ? settings.darkSecondary : settings.themeSecondary, dark ? '#86add4' : '#8db9e7');
  const text = themeHex(dark ? settings.darkText : settings.themeText, dark ? '#f8f3fb' : '#443c52');
  document.body.style.setProperty('--portal-theme-bg', background);
  document.body.style.setProperty('--portal-theme-surface', surface);
  document.body.style.setProperty('--portal-theme-primary', primary);
  document.body.style.setProperty('--portal-theme-secondary', secondary);
  document.body.style.setProperty('--portal-theme-text', text);
  document.body.style.setProperty('--portal-corner-radius', String(Math.round(clamp(settings.cornerRadius, 12, 42))));
  const style = ['soft','gradient','solid'].includes(settings.backgroundStyle) ? settings.backgroundStyle : 'soft';
  document.body.dataset.backgroundStyle = style;
  if (els.themeColor) els.themeColor.setAttribute('content', BOARD_THEME_COLOR);
}

function applyBackground(settings) {
  const image = isImageDataUrl(settings.backgroundImage) ? settings.backgroundImage : '';
  const overlay = Math.round(clamp(settings.backgroundOverlay ?? DEFAULT_SETTINGS.backgroundOverlay, 20, 90));
  document.body.classList.toggle('has-custom-background', Boolean(image));
  document.body.style.setProperty('--portal-background-image', image ? `url("${image}")` : 'none');
  document.body.style.setProperty('--portal-background-overlay', String(overlay / 100));
}

function safeUrl(value) {
  const url = cleanText(value);
  if (!url) return '';
  if (/^(javascript|data|vbscript):/i.test(url)) return '';
  try {
    const parsed = new URL(url, window.location.href);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return url;
  } catch {
    return '';
  }
}

function categoryEntries() {
  return Object.entries(state.categories)
    .map(([id, item]) => ({
      id,
      name: cleanText(item?.name, '기타'),
      order: Number(item?.order) || 9999
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'));
}

function visibleApps() {
  return Object.entries(state.apps)
    .map(([id, app]) => ({ id, ...app }))
    .filter(app => app.visible !== false)
    .sort((a, b) => {
      const featuredDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      return featuredDiff
        || (Number(a.order) || 9999) - (Number(b.order) || 9999)
        || cleanText(a.title).localeCompare(cleanText(b.title), 'ko');
    });
}

function matchesSearch(app) {
  const query = state.search.toLocaleLowerCase('ko');
  if (!query) return true;
  const categoryName = cleanText(state.categories[app.category]?.name, '기타');
  const haystack = [app.title, app.description, categoryName]
    .map(value => cleanText(value).toLocaleLowerCase('ko'))
    .join(' ');
  return haystack.includes(query);
}

function groupedApps() {
  const allApps = visibleApps();
  const apps = allApps.filter(matchesSearch);
  const categories = categoryEntries();
  const knownIds = new Set(categories.map(item => item.id));
  const groups = categories
    .map(category => ({
      ...category,
      apps: reorder.sortApps(category.id, allApps.filter(app => app.category === category.id)).filter(matchesSearch)
    }))
    .filter(group => group.apps.length > 0);

  const uncategorized = reorder.sortApps('__other__', allApps.filter(app => !knownIds.has(app.category))).filter(matchesSearch);
  if (uncategorized.length) {
    groups.push({ id: '__other__', name: '기타', order: 99999, apps: uncategorized });
  }
  return { apps, groups };
}

function applySettings() {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const title = cleanText(settings.title, DEFAULT_SETTINGS.title);
  const footer = cleanText(settings.footer, DEFAULT_SETTINGS.footer);
  const notice = cleanText(settings.notice);

  document.title = title;
  els.brandTitle.textContent = title;
  els.footerText.textContent = footer;
  els.notice.textContent = notice;
  els.notice.classList.toggle('hidden', !notice);
  applyVisualTheme(settings);
  applyBackground(settings);
}

function categoryCounts() {
  const counts = new Map();
  visibleApps().filter(matchesSearch).forEach(app => {
    counts.set(app.category, (counts.get(app.category) || 0) + 1);
  });
  return counts;
}

function renderCategories() {
  const categories = categoryEntries();
  const counts = categoryCounts();
  const valid = state.activeCategory === 'all'
    || categories.some(item => item.id === state.activeCategory)
    || state.activeCategory === '__other__';
  if (!valid) state.activeCategory = 'all';

  els.categoryTabs.replaceChildren();
  const total = visibleApps().filter(matchesSearch).length;
  els.categoryTabs.appendChild(createCategoryButton('all', '전체', total));
  categories
    .filter(item => (counts.get(item.id) || 0) > 0)
    .forEach(item => els.categoryTabs.appendChild(createCategoryButton(item.id, item.name, counts.get(item.id) || 0)));
}

function createCategoryButton(id, name, count) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `category-tab${state.activeCategory === id ? ' active' : ''}`;
  button.dataset.category = id;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(state.activeCategory === id));

  const label = document.createElement('span');
  label.textContent = name;
  const number = document.createElement('span');
  number.className = 'category-tab-count';
  number.textContent = String(count);
  button.append(label, number);
  return button;
}

function launchApp(app, url = app.primaryUrl) {
  const safe = safeUrl(url);
  if (!safe) return;
  recordAppLaunch(app.id);
  if (app.openMode === 'same') window.location.assign(safe);
  else window.open(safe, '_blank', 'noopener,noreferrer');
}

// 링크가 하나면 바로 실행, 둘이면(교사용 · 학생용 등) 고르는 창을 띄운다.
function requestLaunch(app) {
  if (!app) return;
  if (safeUrl(app.secondaryUrl) && els.launchChoice) openLaunchChoice(app);
  else launchApp(app);
}

function renderAppInfo(host, app, kind = 'dialog') {
  host.replaceChildren();
  host.style.setProperty('--app-color', normalizeColor(app.color));
  const heading = document.createElement('div');
  heading.className = 'app-info-heading';
  const icon = document.createElement('span');
  icon.className = 'launch-choice-icon';
  fillIcon(icon, app);
  const titles = document.createElement('div');
  titles.className = 'app-info-titles';
  const category = document.createElement('span');
  category.className = 'app-info-category';
  category.textContent = cleanText(state.categories[app.category]?.name, '앱 안내');
  const title = document.createElement('h2');
  title.id = kind === 'dialog' ? 'appDetailsTitle' : 'appPreviewTitle';
  title.textContent = cleanText(app.title, '앱');
  titles.append(category, title);
  heading.append(icon, titles);
  const description = document.createElement('p');
  description.id = kind === 'dialog' ? 'appDetailsDescription' : 'appPreviewDescription';
  description.className = 'app-info-description';
  description.textContent = cleanText(app.description) || '사용하기를 눌러 앱을 시작하세요.';

  const actions = document.createElement('div');
  actions.className = 'launch-choice-actions';
  const hasSecondary = Boolean(safeUrl(app.secondaryUrl));
  [
    [hasSecondary ? (cleanText(app.primaryLabel) || '사용하기') : '사용하기', app.primaryUrl, 'primary'],
    [cleanText(app.secondaryLabel) || '두 번째 화면 열기', app.secondaryUrl, 'secondary']
  ].forEach(([label, url, style]) => {
    const safe = safeUrl(url);
    if (!safe) return;
    const link = document.createElement('a');
    link.className = `launch-choice-button ${style}`;
    link.href = safe;
    link.textContent = label;
    if (app.openMode !== 'same') {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.addEventListener('click', () => {
      recordAppLaunch(app.id);
      if (kind === 'dialog') els.launchChoice.close();
    });
    actions.appendChild(link);
  });
  host.append(heading, description, actions);
  if (app.openMode !== 'same') {
    const note = document.createElement('small');
    note.className = 'app-info-footnote';
    note.textContent = '새 창에서 열립니다';
    host.appendChild(note);
  }
}

function openLaunchChoice(app) {
  preview.close();
  const dialog = els.launchChoice;
  if (!dialog) return;
  renderAppInfo(dialog, app);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'launch-choice-close';
  close.setAttribute('aria-label', '앱 설명 닫기');
  close.textContent = '×';
  close.addEventListener('click', () => dialog.close());
  dialog.prepend(close);
  document.body.classList.add('app-details-open');
  if (!dialog.open) dialog.showModal();
  close.focus({ preventScroll: true });
}

els.launchChoice?.addEventListener('click', event => {
  if (event.target !== els.launchChoice) return;
  const rect = els.launchChoice.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    els.launchChoice.close();
  }
});
els.launchChoice?.addEventListener('close', () => {
  document.body.classList.remove('app-details-open');
  preview.close();
});

function createAppTile(app) {
  const tile = document.createElement('article');
  tile.className = 'app-tile';
  tile.dataset.appId = app.id;
  tile.style.setProperty('--app-color', normalizeColor(app.color));
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'app-tile-open';
  open.setAttribute('aria-label', `${cleanText(app.title, '앱')} 설명 보기`);
  open.setAttribute('aria-haspopup', 'dialog');
  open.setAttribute('aria-controls', 'launchChoiceDialog');

  const head = document.createElement('span');
  head.className = 'app-tile-head';

  const icon = document.createElement('span');
  icon.className = 'app-tile-icon';
  fillIcon(icon, app);

  const favorite = document.createElement('button');
  favorite.type = 'button';
  favorite.className = 'favorite-toggle';
  favorite.dataset.favoriteApp = app.id;
  const isFavorite = state.favorites.has(app.id);
  favorite.setAttribute('aria-pressed', String(isFavorite));
  favorite.setAttribute('aria-label', `${cleanText(app.title, '앱')} ${isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}`);
  favorite.title = isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가';
  favorite.textContent = isFavorite ? '★' : '☆';
  head.append(icon);

  if (app.isNew) {
    const badge = document.createElement('span');
    badge.className = 'app-tile-new';
    badge.textContent = 'NEW';
    head.appendChild(badge);
  }

  const name = document.createElement('span');
  name.className = 'app-tile-name';
  name.textContent = cleanText(app.title, '이름 없는 앱');
  if (app.featured) {
    const tag = document.createElement('span');
    tag.className = 'app-tile-tag';
    tag.textContent = '추천';
    name.appendChild(tag);
  }

  open.append(head, name);
  tile.append(open, favorite);

  if (safeUrl(app.secondaryUrl)) {
    const sub = document.createElement('span');
    sub.className = 'app-tile-sub';
    sub.textContent = `${cleanText(app.primaryLabel, '실행')} · ${cleanText(app.secondaryLabel, '열기')}`;
    open.appendChild(sub);
  }

  if (safeUrl(app.primaryUrl)) {
    tile.classList.add('is-clickable');
  } else {
    open.disabled = true;
  }
  return tile;
}

function createCategorySection(group, groupIndex) {
  const section = document.createElement('section');
  section.className = 'category-section';
  section.dataset.categorySection = group.id;
  section.style.setProperty('--section-color', SECTION_PALETTE[groupIndex % SECTION_PALETTE.length]);

  const heading = document.createElement('h2');
  heading.className = 'category-title';
  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = group.name;
  const count = document.createElement('span');
  count.className = 'category-count';
  count.textContent = String(group.apps.length);
  heading.append(name, count);

  const grid = document.createElement('div');
  grid.className = 'tile-grid';
  grid.setAttribute('aria-label', `${group.name} 앱 목록`);
  group.apps.forEach(app => grid.appendChild(createAppTile(app)));

  section.append(heading, grid);
  return section;
}

function appendStatusState(className, titleText, detailText) {
  const box = document.createElement('div');
  box.className = className;
  const title = document.createElement('strong');
  title.textContent = titleText;
  const detail = document.createElement('span');
  detail.textContent = detailText;
  box.append(title, detail);
  els.categorySections.appendChild(box);
}

function renderCategorySections() {
  preview.close();
  reorder.beforeRender();
  const { apps, groups } = groupedApps();
  if (els.searchStatus) {
    els.searchStatus.textContent = state.search ? `“${state.search}” 검색 결과 ${apps.length}개` : '';
    els.searchStatus.classList.toggle('hidden', !state.search);
  }
  els.categorySections.replaceChildren();

  if (state.loadError && !Object.keys(state.apps).length) {
    appendStatusState('error-state category-wide-state', '앱 목록을 불러오지 못했습니다.', state.loadError);
    return;
  }

  if (!state.appsLoaded && !Object.keys(state.apps).length) {
    for (let i = 0; i < 2; i += 1) {
      const skeletonSection = document.createElement('div');
      skeletonSection.className = 'category-section category-section-skeleton';
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      skeletonSection.appendChild(skeleton);
      els.categorySections.appendChild(skeletonSection);
    }
    return;
  }

  if (!Object.keys(state.apps).length) {
    appendStatusState(
      'empty-state category-wide-state',
      '아직 등록된 앱이 없습니다.',
      '관리자 화면에서 “현재 앱 한 번에 불러오기”를 눌러 초기 목록을 등록하세요.'
    );
    return;
  }

  if (!apps.length) {
    appendStatusState(
      'empty-state category-wide-state',
      '검색 조건에 맞는 앱이 없습니다.',
      '검색어를 조금 다르게 입력해보세요.'
    );
    return;
  }

  groups.forEach((group, index) => els.categorySections.appendChild(createCategorySection(group, index)));
  reorder.afterRender();
}

function markLoaded(part) {
  state[`${part}Loaded`] = true;
  if (state.appsLoaded && state.categoriesLoaded && state.settingsLoaded) saveCache();
}

function scrollToCategory(categoryId) {
  const section = [...els.categorySections.querySelectorAll('[data-category-section]')]
    .find(item => item.dataset.categorySection === categoryId);
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section.classList.remove('category-highlight');
  requestAnimationFrame(() => section.classList.add('category-highlight'));
  window.setTimeout(() => section.classList.remove('category-highlight'), 900);
}

els.searchInput.addEventListener('input', event => {
  state.search = event.target.value.trim();
  state.activeCategory = 'all';
  renderCategories();
  renderCategorySections();
});

els.categoryTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  const categoryId = button.dataset.category;
  state.activeCategory = categoryId;
  renderCategories();
  renderCategorySections();

  if (categoryId === 'all') {
    els.categorySections.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  requestAnimationFrame(() => scrollToCategory(categoryId));
});

function tileApp(element) {
  const tile = element?.closest('.app-tile.is-clickable');
  return tile ? appById(tile.dataset.appId) : null;
}

els.categorySections.addEventListener('click', event => {
  if (reorder.consumesClick(event)) return;
  const favoriteButton = event.target.closest('[data-favorite-app]');
  if (favoriteButton) {
    const active = toggleFavorite(favoriteButton.dataset.favoriteApp);
    favoriteButton.setAttribute('aria-pressed', String(active));
    favoriteButton.setAttribute('aria-label', active ? '즐겨찾기 해제' : '즐겨찾기 추가');
    favoriteButton.title = active ? '즐겨찾기 해제' : '즐겨찾기 추가';
    favoriteButton.textContent = active ? '★' : '☆';
    return;
  }

  if (!event.target.closest('.app-tile-open')) return;
  const app = tileApp(event.target);
  if (app) openLaunchChoice(app);
});

loadUserPreferences();
renderQuickAccess();
renderTodayDate();
window.setInterval(renderTodayDate, 60 * 1000);

window.addEventListener('teacher-portal-launch', event => recordAppLaunch(event.detail?.appId));

document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
  event.preventDefault();
  els.searchInput?.focus();
});

const cacheLoaded = loadCache();
if (cacheLoaded) {
  // Firebase가 빠르게 응답하면 캐시 화면을 생략해 한 번만 그린다.
  cacheFallbackTimer = window.setTimeout(renderCachedFallback, CACHE_FALLBACK_DELAY);
}

function fillFallbackFor(part) {
  if (part === 'apps' && !Object.keys(state.apps).length) state.apps = cloneData(DEFAULT_APPS);
  if (part === 'categories' && !Object.keys(state.categories).length) state.categories = cloneData(DEFAULT_CATEGORIES);
  if (part === 'settings') state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
  state[`${part}Loaded`] = true;
}

function handleRealtimeError(part, error) {
  console.error(`Firebase ${part} 읽기 실패`, error);
  fillFallbackFor(part);
  state.dataSource = state.cacheAvailable ? 'cache' : 'default';
  state.loadError = '';
  scheduleRealtimeRender();
}

function activateOfflineFallback(error) {
  console.warn('Firebase 연결을 시작하지 못해 로컬 포털로 전환합니다.', error);
  fillFallbackFor('apps');
  fillFallbackFor('categories');
  fillFallbackFor('settings');
  state.dataSource = state.cacheAvailable ? 'cache' : 'default';
  state.loadError = '';
  state.initialFirebaseCommitted = true;
  window.clearTimeout(cacheFallbackTimer);
  window.clearTimeout(firebaseStartupTimer);
  commitPortalView();
}

async function connectRealtimeData() {
  firebaseStartupTimer = window.setTimeout(() => {
    if (!state.initialFirebaseCommitted && !allInitialDataSettled()) {
      activateOfflineFallback(new Error('Firebase startup timeout'));
    }
  }, FIREBASE_STARTUP_TIMEOUT);

  try {
    const [{ db }, database] = await Promise.all([
      import('./firebase-config.js'),
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js')
    ]);
    const { ref, onValue } = database;

    onValue(ref(db, 'portal/apps'), snapshot => {
      state.apps = snapshot.val() || {};
      state.loadError = '';
      state.dataSource = 'firebase';
      markLoaded('apps');
      scheduleRealtimeRender();
    }, error => handleRealtimeError('apps', error));

    onValue(ref(db, 'portal/categories'), snapshot => {
      state.categories = snapshot.val() || {};
      state.dataSource = 'firebase';
      markLoaded('categories');
      scheduleRealtimeRender();
    }, error => handleRealtimeError('categories', error));

    onValue(ref(db, 'portal/settings'), snapshot => {
      state.settings = { ...DEFAULT_SETTINGS, ...(snapshot.val() || {}) };
      state.dataSource = 'firebase';
      markLoaded('settings');
      scheduleRealtimeRender();
    }, error => handleRealtimeError('settings', error));
  } catch (error) {
    activateOfflineFallback(error);
  }
}

connectRealtimeData();

