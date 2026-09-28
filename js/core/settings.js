// Настройки приложения с хранением в localStorage.
// Модуль отдаёт геттеры/сеттеры и рассылает событие settings-changed,
// чтобы UI мог мгновенно реагировать на изменения.

const KEYS = {
  ICONS_ENABLED: "icons_custom_enabled",
  ICONS_STANDARD: "icons_custom_standard",
  ICONS_UNITY: "icons_custom_unity",
  KB_ENABLED: "kb_custom_enabled",
};

const EVENT = "settings-changed";

function readBool(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    return v === "1";
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

export const SETTINGS_KEYS = KEYS;
export const SETTINGS_EVENT = EVENT;

// Кастомные иконки — главный тумблер.
export function getIconsEnabled() { return readBool(KEYS.ICONS_ENABLED, true); }
export function setIconsEnabled(v) { writeBool(KEYS.ICONS_ENABLED, !!v); }

// Подпункт: иконки для стандартных файлов.
export function getIconsStandard() { return readBool(KEYS.ICONS_STANDARD, true); }
export function setIconsStandard(v) { writeBool(KEYS.ICONS_STANDARD, !!v); }

// Подпункт: иконки для Unity.
export function getIconsUnity() { return readBool(KEYS.ICONS_UNITY, true); }
export function setIconsUnity(v) { writeBool(KEYS.ICONS_UNITY, !!v); }

// Кастомная клавиатура — тот же ключ, что использует custom-keyboard.js.
export function getKeyboardEnabled() { return readBool(KEYS.KB_ENABLED, true); }
export function setKeyboardEnabled(v) { writeBool(KEYS.KB_ENABLED, !!v); }
