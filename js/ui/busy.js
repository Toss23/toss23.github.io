let overlay = null;
let textEl = null;
let currentToken = null;

function ensure() {
  if (overlay && overlay.isConnected) return;
  overlay = document.getElementById("busy-overlay");
  textEl = document.getElementById("busy-text");
}

// После каждой косой черты вставляем zero-width space, чтобы длинные пути
// переносились по "/", а не обрезались.
function wrapSlashes(text) {
  return String(text == null ? "" : text).replace(/\//g, "/\u200B");
}

export function showBusy(text = "Загрузка…") {
  ensure();
  if (!overlay) return;
  currentToken = Symbol("busy");
  if (textEl) textEl.textContent = wrapSlashes(text);
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  return currentToken;
}

export function updateBusyText(text) {
  ensure();
  if (!textEl) return;
  textEl.textContent = wrapSlashes(text);
}

export function hideBusy(token = null) {
  ensure();
  if (!overlay) return;
  if (token && currentToken && token !== currentToken) return;
  currentToken = null;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

export function forceHideBusy() {
  ensure();
  currentToken = null;
  if (!overlay) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

export async function withBusy(text, fn) {
  const token = showBusy(text);
  try {
    return await fn();
  } finally {
    hideBusy(token);
  }
}
