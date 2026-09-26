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

  /* Касания: клик только если палец не уехал */

  const TAP_MAX_MS = 600;
  const TAP_MAX_DIST = 10;
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
    const btn = e.target.closest("button");
    if (!btn) return;
    e.preventDefault();
    handleButton(btn);
  });

  /* ---------- Baseline для определения клавиатуры ---------- */

  const vv = window.visualViewport;
  let baselineHeight = vv ? vv.height : window.innerHeight;
  let baselineLocked = false;

  // Через секунду после старта зафиксируем нормальную высоту.
  setTimeout(() => {
    if (vv) baselineHeight = Math.max(baselineHeight, vv.height);
    else baselineHeight = Math.max(baselineHeight, window.innerHeight);
    baselineLocked = true;
    console.log("[keybar] baseline =", baselineHeight);
  }, 1000);

  function isKeyboardVisible() {
    const focused = document.activeElement === textarea;
    if (!vv) return focused;
    const h = vv.height;
    // Клавиатура открыта, если высота меньше 80% от baseline.
    const shrunk = baselineLocked && h < baselineHeight * 0.8;
    return focused && shrunk;
  }

  /* ---------- Видимость ---------- */

  let visible = false;

  const statusEl = document.getElementById("status");

  function show() {
    if (visible) return;
    if (isActive && !isActive()) return;
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

  function syncState() {
    if (isKeyboardVisible()) show();
    else hide();
  }

  if (vv) {
    vv.addEventListener("resize", syncState);
    vv.addEventListener("scroll", syncState);
  }
  window.addEventListener("orientationchange", () => {
    // При повороте baseline пересчитается заново
    baselineLocked = false;
    setTimeout(() => {
      if (vv) baselineHeight = vv.height;
      else baselineHeight = window.innerHeight;
      baselineLocked = true;
      syncState();
    }, 400);
  });
  textarea.addEventListener("focus", () => setTimeout(syncState, 100));
  textarea.addEventListener("blur", () => setTimeout(syncState, 150));
  document.addEventListener("focusin", () => setTimeout(syncState, 100), true);
  document.addEventListener("focusout", () => setTimeout(syncState, 150), true);
  setInterval(syncState, 400);

  return { show, hide, sync: syncState };
}
