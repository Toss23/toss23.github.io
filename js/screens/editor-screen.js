import { EditorView, basicSetup } from "https://esm.sh/codemirror@6";
import { EditorState } from "https://esm.sh/@codemirror/state@6";
import { syntaxHighlighting } from "https://esm.sh/@codemirror/language@6";
import { csharp } from "https://esm.sh/@codemirror/lang-csharp@6";
import { csharpHighlightStyle, csharpEditorTheme } from "@core/csharp-theme.js";
import { $ } from "@core/dom.js";
import { UI } from "@core/config.js";
import { gitBlobSha } from "@core/git-sha.js";
import { fromLf } from "@core/encoding.js";

export function initEditorScreen({ onStateChange, onSave, onRevert }) {
  const container = $("file-content");
  const pathLabel = $("file-path");
  const marker = $("dirty-marker");
  const saveBtn = $("save-file");
  const revertBtn = $("revert-file");

  let view = null;
  let base = null;
  let savedLf = null;
  let timer;

  function createView(doc = "", readOnly = false) {
    if (view) {
      view.destroy();
      view = null;
    }
    const extensions = [
      basicSetup,
      csharp(),
      syntaxHighlighting(csharpHighlightStyle),
      csharpEditorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          clearTimeout(timer);
          timer = setTimeout(check, UI.DIRTY_DEBOUNCE_MS);
        }
      }),
    ];
    if (readOnly) extensions.push(EditorView.editable.of(false));
    const state = EditorState.create({ doc, extensions });
    view = new EditorView({ state, parent: container });
  }

  async function check() {
    if (!base || !view) return;
    const current = view.state.doc.toString();
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

  saveBtn.addEventListener("click", () => {
    if (!base || !view) return;
    onSave?.(base.path, view.state.doc.toString());
  });

  revertBtn.addEventListener("click", () => {
    if (!base) return;
    onRevert?.(base.path);
  });

  createView("");

  return {
    open({ path, baseSha, eol, content }) {
      base = { path, baseSha, baseEol: eol };
      savedLf = content;
      pathLabel.textContent = path;
      createView(content);
      clearTimeout(timer);
      check();
    },
    close() {
      base = null;
      savedLf = null;
      pathLabel.textContent = "";
      createView("");
      marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
      clearTimeout(timer);
    },
    markSaved(path) {
      if (!base || !view) return;
      if (path && base.path !== path) return;
      savedLf = view.state.doc.toString();
      check();
    },
    revert({ content, baseSha }) {
      if (!base || !view) return;
      savedLf = content;
      base.baseSha = baseSha;
      createView(content);
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
      createView("📦 Бинарный файл — " + sizeText + "\n\nПросмотр и редактирование недоступны.", true);
      marker.classList.add("hidden");
      saveBtn.disabled = true;
      saveBtn.classList.remove("active");
      revertBtn.disabled = true;
    },
  };
}
