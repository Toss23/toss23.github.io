import { $ } from "@core/dom.js";

const isTouchDevice = (() => {
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
  if (typeof window !== "undefined" && "ontouchstart" in window) return true;
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
})();

const BUTTONS = [
  { label: "⇥", title: "Таб", action: "indent" },
  { label: "⇤", title: "Убрать отступ", action: "unindent" },
  { label: ".", key: "." },
  { label: ",", key: "," },
  { label: "\"", key: "\"" },
  { label: ";", key: ";" },
  { label: "=", key: "=" },
  { label: "{", key: "{" },
  { label: "}", key: "}" },
  { label: "(", key: "(" },
  { label: ")", key: ")" },
  { label: "[", key: "[" },
  { label: "]", key: "]" },
];

export function initEditorKeybar({ editorScreen, onShow, onHide, isSuppressed }) {
  const bar = $("editor-keybar");
  const textarea = $("file-content");
  const statusEl = $("status");

  if (!bar || !textarea) return { show() {}, hide() {} };
  if (!isTouchDevice) return { show() {}, hide() {} };

  if (!bar.children.length) {
    for (const b of BUTTONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.label;
      if (b.title) btn.title = b.title;
      if (b.action) btn.dataset.action = b.action;
      if (b.key) btn.dataset.key = b.key;
      bar.appendChild(btn);
    }
  }

  function handleButton(btn) {
    if (!editorScreen) return;
    const action = btn.dataset.action;
    const key = btn.dataset.key;
    if (action === "indent") editorScreen.indent?.();
    else if (action === "unindent") editorScreen.unindent?.();
    else if (key !== undefined) editorScreen.insertAtCursor?.(key);
    editorScreen.focus?.();
  }

  const TAP_MAX_MS = 700;
  const TAP_MAX_DIST = 12;
  let startX = 0, startY = 0, startTime = 0, startBtn = null, scrolled = false;

  bar.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { startBtn = null; return; }
    startBtn = e.target.closest("button");
    if (!startBtn) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    scrolled = false;
  }, { passive: true });

  bar.addEventListener("touchmove", (e) => {
    if (!startBtn) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > TAP_MAX_DIST || Math.abs(dy) > TAP_MAX_DIST) scrolled = true;
  }, { passive: true });

  bar.addEventListener("touchend", (e) => {
    const btn = startBtn;
    startBtn = null;
    if (!btn || scrolled) return;
    if (Date.now() - startTime > TAP_MAX_MS) return;
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (!el || (!btn.contains(el) && el !== btn)) return;
    e.preventDefault();
    handleButton(btn);
  }, { passive: false });

  bar.addEventListener("touchcancel", () => { startBtn = null; scrolled = false; }, { passive: true });

  bar.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const btn = e.target.closest("button");
    if (!btn) return;
    handleButton(btn);
  });

  let visible = false;

  function show() {
    if (visible) return;
    if (isSuppressed && isSuppressed()) return;
    visible = true;
    bar.classList.remove("hidden");
    if (statusEl) statusEl.classList.add("hidden");
    onShow?.();
  }

  function hide() {
    if (!visible) return;
    visible = false;
    bar.classList.add("hidden");
    if (statusEl) statusEl.classList.remove("hidden");
    onHide?.();
  }

  function isEditorFocused() {
    return document.activeElement === textarea;
  }

  function syncState() {
    if (isSuppressed && isSuppressed()) {
      if (visible) hide();
      return;
    }
    if (isEditorFocused()) show();
    else hide();
  }

  textarea.addEventListener("focus", () => setTimeout(syncState, 60));
  textarea.addEventListener("blur", () => setTimeout(syncState, 120));
  document.addEventListener("focusin", () => setTimeout(syncState, 60), true);
  document.addEventListener("focusout", () => setTimeout(syncState, 120), true);
  setInterval(syncState, 500);
  setTimeout(syncState, 200);

  return { show, hide, sync: syncState };
}
