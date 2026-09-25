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
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);

export function isImagePath(path) {
  if (!path) return false;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}