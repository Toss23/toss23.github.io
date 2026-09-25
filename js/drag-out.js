import { getState } from "./store.js";
import * as storage from "./storage.js";
import { getBlobRaw } from "./github.js";
import { base64ToBytes } from "./encoding.js";

const MIME = {
  html: "text/html", htm: "text/html",
  css: "text/css",
  js: "text/javascript", mjs: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain", cs: "text/plain", log: "text/plain",
  xml: "application/xml", svg: "image/svg+xml",
  yml: "text/yaml", yaml: "text/yaml",
  png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
};

function guessMime(path) {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME[path.slice(dot + 1).toLowerCase()] || "application/octet-stream";
}

// Создаём иконку файла (SVG → img) один раз и переиспользуем.
let dragIcon = null;

function ensureDragIcon() {
  if (dragIcon) return dragIcon;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <path d="M8 4h20l12 12v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
            fill="#ffffff" stroke="#666" stroke-width="2"/>
      <path d="M28 4l12 12H28z" fill="#d0d0d0" stroke="#666" stroke-width="2"/>
    </svg>`;

  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(svg);
  // Прикрепляем в DOM — Chrome игнорирует отсоединённые узлы при setDragImage.
  img.style.position = "fixed";
  img.style.top = "-1000px";
  img.style.width = "48px";
  img.style.height = "48px";
  img.style.pointerEvents = "none";
  document.body.appendChild(img);

  dragIcon = img;
  return img;
}

export function attachDragOut(li, file) {
  li.draggable = true;

  li.addEventListener("dragstart", (e) => {
    // 1. Синхронно — ставим иконку вместо строки списка.
    try {
      const icon = ensureDragIcon();
      e.dataTransfer.setDragImage(icon, 24, 24);
    } catch (err) {
      console.warn("setDragImage:", err);
    }

    // 2. Синхронно — режим «копирование».
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", file.path);

    // 3. Асинхронно — строим File и подсовываем его как DownloadURL.
    buildDragPayload(file).then((payload) => {
      if (!payload) return;
      // DownloadURL — Chrome-специфичный формат: "mime:filename:blobURL".
      try {
        e.dataTransfer.setData(
          "DownloadURL",
          `${payload.mime}:${payload.name}:${payload.url}`
        );
      } catch (err) {
        console.warn("DownloadURL:", err);
      }
    }).catch((err) => console.warn("drag-out:", err));

    li.classList.add("dragging");
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    // Отзываем blob URL, чтобы не копить мусор.
    for (const url of pendingUrls) URL.revokeObjectURL(url);
    pendingUrls.clear();
  });
}

const pendingUrls = new Set();

async function buildDragPayload(file) {
  const state = getState();
  const { mode, cloned, octokit, repo, dirty } = state;

  const name = file.path.split("/").pop() || file.path;
  const mime = guessMime(file.path);

  let blob = null;

  if (mode === "local" && cloned) {
    const entry = await storage.getFile(cloned.key, file.path);
    if (!entry) return null;
    if (entry.isBinary) {
      blob = new Blob([base64ToBytes(entry.content)], { type: mime });
    } else {
      blob = new Blob([entry.content], { type: mime });
    }
  } else if (file.isNew) {
    if (file.isBinary && file.content) {
      blob = new Blob([base64ToBytes(file.content)], { type: mime });
    } else if (dirty.has(file.path)) {
      blob = new Blob([dirty.get(file.path)], { type: mime });
    } else {
      blob = new Blob([""], { type: mime });
    }
  } else {
    if (!octokit || !repo || !file.sha) return null;
    try {
      blob = await getBlobRaw(octokit, repo.owner, repo.name, file.sha);
    } catch (e) {
      console.warn("drag-out blob:", e.message);
      return null;
    }
  }

  const url = URL.createObjectURL(blob);
  pendingUrls.add(url);
  return { name, mime, url };
}