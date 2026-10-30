// 결과 보드(DOM), 결과 복사, PNG 저장
import { state, VERSION, shortName } from "./state.js?v=8.5";
import { roundRect, dateStamp } from "./util.js?v=8.5";

let els = null, actions = null;
export function initResults(elements, handlers) { els = elements; actions = handlers; }

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function nameOf(num, names) { return (names || state.names)?.[num] || ""; }

function showResultShell(title, sub, eyebrow) {
  els.resultBoard.replaceChildren();
  const head = el("div", "result-heading");
  head.append(el("div", "result-eyebrow", eyebrow), el("h2", null, title), el("p", null, sub));
  els.resultBoard.appendChild(head);
  els.resultBoard.classList.add("show");
  els.stageLabel.style.visibility = "hidden"; els.closeResultBtn.hidden = false;
}
export function showRaceResults(results) {
  showResultShell("레이스 결과", `${results.length}명의 번호가 결정되었습니다.`, "PHYSICS RACE RESULT");
  if (results.length <= 3) {
    const podium = el("div", "podium"), order = results.length === 3 ? [1, 0, 2] : results.length === 2 ? [1, 0] : [0];
    order.forEach((idx) => {
      const card = el("div", `podium-card p${idx + 1}`); card.style.animationDelay = `${idx * 0.12}s`;
      card.append(el("div", "medal", `${idx + 1}등`), el("div", "podium-num", results[idx]));
      const name = nameOf(results[idx]);
      card.append(el("div", "podium-name", name ? `${results[idx]}번 ${name}` : `${results[idx]}번`));
      podium.appendChild(card);
    });
    els.resultBoard.appendChild(podium);
  } else {
    const grid = el("div", "winner-grid");
    results.forEach((n, i) => {
      const item = el("div", "winner-item"); item.style.animationDelay = `${i * 0.05}s`;
      item.append(el("b", null, `${i + 1}`), el("span", null, n));
      const name = nameOf(n); if (name) item.append(el("small", null, name));
      grid.appendChild(item);
    });
    els.resultBoard.appendChild(grid);
  }
  appendResultActions();
}
export function showTeamResults(teams) {
  showResultShell("팀 나누기 완료", `${teams.length}개 팀에 ${state.results.length}명을 배치했습니다.`, "BALANCED TEAM DRAW");
  const grid = el("div", "team-grid");
  teams.forEach((team, i) => {
    const card = el("section", "team-card"); card.style.animationDelay = `${i * 0.07}s`; card.style.setProperty("--team-color", state.teamBins[i]?.color || "#5ed4ff");
    card.append(el("h3", null, `${i + 1}조 · ${team.length}명`));
    const members = el("div", "team-members");
    team.forEach((n) => { const s = el("span", "team-member", n); const name = nameOf(n); if (name) s.append(el("small", null, name)); members.appendChild(s); });
    card.append(members); grid.appendChild(card);
  });
  els.resultBoard.appendChild(grid); appendResultActions();
}
export function showOrderResults(order) {
  showResultShell("전체 순서 결정", `${order.length}명의 순서가 무작위로 정해졌습니다.`, "RANDOM ORDER");
  const grid = el("div", "order-grid");
  order.forEach((n, i) => {
    const item = el("div", "order-item"); item.style.animationDelay = `${Math.min(i * 0.025, 0.8)}s`;
    const name = nameOf(n);
    item.append(el("b", null, i + 1), el("span", null, name ? `${n}번 ${name}` : `${n}번`)); grid.appendChild(item);
  });
  els.resultBoard.appendChild(grid); appendResultActions();
}
function appendResultActions() {
  const box = el("div", "result-actions");
  const again = el("button", "primary", "다시 추첨"); again.type = "button"; again.addEventListener("click", () => { hideResult(); actions.again(); });
  const png = el("button", null, "PNG 저장"); png.type = "button"; png.addEventListener("click", saveResultsPng);
  const copy = el("button", null, "결과 복사"); copy.type = "button"; copy.addEventListener("click", copyResult);
  const close = el("button", null, "결과 닫기"); close.type = "button"; close.addEventListener("click", hideResult);
  box.append(again, png, copy, close); els.resultBoard.appendChild(box);
}
export function hideResult() { els.resultBoard.classList.remove("show"); els.stageLabel.style.visibility = ""; els.closeResultBtn.hidden = true; }

export function formatResultText() {
  const r = state.lastResult; if (!r) return "";
  const nm = (n) => { const name = nameOf(n, r.names); return name ? `${n}번 ${name}` : `${n}번`; };
  if (r.type === "race") return `[랜덤 아레나 V${VERSION}]\n${r.results.map((n, i) => `${`${i + 1}등`}: ${nm(n)}`).join("\n")}`;
  if (r.type === "teams") return `[랜덤 아레나 V${VERSION} 팀 결과]\n${r.teams.map((t, i) => `${i + 1}조: ${t.map(nm).join(", ")}`).join("\n")}`;
  return `[랜덤 아레나 V${VERSION} 전체 순서]\n${r.order.map((n, i) => `${i + 1}. ${nm(n)}`).join("\n")}`;
}
export async function copyResult() {
  const text = formatResultText(); if (!text) { actions.notify("먼저 추첨을 진행해주세요.", true); return; }
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  actions.notify("결과를 복사했습니다.");
}

export function saveResultsPng() {
  const r = state.lastResult; if (!r) { actions.notify("저장할 결과가 없습니다.", true); return; }
  const c = document.createElement("canvas"); c.width = 1600; c.height = 1000; const g = c.getContext("2d");
  const F = "NeoDunggeunmo, sans-serif";
  const grad = g.createLinearGradient(0, 0, 1600, 1000); grad.addColorStop(0, "#05070f"); grad.addColorStop(1, "#131a30"); g.fillStyle = grad; g.fillRect(0, 0, 1600, 1000);
  // 도트 별
  for (let i = 0; i < 160; i++) { g.fillStyle = i % 3 ? "#2a3a63" : "#56709e"; g.fillRect((i * 971) % 1600, (i * 557) % 1000, 3, 3); }
  g.fillStyle = "#5ed4ff"; g.font = `24px ${F}`; g.fillText(`RANDOM ARENA · V${VERSION}`, 90, 80);
  g.fillStyle = "#fff"; g.font = `56px ${F}`;
  const title = r.type === "teams" ? "팀 나누기 결과" : r.type === "order" ? "전체 순서" : "레이스 결과";
  g.fillText(title, 90, 150); g.fillStyle = "#9aa8c7"; g.font = "600 20px sans-serif"; g.fillText(new Date(r.createdAt).toLocaleString("ko-KR"), 92, 190);
  const names = r.names || {};
  if (r.type === "race") drawRacePng(g, r.results, r.mode, names, F); else if (r.type === "teams") drawTeamsPng(g, r.teams, names, F); else drawOrderPng(g, r.order, names, F);
  g.fillStyle = "#5e6c8f"; g.font = "700 16px sans-serif"; g.textAlign = "left"; g.fillText("랜덤 아레나 · 현재 기기에서 생성된 결과", 90, 954);
  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `랜덤아레나_${title.replace(/ /g, "_")}_${dateStamp()}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200); actions.notify("결과 이미지를 저장했습니다.");
  }, "image/png");
}
function pixelCard(g, x, y, w, h, color) { g.fillStyle = "#05070f"; g.fillRect(x - 4, y - 4, w + 8, h + 8); g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x, y, w, h); g.fillStyle = color; g.fillRect(x, y, w, 4); g.fillRect(x, y, 4, h); }
function drawRacePng(g, results, mode, names, F) {
  const cols = Math.min(results.length, 5), cardW = Math.min(250, (1420 - (cols - 1) * 26) / cols), start = (1600 - (cardW * cols + 26 * (cols - 1))) / 2;
  results.slice(0, 10).forEach((n, i) => {
    const row = Math.floor(i / 5), col = i % 5, x = (results.length <= 5 ? start : 100) + col * (cardW + 26), y = 270 + row * 300;
    pixelCard(g, x, y, cardW, 250, i === 0 ? "#f2b61b" : "#5e6c8f");
    g.textAlign = "center"; g.fillStyle = i === 0 ? "#ffe27a" : "#9aa8c7"; g.font = `22px ${F}`; g.fillText(`${i + 1}등`, x + cardW / 2, y + 50);
    g.fillStyle = "#fff"; g.font = `88px ${F}`; g.fillText(n, x + cardW / 2, y + 150);
    g.font = `24px ${F}`; g.fillStyle = "#d8e4f0"; g.fillText(names[n] ? `${n}번 ${names[n]}` : `${n}번`, x + cardW / 2, y + 210);
  });
  g.textAlign = "left";
}
function drawTeamsPng(g, teams, names, F) {
  const cols = Math.min(4, teams.length), gap = 22, w = (1420 - gap * (cols - 1)) / cols;
  teams.forEach((team, i) => {
    const row = Math.floor(i / 4), col = i % 4, x = 90 + col * (w + gap), y = 240 + row * 340;
    pixelCard(g, x, y, w, 300, "#2fc278");
    g.textAlign = "left"; g.fillStyle = "#8df5b7"; g.font = `28px ${F}`; g.fillText(`${i + 1}조`, x + 24, y + 50);
    g.fillStyle = "#fff"; g.font = names && Object.keys(names).length ? `18px ${F}` : `24px ${F}`;
    const perRow = names && Object.keys(names).length ? 3 : 5, cw = (w - 40) / perRow;
    team.forEach((n, j) => { const cx = x + 24 + (j % perRow) * cw, cy = y + 100 + Math.floor(j / perRow) * 44; g.fillText(names[n] ? `${n} ${names[n]}` : String(n), cx, cy); });
  });
}
function drawOrderPng(g, order, names, F) {
  const hasNames = names && Object.keys(names).length, perRow = hasNames ? 6 : 10, cw = hasNames ? 236 : 145;
  g.font = `${hasNames ? 20 : 23}px ${F}`;
  order.slice(0, hasNames ? 48 : 80).forEach((n, i) => {
    const col = i % perRow, row = Math.floor(i / perRow), x = 95 + col * cw, y = 260 + row * 80;
    pixelCard(g, x, y, cw - 20, 56, "#8a5cf6");
    g.fillStyle = "#c7b2ff"; g.textAlign = "left"; g.fillText(`${i + 1}.`, x + 14, y + 36); g.fillStyle = "#fff"; g.fillText(names[n] ? `${n} ${names[n]}` : String(n), x + 62, y + 36);
  });
}

