import { db } from './firebase-config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { DEFAULT_SETTINGS } from './default-data.js';

const els = {
  brandTitle: document.getElementById('brandTitle'),
  heroTitle: document.getElementById('heroTitle'),
  heroSubtitle: document.getElementById('heroSubtitle'),
  appCount: document.getElementById('appCount'),
  notice: document.getElementById('notice'),
  searchInput: document.getElementById('searchInput'),
  categoryTabs: document.getElementById('categoryTabs'),
  sectionTitle: document.getElementById('sectionTitle'),
  resultCount: document.getElementById('resultCount'),
  appGrid: document.getElementById('appGrid'),
  footerText: document.getElementById('footerText'),
  themeToggle: document.getElementById('themeToggle'),
  themeToggleLabel: document.getElementById('themeToggleLabel'),
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
  loadError: ''
};

const CACHE_KEY = 'teacherPortalCacheV1';

const THEME_KEY = 'teacherPortalTheme';

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
    els.themeToggle.title = isDark ? '라이트 모드로 변경' : '나이트 모드로 변경';
  }
  if (els.themeToggleLabel) els.themeToggleLabel.textContent = isDark ? '나이트' : '라이트';
  if (els.themeColor) els.themeColor.setAttribute('content', isDark ? '#17141f' : '#fff8fb');

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


function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!cached || typeof cached !== 'object') return;
    state.apps = cached.apps || {};
    state.categories = cached.categories || {};
    state.settings = { ...DEFAULT_SETTINGS, ...(cached.settings || {}) };
    applySettings();
    renderCategories();
    renderApps();
  } catch (error) {
    console.warn('포털 캐시를 읽지 못했습니다.', error);
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      apps: state.apps,
      categories: state.categories,
      settings: state.settings
    }));
  } catch (error) {
    console.warn('포털 캐시를 저장하지 못했습니다.', error);
  }
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#36588e';
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
    .map(([id, item]) => ({ id, name: cleanText(item?.name, '기타'), order: Number(item?.order) || 9999 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'));
}

function visibleApps() {
  return Object.entries(state.apps)
    .map(([id, app]) => ({ id, ...app }))
    .filter(app => app.visible !== false)
    .sort((a, b) => {
      const featuredDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      return featuredDiff || (Number(a.order) || 9999) - (Number(b.order) || 9999) || cleanText(a.title).localeCompare(cleanText(b.title), 'ko');
    });
}

function filteredApps() {
  const query = state.search.toLocaleLowerCase('ko');
  return visibleApps().filter(app => {
    if (state.activeCategory !== 'all' && app.category !== state.activeCategory) return false;
    if (!query) return true;
    const categoryName = cleanText(state.categories[app.category]?.name);
    const haystack = [app.title, app.description, categoryName].map(value => cleanText(value).toLocaleLowerCase('ko')).join(' ');
    return haystack.includes(query);
  });
}

function applySettings() {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const title = cleanText(settings.title, DEFAULT_SETTINGS.title);
  const subtitle = cleanText(settings.subtitle, DEFAULT_SETTINGS.subtitle);
  const footer = cleanText(settings.footer, DEFAULT_SETTINGS.footer);
  const notice = cleanText(settings.notice);

  document.title = title;
  els.brandTitle.textContent = title;
  els.heroTitle.textContent = title;
  els.heroSubtitle.textContent = subtitle;
  els.footerText.textContent = footer;
  els.notice.textContent = notice;
  els.notice.classList.toggle('hidden', !notice);
}

function renderCategories() {
  const categories = categoryEntries();
  const valid = state.activeCategory === 'all' || categories.some(item => item.id === state.activeCategory);
  if (!valid) state.activeCategory = 'all';

  els.categoryTabs.replaceChildren();
  const allButton = createCategoryButton('all', '전체');
  els.categoryTabs.appendChild(allButton);
  categories.forEach(item => els.categoryTabs.appendChild(createCategoryButton(item.id, item.name)));
}

function createCategoryButton(id, name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `category-tab${state.activeCategory === id ? ' active' : ''}`;
  button.dataset.category = id;
  button.textContent = name;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(state.activeCategory === id));
  return button;
}

function createLaunchButton(label, url, app, secondary = false) {
  const safe = safeUrl(url);
  if (!safe) return null;
  const link = document.createElement('a');
  link.className = `launch-button ${secondary ? 'launch-secondary' : 'launch-primary'}`;
  link.href = safe;
  link.textContent = cleanText(label, secondary ? '열기' : '실행');
  if (app.openMode !== 'same') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

function createAppCard(app) {
  const article = document.createElement('article');
  article.className = 'app-card';
  article.style.setProperty('--app-color', normalizeColor(app.color));

  const head = document.createElement('div');
  head.className = 'card-head';

  const icon = document.createElement('div');
  icon.className = 'app-icon';
  icon.textContent = cleanText(app.icon, '🔗');

  const badges = document.createElement('div');
  badges.className = 'badges';
  if (app.featured) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-featured';
    badge.textContent = '추천';
    badges.appendChild(badge);
  }
  if (app.isNew) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-new';
    badge.textContent = 'NEW';
    badges.appendChild(badge);
  }
  head.append(icon, badges);

  const category = document.createElement('div');
  category.className = 'card-category';
  category.textContent = cleanText(state.categories[app.category]?.name, '기타');

  const title = document.createElement('h4');
  title.className = 'app-title';
  title.textContent = cleanText(app.title, '이름 없는 앱');

  const description = document.createElement('p');
  description.className = 'app-description';
  description.textContent = cleanText(app.description, '등록된 설명이 없습니다.');

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const primary = createLaunchButton(app.primaryLabel, app.primaryUrl, app, false);
  const secondary = createLaunchButton(app.secondaryLabel, app.secondaryUrl, app, true);
  const buttons = [primary, secondary].filter(Boolean);
  actions.style.setProperty('--button-count', String(Math.max(buttons.length, 1)));
  buttons.forEach(button => actions.appendChild(button));

  article.append(head, category, title, description, actions);
  return article;
}

function renderApps() {
  const allVisible = visibleApps();
  const apps = filteredApps();
  els.appCount.textContent = String(allVisible.length);
  els.resultCount.textContent = `${apps.length}개 표시`;
  els.sectionTitle.textContent = state.activeCategory === 'all'
    ? (state.search ? '검색 결과' : '전체 도구')
    : cleanText(state.categories[state.activeCategory]?.name, '도구');

  els.appGrid.replaceChildren();

  if (state.loadError && !Object.keys(state.apps).length) {
    const error = document.createElement('div');
    error.className = 'error-state';
    error.innerHTML = '<strong>앱 목록을 불러오지 못했습니다.</strong><span></span>';
    error.querySelector('span').textContent = state.loadError;
    els.appGrid.appendChild(error);
    return;
  }

  if (!state.appsLoaded && !Object.keys(state.apps).length) {
    for (let i = 0; i < 3; i += 1) {
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      els.appGrid.appendChild(skeleton);
    }
    return;
  }

  if (!Object.keys(state.apps).length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<strong>아직 등록된 앱이 없습니다.</strong><span>관리자 화면에서 “현재 앱 한 번에 불러오기”를 눌러 초기 목록을 등록하세요.</span>';
    els.appGrid.appendChild(empty);
    return;
  }

  if (!apps.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<strong>조건에 맞는 앱이 없습니다.</strong><span>검색어를 바꾸거나 다른 카테고리를 선택해보세요.</span>';
    els.appGrid.appendChild(empty);
    return;
  }

  apps.forEach(app => els.appGrid.appendChild(createAppCard(app)));
}

function markLoaded(part) {
  state[`${part}Loaded`] = true;
  if (state.appsLoaded && state.categoriesLoaded && state.settingsLoaded) saveCache();
}

els.searchInput.addEventListener('input', event => {
  state.search = event.target.value.trim();
  renderApps();
});

els.categoryTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.activeCategory = button.dataset.category;
  renderCategories();
  renderApps();
});

loadCache();

onValue(ref(db, 'portal/apps'), snapshot => {
  state.apps = snapshot.val() || {};
  state.loadError = '';
  markLoaded('apps');
  renderApps();
}, error => {
  console.error(error);
  state.appsLoaded = true;
  state.loadError = 'Firebase 데이터베이스 읽기 권한과 인터넷 연결을 확인해주세요.';
  renderApps();
});

onValue(ref(db, 'portal/categories'), snapshot => {
  state.categories = snapshot.val() || {};
  markLoaded('categories');
  renderCategories();
  renderApps();
}, error => {
  console.error(error);
  state.categoriesLoaded = true;
});

onValue(ref(db, 'portal/settings'), snapshot => {
  state.settings = { ...DEFAULT_SETTINGS, ...(snapshot.val() || {}) };
  markLoaded('settings');
  applySettings();
}, error => {
  console.error(error);
  state.settingsLoaded = true;
  applySettings();
});
