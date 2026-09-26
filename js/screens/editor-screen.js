import { $ } from "@core/dom.js";
import { UI } from "@core/config.js";
import { gitBlobSha } from "@core/git-sha.js";
import { fromLf } from "@core/encoding.js";
import { tokenize, renderTokens, findBracketPair } from "@core/csharp-highlight.js";

const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}", "\"": "\"", "'": "'" };
const CLOSE_CHARS = new Set([")", "]", "}", "\"", "'"]);
const INDENT_SIZE = 4;

export function initEditorScreen({ onStateChange, onSave, onRevert }) {
  const textarea = $("file-content");
  const highlight = $("file-highlight");
  const codeEl = highlight ? highlight.querySelector("code") : null;
  const pathLabel = $("file-path");
  const marker = $("dirty-marker");
  const saveBtn = $("save-file");
  const revertBtn = $("revert-file");

  if (!textarea || !highlight || !codeEl) {
    console.error("editor-screen: не найдены #file-content или #file-highlight");
  }

  let base = null;
  let savedLf = null;
  let checkTimer;
  let highlightTimer;
  let caretTimer;

  /* ---------- Подсветка ---------- */

  function renderHighlight() {
    if (!codeEl || !textarea) return;
    const text = textarea.value;
    try {
      const tokens = tokenize(text);
      const pos = textarea.selectionStart || 0;
      const pair = findBracketPair(text, pos);
      codeEl.innerHTML = renderTokens(tokens, pair);
    } catch (e) {
      console.warn("highlight:", e);
      codeEl.textContent = text;
    }
    if (highlight) {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
  }

  function scheduleHighlight() {
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(renderHighlight, 120);
  }

  function scheduleCaretHighlight() {
    clearTimeout(caretTimer);
    caretTimer = setTimeout(renderHighlight, 40);
  }

  /* ---------- Вставка ---------- */

  function insertText(text, selectStart, selectEnd) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText(text, start, end, "end");
    if (typeof selectStart === "number") {
      const s = start + selectStart;
      const e = typeof selectEnd === "number" ? start + selectEnd : s;
      textarea.setSelectionRange(s, e);
    }
    scheduleHighlight();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 200);
  }

  function currentLineInfo() {
    if (!textarea) return { indent: "", beforeCaret: "", afterCaret: "" };
    const text = textarea.value;
    const pos = textarea.selectionStart;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const lineEnd = text.indexOf("\n", pos);
    const lineEndPos = lineEnd === -1 ? text.length : lineEnd;
    const beforeCaret = text.slice(lineStart, pos);
    const afterCaret = text.slice(pos, lineEndPos);
    const m = beforeCaret.match(/^[ \t]*/);
    const indent = m ? m[0] : "";
    return { indent, beforeCaret, afterCaret, lineStart, lineEndPos };
  }

  /* ---------- Обработка клавиш ---------- */

  function handleKeydown(e) {
    if (!textarea || textarea.disabled || !base) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Enter — автоотступ / автозакрытие блока
    if (e.key === "Enter" && !e.shiftKey) {
      const { indent, beforeCaret, afterCaret } = currentLineInfo();
      const trimmedEnd = beforeCaret.replace(/[ \t]+$/, "");

      if (trimmedEnd.endsWith("{")) {
        e.preventDefault();
        const nextIndent = indent + " ".repeat(INDENT_SIZE);
        const trimmedAfter = afterCaret.replace(/^[ \t]*/, "");
        if (trimmedAfter.startsWith("}")) {
          const insertion = "\n" + nextIndent + "\n" + indent;
          insertText(insertion, 1 + nextIndent.length, 1 + nextIndent.length);
        } else {
          const insertion = "\n" + nextIndent;
          insertText(insertion);
        }
        return;
      }

      const trimmedAfter = afterCaret.replace(/^[ \t]*/, "");
      if (trimmedAfter.startsWith("}")) {
        e.preventDefault();
        let baseIndent = indent;
        if (baseIndent.length >= INDENT_SIZE) baseIndent = baseIndent.slice(0, -INDENT_SIZE);
        const insertion = "\n" + baseIndent;
        insertText(insertion);
        return;
      }

      if (indent) {
        e.preventDefault();
        const insertion = "\n" + indent;
        insertText(insertion);
        return;
      }
      return;
    }

    // Автозакрытие скобок
    if (OPEN_TO_CLOSE[e.key]) {
      const text = textarea.value;
      const pos = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const isQuote = e.key === "\"" || e.key === "'";
      if (isQuote) {
        const prevCh = pos > 0 ? text[pos - 1] : "";
        const nextCh = pos < text.length ? text[pos] : "";
        if (prevCh === "\\") return;
        if (nextCh === e.key && pos === end) {
          e.preventDefault();
          textarea.setSelectionRange(pos + 1, pos + 1);
          scheduleCaretHighlight();
          return;
        }
        if (/[A-Za-z0-9_]/.test(prevCh)) return;
      } else {
        const nextCh = pos < text.length ? text[pos] : "";
        if (CLOSE_CHARS.has(nextCh) && pos === end) {
          e.preventDefault();
          textarea.setRangeText(e.key + nextCh, pos, pos + 1, "end");
          textarea.setSelectionRange(pos + 1, pos + 1);
          scheduleHighlight();
          clearTimeout(checkTimer);
          checkTimer = setTimeout(check, 200);
          return;
        }
      }

      e.preventDefault();
      const close = OPEN_TO_CLOSE[e.key];
      const selected = textarea.value.slice(pos, end);
      insertText(e.key + selected + close, 1, 1 + selected.length);
      return;
    }

    // Прыжок через закрывающую
    if (CLOSE_CHARS.has(e.key)) {
      const text = textarea.value;
      const pos = textarea.selectionStart;
      if (pos === textarea.selectionEnd && text[pos] === e.key) {
        e.preventDefault();
        textarea.setSelectionRange(pos + 1, pos + 1);
        scheduleCaretHighlight();
        return;
      }
    }

    // Backspace внутри пустой пары — удалить обе скобки
    if (e.key === "Backspace") {
      const text = textarea.value;
      const pos = textarea.selectionStart;
      if (pos === textarea.selectionEnd && pos > 0 && pos < text.length) {
        const leftCh = text[pos - 1];
        const rightCh = text[pos];
        if (OPEN_TO_CLOSE[leftCh] && OPEN_TO_CLOSE[leftCh] === rightCh) {
          e.preventDefault();
          textarea.setRangeText("", pos - 1, pos + 1, "end");
          scheduleHighlight();
          clearTimeout(checkTimer);
          checkTimer = setTimeout(check, 200);
          return;
        }
      }
    }

    // Автоотступ для одиночной закрывающей скобки в начале строки
    if (e.key === "}") {
      const text = textarea.value;
      const pos = textarea.selectionStart;
      const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
      const before = text.slice(lineStart, pos);
      if (/^[ \t]+$/.test(before)) {
        e.preventDefault();
        let baseIndent = before;
        if (baseIndent.length >= INDENT_SIZE) baseIndent = baseIndent.slice(0, -INDENT_SIZE);
        const insertion = baseIndent + "}";
        textarea.setRangeText(insertion, lineStart, pos, "end");
        scheduleHighlight();
        clearTimeout(checkTimer);
        checkTimer = setTimeout(check, 200);
        return;
      }
    }
  }

  /* ---------- Обработчики ---------- */

  textarea.addEventListener("keydown", handleKeydown);

  textarea.addEventListener("input", () => {
    scheduleHighlight();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, UI.DIRTY_DEBOUNCE_MS);
  });

  textarea.addEventListener("scroll", () => {
    if (!highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  });

  textarea.addEventListener("keyup", scheduleCaretHighlight);
  textarea.addEventListener("click", scheduleCaretHighlight);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === textarea) scheduleCaretHighlight();
  });

  saveBtn.addEventListener("click", () => {
    if (!base) return;
    onSave?.(base.path, textarea.value);
  });

  revertBtn.addEventListener("click", () => {
    if (!base) return;
    onRevert?.(base.path);
  });

  async function check() {
    if (!base) return;
    const current = textarea.value;
    const contentOrig = fromLf(current, base.baseEol);
    const sha = await gitBlobSha(contentOrig);
    const modified = sha !== base.baseSha;
    const unsaved = current !== savedLf;

    marker.classList.toggle("hidden", !modified);
    saveBtn.disabled = !unsaved;
    saveBtn.classList.toggle("active", unsaved);
    revertBtn.disabled = !(modified || unsaved);

    onStateChange?.(base.path, { modified, unsaved, current });
  }

  function setContent(text, disabled) {
    if (!textarea) return;
    textarea.value = text;
    textarea.disabled = !!disabled;
    renderHighlight();
  }

  return {
    open({ path, baseSha, eol, content, focus = false }) {
      base = { path, baseSha, baseEol: eol };
      savedLf = content;
      if (pathLabel) pathLabel.textContent = path;
      setContent(content, false);
      clearTimeout(checkTimer);
      check();
      if (focus) setTimeout(() => textarea.focus(), 50);
    },
    close() {
      base = null;
      savedLf = null;
      if (pathLabel) pathLabel.textContent = "";
      setContent("", true);
      if (marker) marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
      clearTimeout(checkTimer);
      clearTimeout(highlightTimer);
      clearTimeout(caretTimer);
    },
    markSaved(path) {
      if (!base || !textarea) return;
      if (path && base.path !== path) return;
      savedLf = textarea.value;
      check();
    },
    revert({ content, baseSha }) {
      if (!base) return;
      savedLf = content;
      base.baseSha = baseSha;
      setContent(content, false);
      check();
    },
    updateBaseSha(newSha) {
      if (!base) return;
      base.baseSha = newSha;
      check();
    },
    setLocalMode(visible) {
      saveBtn.classList.toggle("hidden", !visible);
      revertBtn.classList.remove("hidden");
    },
    showBinaryNotice(path, sizeText) {
      base = null;
      savedLf = null;
      if (pathLabel) pathLabel.textContent = path;
      setContent("\uD83D\uDCE6 Бинарный файл — " + sizeText + "\n\nПросмотр и редактирование недоступны.", true);
      if (marker) marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
    },
    getPath() {
      return base ? base.path : null;
    },
    captureDirty() {
      if (!base || !textarea) return null;
      const current = textarea.value;
      return { path: base.path, current, unsaved: current !== savedLf };
    },
    getContent() {
      return textarea ? textarea.value : "";
    },
    setContent(text) {
      if (!textarea) return;
      textarea.value = text;
      scheduleHighlight();
      clearTimeout(checkTimer);
      checkTimer = setTimeout(check, 200);
    },
    selectRange(start, end) {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 22;
      const before = textarea.value.slice(0, start);
      const line = (before.match(/\n/g) || []).length;
      const target = Math.max(0, line * lineHeight - textarea.clientHeight / 2 + lineHeight);
      textarea.scrollTop = target;
      if (highlight) highlight.scrollTop = textarea.scrollTop;
    },
    focus() {
      if (textarea) textarea.focus();
    },
  };
}
