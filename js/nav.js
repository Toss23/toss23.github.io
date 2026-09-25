import { $ } from "./dom.js";

export function initNav({ onExitRepo, onBack, onCommit }) {
  const bar = $("nav-bar");
  const exitBtn = $("nav-exit");
  const backBtn = $("nav-back");
  const commitBtn = $("nav-commit");

  exitBtn.addEventListener("click", () => onExitRepo());
  backBtn.addEventListener("click", () => onBack());
  commitBtn.addEventListener("click", () => onCommit());

  return {
    setVisible(visible) {
      bar.classList.toggle("hidden", !visible);
    },
    setCommitCount(count) {
      commitBtn.textContent = count > 0 ? `🟩 Коммит (${count})` : "🟩 Коммит";
      commitBtn.classList.toggle("has-changes", count > 0);
    },
  };
}