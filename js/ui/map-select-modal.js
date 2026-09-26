import { $, el, clear } from "@core/dom.js";
import { formatSize } from "@core/format.js";
import { kindOf, hasServiceFolder } from "@api/project-map.js";

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

function computeTopLevel(files) {
  const items = new Map();
  for (const f of files) {
    const slash = f.path.indexOf("/");
    if (slash < 0) {
      items.set(f.path, { name: f.path, isFolder: false, count: 1, bytes: f.size || 0 });
    } else {
      const top = f.path.slice(0, slash);
      if (!items.has(top)) items.set(top, { name: top, isFolder: true, count: 0, bytes: 0 });
      const it = items.get(top);
      it.count++;
      it.bytes += f.size || 0;
    }
  }
  return [...items.values()].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Если в корне найден только один «осмысленный» тип — выбираем только его,
// иначе выбираем все.
function pickDefaultTypes(files) {
  const rootFiles = files.filter((f) => !f.path.includes("/"));
  const groups = new Set();
  for (const f of rootFiles) {
    const g = groupKeyForFile(f.path);
    if (g !== "other") groups.add(g);
  }
  if (groups.size === 1) return new Set(groups);
  return new Set(TYPE_GROUPS.map((g) => g.key));
}

export function initMapSelectModal() {
  const modal = $("map-select-modal");
  const list = $("map-select-list");
  const typeList = $("map-type-list");
  const closeBtn = $("map-select-close");
  const allBtn = $("map-select-all");
  const noneBtn = $("map-select-none");
  const cancelBtn = $("map-select-cancel");
  const okBtn = $("map-select-ok");
  const includeUnanalyzedBox = $("map-include-unanalyzed");
  const includeServiceBox = $("map-include-service");

  if (!modal || !list) return { ask: async () => null };

  let resolver = null;
  let allFiles = [];
  let visibleFiles = [];
  let items = [];
  let selected = new Set();
  let selectedTypes = new Set();

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

  function visibleFromOptions() {
    const includeService = includeServiceBox ? includeServiceBox.checked : false;
    return includeService ? allFiles : allFiles.filter((f) => !hasServiceFolder(f.path));
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

  function recomputeFromOptions() {
    visibleFiles = visibleFromOptions();
    items = computeTopLevel(visibleFiles);
    selected = new Set(items.map((i) => i.name));
    selectedTypes = pickDefaultTypes(visibleFiles);
    renderTypes();
    renderPaths();
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
    const includeService = includeServiceBox ? includeServiceBox.checked : false;
    close({ paths: new Set(selected), types: new Set(selectedTypes), includeUnanalyzed, includeService });
  });

  if (includeServiceBox) {
    includeServiceBox.addEventListener("change", recomputeFromOptions);
  }

  return {
    ask(files) {
      return new Promise((resolve) => {
        allFiles = files || [];
        if (includeUnanalyzedBox) includeUnanalyzedBox.checked = false;
        if (includeServiceBox) includeServiceBox.checked = false;
        resolver = resolve;
        recomputeFromOptions();
        modal.classList.remove("hidden");
      });
    },
  };
}
