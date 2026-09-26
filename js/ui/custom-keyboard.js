import { $ } from "@core/dom.js";
import { getRows } from "@core/keyboard-layouts.js";

const LANG_KEY = "kb_lang";
const MODE_KEY = "kb_custom_enabled";

const BACKSPACE_DELAY = 400;
const BACKSPACE_INTERVAL = 50;

const EXTRA_BUTTONS = [
  { label: "⇥", action: "indent", title: "Таб" },
  { label: "⇤", action: "unindent", title: "Убрать отступ" },
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

function isTouchDevice() {
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
  if (typeof window !== "undefined" && "ontouchstart" in window) return true;
  try { return window.matchMedia("(hover: none) and (pointer: coarse)").matches; }
  catch { return false; }
}

function loadEnabledPref() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === null) return true;
    return v === "1";
  } catch { return true; }
}

function saveEnabledPref(v) {
  try { localStorage.setItem(MODE_KEY, v ? "1" : "0"); } catch {}
}

export function initCustomKeyboard({ editorScreen, onVisibilityChange }) {
  const textarea = $("file-content");
  if (!textarea || !editorScreen) return null;

  const isTouch = isTouchDevice();
  let enabled = isTouch ? loadEnabledPref() : false;

  let container = $("custom-keyboard");
  if (!container) {
    container = document.createElement("div");
    container.id = "custom-keyboard";
    container.className = "custom-keyboard hidden";
    document.body.appendChild(container);
  }

  let lang = "en";
  try { lang = localStorage.getItem(LANG_KEY) || "en"; } catch {}
  let shift = false;
  let panel = "letters";
  let visible = false;
  let lastTouchTime = 0;

  let bsDelayTimer = null;
  let bsRepeatTimer = null;

  function startBackspace() {
    stopBackspace();
    editorScreen.backspace?.();
    if (document.activeElement !== textarea) textarea.focus();
    bsDelayTimer = setTimeout(() => {
      bsRepeatTimer = setInterval(() => {
        editorScreen.backspace?.();
      }, BACKSPACE_INTERVAL);
    }, BACKSPACE_DELAY);
  }

  function stopBackspace() {
    if (bsDelayTimer) { clearTimeout(bsDelayTimer); bsDelayTimer = null; }
    if (bsRepeatTimer) { clearInterval(bsRepeatTimer); bsRepeatTimer = null; }
  }

  function applyInputMode() {
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("spellcheck", "false");
    if (enabled) textarea.setAttribute("inputmode", "none");
    else textarea.removeAttribute("inputmode");
  }

  function setLang(l) {
    lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch {}
    render();
  }

  function insert(text) {
    if (shift && panel === "letters" && text.length === 1 && /[A-Za-zА-Яа-я]/.test(text)) {
      shift = false;
      updateShiftButton();
    }
    editorScreen.insertAtCursor?.(text);
    if (document.activeElement !== textarea) textarea.focus();
  }

  function handleKey(key) {
    if (typeof key === "string") { insert(key); return; }
    switch (key.a) {
      case "shift": shift = !shift; render(); break;
      case "backspace": break;
      case "space": insert(" "); break;
      case "enter": editorScreen.enterKey?.(); if (document.activeElement !== textarea) textarea.focus(); break;
      case "indent": editorScreen.indent?.(); if (document.activeElement !== textarea) textarea.focus(); break;
      case "unindent": editorScreen.unindent?.(); if (document.activeElement !== textarea) textarea.focus(); break;
      case "numbers": panel = "numbers"; shift = false; render(); break;
      case "symbols": panel = "symbols"; shift = false; render(); break;
      case "letters": panel = "letters"; shift = false; render(); break;
      case "lang": setLang(lang === "en" ? "ru" : "en"); break;
      case "hide": hide(); break;
    }
  }

  function attachHandlers(btn, payload) {
    const isBackspace = typeof payload === "object" && payload?.a === "backspace";

    function fire() {
      if (isBackspace) startBackspace();
      else handleKey(payload);
    }

    btn.addEventListener("mousedown", (e) => {
      if (Date.now() - lastTouchTime < 600) return;
      e.preventDefault();
      fire();
    });
    btn.addEventListener("touchstart", (e) => {
      lastTouchTime = Date.now();
      e.preventDefault();
      fire();
    }, { passive: false });

    if (isBackspace) {
      const stop = () => stopBackspace();
      btn.addEventListener("mouseup", stop);
      btn.addEventListener("mouseleave", stop);
      btn.addEventListener("touchend", stop);
      btn.addEventListener("touchcancel", stop);
    }

    btn.addEventListener("click", (e) => e.preventDefault());
  }

  function makeKey(label, payload, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = "kb-key";
    if (opts.wide) btn.style.flex = String(opts.wide);
    if (opts.special) btn.classList.add("special");
    if (opts.action) btn.dataset.action = opts.action;
    btn.textContent = label;
    attachHandlers(btn, payload);
    return btn;
  }

  function updateShiftButton() {
    const btn = container.querySelector('button[data-action="shift"]');
    if (btn) btn.textContent = shift ? "⇪" : "⇧";
  }

  function render() {
    if (!container) return;
    container.innerHTML = "";

    const extra = document.createElement("div");
    extra.className = "kb-row kb-extra-row";
    for (const b of EXTRA_BUTTONS) {
      const payload = b.action ? { a: b.action } : b.key;
      extra.appendChild(makeKey(b.label, payload, {
        special: true,
        action: b.action,
      }));
    }
    container.appendChild(extra);

    const rows = getRows(lang, panel, shift);
    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      for (const k of row) {
        const isObj = typeof k === "object";
        const label = isObj ? k.t : k;
        const payload = isObj ? k : k;
        const opts = { wide: isObj ? k.w : 1, special: isObj };
        if (isObj && k.a) opts.action = k.a;
        rowEl.appendChild(makeKey(label, payload, opts));
      }
      container.appendChild(rowEl);
    }

    const bottom = document.createElement("div");
    bottom.className = "kb-row";
    const panelLabel = panel === "letters" ? "?123" : "ABC";
    const panelAction = panel === "letters" ? "numbers" : "letters";
    bottom.appendChild(makeKey(panelLabel, { a: panelAction }, { wide: 1.5, special: true, action: panelAction }));
    bottom.appendChild(makeKey("🌐", { a: "lang" }, { wide: 1.5, special: true, action: "lang" }));
    bottom.appendChild(makeKey("⎵", { a: "space" }, { wide: 5, special: true, action: "space" }));
    bottom.appendChild(makeKey("▼", { a: "hide" }, { wide: 1.5, special: true, action: "hide" }));
    bottom.appendChild(makeKey("⏎", { a: "enter" }, { wide: 2, special: true, action: "enter" }));
    container.appendChild(bottom);
  }

  function show() {
    if (!enabled) return;
    if (visible) return;
    visible = true;
    container.classList.remove("hidden");
    render();
    if (document.activeElement !== textarea) textarea.focus();
    onVisibilityChange?.(true);
  }

  function hide() {
    if (!visible) return;
    visible = false;
    stopBackspace();
    container.classList.add("hidden");
    onVisibilityChange?.(false);
  }

  function setEnabled(v) {
    const next = !!v;
    if (next === enabled) return;
    enabled = next;
    saveEnabledPref(enabled);
    applyInputMode();
    if (!enabled) hide();
  }

  textarea.addEventListener("focus", () => show());

  setInterval(() => {
    if (!enabled || !visible) return;
    const screen = document.getElementById("screen-editor");
    if (!screen || screen.classList.contains("hidden")) hide();
  }, 400);

  applyInputMode();
  render();

  return {
    show,
    hide,
    isVisible: () => visible,
    isEnabled: () => enabled,
    setEnabled,
    isTouch: () => isTouch,
    getHeight: () => {
      if (!container || container.classList.contains("hidden")) return 0;
      return container.getBoundingClientRect().height;
    },
  };
}
