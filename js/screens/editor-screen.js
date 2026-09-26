import { $ } from "@core/dom.js";
import { UI } from "@core/config.js";
import { gitBlobSha } from "@core/git-sha.js";
import { fromLf } from "@core/encoding.js";
import { tokenize, renderTokens, renderPlain, findBracketPair } from "@core/csharp-highlight.js";

function isCSharpPath(path) {
  return typeof path === "string" && /\.cs$/i.test(path);
}

const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}", "\"": "\"", "'": "'" };
const CLOSE_CHARS = new Set([")", "]", "}", "\"", "'"]);
const INDENT_SIZE = 4;
const INDENT_UNIT = " ".repeat(INDENT_SIZE);
const HISTORY_LIMIT = 200;
const HISTORY_MERGE_MS = 400;

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

  /* ---------- История (undo/redo) ---------- */

  let undoStack = [];
  let redoStack = [];
  let lastSnapshotTime = 0;
  let historySuspend = false;

  function snapState() {
    return {
      text: textarea.value,
      ss: textarea.selectionStart,
      se: textarea.selectionEnd,
    };
  }

  function takeSnapshot(force) {
    if (!textarea || historySuspend) return;
    const state = snapState();
    const last = undoStack[undoStack.length - 1];
    if (last && last.text === state.text && last.ss === state.ss && last.se === state.se) return;

    const now = Date.now();
    if (!force && last && (now - lastSnapshotTime) < HISTORY_MERGE_MS) {
      undoStack[undoStack.length - 1] = state;
    } else {
      undoStack.push(state);
    }
    lastSnapshotTime = now;
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function resetHistory() {
    undoStack = [];
    redoStack = [];
    lastSnapshotTime = 0;
    if (textarea) undoStack.push(snapState());
  }

  function applyState(state) {
    historySuspend = true;
    textarea.value = state.text;
    try { textarea.setSelectionRange(state.ss, state.se); } catch {}
    historySuspend = false;
    scheduleHighlight();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 200);
  }

  function doUndo() {
    if (undoStack.length <= 1) return false;
    redoStack.push(snapState());
    undoStack.pop();
    const prev = undoStack[undoStack.length - 1];
    applyState(prev);
    return true;
  }

  function doRedo() {
    if (redoStack.length === 0) return false;
    undoStack.push(snapState());
    const next = redoStack.pop();
    applyState(next);
    return true;
  }

  /* ---------- Подсветка ---------- */

  function renderHighlight() {
    if (!codeEl || !textarea) return;
    const text = textarea.value;
    const pos = textarea.selectionStart || 0;
    const pair = findBracketPair(text, pos);
    const path = base ? base.path : "";
    try {
      if (isCSharpPath(path)) {
        codeEl.innerHTML = renderTokens(tokenize(text), pair);
      } else {
        codeEl.innerHTML = renderPlain(text, pair);
      }
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

  function afterEdit() {
    scheduleHighlight();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 200);
  }

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
    takeSnapshot(true);
    afterEdit();
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

  /* ---------- Tab / Shift+Tab ---------- */

  function applyIndent() {
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      insertText(INDENT_UNIT);
      return;
    }

    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;

    const chunk = text.slice(lineStart, lineEnd);
    const lines = chunk.split("\n");
    const newLines = lines.map((l) => l.length ? INDENT_UNIT + l : l);
    const newChunk = newLines.join("\n");
    const inserted = newChunk.length - chunk.length;

    textarea.setRangeText(newChunk, lineStart, lineEnd, "end");
    textarea.setSelectionRange(start + INDENT_UNIT.length, end + inserted);
    takeSnapshot(true);
    afterEdit();
  }

  function removeIndent() {
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;

    const chunk = text.slice(lineStart, lineEnd);
    const lines = chunk.split("\n");
    let removedTotal = 0;
    let firstLineRemoved = 0;

    const newLines = lines.map((l, idx) => {
      const m = l.match(/^[ \t]+/);
      if (!m) return l;
      const take = Math.min(m[0].length, INDENT_SIZE);
      if (idx === 0) firstLineRemoved = take;
      removedTotal += take;
      return l.slice(take);
    });
    const newChunk = newLines.join("\n");

    textarea.setRangeText(newChunk, lineStart, lineEnd, "end");
    const newStart = Math.max(lineStart, start - firstLineRemoved);
    const newEnd = Math.max(newStart, end - removedTotal);
    textarea.setSelectionRange(newStart, newEnd);
    takeSnapshot(true);
    afterEdit();
  }

  /* ---------- Обработка клавиш ---------- */

  function handleKeydown(e) {
    if (!textarea || textarea.disabled || !base) return;

    // Ctrl/Cmd — обрабатываем undo/redo, остальное пропускаем
    if (e.ctrlKey || e.metaKey) {
      const k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
        return;
      }
      if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        doRedo();
        return;
      }
      return;
    }
    if (e.altKey) return;

    // Tab / Shift+Tab
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) removeIndent();
      else applyIndent();
      return;
    }

    // Enter — автоотступ / автозакрытие блока
    if (e.key === "Enter" && !e.shiftKey) {
      const { indent, beforeCaret, afterCaret } = currentLineInfo();
      const trimmedEnd = beforeCaret.replace(/[ \t]+$/, "");
      const trimmedAfter = afterCaret.replace(/^[ \t]*/, "");

      if (trimmedEnd.endsWith("{")) {
        e.preventDefault();
        const nextIndent = indent + INDENT_UNIT;
        if (trimmedAfter.startsWith("}")) {
          const insertion = "\n" + nextIndent + "\n" + indent;
          insertText(insertion, 1 + nextIndent.length, 1 + nextIndent.length);
        } else {
          insertText("\n" + nextIndent);
        }
        return;
      }

      if (trimmedAfter.startsWith("}")) {
        e.preventDefault();
        let baseIndent = indent;
        if (baseIndent.length >= INDENT_SIZE) baseIndent = baseIndent.slice(0, -INDENT_SIZE);
        insertText("\n" + baseIndent);
        return;
      }

      if (indent) {
        e.preventDefault();
        insertText("\n" + indent);
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
          takeSnapshot(true);
          afterEdit();
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
          takeSnapshot(true);
          afterEdit();
          return;
        }
      }
    }

    // Автоотступ для одиночной закрывающей в начале строки
    if (e.key === "}") {
      const text = textarea.value;
      const pos = textarea.selectionStart;
      const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
      const before = text.slice(lineStart, pos);
      if (/^[ \t]+$/.test(before)) {
        e.preventDefault();
        let baseIndent = before;
        if (baseIndent.length >= INDENT_SIZE) baseIndent = baseIndent.slice(0, -INDENT_SIZE);
        textarea.setRangeText(baseIndent + "}", lineStart, pos, "end");
        takeSnapshot(true);
        afterEdit();
        return;
      }
    }
  }

  /* ---------- Обработчики ---------- */

  textarea.addEventListener("keydown", handleKeydown);

  textarea.addEventListener("input", () => {
    if (!historySuspend) takeSnapshot(false);
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
      resetHistory();
      clearTimeout(checkTimer);
      check();
      if (focus) setTimeout(() => textarea.focus(), 50);
    },
    close() {
      base = null;
      savedLf = null;
      if (pathLabel) pathLabel.textContent = "";
      setContent("", true);
      undoStack = [];
      redoStack = [];
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
      resetHistory();
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
    getContent() {
      return textarea ? textarea.value : "";
    },
    setContent(text) {
      if (!textarea) return;
      textarea.value = text;
      takeSnapshot(true);
      afterEdit();
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
    captureDirty() {
      if (!base || !textarea) return null;
      const current = textarea.value;
      return { path: base.path, current, unsaved: current !== savedLf };
    },
    focus() {
      if (textarea) textarea.focus();
    },
  };
}
