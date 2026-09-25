import { $, el, clear } from "./dom.js";
import { UI } from "./config.js";
import { computeLineDiff, renderDiffHtml } from "./diff.js";

export function initCommitScreen({ onSubmit, onCancel, onRevertAll }) {
  const modal = $("commit-modal");
  const list = $("commit-files");
  const message = $("commit-message");
  const submitBtn = $("commit-submit");
  const cancelBtn = $("commit-cancel");
  const revertAllBtn = $("commit-revert-all");

  const missing = [
    ["commit-modal", modal],
    ["commit-files", list],
    ["commit-message", message],
    ["commit-submit", submitBtn],
    ["commit-cancel", cancelBtn],
    ["commit-revert-all", revertAllBtn],
  ].filter(([, n]) => !n).map(([id]) => id);

  if (missing.length) {
    console.error("commit-screen: нет элементов:", missing);
    return { open() {}, close() {}, setBusy() {} };
  }

  cancelBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    onCancel?.();
  });

  submitBtn.addEventListener("click", () => {
    const msg = message.value.trim() || UI.DEFAULT_COMMIT_MESSAGE;
    onSubmit(msg);
  });

  revertAllBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    onRevertAll?.();
  });

  return {
    open(items, { mode } = {}) {
      clear(list);
      for (const item of items) {
        const { path, baseText, currentText, type } = item;
        let parts = [], added = 0, removed = 0;

        if (type === "delete") {
          const lines = (baseText || "").split("\n");
          if (lines[lines.length - 1] === "") lines.pop();
          parts = [{ removed: true, value: (baseText || "") + "\n" }];
          removed = lines.length;
        } else if (typeof baseText === "string") {
          const d = computeLineDiff(baseText, currentText);
          parts = d.parts; added = d.added; removed = d.removed;
        } else {
          // Новый файл
          const lines = (currentText || "").split("\n");
          if (lines[lines.length - 1] === "") lines.pop();
          parts = [{ added: true, value: (currentText || "") + "\n" }];
          added = lines.length;
        }

        const li = el("li", { class: "commit-file" });
        const header = el("div", { class: "commit-file-header" }, [
          el("span", { class: "name", text: path }),
          el("span", { class: "stats" }, [
            el("span", { class: "add-stat", text: `+${added}` }),
            el("span", { class: "rem-stat", text: `-${removed}` }),
          ]),
        ]);
        header.addEventListener("click", () => li.classList.toggle("expanded"));

        const diffBox = el("div", { class: "diff-box" });
        diffBox.innerHTML = renderDiffHtml(parts);

        li.appendChild(header);
        li.appendChild(diffBox);
        list.appendChild(li);
      }

      message.value = "";
      revertAllBtn.classList.toggle("hidden", mode !== "local");
      modal.classList.remove("hidden");
      setTimeout(() => message.focus(), 50);
    },
    close() { modal.classList.add("hidden"); },
    setBusy(busy) {
      submitBtn.disabled = busy;
      cancelBtn.disabled = busy;
      revertAllBtn.disabled = busy;
    },
  };
}