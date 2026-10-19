// 전체 순서 모드: 도트 셔플 연출 후 순서 공개
import { secureShuffle, sleep } from "../util.js";
import { state } from "../state.js";
import { fx, audio, host } from "../core.js";
import { drawShuffleScene } from "../render.js";

export async function runListMode(eligible, token) {
  state.engine = "list"; fx.reset();
  host.setStageLabel("전체 순서를 섞는 중...");
  if (!(await host.countdown(token))) return;
  const shuffled = secureShuffle(eligible);
  // 짧은 셔플 애니메이션
  const start = performance.now(); let last = start;
  audio.sfx("shuffle");
  while (performance.now() - start < 1100) {
    if (token !== state.runToken) return;
    const now = performance.now(); fx.update(Math.min(0.05, (now - last) / 1000)); last = now;
    drawShuffleScene(eligible, (now - start) / 1100);
    await new Promise((r) => requestAnimationFrame(r));
  }
  if (token !== state.runToken) return;
  state.results = shuffled;
  state.lastResult = { type: "order", order: shuffled, participants: [...eligible], names: { ...state.names }, createdAt: new Date() };
  host.afterRun(null);
  host.showOrderResults(shuffled);
  host.celebrate(90); audio.sfx("done");
}
