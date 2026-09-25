import { $, el, clear, option } from "@core/dom.js";
import { listDirectory } from "@core/tree.js";
import { formatSize } from "@core/format.js";

// Тач-устройство: не разрешаем HTML5 drag — на Android он конфликтует с long-press.
const isTouchDevice = (() => {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return "ontouchstart" in window;
  }
})();

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
  onDownload,
  onMove,
  onMoveFile,
  onLongPressSelect,
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
  const btnMove = $("btn-move");
  const btnHistory = $("btn-history");
  const btnDeleteCancel = $("btn-delete-cancel");
  const btnDeleteConfirm = $("btn-delete-confirm");
  const btnDownload = $("btn-download");
  const deleteCount = $("delete-count");

  let suppressClickUntil = 0;

  branchSelect.addEventListener("change", () => onBranchChange(branchSelect.value));
  btnNewFile.addEventListener("click", () => onCreateFile());
  btnNewFolder.addEventListener("click", () => onCreateFolder());
  btnDeleteMode.addEventListener("click", () => onEnterSelection());
  btnDeleteCancel.addEventListener("click", () => onCancelSelection());
  btnDeleteConfirm.addEventListener("click", () => onConfirmDelete());
  if (btnHistory) btnHistory.addEventListener("click", () => onOpenHistory());
  if (btnRename) btnRename.addEventListener("click", () => onRename());
  if (btnDownload) btnDownload.addEventListener("click", () => onDownload());
  if (btnMove) btnMove.addEventListener("click", () => {
    console.log("[files-screen] btn-move clicked");
    onMove();
  });

  // ----- Long-press на телефоне -----
  let touchTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTargetPath = null;
  let longPressFired = false;

  if (isTouchDevice) {
    list.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const li = e.target.closest("li[data-path]");
      if (!li) return;
      if (li.classList.contains("updir")) return;

      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchTargetPath = li.dataset.path;
      longPressFired = false;

      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        touchTimer = null;
        longPressFired = true;
        suppressClickUntil = Date.now() + 500;

        if (navigator.vibrate) {
          try { navigator.vibrate(30); } catch {}
        }

        onLongPressSelect?.(touchTargetPath);
      }, 500);
    }, { passive: true });

    list.addEventListener("touchmove", (e) => {
      if (!touchTimer) return;
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      if (dx * dx + dy * dy > 100) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });

    list.addEventListener("touchend", (e) => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      if (longPressFired) {
        e.preventDefault();
        e.stopPropagation();
        longPressFired = false;
      }
    });

    list.addEventListener("touchcancel", () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      longPressFired = false;
    });
  }

  function clickGuard(fn) {
    return (e) => {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      fn(e);
    };
  }

  // ----- Внутренний drag-and-drop (только ПК) -----
  const INTERNAL_MIME = "application/x-internal-move";

  function isInternalDrag(e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    return [...(dt.types || [])].includes(INTERNAL_MIME);
  }

  function attachDraggable(li, path) {
    if (isTouchDevice) return;
    li.draggable = true;
    li.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(INTERNAL_MIME, path);
      e.dataTransfer.setData("text/plain", path);
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      list.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
    });
  }

  function attachDropTarget(li, destFolderPath) {
    if (isTouchDevice) return;
    li.addEventListener("dragover", (e) => {
      if (!isInternalDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      li.classList.add("drop-target");
    });
    li.addEventListener("dragleave", (e) => {
      if (!isInternalDrag(e)) return;
      li.classList.remove("drop-target");
    });
    li.addEventListener("drop", (e) => {
      if (!isInternalDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      li.classList.remove("drop-target");

      const srcPath = e.dataTransfer.getData(INTERNAL_MIME) ||
                      e.dataTransfer.getData("text/plain");
      if (!srcPath) return;

      onMoveFile(srcPath, destFolderPath);
    });
  }

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

      fileActions.classList.toggle("hidden", selectionMode);
      deleteActions.classList.toggle("hidden", !selectionMode);
      branchSelect.classList.toggle("hidden", selectionMode);
      list.classList.toggle("selection-mode", selectionMode);

      const count = selection?.size || 0;
      if (selectionMode) {
        deleteCount.textContent = `Выбрано: ${count}`;
        btnDeleteConfirm.disabled = count === 0;
        if (btnRename) btnRename.disabled = count !== 1;
        if (btnMove) btnMove.disabled = count !== 1;
        if (btnDownload) btnDownload.disabled = count === 0;
      }

      clear(branchSelect);
      for (const b of branches) {
        branchSelect.appendChild(option(b.name, b.name, b.name === branch));
      }

      const { folders, files: filesHere } = listDirectory(files, base, deletedSet);
      const folderSizes = computeFolderSizes(files, deletedSet);
      const changedFolders = collectChangedFolders(dirtyPaths, deletedSet);
      clear(list);

      if (base) {
        const parentParts = base.split("/").filter(Boolean);
        parentParts.pop();
        const parentPath = parentParts.length ? parentParts.join("/") : "";

        const upLi = el("li", {
          class: "entry updir",
          title: "Назад в родительскую папку",
          onclick: () => onOpenFolder(".."),
        }, [
          el("span", { class: "icon", text: "📂" }),
          el("span", { class: "name", text: "..." }),
        ]);
        attachDropTarget(upLi, parentPath);
        list.appendChild(upLi);
      }

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
          dataset: { path: fullPath + "/" },
          onclick: clickGuard(() => {
            if (selectionMode) onToggleSelect(fullPath + "/");
            else onOpenFolder(name);
          }),
        }, children);

        if (changedFolders.has(fullPath)) li.classList.add("dirty");
        if (selectionMode && selection?.has(fullPath + "/")) {
          li.classList.add("selected");
        }

        if (!selectionMode) {
          attachDraggable(li, fullPath);
          attachDropTarget(li, fullPath);
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

        children.push(el("span", { class: "size", text: formatSize(f.size || 0) }));

        const li = el("li", {
          class: "entry file",
          dataset: { path: f.path },
          onclick: clickGuard(() => {
            if (selectionMode) onToggleSelect(f.path);
            else onOpenFile(f);
          }),
        }, children);

        if (dirtyPaths.has(f.path)) li.classList.add("dirty");
        if (selectionMode && selection?.has(f.path)) li.classList.add("selected");

        if (!selectionMode) attachDraggable(li, f.path);

        list.appendChild(li);
      }

      if (!base && !folders.length && !filesHere.length) {
        list.appendChild(el("li", { class: "empty", text: "Пусто" }));
      } else if (base && !folders.length && !filesHere.length) {
        list.appendChild(el("li", { class: "empty", text: "Пусто" }));
      }
    },
  };
}