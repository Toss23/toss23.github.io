import { $ } from "./dom.js";
import { formatSize } from "./format.js";

export function initProgressBar() {
  const box = $("progress-box");
  const fill = $("progress-fill");
  const label = $("progress-label");
  if (!box || !fill || !label) {
    return { show() {}, showIndeterminate() {}, update() {}, hide() {} };
  }

  return {
    show(text = "0%") {
      box.classList.remove("hidden", "indeterminate");
      fill.style.width = "0%";
      label.textContent = text;
    },
    showIndeterminate(text = "Загрузка...") {
      box.classList.remove("hidden");
      box.classList.add("indeterminate");
      label.textContent = text;
    },
    update(done, total, bytes, totalBytes) {
      box.classList.remove("indeterminate");
      const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
      fill.style.width = pct + "%";

      const parts = [`${pct}%`];
      if (total) parts.push(`${done}/${total}`);
      if (bytes !== undefined && totalBytes) {
        parts.push(`${formatSize(bytes)} / ${formatSize(totalBytes)}`);
      }
      label.textContent = parts.join(" · ");
    },
    hide() {
      box.classList.add("hidden");
      box.classList.remove("indeterminate");
      fill.style.width = "0%";
    },
  };
}