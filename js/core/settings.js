// Настройки приложения с хранением в localStorage.
// Модуль отдаёт геттеры/сеттеры и рассылает событие settings-changed,
// чтобы UI мог мгновенно реагировать на изменения.

const KEYS = {
  ICONS_ENABLED: "icons_custom_enabled",
  ICONS_STANDARD: "icons_custom_standard",
  ICONS_UNITY: "icons_custom_unity",
  KB_ENABLED: "kb_custom_enabled",
  EDITOR_TAB_SIZE: "editor_tab_size",
  EDITOR_FONT_FAMILY: "editor_font_family",
  EDITOR_AUTOSAVE: "editor_autosave",
  EDITOR_WORD_WRAP: "editor_word_wrap",
  EDITOR_BRACKET_HIGHLIGHT: "editor_bracket_highlight",
};

const EVENT = "settings-changed";

function readBool(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return def;
  } catch { return def; }
}

function writeBool(key, v) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT, {
      detail: { key, value: !!v },
    }));
  } catch {}
}

function readString(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v;
  } catch { return def; }
}

function writeString(key, v) {
  try { localStorage.setItem(key, String(v)); } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value: v } }));
  } catch {}
}

function readInt(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  } catch { return def; }
}

function writeInt(key, v) {
  try { localStorage.setItem(key, String(v)); } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value: v } }));
  } catch {}
}

export const SETTINGS_KEYS = KEYS;
export const SETTINGS_EVENT = EVENT;

/* ---------- Иконки ---------- */

export function getIconsEnabled() { return readBool(KEYS.ICONS_ENABLED, true); }
export function setIconsEnabled(v) { writeBool(KEYS.ICONS_ENABLED, !!v); }

export function getIconsStandard() { return readBool(KEYS.ICONS_STANDARD, true); }
export function setIconsStandard(v) { writeBool(KEYS.ICONS_STANDARD, !!v); }

export function getIconsUnity() { return readBool(KEYS.ICONS_UNITY, true); }
export function setIconsUnity(v) { writeBool(KEYS.ICONS_UNITY, !!v); }

/* ---------- Клавиатура ---------- */

export function getKeyboardEnabled() { return readBool(KEYS.KB_ENABLED, true); }
export function setKeyboardEnabled(v) { writeBool(KEYS.KB_ENABLED, !!v); }

/* ---------- Редактор ---------- */

export function getEditorTabSize() {
  const v = readInt(KEYS.EDITOR_TAB_SIZE, 4);
  return (v === 2 || v === 4 || v === 8) ? v : 4;
}
export function setEditorTabSize(v) {
  const n = parseInt(v, 10);
  writeInt(KEYS.EDITOR_TAB_SIZE, (n === 2 || n === 4 || n === 8) ? n : 4);
}

export function getEditorFontFamily() {
  const v = readString(KEYS.EDITOR_FONT_FAMILY, "system");
  return (v === "cascadia" || v === "jetbrains") ? v : "system";
}
export function setEditorFontFamily(v) {
  const s = String(v || "system");
  writeString(KEYS.EDITOR_FONT_FAMILY, (s === "cascadia" || s === "jetbrains") ? s : "system");
}

export function getEditorAutosave() { return readBool(KEYS.EDITOR_AUTOSAVE, true); }
export function setEditorAutosave(v) { writeBool(KEYS.EDITOR_AUTOSAVE, !!v); }

export function getEditorWordWrap() { return readBool(KEYS.EDITOR_WORD_WRAP, false); }
export function setEditorWordWrap(v) { writeBool(KEYS.EDITOR_WORD_WRAP, !!v); }

export function getEditorBracketHighlight() { return readBool(KEYS.EDITOR_BRACKET_HIGHLIGHT, true); }
export function setEditorBracketHighlight(v) { writeBool(KEYS.EDITOR_BRACKET_HIGHLIGHT, !!v); }
