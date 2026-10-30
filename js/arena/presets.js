// 번호 프리셋 저장소 (localStorage). 기존 V6 프리셋과 호환되며 names(가려진 이름)를 추가로 보관한다.
import { PRESET_KEY } from "./state.js?v=8.6";
import { randomInt } from "./util.js?v=8.6";

export function loadPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(PRESET_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && Array.isArray(p.numbers)) : [];
  } catch { return []; }
}
function persist(list) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(list));
}
// 같은 이름이 있으면 덮어쓴다. 반환: 저장된 항목
export function upsertPreset({ name, numbers, names }) {
  const presets = loadPresets(), existing = presets.find((p) => p.name === name);
  const item = { id: existing?.id || `${Date.now()}-${randomInt(9999)}`, name, numbers: [...numbers], updatedAt: Date.now() };
  if (names && Object.keys(names).length) item.names = { ...names };
  const next = existing ? presets.map((p) => (p.id === existing.id ? item : p)) : [...presets, item];
  persist(next);
  return item;
}
export function upsertMany(items) {
  const saved = [];
  for (const it of items) saved.push(upsertPreset(it));
  return saved;
}
export function deletePreset(id) {
  persist(loadPresets().filter((p) => p.id !== id));
}
export function findPreset(id) { return loadPresets().find((p) => p.id === id) || null; }

