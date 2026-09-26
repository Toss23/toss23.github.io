import { $ } from "@core/dom.js";

const isTouchDevice = (() => {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return "ontouchstart" in window;
  }
})();

const BUTTONS = [
  { label: "⇥", title: "Таб", action: "indent" },
  { label: "⇤", title: "Убрать отступ", action: "unindent" },
  { label: "↶", title: "Отменить", action: "undo" },
  { label: "↷", title: "Повторить", action: "redo" },
  { label: "\"", key: "\"" },
  { label: "'", key: "'" },
  { label: ";", key: ";" },
  { label: ",", key: "," },
  { label: ".", key: "." },
  { label: "=", key: "=" },
  { label: "+", key: "+" },
  { label: "-", key: "-" },
  { label: "/", key: "/" },
  { label: "_", key: "_" },
  { label: "$", key: "$" },
  { label: "←", title: "Влево", action: "left" },
  { label: "→", title: "Вправо", action: "right" },
  { label: "↑", title: "Вверх", action: "up" },
  { label: "↓", title: "Вниз", action: "down" },
];

export function initEditorKeybar({ editorScreen }) {
  const bar = $("editor-keybar");
  const textarea = $("file-content");
  const statusEl = $("status");
  if (!bar || !textarea) return { show() {}, hide() {} };

  if (!isTouchDevice) return { show() {}, hide() {} };

  for (const b of BUTTONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = b.label;
    if (b.title) btn.title = b.title;
    if (b.action) btn.dataset.action = b.action;
    if (b.key) btn.dataset.key = b.key;
    bar.appendChild(btn);
  }

  function handleButton(btn) {
    if (!editorScreen) return;
    const action = btn.dataset.action;
    const key = btn.dataset.key;

    if (action === "indent") editorScreen.indent?.();
    else if (action === "unindent") editorScreen.unindent?.();
    else if (action === "undo") editorScreen.undo?.();
    else if (action === "redo") editorScreen.redo?.();
    else if (action === "left" || action === "right" || action === "up" || action === "down") {
      editorScreen.moveCursor?.(action);
    } else if (key !== undefined) {
      editorScreen.insertAtCursor?.(key);
    }
    editorScreen.focus?.();
  }

  bar.addEventListener("touchstart", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    e.preventDefault();
    handleButton(btn);
  }, { passive: false });

  bar.addEventListener("mousedown", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    e.preventDefault();
    handleButton(btn);
  });

  function show() {
    bar.classList.remove("hidden");
    if (statusEl) statusEl.classList.add("hidden");
  }

  function hide() {
    bar.classList.add("hidden");
    if (statusEl) statusEl.classList.remove("hidden");
  }

  textarea.addEventListener("focus", show);
  textarea.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement !== textarea) hide();
    }, 100);
  });

  // Позиционирование не требуется: keybar — flex-элемент внизу
  // #screen-editor, а body сжимается через --app-height из keyboard-viewport.
  return { show, hide };
}
