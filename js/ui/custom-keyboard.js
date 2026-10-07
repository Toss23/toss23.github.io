import { $ } from "@core/dom.js";
import { getRows } from "@core/keyboard-layouts.js";
import { suggest, getWordAtCursor, ATTRIBUTES } from "@core/autocomplete.js";

const LANG_KEY = "kb_lang";
const MODE_KEY = "kb_custom_enabled";

const BACKSPACE_DELAY = 400;
const BACKSPACE_INTERVAL = 50;

// Кастомная клавиатура показывается только после явного тапа по полю
// редактора, а не на программный фокус. Тап считаем «свежим» в течение
// этого времени.
const USER_TAP_WINDOW_MS = 800;

// После ввода с физической клавиатуры кастомная не появляется
// в течение этого окна — защита от авто-показа при следующем тапе.
const PHYSICAL_KEY_SUPPRESS_MS = 5000;

// Поля, для которых работает кастомная клавиатура.
const EDITOR_FIELD_IDS = ["file-content", "editor-find-input", "editor-replace-input"];

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
  try {
    window.dispatchEvent(new CustomEvent("settings-changed", {
      detail: { key: MODE_KEY, value: !!v },
    }));
  } catch {}
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
  // Время последнего явного тапа пользователя по полю редактора.
  let lastUserTapAt = 0;
  // Время последнего нажатия на физической клавиатуре.
  let lastPhysicalKeyAt = 0;

  let bsDelayTimer = null;
  let bsRepeatTimer = null;

  function getFields() {
    return EDITOR_FIELD_IDS
      .map((id) => document.getElementById(id))
      .filter(Boolean);
  }

  function getTarget() {
    const a = document.activeElement;
    if (a && EDITOR_FIELD_IDS.includes(a.id)) return a;
    return textarea;
  }

  function isTargetInEditor() {
    const a = document.activeElement;
    return !!(a && EDITOR_FIELD_IDS.includes(a.id));
  }

  function startBackspace() {
    stopBackspace();
    doBackspace();
    bsDelayTimer = setTimeout(() => {
      bsRepeatTimer = setInterval(doBackspace, BACKSPACE_INTERVAL);
    }, BACKSPACE_DELAY);
  }

  function stopBackspace() {
    if (bsDelayTimer) { clearTimeout(bsDelayTimer); bsDelayTimer = null; }
    if (bsRepeatTimer) { clearInterval(bsRepeatTimer); bsRepeatTimer = null; }
  }

  function doBackspace() {
    const el = getTarget();
    if (el === textarea) {
      editorScreen.backspace?.();
      if (document.activeElement !== textarea) textarea.focus();
      return;
    }
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    if (s !== e) {
      el.setRangeText("", s, e, "end");
    } else if (s > 0) {
      el.setRangeText("", s - 1, s, "end");
    } else {
      return;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyInputMode() {
    for (const el of getFields()) {
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("spellcheck", "false");
      if (enabled) el.setAttribute("inputmode", "none");
      else el.removeAttribute("inputmode");
    }
  }

  function setLang(l) {
    lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch {}
    render();
  }

  function insertAtTarget(text) {
    const el = getTarget();
    if (el === textarea) {
      editorScreen.insertAtCursor?.(text);
      if (document.activeElement !== textarea) textarea.focus();
    } else {
      const s = el.selectionStart ?? el.value.length;
      const e = el.selectionEnd ?? s;
      el.setRangeText(text, s, e, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Обновляем ряд подсказок автодополнения после каждого ввода.
    updateSuggestionRow();

    // Одноразовый Shift: после любого одиночного ввода на панели «letters»
    // возвращаем нижний регистр и перерисовываем клавиатуру,
    // чтобы буквы снова стали строчными.
    if (shift && panel === "letters" && typeof text === "string" && text.length > 0) {
      shift = false;
      render();
    }
  }

  function enterAtTarget() {
    const el = getTarget();
    if (el === textarea) {
      editorScreen.enterKey?.();
      if (document.activeElement !== textarea) textarea.focus();
      return;
    }
    // Эмулируем Enter — обработчики на полях поиска сработают (найти следующее).
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", bubbles: true, cancelable: true,
    }));
  }

  function handleKey(key) {
    if (typeof key === "string") { insertAtTarget(key); return; }
    switch (key.a) {
      case "shift":
        shift = !shift;
        updateShiftButton();
        render();
        break;
      case "backspace": break;
      case "space": insertAtTarget(" "); break;
      case "enter": enterAtTarget(); break;
      case "indent":
        if (getTarget() === textarea) {
          editorScreen.indent?.();
          if (document.activeElement !== textarea) textarea.focus();
        }
        break;
      case "unindent":
        if (getTarget() === textarea) {
          editorScreen.unindent?.();
          if (document.activeElement !== textarea) textarea.focus();
        }
        break;
      case "numbers": panel = "numbers"; shift = false; render(); break;
      case "symbols": panel = "symbols"; shift = false; render(); break;
      case "letters": panel = "letters"; shift = false; render(); break;
      case "lang": setLang(lang === "en" ? "ru" : "en"); break;
      case "hide": hide(); break;
    }
  }

  function attachHandlers(btn, payload) {
    const isBackspace = typeof payload === "object" && payload?.a === "backspace";
    const TAP_MAX_MS = 700;
    const TAP_MAX_DIST = 12;
    let sx = 0, sy = 0, st = 0, moved = false;

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
      if (e.touches.length !== 1) { moved = true; return; }
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
      moved = false;
    }, { passive: true });

    btn.addEventListener("touchmove", (e) => {
      if (moved) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) > TAP_MAX_DIST || Math.abs(dy) > TAP_MAX_DIST) moved = true;
    }, { passive: true });

    btn.addEventListener("touchend", (e) => {
      const wasMoved = moved;
      moved = false;
      if (wasMoved) return;
      if (Date.now() - st > TAP_MAX_MS) return;
      e.preventDefault();
      fire();
    }, { passive: false });

    btn.addEventListener("touchcancel", () => { moved = false; }, { passive: true });

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

  // Принимает подсказку: заменяет уже набранный префикс на полное слово.
  function acceptSuggestion(word) {
    const el = getTarget();
    if (!el || !word) return;
    const { start, end } = getWordAtCursor(el);
    const charBefore = el.value[start - 1];
    el.setRangeText(word, start, end, "end");
    const pos = el.selectionStart;

    // Атрибут в стиле [SerializeField]: перепрыгиваем "]" и ставим пробел.
    if (ATTRIBUTES.has(word) && charBefore === "[" && el.value[pos] === "]") {
      const after = el.value[pos + 1];
      if (after === " ") {
        el.setSelectionRange(pos + 2, pos + 2);
      } else {
        el.setRangeText(" ", pos + 1, pos + 1, "end");
      }
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (el !== textarea && document.activeElement !== el) el.focus();
    updateSuggestionRow();
  }

  // Перестраивает ряд подсказок над клавиатурой.
  // Если подсказок нет — прячет ряд, чтобы не занимал место.
  function updateSuggestionRow() {
    const row = container && container.querySelector("#kb-suggest-row");
    if (!row) return;
    row.innerHTML = "";
    const el = getTarget();
    if (!el) { row.classList.add("hidden"); return; }
    const { prefix } = getWordAtCursor(el);
    const items = suggest(prefix, 4);
    if (!items.length) { row.classList.add("hidden"); return; }
    row.classList.remove("hidden");
    for (const word of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.tabIndex = -1;
      btn.className = "kb-suggest-btn";
      btn.textContent = word;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        acceptSuggestion(word);
      });
      row.appendChild(btn);
    }
  }

  function updateShiftButton() {
    const btn = container.querySelector('button[data-action="shift"]');
    if (btn) btn.textContent = shift ? "⇪" : "⇧";
  }

  function render() {
    if (!container) return;
    container.innerHTML = "";

    // Ряд подсказок автодополнения — над остальными кнопками.
    // Скрыт, если префикс короче 3 символов или совпадений нет.
    const suggestRow = document.createElement("div");
    suggestRow.id = "kb-suggest-row";
    suggestRow.className = "kb-suggest-row hidden";
    container.appendChild(suggestRow);

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

    // После полной перерисовки обновляем содержимое ряда подсказок.
    updateSuggestionRow();
  }

  function show() {
    if (!enabled) return;
    if (visible) return;
    // Показываем только если пользователь только что тапнул по полю.
    if (Date.now() - lastUserTapAt > USER_TAP_WINDOW_MS) return;
    // И только если недавно не печатал на физической.
    if (Date.now() - lastPhysicalKeyAt < PHYSICAL_KEY_SUPPRESS_MS) return;
    visible = true;
    container.classList.remove("hidden");
    render();
    const a = document.activeElement;
    if (a && EDITOR_FIELD_IDS.includes(a.id)) {
      // оставляем фокус там, где он был
    } else {
      textarea.focus();
    }
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

  // Тап по полю редактора — единственный триггер показа.
  // pointerdown срабатывает до focus, ловит и мышь, и палец.
  document.addEventListener("pointerdown", (e) => {
    if (!enabled) return;
    if (!e.isTrusted) return;
    const t = e.target;
    if (!t || !t.closest) return;
    for (const id of EDITOR_FIELD_IDS) {
      if (t.closest("#" + id)) {
        lastUserTapAt = Date.now();
        show();
        return;
      }
    }
  }, { passive: true });

  // Физическая клавиатура: печатный символ или служебная клавиша
  // означает, что пользователь печатает не с кастомной. Скрываем её
  // и запоминаем время, чтобы show() не поднял её сразу после тапа.
  document.addEventListener("keydown", (e) => {
    if (!enabled) return;
    if (!e.isTrusted) return;
    const key = e.key;
    if (!key) return;

    // Одни модификаторы — не печать.
    if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" ||
        key === "CapsLock" || key === "NumLock" || key === "ScrollLock" ||
        key === "Escape" || key === "ContextMenu" || key === "Fn") return;

    // Шорткаты с Ctrl/Cmd/Alt — тоже не текст.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const isPrintable = key.length === 1;
    const isAction = key === "Enter" || key === "Backspace" || key === "Tab" ||
      key === "Delete" || key === "ArrowLeft" || key === "ArrowRight" ||
      key === "ArrowUp" || key === "ArrowDown" ||
      key === "Home" || key === "End" || key === "PageUp" || key === "PageDown";
    if (!isPrintable && !isAction) return;

    lastPhysicalKeyAt = Date.now();
    if (visible) hide();
  });

  document.addEventListener("focusout", () => {
    if (!enabled || !visible) return;
    // Даём браузеру перевести фокус и проверяем, куда пришли.
    setTimeout(() => {
      if (!isTargetInEditor()) hide();
    }, 80);
  });

  // Автоскрытие при уходе с экрана редактора.
  setInterval(() => {
    if (!enabled || !visible) return;
    const screen = document.getElementById("screen-editor");
    if (!screen || screen.classList.contains("hidden")) hide();
  }, 400);

  // Реакция на изменение настройки «Кастомная клавиатура» во время работы.
  setInterval(() => {
    const pref = loadEnabledPref();
    if (pref !== enabled && isTouch) setEnabled(pref);
  }, 500);

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
