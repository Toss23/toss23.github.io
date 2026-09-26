import { $, el, clear } from "@core/dom.js";
import { formatSize } from "@core/format.js";

export function initMapSelectModal() {
  const modal = $("map-select-modal");
  const list = $("map-select-list");
  const closeBtn = $("map-select-close");
  const allBtn = $("map-select-all");
  const noneBtn = $("map-select-none");
  const cancelBtn = $("map-select-cancel");
  const okBtn = $("map-select-ok");

  if (!modal || !list) return { ask: async () => null };

  let resolver = null;
  let items = [];
  let selected = new Set();

  function close(result) {
    modal.classList.add("hidden");
    const r = resolver;
    resolver = null;
    if (r) r(result);
  }

  function updateOkState() {
    if (okBtn) okBtn.disabled = selected.size === 0;
  }

  function render() {
    clear(list);
    for (const item of items) {
      const cb = el("input", { type: "checkbox", class: "checkbox" });
      cb.checked = selected.has(item.name);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(item.name);
        else selected.delete(item.name);
        updateOkState();
      });

      const icon = el("span", { class: "icon", text: item.isFolder ? "\uD83D\uDCC1" : "\uD83D\uDCC4" });
      const name = el("span", { class: "name", text: item.name });
      const meta = el("span", {
        class: "meta",
        text: item.isFolder
          ? item.count + " \u00B7 " + formatSize(item.bytes)
          : formatSize(item.bytes),
      });

      const li = el("li", {}, [cb, icon, name, meta]);
      li.addEventListener("click", (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });

      list.appendChild(li);
    }
    updateOkState();
  }

  if (closeBtn) closeBtn.addEventListener("click", () => close(null));
  if (cancelBtn) cancelBtn.addEventListener("click", () => close(null));
  if (allBtn) allBtn.addEventListener("click", () => {
    selected = new Set(items.map((i) => i.name));
    render();
  });
  if (noneBtn) noneBtn.addEventListener("click", () => {
    selected.clear();
    render();
  });
  if (okBtn) okBtn.addEventListener("click", () => {
    if (!selected.size) return;
    close(new Set(selected));
  });

  return {
    ask(topItems) {
      return new Promise((resolve) => {
        items = topItems;
        selected = new Set(topItems.map((i) => i.name));
        resolver = resolve;
        render();
        modal.classList.remove("hidden");
      });
    },
  };
}
