// Inline ghost-подсказка автодополнения для редактора кода.
//
// Работает как в IDE: при наборе префикса (≥3 символов) справа от
// курсора серым показывается продолжение слова. По Tab подсказка
// принимается, по Escape — отменяется.
//
// Позиция курсора измеряется через скрытый div с теми же параметрами
// типографики, что у textarea (шрифт, размер, line-height, tab-size,
// padding). В него кладётся текст до курсора плюс zero-width метка,
// координаты которой дают позицию ghost'а.

import { suggest, getWordAtCursor } from "@core/autocomplete.js";

export function initEditorAutocomplete({ textarea }) {
  if (!textarea) return null;
  const editorScroll = textarea.closest(".editor-scroll") || textarea.parentElement;
  if (!editorScroll) return null;

  const ghost = document.createElement("span");
  ghost.id = "editor-ghost";
  ghost.className = "hidden";
  editorScroll.appendChild(ghost);

  const measure = document.createElement("div");
  measure.id = "editor-measure";
  editorScroll.appendChild(measure);

  let current = null;  // { word, start, end }
  let raf = 0;

  // Копирует типографику textarea в measure, чтобы координаты совпадали.
  function copyMeasureStyles() {
    const cs = getComputedStyle(textarea);
    const props = [
      "fontFamily", "fontSize", "fontWeight", "fontStyle",
      "lineHeight", "letterSpacing", "textIndent", "textTransform",
      "tabSize", "MozTabSize", "whiteSpace", "wordBreak", "overflowWrap",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "boxSizing",
    ];
    for (const p of props) {
      try { measure.style[p] = cs[p]; } catch {}
    }
  }

  // Возвращает координаты курсора относительно левого-верхнего угла
  // .editor-scroll (без учёта scrollTop/scrollLeft textarea).
  function measureCursor(text, pos) {
    copyMeasureStyles();
    measure.textContent = text.slice(0, pos);
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    measure.appendChild(marker);
    const mr = measure.getBoundingClientRect();
    const kr = marker.getBoundingClientRect();
    return {
      x: kr.left - mr.left,
      y: kr.top - mr.top,
      h: kr.height,
    };
  }

  function hide() {
    ghost.classList.add("hidden");
    current = null;
  }

  function compute() {
    if (document.activeElement !== textarea) return hide();
    if (textarea.disabled) return hide();
    if (textarea.selectionStart !== textarea.selectionEnd) return hide();

    const { prefix, start, end } = getWordAtCursor(textarea);
    if (!prefix || prefix.length < 3) return hide();

    const cands = suggest(prefix, 1);
    if (!cands.length) return hide();
    const word = cands[0];
    const tail = word.slice(prefix.length);
    if (!tail) return hide();

    const pos = measureCursor(textarea.value, end);
    const cs = getComputedStyle(textarea);

    ghost.textContent = tail;
    ghost.style.left = (pos.x - textarea.scrollLeft) + "px";
    ghost.style.top  = (pos.y - textarea.scrollTop) + "px";
    ghost.style.fontFamily = cs.fontFamily;
    ghost.style.fontSize = cs.fontSize;
    ghost.style.lineHeight = cs.lineHeight;
    ghost.style.letterSpacing = cs.letterSpacing;
    ghost.style.tabSize = cs.tabSize;
    ghost.classList.remove("hidden");

    current = { word, start, end };
  }

  function refresh() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      compute();
    });
  }

  function accept() {
    if (!current) return false;
    const { word, start, end } = current;
    textarea.setRangeText(word, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    hide();
    return true;
  }

  function dismiss() {
    if (!current) return false;
    hide();
    return true;
  }

  // Перехват Tab/Escape. Возвращает true, если событие обработано
  // и его дальше пропускать не надо.
  function handleKey(e) {
    if (!current) return false;
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      accept();
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return true;
    }
    return false;
  }

  textarea.addEventListener("input", refresh);
  textarea.addEventListener("keyup", refresh);
  textarea.addEventListener("click", refresh);
  textarea.addEventListener("focus", refresh);
  textarea.addEventListener("blur", hide);
  textarea.addEventListener("scroll", refresh);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === textarea) refresh();
  });

  return {
    refresh,
    hide,
    handleKey,
    hasSuggestion: () => !!current,
  };
}
