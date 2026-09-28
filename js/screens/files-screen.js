import { $, el, clear, option } from "@core/dom.js";
import { listDirectory } from "@core/tree.js";
import { formatSize } from "@core/format.js";
import { getIconsEnabled, getIconsStandard, getIconsUnity } from "@core/settings.js";

const FILE_ICONS_STANDARD = {
  cs: "#\uFE0F\u20E3",
  csproj: "\uD83D\uDD37",
  sln: "\uD83D\uDD37",
  js: "\uD83D\uDFE1",
  mjs: "\uD83D\uDFE1",
  cjs: "\uD83D\uDFE1",
  ts: "\uD83D\uDD35",
  tsx: "\uD83D\uDD35",
  jsx: "\uD83D\uDD35",
  html: "\uD83C\uDF10",
  htm: "\uD83C\uDF10",
  xhtml: "\uD83C\uDF10",
  css: "\uD83C\uDFA8",
  scss: "\uD83C\uDFA8",
  sass: "\uD83C\uDFA8",
  less: "\uD83C\uDFA8",
  json: "\uD83D\uDCCB",
  md: "\uD83D\uDCD6",
  markdown: "\uD83D\uDCD6",
  yml: "\u2699\uFE0F",
  yaml: "\u2699\uFE0F",
  toml: "\u2699\uFE0F",
  ini: "\u2699\uFE0F",
  xml: "\uD83D\uDCF0",
  png: "\uD83D\uDDBC\uFE0F",
  jpg: "\uD83D\uDDBC\uFE0F",
  jpeg: "\uD83D\uDDBC\uFE0F",
  gif: "\uD83D\uDDBC\uFE0F",
  webp: "\uD83D\uDDBC\uFE0F",
  bmp: "\uD83D\uDDBC\uFE0F",
  ico: "\uD83D\uDDBC\uFE0F",
  svg: "\uD83D\uDDBC\uFE0F",
  psd: "\uD83D\uDDBC\uFE0F",
  psb: "\uD83D\uDDBC\uFE0F",
  pdf: "\uD83D\uDCD5",
  zip: "\uD83D\uDDDC\uFE0F",
  tar: "\uD83D\uDDDC\uFE0F",
  gz: "\uD83D\uDDDC\uFE0F",
  rar: "\uD83D\uDDDC\uFE0F",
  "7z": "\uD83D\uDDDC\uFE0F",
  py: "\uD83D\uDC0D",
  java: "\u2615",
  kt: "\uD83C\uDFA1",
  go: "\uD83D\uDC39",
  rs: "\uD83E\uDD80",
  rb: "\uD83D\uDC8E",
  php: "\uD83D\uDC18",
  cpp: "\u2699\uFE0F",
  c: "\u2699\uFE0F",
  h: "\u2699\uFE0F",
  hpp: "\u2699\uFE0F",
  sh: "\u2699\uFE0F",
  bash: "\u2699\uFE0F",
  zsh: "\u2699\uFE0F",
  ps1: "\u2699\uFE0F",
  bat: "\u2699\uFE0F",
  cmd: "\u2699\uFE0F",
  sql: "\uD83D\uDDC4\uFE0F",
  txt: "\uD83D\uDCC4",
  log: "\uD83D\uDCC4",
  csv: "\uD83D\uDCCA",
  tsv: "\uD83D\uDCCA",
  env: "\uD83D\uDD10",
  tga: "\uD83D\uDDBC\uFE0F",
  tif: "\uD83D\uDDBC\uFE0F",
  tiff: "\uD83D\uDDBC\uFE0F",
  exr: "\uD83D\uDDBC\uFE0F",
  hdr: "\uD83D\uDDBC\uFE0F",
  wav: "\uD83C\uDFB5",
  mp3: "\uD83C\uDFB5",
  ogg: "\uD83C\uDFB5",
  oga: "\uD83C\uDFB5",
  opus: "\uD83C\uDFB5",
  aiff: "\uD83C\uDFB5",
  flac: "\uD83C\uDFB5",
  aac: "\uD83C\uDFB5",
  m4a: "\uD83C\uDFB5",
  weba: "\uD83C\uDFB5",
  mid: "\uD83C\uDFB5",
  midi: "\uD83C\uDFB5",
  mp4: "\uD83C\uDFA5",
  mov: "\uD83C\uDFA5",
  webm: "\uD83C\uDFA5",
  avi: "\uD83C\uDFA5",
  ttf: "\uD83D\uDD24",
  otf: "\uD83D\uDD24",
};

// Иконки для файлов Unity.
const FILE_ICONS_UNITY = {
  unity: "\uD83C\uDFAC",
  prefab: "\uD83D\uDCE6",
  asset: "\uD83D\uDDC2\uFE0F",
  meta: "\uD83C\uDFF7\uFE0F",
  mat: "\uD83C\uDFA8",
  anim: "\uD83C\uDF9E\uFE0F",
  controller: "\uD83D\uDD79\uFE0F",
  overridecontroller: "\uD83D\uDD79\uFE0F",
  physicmaterial: "\u2699\uFE0F",
  physicsmaterial2d: "\u2699\uFE0F",
  shader: "\u2728",
  cginc: "\u2728",
  hlsl: "\u2728",
  glslinc: "\u2728",
  compute: "\u2728",
  vfx: "\u2728",
  uxml: "\uD83E\uDDE9",
  uss: "\uD83E\uDDE9",
  asmdef: "\uD83E\uDDF1",
  asmref: "\uD83E\uDDF1",
  rsp: "\uD83D\uDCDC",
  fbx: "\uD83E\uDDCA",
  obj: "\uD83E\uDDCA",
  dae: "\uD83E\uDDCA",
  "3ds": "\uD83E\uDDCA",
  blend: "\uD83E\uDDCA",
  max: "\uD83E\uDDCA",
  mb: "\uD83E\uDDCA",
  ma: "\uD83E\uDDCA",
  skp: "\uD83E\uDDCA",
  spm: "\uD83C\uDF33",
  st: "\uD83C\uDF33",
  dds: "\uD83E\uDDCA",
  ktx: "\uD83E\uDDCA",
  pvr: "\uD83E\uDDCA",
  astc: "\uD83E\uDDCA",
  cubemap: "\uD83C\uDF0C",
  rendertexture: "\uD83D\uDDA5\uFE0F",
  spriteatlas: "\uD83D\uDDFA\uFE0F",
  terrainlayer: "\u26F0\uFE0F",
  guiskin: "\uD83C\uDF9B\uFE0F",
  mask: "\uD83C\uDFAD",
  flare: "\u2600\uFE0F",
  fontsettings: "\uD83D\uDD24",
  sbsar: "\uD83E\uDDEA",
  signal: "\uD83D\uDCE1",
};

const FILE_ICON_DEFAULT = "\uD83D\uDCC4";

function fileIcon(path) {
  // Главный тумблер кастомных иконок.
  if (!getIconsEnabled()) return FILE_ICON_DEFAULT;

  const name = (path.split("/").pop() || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot < 0 ? "" : name.slice(dot + 1);

  // Unity-иконки проверяем раньше стандартных.
  if (getIconsUnity() && ext && FILE_ICONS_UNITY[ext]) {
    return FILE_ICONS_UNITY[ext];
  }

  if (getIconsStandard()) {
    if (name === ".gitignore" || name === ".gitattributes" || name === ".gitmodules") return "\uD83D\uDD27";
    if (name === "dockerfile") return "\uD83D\uDC33";
    if (name === ".editorconfig") return "\u2699\uFE0F";
    if (ext && FILE_ICONS_STANDARD[ext]) return FILE_ICONS_STANDARD[ext];
  }

  return FILE_ICON_DEFAULT;
}

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
  onCreateMenu,
  onMoreMenu,
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
  const btnCreate = $("btn-create");
  const btnMore = $("btn-more");
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
  if (btnCreate) btnCreate.addEventListener("click", () => onCreateMenu && onCreateMenu());
  if (btnMore) btnMore.addEventListener("click", () => onMoreMenu && onMoreMenu());
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
        children.push(el("span", { class: "icon", text: fileIcon(f.path) }));
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