import { $ } from "@core/dom.js";
import { getRows } from "@core/keyboard-layouts.js";

const LANG_KEY = "kb_lang";

function isTouchDevice() {
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
  if (typeof window !== "undefined" && "ontouchstart" in window) return true;
  try { return window.matchMedia("(hover: none) and (pointer: coarse)").matches; }
  catch { return false; }
}

export function initCustomKeyboard({ editorScreen }) {
  const textarea = $("file-content");
  if (!textarea || !editorScreen) return { show() {}, hide() {} };

  // Только для тач-устройств.
  if (!isTouchDevice()) return { show() {}, hide() {} };

  // Отключаем системную клавиатуру: focus без ввода.
  textarea.setAttribute("inputmode", "none");
  textarea.setAttribute("autocomplete", "off");
  textarea.setAttribute("autocorrect", "off");
  textarea.setAttribute("autocapitalize", "off");
  textarea.setAttribute("spellcheck", "false");

  // Контейнер создаём динамически, чтобы не трогать HTML.
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
    if (panel === "letters") render();
  }

  function backspace() { editorScreen.backspace?.(); }
  function enterKey() { editorScreen.enterKey?.(); }

  function toggleShift() {
    shift = !shift;
    render();
  }

  function switchPanel(p) {
    panel = p;
    shift = false;
    render();
  }

  function handleKey(key) {
    if (typeof key === "string") { insert(key); return; }
    switch (key.a) {
      case "shift": toggleShift(); break;
      case "backspace": backspace(); break;
      case "space": insert(" "); break;
      case "enter": enterKey(); break;
      case "numbers": switchPanel("numbers"); break;
      case "symbols": switchPanel("symbols"); break;
      case "letters": switchPanel("letters"); break;
      case "lang": setLang(lang === "en" ? "ru" : "en"); break;
      case "hide": hide(); break;
    }
  }

  function makeKey(label, actionOrKey, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.className = "kb-key";
    if (opts.wide) btn.style.flex = String(opts.wide);
    if (opts.special) btn.classList.add("special");
    btn.textContent = label;

    const payload = actionOrKey;

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
        const label = isObj ? k.t : k;
        const payload = isObj ? k : k;
        const btn = makeKey(label, payload, {
          wide: isObj ? k.w : 1,
          special: isObj,
        });
        rowEl.appendChild(btn);
      }
      container.appendChild(rowEl);
    }

    // Нижний ряд: [?123/ABC] [🌐] [space] [⌄] [⏎]
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
    if (visible) return;
    visible = true;
    container.classList.remove("hidden");
    render();
    editorScreen.focus?.();
  }

  function hide() {
    if (!visible) return;
    visible = false;
    container.classList.add("hidden");
    // Если textarea активна — снимаем фокус, чтобы не было мигания курсора без клавиатуры.
    if (document.activeElement === textarea) textarea.blur();
  }

  textarea.addEventListener("focus", () => show());
  textarea.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement !== textarea) hide();
    }, 120);
  });

  render();

  return { show, hide, isVisible: () => visible };
}
