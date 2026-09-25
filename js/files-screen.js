import { $, el, clear, option } from "./dom.js";
import { listDirectory } from "./tree.js";
import { formatSize } from "./format.js";

export function initFilesScreen({
  onOpenFolder,
  onOpenFile,
  onBranchChange,
  onCreateFile,
  onCreateFolder,
  onEnterSelection,
  onCancelSelection,
  onToggleSelect,
  onConfirmDelete,
  onOpenHistory,
  onRename,
}) {
  const list = $("entries-list");
  const breadcrumbs = $("breadcrumbs");
  const branchSelect = $("branch-select");
  const panel = $("screen-files");

  const fileActions = $("file-actions");
  const deleteActions = $("delete-actions");
  const btnNewFile = $("btn-new-file");
  const btnNewFolder = $("btn-new-folder");
  const btnDeleteMode = $("btn-delete-mode");
  const btnRename = $("btn-rename");
  const btnHistory = $("btn-history");
  const btnDeleteCancel = $("btn-delete-cancel");
  const btnDeleteConfirm = $("btn-delete-confirm");
  const deleteCount = $("delete-count");

  branchSelect.addEventListener("change", () => onBranchChange(branchSelect.value));
  btnNewFile.addEventListener("click", () => onCreateFile());
  btnNewFolder.addEventListener("click", () => onCreateFolder());
  btnDeleteMode.addEventListener("click", () => onEnterSelection());
  btnDeleteCancel.addEventListener("click", () => onCancelSelection());
  btnDeleteConfirm.addEventListener("click", () => onConfirmDelete());
  if (btnHistory) btnHistory.addEventListener("click", () => onOpenHistory());
  if (btnRename) btnRename.addEventListener("click", () => onRename());

  function renderBreadcrumbs(currentPath) {
    clear(breadcrumbs);
    breadcrumbs.appendChild(el("span", { class: "crumb", text: "корень" }));
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    for (const p of parts) {
      breadcrumbs.appendChild(el("span", { class: "sep", text: "/" }));
      breadcrumbs.appendChild(el("span", { class: "crumb", text: p }));
    }
  }

  // Один проход: вес каждой папки-префикса (без удалённых).
  function computeFolderSizes(files, deletedSet) {
    const sizes = new Map();
    for (const f of files) {
      if (deletedSet && deletedSet.has(f.path)) continue;
      const parts = f.path.split("/");
      if (parts.length < 2) continue;
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? acc + "/" + parts[i] : parts[i];
        sizes.set(acc, (sizes.get(acc) || 0) + (f.size || 0));
      }
    }
    return sizes;
  }

  // Все папки, внутри которых что-то изменено или удалено.
  function collectChangedFolders(changedPaths, deletedSet) {
    const folders = new Set();
    const all = new Set(changedPaths);
    if (deletedSet) for (const p of deletedSet) all.add(p);
    for (const p of all) {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join("/"));
      }
    }
    return folders;
  }

  return {
    render({
      files,
      currentPath,
      dirtyPaths,
      deletedSet,
      branch,
      branches,
      mode,
      selectionMode,
      selection,
      remoteChanges,
    }) {
      const base = (currentPath || "").replace(/\/+$/, "");
      const remoteMap = remoteChanges || new Map();

      renderBreadcrumbs(base);
      panel.classList.toggle("mode-local", mode === "local");

      // Переключение между двумя панелями кнопок.
      fileActions.classList.toggle("hidden", selectionMode);
      deleteActions.classList.toggle("hidden", !selectionMode);
      branchSelect.classList.toggle("hidden", selectionMode);
      list.classList.toggle("selection-mode", selectionMode);

      // Счётчик и активность кнопок удаления/переименования.
      const count = selection?.size || 0;
      if (selectionMode) {
        deleteCount.textContent = `Выбрано: ${count}`;
        btnDeleteConfirm.disabled = count === 0;
        if (btnRename) btnRename.disabled = count !== 1;
      }

      clear(branchSelect);
      for (const b of branches) {
        branchSelect.appendChild(option(b.name, b.name, b.name === branch));
      }

      const { folders, files: filesHere } = listDirectory(files, base, deletedSet);
      const folderSizes = computeFolderSizes(files, deletedSet);
      const changedFolders = collectChangedFolders(dirtyPaths, deletedSet);
      clear(list);

      for (const name of folders) {
        const fullPath = base ? base + "/" + name : name;
        const size = folderSizes.get(fullPath) || 0;

        const children = [];
        if (selectionMode) {
          const cb = el("input", {
            type: "checkbox",
            class: "checkbox",
            onclick: (e) => {
              e.stopPropagation();
              onToggleSelect(fullPath + "/");
            },
          });
          if (selection?.has(fullPath + "/")) cb.checked = true;
          children.push(cb);
        }
        children.push(el("span", { class: "icon", text: "📁" }));
        children.push(el("span", { class: "name", text: name }));

        let folderRemote = null;
        for (const [p, kind] of remoteMap) {
          if (p === fullPath || p.startsWith(fullPath + "/")) {
            folderRemote = kind;
            break;
          }
        }
        if (folderRemote) {
          children.push(el("span", {
            class: "remote-badge",
            title: "Изменено на GitHub",
            text: "⬆",
          }));
        }
        children.push(el("span", { class: "size", text: formatSize(size) }));

        const li = el("li", {
          class: "entry folder",
          onclick: () => {
            if (selectionMode) onToggleSelect(fullPath + "/");
            else onOpenFolder(name);
          },
        }, children);

        if (changedFolders.has(fullPath)) li.classList.add("dirty");
        if (selectionMode && selection?.has(fullPath + "/")) {
          li.classList.add("selected");
        }
        list.appendChild(li);
      }

      for (const f of filesHere) {
        const name = base ? f.path.slice(base.length + 1) : f.path;

        const children = [];
        if (selectionMode) {
          const cb = el("input", {
            type: "checkbox",
            class: "checkbox",
            onclick: (e) => {
              e.stopPropagation();
              onToggleSelect(f.path);
            },
          });
          if (selection?.has(f.path)) cb.checked = true;
          children.push(cb);
        }
        children.push(el("span", { class: "icon", text: "📄" }));
        children.push(el("span", { class: "name", text: name }));

        const remoteKind = remoteMap.get(f.path);
        if (remoteKind) {
          const symbol = remoteKind === "removed" ? "🗑"
            : remoteKind === "added" ? "🆕"
            : "⬆";
          const title = remoteKind === "removed" ? "Удалён на GitHub"
            : remoteKind === "added" ? "Добавлен на GitHub"
            : "Изменён на GitHub";
          children.push(el("span", {
            class: "remote-badge",
            title,
            text: symbol,
          }));
        }

        children.push(el("span", {
          class: "size",
          text: formatSize(typeof f.size === "number" ? f.size : 0),
        }));

        const li = el("li", {
          class: "entry file",
          onclick: () => {
            if (selectionMode) onToggleSelect(f.path);
            else onOpenFile(f);
          },
        }, children);

        if (dirtyPaths.has(f.path)) li.classList.add("dirty");
        if (selectionMode && selection?.has(f.path)) li.classList.add("selected");
        list.appendChild(li);
      }

      if (!folders.length && !filesHere.length) {
        list.appendChild(el("li", { class: "empty", text: "Пусто" }));
      }
    },
  };
}