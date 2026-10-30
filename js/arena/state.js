// 앱 전역 상태와 모드 정보. 엔진·렌더러·UI가 공유한다.
export const VERSION = "8.4.0";
export const PRESET_KEY = "randomArenaPresetsV6";
export const LAST_KEY = "randomArenaLastV8";

export const MODE_INFO = {
  quick: { name: "번호 뽑기", start: "핀볼 레이스 시작", hint: "실제 골인 순서", accent: "#5ed4ff" },
  teams: { name: "팀 나누기", start: "팀 나누기 시작", hint: "균등 팀 배치", accent: "#2fc278" },
  order: { name: "전체 순서", start: "전체 순서 정하기", hint: "전체 무작위 순서", accent: "#8a5cf6" }
};

export const state = {
  // 설정
  mode: "quick", inputType: "range", style: "quick", basis: "physics", comeback: "pure", cameraMode: "auto", trackedNum: null,
  drawCount: 1, teamCount: 4, sound: true, music: true, scanlines: true, replay: true,
  boostMidEnabled: true, boostFinalEnabled: true, chase: null, raceElapsed: 0, finalSlowUntil: 0,
  course: "factory", raceCount: 30, spectatorSpeed: 1, cheerNum: null, raceEvent: null,
  // 참가자
  participants: [], names: {}, rosterLabel: "", sessionDrawn: new Set(),
  // 진행
  results: [], lastResult: null, running: false, ending: false, runToken: 0, engine: "idle", presenting: false,
  // 캔버스/월드
  W: 0, H: 0, dpr: 1, scale: 3, worldH: 0, cameraY: 0, courseSeed: 1,
  balls: [], pegs: [], bumpers: [], rotors: [], wheels: [], gates: [], boosters: [], rails: [], sections: [],
  // 레이스 연출
  raceStart: 0, lastFrame: 0, endingAt: 0, animationId: 0,
  physicsAccumulator: 0, physicsTimeScale: 1, zoom: 1, zoomTarget: 1, zoomFocusX: 0,
  cinematicCandidate: null, cinematicText: "", freezeUntil: 0, freezeFocus: null, winnerFx: null,
  chaseWind: 0, chaseWindTarget: 0, currentLeaderNum: null, previousLeaderNum: null, leaderChangedAt: 0,
  photoFinish: false, photoFinishAt: 0, replayState: null, replayFrames: [], physicsStep: 0,
  // 팀
  orderGame: null,
  teamBins: [], teamQueue: [], teamAssignments: [], teamWave: 0, teamWaveSize: 36, nextWaveAt: 0, teamFx: null, rescueCount: 0
};

export function displayName(num) {
  const name = state.names?.[num];
  return name ? `${num}번 ${name}` : `${num}번`;
}
export function shortName(num) {
  return state.names?.[num] || "";
}

