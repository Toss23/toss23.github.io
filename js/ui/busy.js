let overlay = null;
let textEl = null;
let counter = 0;

function ensure() {
  if (overlay) return;
  overlay = document.getElementById("busy-overlay");
  textEl = document.getElementById("busy-text");
}

export function showBusy(text = "Загрузка…") {
  ensure();
  if (!overlay) return;
  counter++;
  if (textEl) textEl.textContent = text;
  overlay.classList.remove("hidden");

  // Блокируем скролл body.
  document.body.style.overflow = "hidden";
}

export function hideBusy() {
  ensure();
  if (!overlay) return;
  counter = Math.max(0, counter - 1);
  if (counter > 0) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// Принудительно скрыть, независимо от счётчика.
export function forceHideBusy() {
  ensure();
  counter = 0;
  if (!overlay) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// Обернуть промис: показать оверлей, выполнить, скрыть.
export async function withBusy(text, fn) {
  showBusy(text);
  try {
    return await fn();
  } finally {
    hideBusy();
  }
}