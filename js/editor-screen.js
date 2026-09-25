import { $ } from "./dom.js";
import { UI } from "./config.js";
import { gitBlobSha } from "./git-sha.js";
import { fromLf } from "./encoding.js";

export function initEditorScreen({ onStateChange, onSave, onRevert }) {
  const textarea = $("file-content");
  const pathLabel = $("file-path");
  const marker = $("dirty-marker");
  const saveBtn = $("save-file");
  const revertBtn = $("revert-file");

  let base = null;
  let savedLf = null;
  let timer;

  textarea.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(check, UI.DIRTY_DEBOUNCE_MS);
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

  return {
    open({ path, baseSha, eol, content }) {
      base = { path, baseSha, baseEol: eol };
      savedLf = content;
      pathLabel.textContent = path;
      textarea.value = content;
      textarea.disabled = false;
      clearTimeout(timer);
      check();
    },
    close() {
      base = null;
      savedLf = null;
      pathLabel.textContent = "";
      textarea.value = "";
      textarea.disabled = true;
      marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
      clearTimeout(timer);
    },
    markSaved(path) {
      if (!base) return;
      if (path && base.path !== path) return;
      savedLf = textarea.value;
      check();
    },
    revert({ content, baseSha }) {
      if (!base) return;
      savedLf = content;
      base.baseSha = baseSha;
      textarea.value = content;
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
      pathLabel.textContent = path;
      textarea.value = `📦 Бинарный файл — ${sizeText}\n\nПросмотр и редактирование недоступны.`;
      textarea.disabled = true;
      marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
    },
  };
}