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

export function initEditorKeybar({ editorScreen, isActive, onShow, onHide }) {
  const bar = $("editor-keybar");
  const textarea = $("file-content");
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
    else if (key !== undefined) editorScreen.insertAtCursor?.(key);
    editorScreen.focus?.();
  }

  /* ---------- Касания: клик срабатывает только если палец не уехал ---------- */

  const TAP_MAX_MS = 600;
  const TAP_MAX_DIST = 10;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let startBtn = null;
  let scrolled = false;

  bar.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) {
      startBtn = null;
      return;
    }
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
    if (Math.abs(dx) > TAP_MAX_DIST || Math.abs(dy) > TAP_MAX_DIST) {
      scrolled = true;
    }
  }, { passive: true });

  bar.addEventListener("touchend", (e) => {
    const btn = startBtn;
    startBtn = null;
    if (!btn || scrolled) return;
    const dt = Date.now() - startTime;
    if (dt > TAP_MAX_MS) return;
    // Проверяем, что палец остался на той же кнопке
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (!el || !btn.contains(el) && el !== btn) return;
    e.preventDefault();
    handleButton(btn);
  }, { passive: false });

  bar.addEventListener("touchcancel", () => {
    startBtn = null;
    scrolled = false;
  }, { passive: true });

  /* ---------- Мышь для теста на ПК ---------- */

  bar.addEventListener("mousedown", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    e.preventDefault();
    handleButton(btn);
  });

  /* ---------- Видимость ---------- */

  let visible = false;

  function show() {
    if (visible) return;
    if (isActive && !isActive()) return;
    visible = true;
    bar.classList.remove("hidden");
    onShow?.();
  }

  function hide() {
    if (!visible) return;
    visible = false;
    bar.classList.add("hidden");
    onHide?.();
  }

  function isKeyboardVisible() {
    const vv = window.visualViewport;
    if (!vv) return document.activeElement === textarea;
    const innerH = window.innerHeight;
    const vvH = vv.height;
    return vvH < innerH * 0.78;
  }

  function syncState() {
    if (isKeyboardVisible()) show();
    else hide();
  }

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", syncState);
    vv.addEventListener("scroll", syncState);
  }
  window.addEventListener("orientationchange", () => setTimeout(syncState, 200));
  textarea.addEventListener("focus", () => setTimeout(syncState, 60));
  textarea.addEventListener("blur", () => setTimeout(syncState, 120));
  document.addEventListener("focusin", () => setTimeout(syncState, 60), true);
  document.addEventListener("focusout", () => setTimeout(syncState, 120), true);
  setInterval(syncState, 400);

  return { show, hide, sync: syncState };
}
