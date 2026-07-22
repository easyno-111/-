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
  categorySections: document.getElementById('categorySections'),
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
  collapsedCategories: new Set(),
  appsLoaded: false,
  categoriesLoaded: false,
  settingsLoaded: false,
  loadError: ''
};

const CACHE_KEY = 'teacherPortalCacheV1';
const THEME_KEY = 'teacherPortalTheme';
const SECTION_PALETTE = ['#b79be4', '#88bde4', '#82c9b6', '#efa3bc', '#efbd82', '#a8a3ea'];

const sectionObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        sectionObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
  : null;

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

function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!cached || typeof cached !== 'object') return;
    state.apps = cached.apps || {};
    state.categories = cached.categories || {};
    state.settings = { ...DEFAULT_SETTINGS, ...(cached.settings || {}) };
    applySettings();
    renderCategories();
    renderCategorySections();
  } catch (error) {
    console.warn('포털 캐시를 읽지 못했습니다.', error);
  }
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

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#8f79c1';
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
  if (els.themeColor) els.themeColor.setAttribute('content', background);
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
  const apps = visibleApps().filter(matchesSearch);
  const categories = categoryEntries();
  const knownIds = new Set(categories.map(item => item.id));
  const groups = categories
    .map(category => ({
      ...category,
      apps: apps.filter(app => app.category === category.id)
    }))
    .filter(group => group.apps.length > 0);

  const uncategorized = apps.filter(app => !knownIds.has(app.category));
  if (uncategorized.length) {
    groups.push({ id: '__other__', name: '기타', order: 99999, apps: uncategorized });
  }
  return { apps, groups };
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

function createAppCard(app, index = 0) {
  const article = document.createElement('article');
  article.className = 'app-card';
  article.style.setProperty('--app-color', normalizeColor(app.color));
  article.style.setProperty('--card-index', String(index));

  const head = document.createElement('div');
  head.className = 'card-head';

  const icon = document.createElement('div');
  icon.className = 'app-icon';
  if (isImageDataUrl(app.iconImage)) {
    const image = document.createElement('img');
    image.src = app.iconImage;
    image.alt = '';
    icon.appendChild(image);
    icon.classList.add('has-image');
  } else {
    icon.textContent = cleanText(app.icon, '🔗');
  }

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

  const primaryUrl = safeUrl(app.primaryUrl);
  if (primaryUrl) {
    article.classList.add('is-clickable');
    article.dataset.primaryUrl = primaryUrl;
    article.dataset.openMode = app.openMode === 'same' ? 'same' : 'new';
    article.tabIndex = 0;
    article.setAttribute('role', 'link');
    article.setAttribute('aria-label', `${cleanText(app.title, '앱')} 실행`);
  }

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

function createRailButton(direction, categoryName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'category-rail-button';
  button.dataset.railDirection = direction;
  button.setAttribute('aria-label', `${categoryName} 앱 목록 ${direction === 'prev' ? '왼쪽' : '오른쪽'}으로 이동`);
  button.textContent = direction === 'prev' ? '←' : '→';
  return button;
}

function createCategorySection(group, groupIndex) {
  const section = document.createElement('section');
  const isCollapsed = state.collapsedCategories.has(group.id) && !state.search;
  section.className = `category-section${isCollapsed ? '' : ' is-open'} animate-cards`;
  section.dataset.categorySection = group.id;
  section.style.setProperty('--section-color', SECTION_PALETTE[groupIndex % SECTION_PALETTE.length]);
  section.style.setProperty('--section-index', String(groupIndex));

  const header = document.createElement('div');
  header.className = 'category-section-header';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'category-section-toggle';
  toggle.dataset.toggleCategory = group.id;
  toggle.setAttribute('aria-expanded', String(!isCollapsed));

  const indexBadge = document.createElement('span');
  indexBadge.className = 'category-section-index';
  indexBadge.textContent = String(groupIndex + 1).padStart(2, '0');

  const titleWrap = document.createElement('span');
  titleWrap.className = 'category-section-title-wrap';
  const title = document.createElement('span');
  title.className = 'category-section-title';
  title.textContent = `〈${group.name}〉`;
  const subtitle = document.createElement('span');
  subtitle.className = 'category-section-subtitle';
  subtitle.textContent = `${group.apps.length}개의 앱을 모아두었어요`;
  titleWrap.append(title, subtitle);

  const preview = document.createElement('span');
  preview.className = 'category-section-preview';
  group.apps.slice(0, 4).forEach(app => {
    const bubble = document.createElement('span');
    bubble.className = 'category-preview-icon';
    if (isImageDataUrl(app.iconImage)) {
      const image = document.createElement('img'); image.src = app.iconImage; image.alt = ''; bubble.appendChild(image);
    } else bubble.textContent = cleanText(app.icon, '●');
    preview.appendChild(bubble);
  });
  if (group.apps.length > 4) {
    const more = document.createElement('span'); more.className = 'category-preview-more'; more.textContent = `+${group.apps.length - 4}`; preview.appendChild(more);
  }
  const action = document.createElement('span');
  action.className = 'category-toggle-action';
  const actionLabel = document.createElement('span'); actionLabel.className = 'category-toggle-label'; actionLabel.textContent = isCollapsed ? '펼쳐보기' : '접어두기';
  const actionIcon = document.createElement('span'); actionIcon.className = 'category-toggle-icon'; actionIcon.setAttribute('aria-hidden', 'true');
  action.append(actionLabel, actionIcon);
  toggle.append(indexBadge, titleWrap, preview, action);

  header.append(toggle);

  const panel = document.createElement('div');
  panel.className = 'category-section-panel';
  const panelInner = document.createElement('div');
  panelInner.className = 'category-section-panel-inner';

  const rail = document.createElement('div');
  rail.className = 'category-app-rail';
  rail.tabIndex = 0;
  rail.setAttribute('aria-label', `${group.name} 앱 목록`);
  group.apps.forEach((app, index) => rail.appendChild(createAppCard(app, index)));

  panelInner.appendChild(rail);
  panel.appendChild(panelInner);
  section.append(header, panel);
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
  sectionObserver?.disconnect();
  const allVisible = visibleApps();
  const { apps, groups } = groupedApps();
  els.appCount.textContent = String(allVisible.length);
  els.resultCount.textContent = `${apps.length}개 도구 · ${groups.length}개 카테고리`;
  els.sectionTitle.textContent = state.search ? '검색 결과' : '카테고리별 도구';
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

  groups.forEach((group, index) => {
    const section = createCategorySection(group, index);
    els.categorySections.appendChild(section);
    if (sectionObserver) sectionObserver.observe(section);
    else section.classList.add('is-visible');
  });
}

function markLoaded(part) {
  state[`${part}Loaded`] = true;
  if (state.appsLoaded && state.categoriesLoaded && state.settingsLoaded) saveCache();
}

function scrollToCategory(categoryId) {
  const section = [...els.categorySections.querySelectorAll('[data-category-section]')]
    .find(item => item.dataset.categorySection === categoryId);
  if (!section) return;
  section.classList.add('is-open');
  section.querySelector('[data-toggle-category]')?.setAttribute('aria-expanded', 'true');
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

  if (categoryId === 'all') {
    state.collapsedCategories.clear();
    renderCategories();
    renderCategorySections();
    els.categorySections.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  state.collapsedCategories.delete(categoryId);
  renderCategories();
  renderCategorySections();
  requestAnimationFrame(() => scrollToCategory(categoryId));
});

function openAppCard(card) {
  const url = safeUrl(card?.dataset.primaryUrl);
  if (!url) return;
  if (card.dataset.openMode === 'same') window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

els.categorySections.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  if (event.target.closest('a, button, input, select, textarea')) return;
  const card = event.target.closest('.app-card[data-primary-url]');
  if (!card) return;
  event.preventDefault();
  openAppCard(card);
});

els.categorySections.addEventListener('click', event => {
  // 명시적인 링크/버튼은 브라우저 기본 동작을 그대로 사용한다.
  if (!event.target.closest('a, button, input, select, textarea')) {
    const card = event.target.closest('.app-card[data-primary-url]');
    if (card) {
      openAppCard(card);
      return;
    }
  }

  const railButton = event.target.closest('[data-rail-direction]');
  if (railButton) {
    const section = railButton.closest('[data-category-section]');
    const rail = section?.querySelector('.category-app-rail');
    if (!rail) return;
    const direction = railButton.dataset.railDirection === 'prev' ? -1 : 1;
    rail.scrollBy({ left: direction * Math.max(260, rail.clientWidth * 0.78), behavior: 'smooth' });
    return;
  }

  const toggle = event.target.closest('[data-toggle-category]');
  if (!toggle) return;
  const section = toggle.closest('[data-category-section]');
  const categoryId = toggle.dataset.toggleCategory;
  const willOpen = !section.classList.contains('is-open');

  section.classList.toggle('is-open', willOpen);
  toggle.setAttribute('aria-expanded', String(willOpen));
  const toggleLabel = toggle.querySelector('.category-toggle-label');
  if (toggleLabel) toggleLabel.textContent = willOpen ? '접어두기' : '펼쳐보기';
  state.activeCategory = categoryId;
  if (willOpen) {
    state.collapsedCategories.delete(categoryId);
    section.classList.remove('animate-cards');
    void section.offsetWidth;
    section.classList.add('animate-cards');
  } else {
    state.collapsedCategories.add(categoryId);
  }
  renderCategories();
});

loadCache();

onValue(ref(db, 'portal/apps'), snapshot => {
  state.apps = snapshot.val() || {};
  state.loadError = '';
  markLoaded('apps');
  renderCategories();
  renderCategorySections();
}, error => {
  console.error(error);
  state.appsLoaded = true;
  state.loadError = 'Firebase 데이터베이스 읽기 권한과 인터넷 연결을 확인해주세요.';
  renderCategorySections();
});

onValue(ref(db, 'portal/categories'), snapshot => {
  state.categories = snapshot.val() || {};
  markLoaded('categories');
  renderCategories();
  renderCategorySections();
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
