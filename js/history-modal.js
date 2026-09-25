import { $, el, clear } from "./dom.js";
import { computeLineDiff, renderDiffHtml } from "./diff.js";

export function initHistoryModal({ onRevert } = {}) {
  const modal = $("history-modal");
  const titleEl = $("history-modal-title");
  const bodyEl = $("history-modal-body");
  const closeBtn = $("history-modal-close");
  const revertBtn = $("history-modal-revert");

  let currentCommit = null;

  closeBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    currentCommit = null;
  });

  revertBtn.addEventListener("click", () => {
    if (!currentCommit) return;
    const c = currentCommit;
    modal.classList.add("hidden");
    currentCommit = null;
    if (onRevert) onRevert(c);
  });

  return {
    openCommit(commit, files, { canRevert = false } = {}) {
      currentCommit = commit;
      titleEl.textContent = commit.sha.slice(0, 7);
      revertBtn.classList.toggle("hidden", !canRevert);
      clear(bodyEl);

      bodyEl.appendChild(el("div", { class: "history-meta" }, [
        el("div", { class: "history-msg", text: commit.commit.message || "" }),
        el("div", {
          class: "history-author",
          text:
            `${commit.author?.login || commit.commit.author?.name || "unknown"} · ` +
            (commit.commit.author?.date
              ? new Date(commit.commit.author.date).toLocaleString()
              : ""),
        }),
      ]));

      if (!files || !files.length) {
        bodyEl.appendChild(el("div", { class: "empty", text: "Нет файлов" }));
        modal.classList.remove("hidden");
        return;
      }

      for (const f of files) {
        const item = el("li", { class: "commit-file" });
        const d = computeLineDiff(f.baseText ?? "", f.currentText ?? "");

        const header = el("div", { class: "commit-file-header" }, [
          el("span", { class: "name", text: f.path }),
          el("span", { class: "stats" }, [
            el("span", { class: "add-stat", text: `+${d.added}` }),
            el("span", { class: "rem-stat", text: `-${d.removed}` }),
          ]),
        ]);
        header.addEventListener("click", () => item.classList.toggle("expanded"));

        const diffBox = el("div", { class: "diff-box" });
        diffBox.innerHTML = renderDiffHtml(d.parts);

        item.appendChild(header);
        item.appendChild(diffBox);
        bodyEl.appendChild(item);
      }
      modal.classList.remove("hidden");
    },
  };
}