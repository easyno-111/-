// 엑셀 명단 가져오기: 학적 현황표(가로 반복 배치)나 단순 번호·이름 표를 반별로 묶는다.
// 이름은 저장 전에 반드시 가려진다 (이지후 → 이O후). 원본 이름은 메모리에 남기지 않는다.
import { maskName } from "./util.js?v=8.3";

const NUM_HEADERS = new Set(["번호", "no", "no.", "num", "number", "출석번호", "학번", "순번"]);
const NAME_HEADERS = new Set(["성명", "이름", "학생명", "name", "학생이름", "성명(이름)", "학생성명"]);
const CLASS_HEADERS = new Set(["반", "학급", "class"]);
const GRADE_HEADERS = new Set(["학년", "grade"]);
const norm = (v) => (v == null ? "" : String(v).replace(/\s+/g, "").toLowerCase());
const isNumHeader = (v) => NUM_HEADERS.has(norm(v));
const isNameHeader = (v) => NAME_HEADERS.has(norm(v));
const isClassHeader = (v) => CLASS_HEADERS.has(norm(v));
const isGradeHeader = (v) => GRADE_HEADERS.has(norm(v));
function parseNum(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return Number.isInteger(v) ? v : NaN;
  const m = String(v).trim().match(/^(\d{1,4})\s*(번)?$/);
  return m ? Number(m[1]) : NaN;
}
function parseLabelNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  const m = String(v).match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}
function isPlausibleName(v) {
  const s = String(v ?? "").trim();
  if (!s || s.length > 12) return false;
  if (/^\d+$/.test(s)) return false;
  if (isNameHeader(s) || isNumHeader(s) || isClassHeader(s)) return false;
  return /[가-힣a-zA-Z]/.test(s);
}

let sheetJsPromise = null;
export function loadSheetJS() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (!sheetJsPromise) sheetJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL("../vendor/xlsx.mini.min.js", import.meta.url).href;
    s.onload = () => (globalThis.XLSX ? resolve(globalThis.XLSX) : reject(new Error("XLSX 로드 실패")));
    s.onerror = () => reject(new Error("엑셀 파서를 불러오지 못했습니다."));
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

// 2차원 배열 하나(시트)에서 반별 명단을 추출
export function extractClassesFromRows(rows, sheetName = "") {
  const H = rows.length;
  const cell = (r, c) => (r >= 0 && r < H && rows[r] ? rows[r][c] : undefined);
  let titleGrade = null;
  for (let r = 0; r < Math.min(10, H); r++) for (const v of rows[r] || []) {
    if (typeof v !== "string") continue;
    const m = v.match(/(\d)\s*학년/); if (m && titleGrade == null) titleGrade = Number(m[1]);
  }
  const blocks = [];
  for (let r = 0; r < H; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (!isNumHeader(row[c])) continue;
      let nameCol = -1;
      for (let k = c + 1; k <= c + 3; k++) if (isNameHeader(row[k])) { nameCol = k; break; }
      if (nameCol < 0) continue;
      let classCol = -1;
      for (let k = c - 1; k >= Math.max(0, c - 3); k--) if (isClassHeader(row[k])) { classCol = k; break; }
      let gradeCol = -1;
      for (let k = c - 1; k >= 0; k--) if (isGradeHeader(row[k])) { gradeCol = k; break; }
      // 머리글 위쪽에 "1학년 3반" 같은 제목이 있는지
      let titleClass = null, titleGrade2 = null;
      if (classCol < 0) for (let rr = r - 1; rr >= Math.max(0, r - 4) && titleClass == null; rr--) for (let k = Math.max(0, c - 2); k <= nameCol + 2; k++) {
        const v = cell(rr, k); if (typeof v !== "string") continue;
        const m = v.match(/(?:(\d)\s*학년\s*)?(\d{1,2})\s*반/); if (m) { titleClass = Number(m[2]); if (m[1]) titleGrade2 = Number(m[1]); break; }
      }
      blocks.push({ headerRow: r, numCol: c, nameCol, classCol, gradeCol, titleClass, titleGrade: titleGrade2 });
    }
  }
  const groups = new Map();
  blocks.forEach((b, bi) => {
    for (let r = b.headerRow + 1; r < H; r++) {
      const nv = cell(r, b.numCol);
      if (isNumHeader(nv)) break;
      const num = parseNum(nv); if (!Number.isFinite(num) || num < 1 || num > 999) continue;
      const name = cell(r, b.nameCol); if (!isPlausibleName(name)) continue;
      const cls = b.classCol >= 0 ? parseLabelNum(cell(r, b.classCol)) : b.titleClass;
      const grade = b.gradeCol >= 0 ? parseLabelNum(cell(r, b.gradeCol)) : (b.titleGrade ?? titleGrade);
      const key = cls != null ? `${grade ?? ""}|${cls}` : `${grade ?? ""}|_${bi}`;
      if (!groups.has(key)) {
        const label = cls != null ? `${grade != null ? `${grade}학년 ` : ""}${cls}반` : `${grade != null ? `${grade}학년 ` : ""}${sheetName || "명단"}${blocks.length > 1 ? ` ${bi + 1}` : ""}`;
        groups.set(key, { key, label, grade, cls, students: new Map() });
      }
      const g = groups.get(key);
      if (!g.students.has(num)) g.students.set(num, maskName(name));
    }
  });
  return [...groups.values()].filter((g) => g.students.size >= 2).map((g) => ({
    key: g.key, label: g.label, grade: g.grade, cls: g.cls,
    students: [...g.students.entries()].sort((a, b) => a[0] - b[0]).map(([num, masked]) => ({ num, masked }))
  }));
}

export async function parseRosterFile(file) {
  const XLSX = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const classes = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    for (const c of extractClassesFromRows(rows, name)) {
      if (classes.some((x) => x.label === c.label)) c.label = `${c.label} (${name})`;
      classes.push(c);
    }
  }
  return classes;
}

