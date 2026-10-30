// 1등 발표 화면: 무대 위에 도트 전광판처럼 당첨 번호를 한 줄씩 켜서 보여준다.
import { clamp } from "./util.js?v=8.4";
import { state } from "./state.js?v=8.4";
import { fx, audio } from "./core.js?v=8.4";
import { drawWinnerScreen } from "./render.js?v=8.4";

const DURATION = 2.2;

export function winnerSequence(results) {
  const token = state.runToken;
  return new Promise((resolve) => {
    const start = performance.now();
    let last = start, lastRow = -1, ticked = false;
    fx.reset(); fx.flash(0.6, "#05070f");
    audio.duck(0.15, 0.2);
    const loop = (now) => {
      if (token !== state.runToken) { resolve(false); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - start) / 1000;
      fx.update(dt);
      const info = drawWinnerScreen(results, t);
      if (info && info.row !== lastRow && info.row >= 0) { lastRow = info.row; audio.sfx("tick", info.row); }
      if (info && info.done && !ticked) {
        ticked = true;
        fx.shake(6); fx.flash(0.5, "#fff6c4"); fx.aberration(0.8);
        fx.burst(state.W / 2, state.H * 0.45, ["#ffe27a", "#f2b61b", "#ffffff", "#5ed4ff"], 60, { speed: 360, life: 1.1 });
        fx.ring(state.W / 2, state.H * 0.45, "#ffe27a", 260, 0.7, 2);
        audio.sfx("stamp"); audio.victory();
      }
      if (t >= DURATION) { resolve(true); return; }
      state.animationId = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(state.animationId);
    state.animationId = requestAnimationFrame(loop);
  });
}
export function clampT(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }

