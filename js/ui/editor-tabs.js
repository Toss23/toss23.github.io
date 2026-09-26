import { $, clear } from "@core/dom.js";

export function initEditorTabs({ onSwitch, onClose }) {
  const container = $("editor-tabs");
  if (!container) return { render() {} };

  function render(tabs, activePath, dirtyPaths) {
    clear(container);
    if (!tabs.length) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");

    for (const tab of tabs) {
      const el = document.createElement("div");
      el.className = "editor-tab";
      if (tab.path === activePath) el.classList.add("active");
      if (dirtyPaths && dirtyPaths.has(tab.path)) el.classList.add("dirty");

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = tab.path.split("/").pop();
      name.title = tab.path;
      el.appendChild(name);

      const close = document.createElement("button");
      close.className = "tab-close";
      close.type = "button";
      close.textContent = "✕";
      close.title = "Закрыть";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        onClose(tab.path);
      });
      el.appendChild(close);

      el.addEventListener("click", () => {
        if (tab.path !== activePath) onSwitch(tab.path);
      });

      container.appendChild(el);
    }
  }

  return { render };
}
