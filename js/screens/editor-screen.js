import { $ } from "@core/dom.js";
import { UI } from "@core/config.js";
import { gitBlobSha } from "@core/git-sha.js";
import { fromLf } from "@core/encoding.js";
import { tokenize, renderTokens } from "@core/csharp-highlight.js";

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

  function renderHighlight() {
    if (!codeEl || !textarea) return;
    const text = textarea.value;
    try {
      const tokens = tokenize(text);
      codeEl.innerHTML = renderTokens(tokens);
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
    open({ path, baseSha, eol, content }) {
      base = { path, baseSha, baseEol: eol };
      savedLf = content;
      if (pathLabel) pathLabel.textContent = path;
      setContent(content, false);
      clearTimeout(checkTimer);
      check();
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
      revertBtn.classList.toggle("hidden", !visible);
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
    getContent() {
      return textarea ? textarea.value : "";
    },
    setContent(text) {
      if (!textarea) return;
      textarea.value = text;
      scheduleHighlight();
      clearTimeout(checkTimer);
      checkTimer = setTimeout(check, 200);
      const evt = new Event("input", { bubbles: true });
      textarea.dispatchEvent(evt);
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
