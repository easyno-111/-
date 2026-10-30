// 싱글턴 인스턴스: 도트 버퍼, 이펙트, 오디오, 엔진 → UI 콜백 브리지
import { PixelSurface } from "./pixel.js?v=8.1";
import { Fx } from "./fx.js?v=8.1";
import { ArenaAudio } from "./audio.js?v=8.1";

export const pix = new PixelSurface();
export const fx = new Fx();
export const audio = new ArenaAudio();

// main.js가 채워 넣는 UI 콜백. 엔진은 DOM을 직접 만지지 않는다.
export const host = {
  raceNotice() {}, setStatus() {}, setStageLabel() {}, renderLiveRanks() {}, setResultCount() {},
  showRaceResults() {}, showTeamResults() {}, showOrderResults() {},
  afterRun() {}, notify() {}, celebrate() {}, countdown: async () => true
};

