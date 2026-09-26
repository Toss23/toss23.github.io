import { $, el, clear } from "@core/dom.js";
import { formatSize } from "@core/format.js";
import { kindOf } from "@api/project-map.js";

const TYPE_GROUPS = [
  { key: "cs", exts: ".cs", matches: ["cs"] },
  { key: "js", exts: ".js .mjs .cjs .ts .jsx .tsx", matches: ["js"] },
  { key: "other", exts: ".css .html .md .json .txt и др.", matches: ["css", "html", "md", "json", "other"] },
];

function groupKeyForFile(path) {
  const k = kindOf(path);
  for (const g of TYPE_GROUPS) {
    if (g.matches.includes(k)) return g.key;
  }
  return "other";
}

export function initMapSelectModal() {
  const modal = $("map-select-modal");
  const list = $("map-select-list");
  const typeList = $("map-type-list");
  const includeUnanalyzedBox = $("map-include-unanalyzed");
  const closeBtn = $("map-select-close");
  const allBtn = $("map-select-all");
  const noneBtn = $("map-select-none");
  const cancelBtn = $("map-select-cancel");
  const okBtn = $("map-select-ok");

  if (!modal || !list) return { ask: async () => null };

  let resolver = null;
  let items = [];
  let selected = new Set();
  let selectedTypes = new Set();
  let allFiles = [];

  function close(result) {
    modal.classList.add("hidden");
    const r = resolver;
    resolver = null;
    if (r) r(result);
  }

  function updateOkState() {
    if (!okBtn) return;
    okBtn.disabled = selected.size === 0 || selectedTypes.size === 0;
  }

  function renderTypes() {
    if (!typeList) return;
    clear(typeList);
    for (const g of TYPE_GROUPS) {
      const cb = el("input", { type: "checkbox", class: "checkbox" });
      cb.checked = selectedTypes.has(g.key);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedTypes.add(g.key);
        else selectedTypes.delete(g.key);
        const wrap = cb.closest(".map-type-item");
        if (wrap) wrap.classList.toggle("checked", cb.checked);
        updateOkState();
      });

      const wrap = el("li", { class: "map-type-item" }, [
        cb,
        el("span", { class: "ext", text: g.exts }),
      ]);
      if (cb.checked) wrap.classList.add("checked");
      wrap.addEventListener("click", (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });
      typeList.appendChild(wrap);
    }
  }

  function renderPaths() {
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
    selectedTypes = new Set(TYPE_GROUPS.map((g) => g.key));
    renderTypes();
    renderPaths();
  });
  if (noneBtn) noneBtn.addEventListener("click", () => {
    selected.clear();
    selectedTypes.clear();
    renderTypes();
    renderPaths();
  });
  if (okBtn) okBtn.addEventListener("click", () => {
    if (!selected.size || !selectedTypes.size) return;
    const includeUnanalyzed = includeUnanalyzedBox ? includeUnanalyzedBox.checked : true;
    close({ paths: new Set(selected), types: new Set(selectedTypes), includeUnanalyzed });
  });

  return {
    ask(topItems, files) {
      return new Promise((resolve) => {
        items = topItems;
        allFiles = files || [];
        selected = new Set(topItems.map((i) => i.name));
        selectedTypes = new Set(TYPE_GROUPS.map((g) => g.key));
        if (includeUnanalyzedBox) includeUnanalyzedBox.checked = false;
        resolver = resolve;
        renderTypes();
        renderPaths();
        modal.classList.remove("hidden");
      });
    },
  };
}
