import { $ } from "@core/dom.js";
import { getRows } from "@core/keyboard-layouts.js";
import { subscribe } from "@core/store.js";

const LANG_KEY = "kb_lang";
const MODE_KEY = "kb_custom_enabled";

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

export function initCustomKeyboard({ editorScreen, onShow, onHide }) {
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
    }
    editorScreen.insertAtCursor?.(text);
    editorScreen.focus?.();
    if (panel === "letters") render();
  }

  function handleKey(key) {
    if (typeof key === "string") { insert(key); return; }
    switch (key.a) {
      case "shift": shift = !shift; render(); break;
      case "backspace": editorScreen.backspace?.(); editorScreen.focus?.(); break;
      case "space": insert(" "); break;
      case "enter": editorScreen.enterKey?.(); editorScreen.focus?.(); break;
      case "numbers": panel = "numbers"; shift = false; render(); break;
      case "symbols": panel = "symbols"; shift = false; render(); break;
      case "letters": panel = "letters"; shift = false; render(); break;
      case "lang": setLang(lang === "en" ? "ru" : "en"); break;
      case "hide": hide(); break;
    }
  }

  function makeKey(label, payload, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = "kb-key";
    if (opts.wide) btn.style.flex = String(opts.wide);
    if (opts.special) btn.classList.add("special");
    btn.textContent = label;

    btn.addEventListener("mousedown", (e) => {
      if (Date.now() - lastTouchTime < 600) return;
      e.preventDefault();
      handleKey(payload);
    });
    btn.addEventListener("touchstart", (e) => {
      lastTouchTime = Date.now();
      e.preventDefault();
      handleKey(payload);
    }, { passive: false });

    return btn;
  }

  function render() {
    if (!container) return;
    container.innerHTML = "";

    const rows = getRows(lang, panel, shift);
    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      for (const k of row) {
        const isObj = typeof k === "object";
        rowEl.appendChild(makeKey(
          isObj ? k.t : k,
          isObj ? k : k,
          { wide: isObj ? k.w : 1, special: isObj }
        ));
      }
      container.appendChild(rowEl);
    }

    const bottom = document.createElement("div");
    bottom.className = "kb-row";
    const panelLabel = panel === "letters" ? "?123" : "ABC";
    const panelAction = panel === "letters" ? "numbers" : "letters";
    bottom.appendChild(makeKey(panelLabel, { a: panelAction }, { wide: 1.5, special: true }));
    bottom.appendChild(makeKey("🌐", { a: "lang" }, { wide: 1.5, special: true }));
    bottom.appendChild(makeKey("⎵", { a: "space" }, { wide: 5, special: true }));
    bottom.appendChild(makeKey("⌄", { a: "hide" }, { wide: 1.5, special: true }));
    bottom.appendChild(makeKey("⏎", { a: "enter" }, { wide: 2, special: true }));
    container.appendChild(bottom);
  }

  function show() {
    if (!enabled) return;
    if (visible) return;
    visible = true;
    container.classList.remove("hidden");
    render();
    editorScreen.focus?.();
    onShow?.();
  }

  function hide() {
    if (!visible) return;
    visible = false;
    container.classList.add("hidden");
    onHide?.();
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

  subscribe((state) => {
    if (!enabled) return;
    if (state.screen !== "editor" && visible) hide();
  });

  applyInputMode();
  render();

  return {
    show,
    hide,
    isVisible: () => visible,
    isEnabled: () => enabled,
    setEnabled,
    isTouch: () => isTouch,
  };
}
