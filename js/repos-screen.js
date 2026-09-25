import { $, el, clear } from "./dom.js";
import { formatSize } from "./format.js";

export function initReposScreen({ onSelect }) {
  const list = $("repo-list");
  const filter = $("repo-filter");
  let all = [];
  let clonedMap = new Map(); // fullName -> bytes

  filter.addEventListener("input", render);

  function render() {
    const q = filter.value.toLowerCase();
    clear(list);

    const filtered = all.filter(
      (r) => !q || r.full_name.toLowerCase().includes(q)
    );

    // Клонированные — наверх. JS-сортировка стабильна (ES2019+).
    filtered.sort((a, b) => {
      const ac = clonedMap.has(a.full_name) ? 0 : 1;
      const bc = clonedMap.has(b.full_name) ? 0 : 1;
      return ac - bc;
    });

    for (const r of filtered) {
      const bytes = clonedMap.get(r.full_name);
      const isCloned = bytes !== undefined;

      const children = [];
      if (isCloned) {
        children.push(el("span", { class: "icon", text: "📦" }));
      }
      children.push(el("span", { class: "name", text: r.full_name }));
      if (isCloned) {
        children.push(el("span", { class: "size", text: formatSize(bytes) }));
      }

      const li = el("li", { class: "entry", onclick: () => onSelect(r) }, children);
      if (isCloned) li.classList.add("cloned");
      list.appendChild(li);
    }

    if (!list.children.length) {
      list.appendChild(el("li", { class: "empty", text: "Нет репозиториев" }));
    }
  }

  return {
    setRepos(repos, cloned) {
      all = repos;
      clonedMap = cloned || new Map();
      render();
    },
    reset() {
      all = [];
      clonedMap = new Map();
      filter.value = "";
      clear(list);
    },
  };
}