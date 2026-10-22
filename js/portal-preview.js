// One reusable preview keeps a large app library light and its grid stationary.
export function createAppPreview({ container, panel, getApp, renderContent, isEditing }) {
  let anchor = null;
  let openTimer = 0;
  let closeTimer = 0;
  let frame = 0;
  const hoverInput = window.matchMedia('(any-hover: hover)');

  function cancelTimers() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
  }

  function close() {
    cancelTimers();
    cancelAnimationFrame(frame);
    anchor?.classList.remove('is-previewing');
    anchor?.querySelector('.app-tile-open')?.removeAttribute('aria-describedby');
    anchor = null;
    panel.hidden = true;
  }

  function position() {
    if (!anchor?.isConnected || panel.hidden) return close();
    const rect = anchor.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const gap = 10;
    panel.style.maxHeight = `${Math.max(120, height - 24)}px`;
    const box = panel.getBoundingClientRect();
    let top = rect.bottom + gap;
    if (top + box.height > height - 12) top = rect.top - box.height - gap;
    top = Math.max(12, Math.min(top, height - box.height - 12));
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - box.width / 2, width - box.width - 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function open(tile) {
    if (isEditing() || !tile?.isConnected || document.querySelector('dialog[open]')) return;
    const app = getApp(tile.dataset.appId);
    if (!app) return;
    close();
    anchor = tile;
    renderContent(panel, app, 'preview');
    // Keyboard activation opens the same information in a focus-managed dialog.
    panel.querySelectorAll('a, button').forEach(control => { control.tabIndex = -1; });
    panel.hidden = false;
    anchor.classList.add('is-previewing');
    anchor.querySelector('.app-tile-open')?.setAttribute('aria-describedby', 'appPreviewDescription');
    position();
    frame = requestAnimationFrame(position);
  }

  function scheduleOpen(tile) {
    cancelTimers();
    if (tile === anchor) return;
    openTimer = window.setTimeout(() => open(tile), 180);
  }

  function scheduleClose() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, 220);
  }

  container.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !hoverInput.matches || isEditing()) return;
    const tile = event.target.closest('.app-tile');
    if (!tile || tile.contains(event.relatedTarget)) return;
    scheduleOpen(tile);
  });
  container.addEventListener('pointerout', event => {
    const tile = event.target.closest('.app-tile');
    if (!tile || tile.contains(event.relatedTarget) || panel.contains(event.relatedTarget)) return;
    scheduleClose();
  });
  container.addEventListener('focusin', event => {
    if (!event.target.matches('.app-tile-open:focus-visible') || isEditing()) return;
    scheduleOpen(event.target.closest('.app-tile'));
  });
  container.addEventListener('focusout', event => {
    if (!panel.contains(event.relatedTarget)) scheduleClose();
  });
  panel.addEventListener('pointerenter', cancelTimers);
  panel.addEventListener('pointerleave', event => {
    if (!anchor?.contains(event.relatedTarget)) scheduleClose();
  });
  panel.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('scroll', event => {
    if (!panel.contains(event.target)) close();
  }, { capture: true, passive: true });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  return { close };
}
