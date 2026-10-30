// 랜덤 아레나 V7 진입점: DOM 연결, 참가자/설정, 프리셋, 엑셀 명단, 실행 흐름
import { clamp, sleep, parseSpec, newSeed, randomInt } from "./util.js?v=8.2";
import { state, MODE_INFO, LAST_KEY, displayName } from "./state.js?v=8.2";
import { fx, audio, host } from "./core.js?v=8.2";
import { initRenderer, resizeCanvas, drawIdle, drawScene, drawOrderScene } from "./render.js?v=8.2";
import { runRaceMode } from "./engines/race.js?v=8.2";
import { runTeamMode } from "./engines/teams.js?v=8.2";
import { runListMode, revealAllOrder } from "./engines/order.js?v=8.2";
import { initResults, showRaceResults, showTeamResults, showOrderResults, hideResult, copyResult, saveResultsPng } from "./results.js?v=8.2";
import { loadPresets, upsertPreset, upsertMany, deletePreset, findPreset } from "./presets.js?v=8.2";
import { parseRosterFile } from "./roster.js?v=8.2";

const $ = (id) => document.getElementById(id);
const els = {};
[
  "gameCanvas", "hudCanvas", "stage", "resultBoard", "countdown", "countdownText", "stageLabel", "liveRanks", "toast", "startBtn", "savePngBtn", "copyBtn",
  "minNum", "maxNum", "excludeInput", "directInput", "numberPad", "participantChips", "selectedCount", "participantBadge", "remainingLabel",
  "countBlock", "teamBlock", "cameraBlock", "trackSelect", "cameraHelp", "styleBlock", "comebackBlock", "excludeBlock",
  "drawCount", "teamCount", "countLabel", "settingHint", "comebackHelp", "styleLabel", "excludeWinners", "sessionResults",
  "presetName", "presetSelect", "statParticipants", "statMode", "statStatus", "statResults", "soundBtn", "musicBtn", "fullscreenBtn", "stageFullscreenBtn", "closeResultBtn",
  "rosterChip", "rosterLabel", "rosterClearBtn", "importRosterBtn", "rosterFile", "rosterModal", "rosterList", "rosterSummary", "rosterSaveBtn", "rosterCancelBtn", "replayToggle", "scanlineToggle"
].forEach((id) => (els[id] = $(id)));
let toastTimer = 0;
let pendingRoster = [];
const extra = Object.fromEntries(["paceBtn", "stopBtn", "cheerSelect", "followBtn", "spectatorControls", "raceNotice", "courseSelect", "boostMidToggle", "boostFinalToggle"].map(id => [id, $(id)]));

// ---------- 참가자 ----------
function collectParticipants(showError = false) {
  let numbers = [], invalid = [];
  if (state.inputType === "range") {
    const min = Number(els.minNum.value), max = Number(els.maxNum.value);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 9999) { if (showError) notify("시작 번호와 끝 번호를 올바르게 입력해주세요.", true); return []; }
    if (max - min + 1 > 300) { if (showError) notify("한 번에 설정할 수 있는 번호는 최대 300개입니다.", true); return []; }
    const excluded = parseSpec(els.excludeInput.value); invalid = excluded.invalid; const ex = new Set(excluded.numbers);
    for (let n = min; n <= max; n++) if (!ex.has(n)) numbers.push(n);
  } else { const parsed = parseSpec(els.directInput.value); numbers = parsed.numbers; invalid = parsed.invalid; }
  if (invalid.length && showError) { notify(`인식하지 못한 입력: ${invalid.slice(0, 3).join(", ")}`, true); return []; }
  return numbers;
}
function eligibleParticipants() {
  const shouldExclude = (state.mode === "quick") && els.excludeWinners.checked;
  return shouldExclude ? state.participants.filter((n) => !state.sessionDrawn.has(n)) : [...state.participants];
}
function refreshParticipants() {
  state.participants = collectParticipants(false);
  const count = state.participants.length, eligible = eligibleParticipants();
  els.selectedCount.textContent = `${count}명`; els.participantBadge.textContent = `${count}명 선택`; els.statParticipants.textContent = `${eligible.length}명`;
  els.remainingLabel.textContent = `남은 ${eligible.length}명`;
  renderParticipantChips(); renderNumberPad(); renderTrackOptions(); renderRosterChip(); saveLastConfig();
}
function renderTrackOptions() {
  const current = state.trackedNum, nums = state.participants;
  els.trackSelect.replaceChildren();
  const base = document.createElement("option"); base.value = ""; base.textContent = "추적할 번호 선택"; els.trackSelect.appendChild(base);
  nums.forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = displayName(n); els.trackSelect.appendChild(o); });
  extra.cheerSelect.replaceChildren(new Option('선택 안 함', ''), ...nums.map(n => new Option(displayName(n), n)));
  if (state.cheerNum != null && nums.includes(state.cheerNum)) extra.cheerSelect.value = String(state.cheerNum);
  else state.cheerNum = null;
  if (current != null && nums.includes(current)) els.trackSelect.value = String(current); else if (current != null) state.trackedNum = null;
}
function renderParticipantChips() {
  els.participantChips.replaceChildren();
  const frag = document.createDocumentFragment();
  state.participants.slice(0, 80).forEach((n) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "num-chip"; b.textContent = state.names[n] ? `${n} ${state.names[n]}` : n; b.title = `${displayName(n)} 제외`;
    b.addEventListener("click", () => removeParticipant(n)); frag.appendChild(b);
  });
  els.participantChips.appendChild(frag);
  if (state.participants.length > 80) { const more = document.createElement("span"); more.className = "empty-mini"; more.textContent = `외 ${state.participants.length - 80}명`; els.participantChips.appendChild(more); }
}
function renderRosterChip() {
  const has = Object.keys(state.names).length > 0;
  els.rosterChip.hidden = !has;
  if (has) els.rosterLabel.textContent = `${state.rosterLabel || "명단"} · 이름 ${Object.keys(state.names).length}명 표시 중`;
}
function removeParticipant(n) {
  if (state.running) return;
  if (state.inputType === "range") { const parsed = parseSpec(els.excludeInput.value).numbers; if (!parsed.includes(n)) parsed.push(n); els.excludeInput.value = parsed.sort((a, b) => a - b).join(", "); }
  else els.directInput.value = state.participants.filter((v) => v !== n).join(", ");
  state.sessionDrawn.delete(n); refreshParticipants(); renderSessionResults(); drawIdle();
}
function buildNumberPad() {
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= 40; n++) { const b = document.createElement("button"); b.type = "button"; b.className = "number-key"; b.dataset.number = n; b.textContent = n; b.addEventListener("click", () => toggleNumber(n)); frag.appendChild(b); }
  els.numberPad.replaceChildren(frag); renderNumberPad();
}
function renderNumberPad() {
  const selected = new Set(state.participants), excluded = new Set(parseSpec(els.excludeInput.value).numbers);
  els.numberPad.querySelectorAll(".number-key").forEach((b) => { const n = Number(b.dataset.number); b.classList.toggle("selected", selected.has(n)); b.classList.toggle("excluded", state.inputType === "range" && excluded.has(n)); });
}
function toggleNumber(n) {
  if (state.running) return;
  audio.sfx("ui");
  if (state.inputType === "range") {
    const min = Number(els.minNum.value), max = Number(els.maxNum.value);
    if (n < min || n > max) { notify(`${min}~${max} 범위 밖의 번호입니다.`); return; }
    const ex = new Set(parseSpec(els.excludeInput.value).numbers); ex.has(n) ? ex.delete(n) : ex.add(n); els.excludeInput.value = [...ex].sort((a, b) => a - b).join(", ");
  } else { const set = new Set(parseSpec(els.directInput.value).numbers); set.has(n) ? set.delete(n) : set.add(n); els.directInput.value = [...set].sort((a, b) => a - b).join(", "); }
  state.sessionDrawn.delete(n); refreshParticipants(); drawIdle();
}
function setInputType(type) {
  if (state.running) return;
  state.inputType = type;
  document.querySelectorAll("[data-input-type]").forEach((b) => b.classList.toggle("active", b.dataset.inputType === type));
  $("rangeView").classList.toggle("active", type === "range"); $("directView").classList.toggle("active", type === "direct");
  refreshParticipants();
}

// ---------- 모드/설정 ----------
function selectMode(mode) {
  if (state.running) { notify("진행 중에는 모드를 바꿀 수 없습니다.", true); return; }
  mode = mode === "rank" ? "quick" : mode;
  state.mode = mode; const race = mode === "quick";
  if (mode === "quick") { state.drawCount = clamp(state.drawCount, 1, 10); }
  document.querySelectorAll(".mode-card").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  els.countBlock.hidden = !race; els.teamBlock.hidden = mode !== "teams"; els.styleBlock.hidden = !race; els.excludeBlock.hidden = !race;
  els.countLabel.textContent = "뽑을 인원"; els.drawCount.textContent = state.drawCount; els.teamCount.textContent = state.teamCount;
  els.startBtn.textContent = MODE_INFO[mode].start; els.settingHint.textContent = MODE_INFO[mode].hint; els.statMode.textContent = MODE_INFO[mode].name;
  updateSegmented(); hideResult(); resetStageForMode(); refreshParticipants(); renderSessionResults(); saveLastConfig();
}
function updateSegmented() {
  document.querySelectorAll('[data-style]').forEach(b => { b.classList.toggle('active', b.dataset.style === state.style); b.textContent = b.dataset.style === 'quick' ? '기본 코스' : '긴 코스'; });
  extra.boostMidToggle.checked = state.boostMidEnabled; extra.boostFinalToggle.checked = state.boostFinalEnabled;
  document.querySelectorAll('[data-camera]').forEach(b => b.classList.toggle('active', b.dataset.camera === state.cameraMode));
  els.styleLabel.textContent = '코스 길이';
  extra.courseSelect.value = state.course;
  extra.courseSelect.closest('.setting-block').hidden = state.mode !== 'quick';
  els.comebackBlock.hidden = state.mode !== 'quick';
  els.cameraBlock.hidden = state.mode === 'order';
  els.trackSelect.disabled = state.cameraMode !== 'track';
  els.cameraHelp.textContent = '자동은 선두, 전체는 넓은 범위, 번호 추적은 선택한 공을 따라갑니다.';

  extra.followBtn.setAttribute('aria-pressed', String(state.cameraMode === 'track' && state.trackedNum === state.cheerNum && state.cheerNum != null));
  if (state.mode === 'quick') { els.startBtn.textContent = '핀볼 레이스 시작'; els.settingHint.textContent = `${state.drawCount}명 선발 · 실제 골인 순서`; }
}
function changeCount(delta) { if (state.running) return; const max = 10; state.drawCount = clamp(state.drawCount + delta, 1, max); els.drawCount.textContent = state.drawCount; updateSegmented(); audio.sfx("ui"); saveLastConfig(); if (!state.running) drawIdle(); }
function changeTeams(delta) { if (state.running) return; state.teamCount = clamp(state.teamCount + delta, 2, 8); els.teamCount.textContent = state.teamCount; audio.sfx("ui"); saveLastConfig(); if (!state.running) { resizeCanvas(); drawIdle(); } }
function resetStageForMode() {
  state.engine = "idle"; state.results = []; state.lastResult = null; els.savePngBtn.disabled = true; els.copyBtn.disabled = true; els.statResults.textContent = "0명"; els.statStatus.textContent = "대기";
  setStageLabel(state.mode === "teams" ? "참가 번호를 여러 팀으로 고르게 나눕니다" : state.mode === "order" ? "모든 참가 번호의 순서를 정합니다" : "설정을 확인하고 추첨을 시작하세요");
  renderLiveRanks(); state.courseSeed = newSeed(); fx.reset(); resizeCanvas(); drawIdle();
}
function setStageLabel(text) { els.stageLabel.querySelector("span").textContent = text; }
function setStatus(text) { els.statStatus.textContent = text; }

// ---------- 실행 ----------
async function startDraw() {
  if (state.running) return;
  audio.ensure();
  const participants = collectParticipants(true); if (!participants.length) { notify("참가 번호를 한 명 이상 설정해주세요.", true); return; }
  state.participants = participants; const eligible = eligibleParticipants();
  const needed = state.mode === "teams" ? state.teamCount : state.mode === "order" ? 1 : state.drawCount;
  if (eligible.length < needed) { notify("남은 참가 번호가 필요한 인원보다 적습니다. 당첨 기록을 초기화하거나 인원을 줄여주세요.", true); return; }
  if ((state.mode === "quick") && eligible.length > 48) { notify("핀볼 레이스는 번호가 잘 보이도록 최대 48명까지 참가할 수 있습니다.", true); return; }
  if ((state.mode === "teams" || state.mode === "order") && eligible.length > 120) { notify("팀과 순서 모드는 최대 120명까지 사용할 수 있습니다.", true); return; }
  hideResult(); state.results = []; state.lastResult = null; renderLiveRanks(); els.savePngBtn.disabled = true; els.copyBtn.disabled = true;
  state.runToken++; const token = state.runToken; state.running = true; state.ending = false; els.startBtn.disabled = true; setStatus("카운트");
  state.courseSeed = newSeed(); state.spectatorSpeed = 1; state.raceEvent = null;
  setRunView(true); saveLastConfig();
  try {
    if (state.mode === "teams") await runTeamMode(eligible, token);
    else if (state.mode === "order") await runListMode(eligible, token);
    else await runRaceMode(eligible, token);
  } catch (err) {
    console.error(err); setRunView(false); state.running = false; els.startBtn.disabled = false; setStatus("오류"); notify("추첨 중 문제가 생겼습니다. 다시 시도해주세요.", true); audio.stopTrack(0.2);
  }
}
async function countdown(token) {
  els.countdown.classList.add("show");
  for (const value of ["3", "2", "1", "GO!"]) {
    if (token !== state.runToken) return false;
    els.countdownText.textContent = value; els.countdownText.classList.toggle("go", value === "GO!");
    els.countdownText.style.animation = "none"; void els.countdownText.offsetWidth; els.countdownText.style.animation = "countPop .7s cubic-bezier(.16,1,.3,1)";
    if (value === "GO!") { audio.sfx("go"); fx.shake(6); fx.flash(0.5); } else audio.sfx("count", Number(value));
    els.stage.classList.add("shake"); setTimeout(() => els.stage.classList.remove("shake"), 160);
    await sleep(value === "GO!" ? 520 : 640);
  }
  els.countdown.classList.remove("show");
  return token === state.runToken;
}
function renderLiveRanks() {
  els.liveRanks.replaceChildren();
  if (!state.results.length) { const p = document.createElement("span"); p.className = "rank-placeholder"; p.textContent = "추첨 결과가 여기에 차례대로 기록됩니다."; els.liveRanks.appendChild(p); return; }
  const chip = (label, num) => { const c = document.createElement("div"); c.className = "rank-chip"; const b = document.createElement("b"); b.textContent = label; const s = document.createElement("span"); s.textContent = displayName(num); c.append(b, s); return c; };
  if (state.mode === "teams") { state.teamAssignments.slice(-16).forEach((a) => els.liveRanks.appendChild(chip(`${a.team}조`, a.num))); return; }
  state.results.forEach((n, i) => els.liveRanks.appendChild(chip(`${i + 1}등`, n)));
}
function afterRun(results) {
  setRunView(false);
  if (results && els.excludeWinners.checked && (state.mode === "quick")) results.forEach((n) => state.sessionDrawn.add(n));
  renderSessionResults(); refreshParticipants();
  els.startBtn.disabled = false; els.savePngBtn.disabled = false; els.copyBtn.disabled = false;
  els.startBtn.textContent = state.mode === "teams" ? "다시 팀 나누기" : state.mode === "order" ? "다시 섞기" : "다음 레이스";
  els.statResults.textContent = `${state.results.length}명`; setStatus("완료");
}
function renderSessionResults() {
  els.sessionResults.replaceChildren();
  if (!state.sessionDrawn.size) { const p = document.createElement("span"); p.className = "empty-mini"; p.textContent = "아직 뽑힌 번호가 없습니다."; els.sessionResults.appendChild(p); }
  else [...state.sessionDrawn].forEach((n, i) => { const chip = document.createElement("span"); chip.className = "session-chip"; const b = document.createElement("b"); b.textContent = i + 1; chip.append(b, document.createTextNode(displayName(n))); els.sessionResults.appendChild(chip); });
  els.remainingLabel.textContent = `남은 ${eligibleParticipants().length}명`;
}
function resetSession() { if (state.running) { notify("진행 중에는 기록을 초기화할 수 없습니다.", true); return; } state.sessionDrawn.clear(); renderSessionResults(); refreshParticipants(); notify("이번 당첨 기록을 초기화했습니다."); }

function setRunView(running) {
  document.body.classList.toggle('racing', running);
  extra.paceBtn.hidden = !running; extra.stopBtn.hidden = !running;
  extra.spectatorControls.hidden = !running || state.mode === 'order';
  extra.paceBtn.textContent = state.mode === 'order' ? '결과 바로 보기' : '빠르게 진행';
  extra.raceNotice.textContent = '';
  document.querySelectorAll('.control-panel input, .control-panel select, .control-panel textarea, .control-panel button, .mode-card').forEach(el => { el.disabled = running; });
  if (running) { els.stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(redraw, 100); }
  else setTimeout(redraw, 100);
}
function cancelRun() {
  state.runToken++; cancelAnimationFrame(state.animationId); state.running = false; state.ending = false; state.spectatorSpeed = 1;
  state.replayState = null; state.orderGame = null; state.raceEvent = null; state.chase = null; state.raceElapsed = 0;
  els.countdown.classList.remove('show'); audio.stopTrack(.2); setRunView(false); resetStageForMode();
  notify('진행을 중단했습니다. 이번 결과는 기록하지 않았습니다.');
}

// ---------- 프리셋 ----------
function renderPresets(selected = "") {
  const presets = loadPresets(); els.presetSelect.replaceChildren();
  const base = document.createElement("option"); base.value = ""; base.textContent = presets.length ? "프리셋을 선택하세요" : "저장된 프리셋 없음"; els.presetSelect.appendChild(base);
  presets.forEach((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = `${p.name} · ${p.numbers.length}명${p.names ? " · 이름" : ""}`; els.presetSelect.appendChild(o); });
  if (selected) els.presetSelect.value = selected;
}
function savePreset() {
  const name = els.presetName.value.trim(), numbers = collectParticipants(true);
  if (!name) { notify("프리셋 이름을 입력해주세요.", true); return; }
  if (!numbers.length) return;
  const names = {}; numbers.forEach((n) => { if (state.names[n]) names[n] = state.names[n]; });
  try { const existed = loadPresets().some((p) => p.name === name); const item = upsertPreset({ name, numbers, names }); renderPresets(item.id); notify(existed ? "프리셋을 덮어썼습니다." : "프리셋을 저장했습니다."); }
  catch { notify("프리셋을 저장할 수 없습니다.", true); }
}
function applyPreset(p) {
  setInputType("direct"); els.directInput.value = p.numbers.join(", "); els.presetName.value = p.name;
  state.names = { ...(p.names || {}) }; state.rosterLabel = p.names ? p.name : "";
  state.sessionDrawn.clear(); refreshParticipants(); renderSessionResults(); drawIdle();
}
function loadPreset() {
  const p = findPreset(els.presetSelect.value); if (!p) { notify("불러올 프리셋을 선택해주세요.", true); return; }
  applyPreset(p); audio.sfx("ui"); notify(`${p.name} 프리셋을 불러왔습니다.${p.names ? " 이름이 함께 표시됩니다." : ""}`);
}
function removePreset() {
  const id = els.presetSelect.value, p = findPreset(id); if (!p) { notify("삭제할 프리셋을 선택해주세요.", true); return; }
  if (!confirm(`'${p.name}' 프리셋을 삭제할까요?`)) return;
  deletePreset(id); renderPresets(); notify("프리셋을 삭제했습니다.");
}
function clearRoster() { state.names = {}; state.rosterLabel = ""; refreshParticipants(); drawIdle(); notify("이름 표시를 껐습니다. 번호만 표시됩니다."); }

// ---------- 엑셀 명단 ----------
async function handleRosterFile(file) {
  if (!file) return;
  notify("명단을 읽는 중...");
  let classes;
  try { classes = await parseRosterFile(file); }
  catch (err) { console.error(err); notify(`명단을 읽지 못했습니다: ${err.message || err}`, true); return; }
  pendingRoster = classes;
  els.rosterList.replaceChildren();
  if (!classes.length) {
    const p = document.createElement("div"); p.className = "roster-empty"; p.textContent = "반·번호·성명 열을 찾지 못했습니다. 머리글에 '반', '번호', '성명(이름)'이 있는 표인지 확인해주세요. .xls 파일은 .xlsx로 다시 저장해주세요.";
    els.rosterList.appendChild(p); els.rosterSaveBtn.disabled = true;
  } else {
    els.rosterSaveBtn.disabled = false;
    classes.forEach((c, i) => {
      const label = document.createElement("label"); label.className = "roster-item";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.dataset.index = i;
      const info = document.createElement("div"); const b = document.createElement("b"); b.textContent = c.label;
      const small = document.createElement("small"); small.textContent = c.students.slice(0, 6).map((s) => `${s.num} ${s.masked}`).join(" · ") + (c.students.length > 6 ? " …" : "");
      info.append(b, small);
      const count = document.createElement("span"); count.className = "roster-count"; count.textContent = `${c.students.length}명`;
      label.append(cb, info, count); els.rosterList.appendChild(label);
    });
  }
  els.rosterSummary.textContent = classes.length ? `${file.name}에서 ${classes.length}개 반을 찾았습니다. 이름은 가운데 글자가 가려진 형태(이O후)로만 저장됩니다.` : `${file.name}에서 반을 찾지 못했습니다.`;
  if (typeof els.rosterModal.showModal === "function") els.rosterModal.showModal(); else els.rosterModal.setAttribute("open", "");
}
function saveRosterSelection() {
  const picked = [...els.rosterList.querySelectorAll("input[type=checkbox]:checked")].map((cb) => pendingRoster[Number(cb.dataset.index)]).filter(Boolean);
  if (!picked.length) { notify("저장할 반을 하나 이상 선택해주세요.", true); return; }
  const items = picked.map((c) => { const names = {}; c.students.forEach((s) => (names[s.num] = s.masked)); return { name: c.label, numbers: c.students.map((s) => s.num), names }; });
  let saved;
  try { saved = upsertMany(items); } catch { notify("프리셋 저장 공간이 부족합니다.", true); return; }
  els.rosterModal.close();
  renderPresets(saved[0].id);
  applyPreset(saved[0]);
  audio.sfx("done");
  notify(`${saved.length}개 반을 프리셋으로 저장했습니다. ${saved[0].name}을(를) 불러왔습니다.`);
}

// ---------- 설정 저장 ----------
function saveLastConfig() {
  const data = { inputType: state.inputType, min: els.minNum.value, max: els.maxNum.value, exclude: els.excludeInput.value, direct: els.directInput.value, mode: state.mode, course: state.course, style: state.style, basis: state.basis, boostMidEnabled: state.boostMidEnabled, boostFinalEnabled: state.boostFinalEnabled, cameraMode: state.cameraMode, trackedNum: state.trackedNum, drawCount: state.drawCount, teamCount: state.teamCount, sound: state.sound, music: state.music, scanlines: state.scanlines, replay: state.replay, excludeWinners: els.excludeWinners.checked, names: state.names, rosterLabel: state.rosterLabel };
  try { localStorage.setItem(LAST_KEY, JSON.stringify(data)); } catch {}
}
function restoreLastConfig() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(LAST_KEY) || "null"); } catch {}
  if (!d) { try { d = JSON.parse(localStorage.getItem("randomArenaLastV7") || localStorage.getItem("randomArenaLastV6") || "null"); } catch {} }
  if (d && (typeof d !== "object" || Array.isArray(d))) d = null;
  if (!d) { setInputType("range"); selectMode("quick"); return; }
  els.minNum.value = d.min || 1; els.maxNum.value = d.max || 30; els.excludeInput.value = d.exclude || ""; els.directInput.value = d.direct || "";
  state.inputType = d.inputType === "direct" ? "direct" : "range";
  state.style = d.style === "tension" ? "tension" : "quick"; state.basis = "physics"; state.course = ["factory", "split", "tower"].includes(d.course) ? d.course : "factory";
  state.comeback = "pure"; state.boostMidEnabled = d.boostMidEnabled !== false; state.boostFinalEnabled = d.boostFinalEnabled !== false;
  state.cameraMode = ["auto", "overview", "track"].includes(d.cameraMode) ? d.cameraMode : "auto";
  state.trackedNum = Number.isFinite(Number(d.trackedNum)) && d.trackedNum !== null ? Number(d.trackedNum) : null;
  state.drawCount = clamp(Number(d.drawCount) || 1, 1, 10); state.teamCount = clamp(Number(d.teamCount) || 4, 2, 8);
  state.sound = d.sound !== false; state.music = d.music !== false; state.scanlines = d.scanlines !== false; state.replay = d.replay !== false;
  state.names = d.names && typeof d.names === "object" ? d.names : {}; state.rosterLabel = d.rosterLabel || "";
  els.excludeWinners.checked = d.excludeWinners !== false;
  setInputType(state.inputType); selectMode(d.mode === "rank" ? "quick" : MODE_INFO[d.mode] ? d.mode : "quick");
}

// ---------- 보조 ----------
function notify(message, error = false) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.toggle("error", error); els.toast.classList.add("show"); toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800); if (error) audio.sfx("error"); }
function celebrate(count) {
  const colors = ["#ffe27a", "#5ed4ff", "#f0477f", "#2fc278", "#8a5cf6", "#fff"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i"); p.className = "confetti"; p.style.left = `${Math.random() * 100}vw`; p.style.background = colors[randomInt(colors.length)];
    const s = 6 + randomInt(6); p.style.width = `${s}px`; p.style.height = `${s}px`;
    p.style.setProperty("--drift", `${(Math.random() - 0.5) * 420}px`); p.style.setProperty("--spin", `${Math.random() * 1300 - 650}deg`);
    p.style.animationDuration = `${2.2 + Math.random() * 2.4}s`; p.style.animationDelay = `${Math.random() * 0.35}s`;
    document.body.appendChild(p); setTimeout(() => p.remove(), 5200);
  }
}
function applyAudioButtons() {
  els.soundBtn.classList.toggle("off", !state.sound); els.soundBtn.title = state.sound ? "효과음 켜짐" : "효과음 꺼짐";
  els.musicBtn.classList.toggle("off", !state.music); els.musicBtn.title = state.music ? "음악 켜짐" : "음악 꺼짐";
  audio.enabled = state.sound; audio.musicEnabled = state.music;
  if (!state.music) audio.duck(0, 0.1); else if (state.running) audio.unduck();
}
function toggleSound() { state.sound = !state.sound; applyAudioButtons(); if (state.sound) audio.sfx("ui"); saveLastConfig(); notify(state.sound ? "효과음을 켰습니다." : "효과음을 껐습니다."); }
function toggleMusic() { state.music = !state.music; applyAudioButtons(); if (state.music && state.running && audio.track) audio.playTrack(audio.track, audio.intensity); saveLastConfig(); notify(state.music ? "음악을 켰습니다." : "음악을 껐습니다."); }
function applyScanlines() { document.body.classList.toggle("crt", state.scanlines); els.scanlineToggle.checked = state.scanlines; }
function redraw() { resizeCanvas(); if (!state.running) drawIdle(); else if (state.engine === "list") drawOrderScene(performance.now()); else drawScene(); }
async function togglePresentation() {
  state.presenting = !state.presenting; document.body.classList.toggle("presenting", state.presenting);
  els.fullscreenBtn.textContent = state.presenting ? "원래 화면" : "무대 크게 보기";
  try { if (state.presenting && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else if (!state.presenting && document.fullscreenElement) await document.exitFullscreen(); } catch {}
  setTimeout(redraw, 100);
}

function bindEvents() {
  document.querySelectorAll(".mode-card").forEach((b) => b.addEventListener("click", () => { audio.sfx("ui"); selectMode(b.dataset.mode); }));
  document.querySelectorAll("[data-input-type]").forEach((b) => b.addEventListener("click", () => setInputType(b.dataset.inputType)));
  const segment = (attr, key) => document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener("click", () => { if (state.running) return; state[key] = b.dataset[attr]; audio.sfx("ui"); updateSegmented(); state.courseSeed = newSeed(); resizeCanvas(); drawIdle(); saveLastConfig(); }));
  segment("style", "style");
  document.querySelectorAll("[data-camera]").forEach((b) => b.addEventListener("click", () => { state.cameraMode = b.dataset.camera; if (state.cameraMode === "track" && state.trackedNum == null && state.participants.length) { state.trackedNum = state.participants[0]; els.trackSelect.value = String(state.trackedNum); } updateSegmented(); saveLastConfig(); if (!state.running) drawIdle(); }));
  els.trackSelect.addEventListener("change", () => { state.trackedNum = els.trackSelect.value === "" ? null : Number(els.trackSelect.value); if (state.trackedNum != null) state.cameraMode = "track"; updateSegmented(); saveLastConfig(); if (!state.running) drawIdle(); });
  [els.minNum, els.maxNum, els.excludeInput, els.directInput].forEach((el) => el.addEventListener("input", () => { if (!state.running) { refreshParticipants(); drawIdle(); } }));
  $("countMinus").addEventListener("click", () => changeCount(-1)); $("countPlus").addEventListener("click", () => changeCount(1));
  $("teamMinus").addEventListener("click", () => changeTeams(-1)); $("teamPlus").addEventListener("click", () => changeTeams(1));
  els.startBtn.addEventListener("click", startDraw); els.soundBtn.addEventListener("click", toggleSound); els.musicBtn.addEventListener("click", toggleMusic);
  els.fullscreenBtn.addEventListener("click", togglePresentation); els.stageFullscreenBtn.addEventListener("click", togglePresentation);
  $("resetSessionBtn").addEventListener("click", resetSession); els.closeResultBtn.addEventListener("click", hideResult); els.savePngBtn.addEventListener("click", saveResultsPng); els.copyBtn.addEventListener("click", copyResult);
  $("savePresetBtn").addEventListener("click", savePreset); $("loadPresetBtn").addEventListener("click", loadPreset); $("deletePresetBtn").addEventListener("click", removePreset);
  els.rosterClearBtn.addEventListener("click", clearRoster);
  els.importRosterBtn.addEventListener("click", () => { if (state.running) { notify("진행 중에는 명단을 바꿀 수 없습니다.", true); return; } els.rosterFile.value = ""; els.rosterFile.click(); });
  els.rosterFile.addEventListener("change", () => handleRosterFile(els.rosterFile.files?.[0]));
  els.rosterSaveBtn.addEventListener("click", saveRosterSelection); els.rosterCancelBtn.addEventListener("click", () => els.rosterModal.close());
  els.excludeWinners.addEventListener("change", () => { refreshParticipants(); renderSessionResults(); saveLastConfig(); });
  els.replayToggle.addEventListener("change", () => { state.replay = els.replayToggle.checked; saveLastConfig(); });
  els.scanlineToggle.addEventListener("change", () => { state.scanlines = els.scanlineToggle.checked; applyScanlines(); saveLastConfig(); });

  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(redraw, 120); });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && state.presenting) { state.presenting = false; document.body.classList.remove("presenting"); els.fullscreenBtn.textContent = "무대 크게 보기"; setTimeout(redraw, 100); } });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select") || els.rosterModal.open) return;
    if (e.code === "Space") { e.preventDefault(); if (state.running && state.engine === "list" && state.orderGame) { revealAllOrder(); return; } startDraw(); }
    else if (e.key.toLowerCase() === "f") { e.preventDefault(); togglePresentation(); }
    else if (e.key === "Escape" && els.resultBoard.classList.contains("show")) hideResult();
  });
  // 드래그 앤 드롭으로도 명단 가져오기
  document.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f && /\.(xlsx|xlsm|csv)$/i.test(f.name)) { e.preventDefault(); handleRosterFile(f); } });
}

async function init() {
  initRenderer(els.gameCanvas, els.hudCanvas, els.stage);
  initResults({ resultBoard: els.resultBoard, stageLabel: els.stageLabel, closeResultBtn: els.closeResultBtn }, { again: startDraw, notify });
  Object.assign(host, {
    setStatus, setStageLabel, renderLiveRanks,
    chaseNotice(event) { const phase = { freeze:'시간 정지', pan:'카메라 이동', charge:'점화', boost:'발진', return:'경기 재개' }[event.phase]; extra.raceNotice.textContent = event.type === 'mid' ? `하위 ${event.plans.length}명 추격 부스터 · ${phase}` : `꼴등 ${event.plans[0].num}번 부스터 · ${phase}`; },
    raceNotice(event) { extra.raceNotice.textContent = event.type === 'lead' ? `선두 교체 · ${displayName(event.previous)} → ${displayName(event.num)}` : `${displayName(event.num)} · ${event.gain}계단 상승! ${event.from}위 → ${event.to}위`; }, setResultCount: (n) => (els.statResults.textContent = `${n}명`),
    showRaceResults, showTeamResults, showOrderResults, afterRun, notify, celebrate, countdown
  });
  extra.boostMidToggle.addEventListener('change', () => { state.boostMidEnabled = extra.boostMidToggle.checked; saveLastConfig(); });
  extra.boostFinalToggle.addEventListener('change', () => { state.boostFinalEnabled = extra.boostFinalToggle.checked; saveLastConfig(); });
  extra.courseSelect.addEventListener('change', () => { if (state.running) return; state.course = extra.courseSelect.value; resetStageForMode(); saveLastConfig(); });
  extra.cheerSelect.addEventListener('change', () => { state.cheerNum = extra.cheerSelect.value ? Number(extra.cheerSelect.value) : null; if (state.cameraMode === 'track') state.trackedNum = state.cheerNum; updateSegmented(); });
  extra.followBtn.addEventListener('click', () => { if (state.cheerNum == null) { notify('응원할 번호를 먼저 선택하세요.'); return; } state.cameraMode = state.cameraMode === 'track' ? 'auto' : 'track'; state.trackedNum = state.cheerNum; updateSegmented(); });
  extra.stopBtn.addEventListener('click', cancelRun);
  extra.paceBtn.addEventListener('click', () => { if (state.engine === 'list') revealAllOrder(); else { state.spectatorSpeed = state.spectatorSpeed === 1 ? 4 : 1; extra.paceBtn.textContent = state.spectatorSpeed === 1 ? '빠르게 진행' : '기본 속도'; } });
  buildNumberPad(); bindEvents(); renderPresets(); restoreLastConfig();
  applyAudioButtons(); applyScanlines(); els.replayToggle.checked = state.replay;
  refreshParticipants(); renderSessionResults(); resizeCanvas(); drawIdle();
  try { await document.fonts.load("16px NeoDunggeunmo"); await document.fonts.load("48px NeoDunggeunmo"); } catch {}
  if (!state.running) drawIdle();
  window.__arena = { state, fx, audio, startDraw, selectMode, redraw };
}
init();

