import { $ } from "@core/dom.js";

export function initDropZone({ isActive, onFiles }) {
  const overlay = $("drop-overlay");
  const overlayText = $("drop-overlay-text");

  let dragDepth = 0;
  let active = false;

  function show() {
    if (!overlay) return;
    active = true;
    overlay.classList.remove("hidden");
  }

  function hide() {
    if (!overlay) return;
    active = false;
    overlay.classList.add("hidden");
    dragDepth = 0;
  }

  function hasFiles(e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    const types = dt.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") return true;
    }
    return false;
  }

  document.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    if (!isActive()) return;
    e.preventDefault();
    dragDepth++;
    if (!active) show();
  });

  document.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    if (!isActive()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  document.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth--;
    if (dragDepth <= 0) hide();
  });

  document.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    if (!isActive()) return;
    e.preventDefault();
    hide();

    try {
      const entries = await collectEntries(e.dataTransfer);
      if (entries.length) onFiles(entries);
    } catch (err) {
      console.error("drop:", err);
    }
  });

  // Не даём браузеру открыть файл по дропу вне зоны.
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });

  return {
    setHint(text) {
      if (overlayText && text) overlayText.textContent = text;
    },
  };
}

async function collectEntries(dataTransfer) {
  // Синхронно вытаскиваем entries — DataTransferItem становится
  // невалидным после любого await.
  const items = [...(dataTransfer.items || [])];
  const rootEntries = [];
  for (const it of items) {
    if (it.kind !== "file") continue;
    if (typeof it.webkitGetAsEntry === "function") {
      const entry = it.webkitGetAsEntry();
      if (entry) rootEntries.push(entry);
    }
  }

  const out = [];
  if (rootEntries.length) {
    for (const entry of rootEntries) {
      await walkEntry(entry, "", out);
    }
  }

  // Fallback — плоский список файлов (без структуры папок).
  if (!out.length) {
    const files = [...(dataTransfer.files || [])];
    for (const f of files) out.push({ file: f, path: f.name });
  }
  return out;
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    const path = prefix ? `${prefix}/${file.name}` : file.name;
    out.push({ file, path });
    return;
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    const dirPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    // readEntries отдаёт батчами — читаем до пустого результата.
    while (true) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) {
        await walkEntry(child, dirPrefix, out);
      }
    }
  }
}