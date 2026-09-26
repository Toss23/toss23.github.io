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
const AUTOSAVE_DELAY = 3000;

export function initEditorScreen({ onStateChange, onSave, onRevert, onAutosave, onContextMenu }) {
  const textarea = $("file-content");
  const highlight = $("file-highlight");
  const codeEl = highlight ? highlight.querySelector("code") : null;
  const lineInner = $("file-line-numbers-inner");
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
  let autosaveTimer;

  /* ---------- История ---------- */

  let undoStack = [];
  let redoStack = [];
  let lastSnapshotTime = 0;
  let historySuspend = false;
  const historyListeners = new Set();

  function notifyHistory() {
    for (const fn of historyListeners) {
      try { fn(); } catch (e) { console.warn("history listener:", e); }
    }
  }

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
    notifyHistory();
  }

  function resetHistory() {
    undoStack = [];
    redoStack = [];
    lastSnapshotTime = 0;
    if (textarea) undoStack.push(snapState());
    notifyHistory();
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
    notifyHistory();
    return true;
  }

  function doRedo() {
    if (redoStack.length === 0) return false;
    undoStack.push(snapState());
    const next = redoStack.pop();
    applyState(next);
    notifyHistory();
    return true;
  }

  /* ---------- Подсветка и номера строк ---------- */

  function renderLineNumbers() {
    if (!lineInner || !textarea) return;
    const total = textarea.value.split("\n").length;
    const arr = new Array(total);
    for (let i = 0; i < total; i++) arr[i] = String(i + 1);
    lineInner.textContent = arr.join("\n");
  }

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
    if (lineInner) {
      lineInner.style.transform = "translateY(" + (-textarea.scrollTop) + "px)";
    }
    renderLineNumbers();
  }

  function scheduleHighlight() {
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(renderHighlight, 120);
  }

  function scheduleCaretHighlight() {
    clearTimeout(caretTimer);
    caretTimer = setTimeout(renderHighlight, 40);
  }

  /* ---------- Правки и автосохранение ---------- */

  function scheduleAutosave() {
    if (!base || !onAutosave) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (!base || !textarea) return;
      onAutosave(base.path, textarea.value);
    }, AUTOSAVE_DELAY);
  }

  function afterEdit() {
    scheduleHighlight();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 200);
    scheduleAutosave();
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
    if (start === end) { insertText(INDENT_UNIT); return; }
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;
    const chunk = text.slice(lineStart, lineEnd);
    const lines = chunk.split("\n");
    const newChunk = lines.map((l) => l.length ? INDENT_UNIT + l : l).join("\n");
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

  /* ---------- Автозакрытие через beforeinput ---------- */

  function handleBeforeInput(e) {
    if (!textarea || textarea.disabled || !base) return;

    // Backspace внутри пустой пары — удаляем обе скобки.
    if (e.inputType === "deleteContentBackward") {
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
        }
      }
      return;
    }

    if (e.inputType !== "insertText") return;
    const ch = e.data;
    if (!ch || ch.length !== 1) return;

    const text = textarea.value;
    const pos = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Открывающие скобки и кавычки — автозакрытие.
    if (OPEN_TO_CLOSE[ch]) {
      const isQuote = ch === "\"" || ch === "'";

      if (isQuote) {
        const prevCh = pos > 0 ? text[pos - 1] : "";
        const nextCh = pos < text.length ? text[pos] : "";
        if (prevCh === "\\") return;
        if (pos === end && nextCh === ch) {
          e.preventDefault();
          textarea.setSelectionRange(pos + 1, pos + 1);
          scheduleCaretHighlight();
          return;
        }
        if (/[A-Za-z0-9_]/.test(prevCh)) return;
      } else {
        const nextCh = pos < text.length ? text[pos] : "";
        if (pos === end && CLOSE_CHARS.has(nextCh)) {
          e.preventDefault();
          textarea.setRangeText(ch + nextCh, pos, pos + 1, "end");
          textarea.setSelectionRange(pos + 1, pos + 1);
          takeSnapshot(true);
          afterEdit();
          return;
        }
      }

      e.preventDefault();
      const close = OPEN_TO_CLOSE[ch];
      const selected = textarea.value.slice(pos, end);
      insertText(ch + selected + close, 1, 1 + selected.length);
      return;
    }

    // Закрывающая скобка — если такая же справа, пропускаем ввод.
    if (CLOSE_CHARS.has(ch)) {
      if (pos === end && text[pos] === ch) {
        e.preventDefault();
        textarea.setSelectionRange(pos + 1, pos + 1);
        scheduleCaretHighlight();
      }
    }
  }

  /* ---------- keydown: Tab, Enter, undo/redo, "}" ---------- */

  function handleKeydown(e) {
    if (!textarea || textarea.disabled || !base) return;

    if (e.ctrlKey || e.metaKey) {
      const k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
      if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); return; }
      return;
    }
    if (e.altKey) return;

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) removeIndent();
      else applyIndent();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      const { indent, beforeCaret, afterCaret } = currentLineInfo();
      const trimmedEnd = beforeCaret.replace(/[ \t]+$/, "");
      const trimmedAfter = afterCaret.replace(/^[ \t]*/, "");

      if (trimmedEnd.endsWith("{")) {
        e.preventDefault();
        const nextIndent = indent + INDENT_UNIT;
        if (trimmedAfter.startsWith("}")) {
          insertText("\n" + nextIndent + "\n" + indent, 1 + nextIndent.length, 1 + nextIndent.length);
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
      if (indent) { e.preventDefault(); insertText("\n" + indent); return; }
      return;
    }

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
  textarea.addEventListener("beforeinput", handleBeforeInput);

  textarea.addEventListener("input", () => {
    if (!historySuspend) takeSnapshot(false);
    scheduleHighlight();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, UI.DIRTY_DEBOUNCE_MS);
    scheduleAutosave();
  });

  textarea.addEventListener("scroll", () => {
    if (highlight) {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
    if (lineInner) {
      lineInner.style.transform = "translateY(" + (-textarea.scrollTop) + "px)";
    }
  });

  textarea.addEventListener("keyup", scheduleCaretHighlight);
  textarea.addEventListener("click", scheduleCaretHighlight);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === textarea) scheduleCaretHighlight();
  });

  textarea.addEventListener("contextmenu", (e) => {
    if (typeof onContextMenu === "function") {
      e.preventDefault();
      onContextMenu();
    }
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

    if (marker) marker.classList.toggle("hidden", !modified);
    saveBtn.disabled = !unsaved;
    saveBtn.classList.toggle("active", unsaved);
    revertBtn.disabled = !(modified || unsaved);

    onStateChange?.(base.path, { modified, unsaved, current });
  }

  function setContent(text, disabled) {
    if (!textarea) return;
    textarea.value = text;
    textarea.disabled = !!disabled;
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
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
      clearTimeout(autosaveTimer);
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
      clearTimeout(autosaveTimer);
      if (pathLabel) pathLabel.textContent = path;
      setContent("\uD83D\uDCE6 Бинарный файл — " + sizeText + "\n\nПросмотр и редактирование недоступны.", true);
      if (marker) marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
    },
    getPath() { return base ? base.path : null; },
    getContent() { return textarea ? textarea.value : ""; },
    getSelection() {
      if (!textarea) return "";
      return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    },
    setContent(text) {
      if (!textarea) return;
      textarea.value = text;
      takeSnapshot(true);
      afterEdit();
    },
    insertAtCursor(text) {
      if (!textarea || !base) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.setRangeText(text, start, end, "end");
      takeSnapshot(true);
      afterEdit();
    },
    moveCursor(dir) {
      if (!textarea) return;
      const text = textarea.value;
      let pos = textarea.selectionStart;
      if (dir === "left") pos = Math.max(0, pos - 1);
      else if (dir === "right") pos = Math.min(text.length, pos + 1);
      else if (dir === "up") {
        const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
        const col = pos - lineStart;
        if (lineStart > 0) {
          const prevLineEnd = lineStart - 1;
          const prevLineStart = text.lastIndexOf("\n", prevLineEnd - 1) + 1;
          const prevLineLen = prevLineEnd - prevLineStart;
          pos = prevLineStart + Math.min(col, prevLineLen);
        }
      } else if (dir === "down") {
        const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
        const col = pos - lineStart;
        const lineEnd = text.indexOf("\n", pos);
        if (lineEnd !== -1) {
          const nextLineStart = lineEnd + 1;
          const nextLineEnd = text.indexOf("\n", nextLineStart);
          const nextLineLen = (nextLineEnd === -1 ? text.length : nextLineEnd) - nextLineStart;
          pos = nextLineStart + Math.min(col, nextLineLen);
        }
      }
      textarea.setSelectionRange(pos, pos);
      scheduleCaretHighlight();
      textarea.focus();
    },
    indent() { if (base) applyIndent(); },
    unindent() { if (base) removeIndent(); },
    undo() { return doUndo(); },
    redo() { return doRedo(); },
    canUndo() { return undoStack.length > 1; },
    canRedo() { return redoStack.length > 0; },
    onHistoryChange(cb) {
      if (typeof cb !== "function") return () => {};
      historyListeners.add(cb);
      cb();
      return () => historyListeners.delete(cb);
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
      if (lineInner) lineInner.style.transform = "translateY(" + (-textarea.scrollTop) + "px)";
    },
    captureDirty() {
      if (!base || !textarea) return null;
      const current = textarea.value;
      return { path: base.path, current, unsaved: current !== savedLf };
    },
    focus() { if (textarea) textarea.focus(); },
  };
}
