export const STORAGE_KEYS = {
  TOKEN: "gh_token",
};

export const LIMITS = {
  MAX_FILE_SIZE: 5_000_000,
  PAGE_SIZE: 100,
};

export const UI = {
  DIRTY_DEBOUNCE_MS: 400,
  STATUS_TIMEOUT_MS: 3000,
  DEFAULT_COMMIT_MESSAGE: "Update from web client",
};

export const SCREENS = {
  AUTH: "auth",
  REPOS: "repos",
  FILES: "files",
  EDITOR: "editor",
  HISTORY: "history",
  IMAGE: "image",
  AUDIO: "audio",
  UNITY_SCENE: "unity-scene",
};

// Резервный адрес репозитория приложения. Используется, когда hostname
// не вида *.github.io (например, кастомный домен). Должен совпадать
// с APP_REPO_FALLBACK в js/boot.js.
export const APP_REPO = {
  owner: "Toss23",
  repo: "toss23.github.io",
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "psd", "psb"]);

export function isImagePath(path) {
  if (!path) return false;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

// Расширения, которые браузер может воспроизвести через <audio>.
// Реальная поддержка зависит от браузера, но эти имеет смысл пытаться.
const AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "ogg", "oga", "opus", "flac",
  "aac", "m4a", "weba", "mid", "midi",
]);

export function isAudioPath(path) {
  if (!path) return false;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return AUDIO_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

// Сцены Unity (.unity). Пока только они — .prefab добавим отдельно.
export function isUnityScenePath(path) {
  if (!path) return false;
  return /\.unity$/i.test(path);
}