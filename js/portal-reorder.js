// Personal launcher order stays in this browser; the shared app catalog is untouched.
const ORDER_KEY = 'teacherPortalAppOrderV1';
const HOLD_DELAY = 550;
const MOVE_TOLERANCE = 10;

function readOrder() {
  try {
    const value = JSON.parse(localStorage.getItem(ORDER_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.create(null);
    return Object.assign(Object.create(null), Object.fromEntries(Object.entries(value)
      .filter(([, ids]) => Array.isArray(ids))
      .map(([category, ids]) => [category, [...new Set(ids.filter(id => typeof id === 'string'))]])));
  } catch { return Object.create(null); }
}

// Replace the visible subsequence without disturbing apps hidden by a search.
function mergeOrder(base, replacement) {
  const selected = new Set(replacement);
  let cursor = 0;
  const merged = base.map(id => selected.has(id) ? replacement[cursor++] : id);
  return [...merged, ...replacement.slice(cursor)];
}

export function createAppReorder({ container, toolbar, status, onEditChange = () => {} }) {
  let saved = readOrder();
  const defaults = new Map();
  const labels = new WeakMap();
  let editing = false;
  let pending = null;
  let dragging = null;
  let suppressClickUntil = 0;
  let frame = 0;
  let lastFrame = 0;
  let renderFocus = null;

  const tiles = grid => [...grid.querySelectorAll(':scope > .app-tile[data-app-id]')];
  const categoryOf = element => element.closest('[data-category-section]')?.dataset.categorySection;
  const tileOf = element => element instanceof Element ? element.closest('.app-tile[data-app-id]') : null;
  const appName = tile => tile.querySelector('.app-tile-name')?.textContent || '앱';
  const announce = message => { if (status) status.textContent = message; };

  function orderedIds(category) {
    const ids = defaults.get(category) || [];
    const known = new Set(ids);
    const preferred = (saved[category] || []).filter(id => known.has(id));
    return [...preferred, ...ids.filter(id => !preferred.includes(id))];
  }

  function sortApps(category, apps) {
    defaults.set(category, apps.map(app => app.id));
    const order = new Map(orderedIds(category).map((id, index) => [id, index]));
    return [...apps].sort((a, b) => order.get(a.id) - order.get(b.id));
  }

  function persistGrid(grid) {
    const category = categoryOf(grid);
    if (!category) return false;
    const ids = tiles(grid).map(tile => tile.dataset.appId);
    const full = mergeOrder(orderedIds(category), ids);
    // Retain dormant IDs so temporarily hidden apps can keep their personal position.
    const previous = saved[category] || [];
    saved[category] = mergeOrder([...previous, ...full.filter(id => !previous.includes(id))], full);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(saved));
      return true;
    } catch {
      announce('배치는 바뀌었지만 이 브라우저에 저장할 수 없어요. 새로고침하면 초기화될 수 있어요.');
      return false;
    }
  }

  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }

  function updateControls() {
    document.body.classList.toggle('is-reordering', editing);
    toolbar?.classList.toggle('is-editing', editing);
    const headerHeight = document.querySelector('.portal-header')?.getBoundingClientRect().height || 0;
    toolbar?.style.setProperty('--reorder-toolbar-top', `${Math.ceil(headerHeight) + 8}px`);
    toolbar?.querySelectorAll('[data-reorder-action]').forEach(button => {
      const action = button.dataset.reorderAction;
      button.hidden = action === 'edit' ? editing : !editing;
      if (action === 'edit') button.setAttribute('aria-expanded', String(editing));
    });
    container.querySelectorAll('.app-tile-open').forEach(button => {
      if (editing) {
        if (!labels.has(button)) labels.set(button, button.getAttribute('aria-label'));
        button.setAttribute('aria-label', `${appName(button.closest('.app-tile'))}, 방향키로 순서 이동`);
        button.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown');
      } else if (labels.has(button)) {
        const label = labels.get(button);
        if (label === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', label);
        button.removeAttribute('aria-keyshortcuts');
        labels.delete(button);
      }
    });
  }

  function beginEditing(fromTouch = false) {
    if (editing) return;
    editing = true;
    updateControls();
    announce(fromTouch
      ? '배치 편집 중 · 손을 뗀 뒤 앱을 끌어 같은 카테고리 안에서 옮기세요.'
      : '배치 편집 중 · 앱을 끌거나 방향키로 같은 카테고리 안에서 옮기세요.');
    onEditChange(true);
  }

  function endDrag(commit = false) {
    if (!dragging) return;
    const current = dragging;
    dragging = null;
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    current.ghost.remove();
    current.tile.classList.remove('is-dragging');
    current.grid.classList.remove('is-reorder-target');
    document.body.classList.remove('is-app-dragging');
    if (container.hasPointerCapture?.(current.pointerId)) container.releasePointerCapture(current.pointerId);
    if (!commit || !current.allowed) {
      current.initial.forEach(tile => current.grid.appendChild(tile));
      announce('이동을 취소했어요. 같은 카테고리 안에서 앱을 놓아 주세요.');
    } else if (persistGrid(current.grid)) {
      const position = tiles(current.grid).indexOf(current.tile) + 1;
      announce(`${appName(current.tile)} · ${position}번째로 배치했어요. 이 기기에 저장됐어요.`);
    }
    current.tile.querySelector('.app-tile-open')?.focus({ preventScroll: true });
    suppressClickUntil = performance.now() + 450;
  }

  function finish() {
    cancelPending();
    endDrag(false);
    if (!editing) return;
    editing = false;
    updateControls();
    announce('배치 편집을 마쳤어요.');
    onEditChange(false);
  }

  function placeAtPointer() {
    if (!dragging) return;
    const { grid, tile, x, y } = dragging;
    const bounds = grid.getBoundingClientRect();
    dragging.allowed = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    dragging.ghost.classList.toggle('is-invalid-drop', !dragging.allowed);
    grid.classList.toggle('is-reorder-target', dragging.allowed);
    if (!dragging.allowed) return;
    const siblings = tiles(grid);
    // Target the nearest fixed grid slot, not the animated icon under the pointer.
    // The moved tile occupies that slot, so stationary pointers cannot swap it back.
    const target = siblings.reduce((nearest, item) => {
      const rect = item.getBoundingClientRect();
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      return !nearest || distance < nearest.distance ? { tile: item, distance } : nearest;
    }, null)?.tile;
    if (!target || target === tile) return;
    const from = siblings.indexOf(tile);
    const to = siblings.indexOf(target);
    if (from < to) target.after(tile);
    else target.before(tile);
  }

  function animateDrag(time) {
    if (!dragging) return;
    const elapsed = lastFrame ? Math.min(time - lastFrame, 32) : 16;
    lastFrame = time;
    const { x, y, offsetX, offsetY, ghost } = dragging;
    ghost.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) scale(1.06)`;
    const headerBottom = document.querySelector('.portal-header')?.getBoundingClientRect().bottom || 0;
    const toolbarBottom = toolbar?.getBoundingClientRect().bottom || 0;
    const top = Math.max(48, headerBottom + 35, toolbarBottom < window.innerHeight / 2 ? toolbarBottom + 25 : 0);
    const bottom = window.innerHeight - 60;
    const speed = y < top ? -Math.min(16, (top - y) / 4) : y > bottom ? Math.min(16, (y - bottom) / 4) : 0;
    if (speed) {
      window.scrollBy(0, speed * elapsed / 16);
      placeAtPointer();
    }
    frame = requestAnimationFrame(animateDrag);
  }

  function startDrag(tile, event) {
    const grid = tile.parentElement;
    const rect = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true);
    ghost.classList.add('reorder-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    ghost.querySelectorAll('button, a, [tabindex]').forEach(element => element.setAttribute('tabindex', '-1'));
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1.06)`;
    document.body.appendChild(ghost);
    dragging = {
      tile, grid, ghost, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
      initial: tiles(grid), allowed: true
    };
    tile.classList.add('is-dragging');
    grid.classList.add('is-reorder-target');
    document.body.classList.add('is-app-dragging');
    container.setPointerCapture?.(event.pointerId);
    frame = requestAnimationFrame(animateDrag);
  }

  container.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || dragging) return;
    const tile = tileOf(event.target);
    if (!tile || event.target.closest('.favorite-toggle, [data-favorite-app]')) return;
    if (!event.target.closest('.app-tile-open')) return;
    cancelPending();
    if (editing) {
      event.preventDefault();
      startDrag(tile, event);
      return;
    }
    const press = {
      tile, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      pointerType: event.pointerType, timer: 0, held: false
    };
    press.timer = setTimeout(() => {
      if (pending !== press || !tile.isConnected) return;
      press.held = true;
      suppressClickUntil = performance.now() + 1000;
      beginEditing(press.pointerType !== 'mouse');
      tile.querySelector('.app-tile-open')?.focus({ preventScroll: true });
    }, HOLD_DELAY);
    pending = press;
  });

  document.addEventListener('pointermove', event => {
    if (dragging?.pointerId === event.pointerId) {
      event.preventDefault();
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      placeAtPointer();
      return;
    }
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= MOVE_TOLERANCE) return;
    if (pending.held && pending.pointerType === 'mouse') {
      const tile = pending.tile;
      cancelPending();
      startDrag(tile, event);
    } else if (!pending.held) cancelPending();
  }, { passive: false });

  document.addEventListener('pointerup', event => {
    if (pending?.pointerId === event.pointerId) {
      if (pending.held) suppressClickUntil = performance.now() + 450;
      cancelPending();
    }
    if (dragging?.pointerId === event.pointerId) {
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      placeAtPointer();
      endDrag(true);
    }
  });
  document.addEventListener('pointercancel', event => {
    if (pending?.pointerId === event.pointerId) cancelPending();
    if (dragging?.pointerId === event.pointerId) endDrag(false);
  });
  window.addEventListener('scroll', () => { if (!dragging) cancelPending(); }, { passive: true, capture: true });
  window.addEventListener('blur', () => { cancelPending(); endDrag(false); });
  window.addEventListener('resize', () => { cancelPending(); endDrag(false); updateControls(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelPending(); endDrag(false); }
  });

  function consumesClick(event) {
    return Boolean(tileOf(event.target) && (editing || performance.now() < suppressClickUntil));
  }

  container.addEventListener('click', event => {
    if (!consumesClick(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  container.addEventListener('contextmenu', event => {
    if (tileOf(event.target)) event.preventDefault();
  });
  container.addEventListener('dragstart', event => {
    if (tileOf(event.target)) event.preventDefault();
  });

  container.addEventListener('keydown', event => {
    if (!editing || !event.target.matches('.app-tile-open')) return;
    const directions = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!directions.includes(event.key)) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelPending();
    endDrag(false);
    const tile = tileOf(event.target);
    const grid = tile.parentElement;
    const siblings = tiles(grid);
    const current = siblings.indexOf(tile);
    const firstTop = siblings[0]?.getBoundingClientRect().top;
    const columns = Math.max(1, siblings.filter(item => Math.abs(item.getBoundingClientRect().top - firstTop) < 4).length);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    const next = Math.max(0, Math.min(siblings.length - 1, current + step));
    if (current === next) return;
    if (next > current) siblings[next].after(tile);
    else siblings[next].before(tile);
    event.target.focus({ preventScroll: true });
    if (persistGrid(grid)) announce(`${appName(tile)} · ${next + 1}번째로 배치했어요. 이 기기에 저장됐어요.`);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editing) {
      event.preventDefault();
      finish();
    }
  });

  toolbar?.addEventListener('click', event => {
    const button = event.target.closest('[data-reorder-action]');
    if (!button) return;
    const action = button.dataset.reorderAction;
    if (action === 'edit') {
      beginEditing();
      container.querySelector('.app-tile-open')?.focus({ preventScroll: true });
    } else if (action === 'done') {
      finish();
      toolbar.querySelector('[data-reorder-action="edit"]')?.focus({ preventScroll: true });
    } else if (action === 'reset') {
      cancelPending();
      endDrag(false);
      saved = Object.create(null);
      let stored = true;
      try { localStorage.removeItem(ORDER_KEY); } catch { stored = false; }
      container.querySelectorAll('.tile-grid').forEach(grid => {
        const byId = new Map(tiles(grid).map(tile => [tile.dataset.appId, tile]));
        (defaults.get(categoryOf(grid)) || []).forEach(id => {
          if (byId.has(id)) grid.appendChild(byId.get(id));
        });
      });
      announce(stored ? '이 기기의 앱 배치를 기본 순서로 되돌렸어요.' : '기본 순서로 바꿨어요. 브라우저의 저장 설정 때문에 변경을 저장하지 못했어요.');
    }
  });

  updateControls();
  return {
    sortApps,
    beforeRender() {
      cancelPending();
      endDrag(false);
      const focused = tileOf(document.activeElement);
      renderFocus = focused && container.contains(focused)
        ? { id: focused.dataset.appId, category: categoryOf(focused) } : null;
    },
    afterRender() {
      updateControls();
      if (renderFocus) {
        [...container.querySelectorAll('.app-tile[data-app-id]')]
          .find(tile => tile.dataset.appId === renderFocus.id && categoryOf(tile) === renderFocus.category)
          ?.querySelector('.app-tile-open')?.focus({ preventScroll: true });
        renderFocus = null;
      }
    },
    isEditing: () => editing,
    consumesClick,
    finish
  };
}
