// The shuffled order is fixed once; animation only reveals it in a bounded time.
import { secureShuffle } from '../util.js?v=8.7';
import { state } from '../state.js?v=8.7';
import { fx, audio, host } from '../core.js?v=8.7';
import { resizeCanvas, drawOrderScene } from '../render.js?v=8.7';

export async function runListMode(eligible, token) {
  state.engine = 'list'; fx.reset(); resizeCanvas();
  const order = secureShuffle(eligible);
  const game = state.orderGame = { order, revealed: 0, startedAt: 0, skipped: false, complete: false };
  drawOrderScene(performance.now()); host.setStageLabel('전체 순서를 섞고 있습니다 · 결과 바로 보기로 연출을 건너뛸 수 있어요');
  if (!(await host.countdown(token))) return;
  game.startedAt = performance.now();
  host.setStatus('순서 공개'); audio.playTrack('shuffle', .3);
  const loop = now => {
    if (token !== state.runToken || !state.running || state.engine !== 'list') return;
    const previous = game.revealed;
    const elapsed = now - game.startedAt;
    // 120 students still complete in under 9 seconds, excluding the countdown.
    const duration = Math.min(6500, 1400 + order.length * 45);
    game.revealed = game.skipped ? order.length : Math.min(order.length, Math.floor(Math.max(0, elapsed - 600) / duration * order.length));
    state.results = order.slice(0, game.revealed);
    if (previous !== game.revealed) { host.renderLiveRanks(); host.setResultCount(game.revealed); audio.sfx('tick', game.revealed % 8); }
    drawOrderScene(now);
    if (game.revealed === order.length && (game.skipped || elapsed > duration + 1200)) { finalizeOrder(game); return; }
    state.animationId = requestAnimationFrame(loop);
  };
  state.animationId = requestAnimationFrame(loop);
}
export function revealAllOrder() {
  if (state.running && state.engine === 'list' && state.orderGame?.startedAt) state.orderGame.skipped = true;
}
function finalizeOrder(game) {
  if (game.complete) return;
  game.complete = true; state.running = false; state.results = [...game.order];
  state.lastResult = { type: 'order', order: [...game.order], participants: [...state.participants], names: { ...state.names }, createdAt: new Date() };
  host.renderLiveRanks(); audio.stopTrack(.4); host.afterRun(null); host.showOrderResults(game.order); host.celebrate(50); audio.sfx('done');
}
