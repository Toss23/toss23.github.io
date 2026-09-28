// Резолвер префабов и спрайт-ассетов Unity.
// По guid находит ассет в репозитории:
//   - .prefab      → рекурсивный обход с применением override'ов
//   - .psb/.psd    → bbox из .meta + декодированная картинка
//   - .png/.jpg    → размеры из заголовка
//
// Возвращает { hasSprite, minX, minY, maxX, maxY, bitmap?, imagePPU }.

import { get as idbGet, set as idbSet } from "https://esm.sh/idb-keyval@6";
import { parseUnityYaml, buildSceneModel } from "./unity-yaml.js";
import { readPsdInfo } from "@core/psd-preview.js";
import { parseSpriteMeta } from "./unity-sprite-meta.js";
import { loadPsbImage } from "@core/psb-image.js";

const CACHE_PREFIX = "unity_prefabs:";
const CACHE_VERSION = "v3";
const MAX_DEPTH = 6;
const DEFAULT_PPU = 100;

function isMetaFile(path) {
  return typeof path === "string" && path.toLowerCase().endsWith(".meta");
}

function makeCacheKey(repoKey, headSha) {
  return CACHE_PREFIX + CACHE_VERSION + ":" + (repoKey || "repo") + "@" + (headSha || "unknown");
}

function detectKind(path) {
  const name = path.toLowerCase();
  if (name.endsWith(".prefab")) return "prefab";
  if (name.endsWith(".psb")) return "psb";
  if (name.endsWith(".psd")) return "psd";
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".tga")) return "tga";
  if (name.endsWith(".gif")) return "gif";
  if (name.endsWith(".bmp")) return "bmp";
  if (name.endsWith(".asset")) return "asset";
  return "other";
}

function looksLikeImage(kind, bytes) {
  if (!bytes || bytes.length < 4) return false;
  if (kind === "png") return bytes[0] === 0x89 && bytes[1] === 0x50;
  if (kind === "jpg") return bytes[0] === 0xFF && bytes[1] === 0xD8;
  if (kind === "psd" || kind === "psb") {
    return bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
  }
  return true;
}

export async function getPrefabMap({ repoKey, headSha, files, getContent, onProgress }) {
  const key = makeCacheKey(repoKey, headSha);

  try {
    const cached = await idbGet(key);
    if (cached && cached.guidToPath && typeof cached.guidToPath === "object") {
      console.log("[prefabs] карта из кэша, записей:", Object.keys(cached.guidToPath).length);
      return cached;
    }
  } catch (e) {
    console.warn("prefab map cache read:", e);
  }
  console.log("[prefabs] кэш не найден, строим карту заново (версия " + CACHE_VERSION + ")");

  const allFiles = files || [];
  const metaFiles = allFiles.filter((f) => f && isMetaFile(f.path));
  const otherFiles = allFiles.length - metaFiles.length;
  console.log(
    "[prefabs] всего файлов:", allFiles.length,
    "· .meta:", metaFiles.length,
    "· прочих:", otherFiles
  );

  const guidToPath = {};
  const kindByGuid = {};
  const total = metaFiles.length;
  let done = 0;
  let skipped = 0;

  for (const mf of metaFiles) {
    done++;
    if (typeof onProgress === "function") {
      try { onProgress(done, total); } catch {}
    }
    try {
      const text = await getContent(mf.path);
      if (typeof text !== "string") { skipped++; continue; }
      const m = text.match(/^guid:\s*([a-f0-9]+)/m);
      if (!m) { skipped++; continue; }
      const assetPath = mf.path.replace(/\.meta$/, "");
      guidToPath[m[1]] = assetPath;
      kindByGuid[m[1]] = detectKind(assetPath);
    } catch { skipped++; }
  }

  const totalEntries = Object.keys(guidToPath).length;
  console.log("[prefabs] карта построена, записей:", totalEntries, "пропущено:", skipped);
  if (totalEntries > 0 && totalEntries <= 50) {
    for (const [g, p] of Object.entries(guidToPath)) {
      console.log("[prefabs]   ", g, "→", p);
    }
  }

  const result = { guidToPath, kindByGuid, builtAt: Date.now() };
  try {
    await idbSet(key, result);
  } catch (e) {
    console.warn("prefab map cache write:", e);
  }
  return result;
}

function readPngSize(bytes) {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function readJpegSize(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xC0 && marker <= 0xC3) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      return { width: w, height: h };
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + len;
  }
  return null;
}

async function readAssetSize(kind, getContent, getAssetBytes, assetPath) {
  try {
    let bytes = null;
    if (typeof getAssetBytes === "function") {
      try {
        const b = await getAssetBytes(assetPath);
        if (b instanceof Uint8Array && b.length > 0) bytes = b;
      } catch (e) {
        console.warn("[prefabs] getAssetBytes:", assetPath, e);
      }
    }
    if (!bytes) {
      const content = await getContent(assetPath);
      if (content === null || content === undefined) return null;
      if (content instanceof Uint8Array) bytes = content;
      else if (typeof content === "object" && content.binary) return null;
      else if (typeof content === "string" && /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 64))) {
        try {
          const bin = atob(content);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch { return null; }
      } else {
        return null;
      }
    }

    if (!bytes || bytes.length < 8) return null;
    if (!looksLikeImage(kind, bytes)) return null;

    if (kind === "psb" || kind === "psd") {
      const info = readPsdInfo(bytes);
      if (info && info.width && info.height) {
        return { width: info.width, height: info.height };
      }
      return null;
    }
    if (kind === "png") return readPngSize(bytes);
    if (kind === "jpg") return readJpegSize(bytes);
    return null;
  } catch (e) {
    console.warn("[prefabs] не удалось прочитать размеры:", assetPath, e);
    return null;
  }
}

function setPropertyPath(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function applyOverrides(docs, overrides) {
  if (!overrides || !overrides.size) return;
  for (const [fileId, entries] of overrides) {
    const doc = docs.find((d) => String(d.fileID) === String(fileId));
    if (!doc || !doc.data) continue;
    const keys = Object.keys(doc.data);
    if (!keys.length) continue;
    const body = doc.data[keys[0]];
    if (!body || typeof body !== "object") continue;
    for (const [path, value] of entries) {
      setPropertyPath(body, path, value);
    }
  }
}

export async function loadPrefabBoundingBox({
  prefabPath,
  kind,
  getContent,
  getAssetBytes,
  prefabMap,
  kindByGuid,
  selfGuid,
  visited,
  depth,
  overrides,
}) {
  if (typeof depth !== "number") depth = 0;
  if (depth > MAX_DEPTH) return null;
  if (!visited) visited = new Set();
  if (selfGuid && visited.has(selfGuid)) return null;
  if (selfGuid) visited.add(selfGuid);

  // --- Ассеты-картинки ---
  if (kind && kind !== "prefab" && kind !== "asset") {
    let metaInfo = null;
    try {
      const metaPath = prefabPath + ".meta";
      const metaText = await getContent(metaPath);
      if (typeof metaText === "string") {
        metaInfo = parseSpriteMeta(metaText);
        if (metaInfo) {
          console.log(
            "[prefabs] meta:", prefabPath,
            "PPU:", metaInfo.ppu,
            "спрайтов:", metaInfo.sprites.length
          );
        }
      }
    } catch (e) {
      console.warn("[prefabs] meta read:", prefabPath, e.message);
    }

    if (metaInfo && metaInfo.sprites.length) {
      const ppu = metaInfo.ppu;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minPx = Infinity, maxPx = -Infinity;
      let minPy = Infinity, maxPy = -Infinity;
      for (const s of metaInfo.sprites) {
        const wPx = s.rect.width;
        const hPx = s.rect.height;
        const cxPx = s.centerX;
        const cyPx = s.centerY;
        const x0 = (cxPx - wPx / 2) / ppu;
        const y0 = (cyPx - hPx / 2) / ppu;
        const x1 = (cxPx + wPx / 2) / ppu;
        const y1 = (cyPx + hPx / 2) / ppu;
        if (x0 < minX) minX = x0;
        if (y0 < minY) minY = y0;
        if (x1 > maxX) maxX = x1;
        if (y1 > maxY) maxY = y1;
        // Пиксельные границы для будущей обрезки картинки
        if (cxPx - wPx / 2 < minPx) minPx = cxPx - wPx / 2;
        if (cxPx + wPx / 2 > maxPx) maxPx = cxPx + wPx / 2;
        if (cyPx - hPx / 2 < minPy) minPy = cyPx - hPx / 2;
        if (cyPx + hPx / 2 > maxPy) maxPy = cyPx + hPx / 2;
      }
      console.log(
        "[prefabs] атлас:", metaInfo.sprites.length, "спрайтов · bbox:",
        (maxX - minX).toFixed(2), "×", (maxY - minY).toFixed(2),
        "· пиксели:", (maxPx - minPx).toFixed(0), "×", (maxPy - minPy).toFixed(0)
      );

      const result = {
        hasSprite: true,
        minX, minY, maxX, maxY,
        color: { r: 1, g: 1, b: 1, a: 1 },
        spriteCount: metaInfo.sprites.length,
        imagePath: prefabPath,
        imagePPU: ppu,
        // Пиксельные границы области спрайтов в документе Photoshop.
        // Нужны, чтобы вырезать нужную часть из PSB-картинки.
        docMinPx: minPx,
        docMaxPx: maxPx,
        docMinPy: minPy,
        docMaxPy: maxPy,
      };

      if ((kind === "psb" || kind === "psd") && typeof getAssetBytes === "function") {
        try {
          const bytes = await getAssetBytes(prefabPath);
          if (bytes && bytes.length) {
            const info = readPsdInfo(bytes);
            result.docWidthPx = info ? info.width : 0;
            result.docHeightPx = info ? info.height : 0;
            const bitmap = await loadPsbImage(bytes, prefabPath);
            if (bitmap) {
              result.bitmap = bitmap;
              result.imageWidth = bitmap.width;
              result.imageHeight = bitmap.height;
              console.log(
                "[prefabs] картинка загружена:", prefabPath,
                bitmap.width + "×" + bitmap.height,
                "· документ:", result.docWidthPx + "×" + result.docHeightPx
              );
            }
          }
        } catch (e) {
          console.warn("[prefabs] bitmap:", prefabPath, e && e.message ? e.message : e);
        }
      }

      return result;
    }

    const size = await readAssetSize(kind, getContent, getAssetBytes, prefabPath);
    if (!size || !size.width || !size.height) {
      console.warn("[prefabs] не удалось получить ни meta, ни размер:", prefabPath);
      return { hasSprite: false };
    }
    const ppu = (metaInfo && metaInfo.ppu) || DEFAULT_PPU;
    const w = size.width / ppu;
    const h = size.height / ppu;
    console.log("[prefabs] fallback размер:", w.toFixed(2), "×", h.toFixed(2));
    return {
      hasSprite: true,
      minX: -w / 2,
      minY: -h / 2,
      maxX: w / 2,
      maxY: h / 2,
      color: { r: 1, g: 1, b: 1, a: 1 },
      spriteCount: 1,
      docMinPx: 0,
      docMaxPx: size.width,
      docMinPy: 0,
      docMaxPy: size.height,
      docWidthPx: size.width,
      docHeightPx: size.height,
    };
  }

  // --- Префаб ---
  const text = await getContent(prefabPath);
  if (typeof text !== "string") {
    console.warn("[prefabs] пустой файл:", prefabPath);
    return null;
  }

  let docs, model;
  try {
    docs = parseUnityYaml(text);
    if (overrides && overrides.size) applyOverrides(docs, overrides);
    model = buildSceneModel(docs);
  } catch (e) {
    console.warn("prefab parse:", prefabPath, e);
    return null;
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let spriteCount = 0;
  let firstColor = null;
  let bitmap = null;
  let imagePPU = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let docMinPx = 0, docMaxPx = 0, docMinPy = 0, docMaxPy = 0;
  let docWidthPx = 0, docHeightPx = 0;

  function absorb(cx, cy, hw, hh, color) {
    const x0 = cx - hw, x1 = cx + hw;
    const y0 = cy - hh, y1 = cy + hh;
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
    if (y0 < minY) minY = y0;
    if (y1 > maxY) maxY = y1;
    if (!firstColor && color) firstColor = color;
  }

  for (const g of model.gameObjects) {
    if (!g.hasSprite || g.sizeX === null || g.sizeY === null) continue;
    absorb(g.worldX, g.worldY, g.sizeX / 2, g.sizeY / 2, g.spriteColor);
    spriteCount++;
  }

  if (prefabMap && kindByGuid) {
    for (const g of model.gameObjects) {
      if (!g.isPrefabInstance) continue;
      const nestedGuid = g.sourceGuid;
      if (!nestedGuid) continue;
      if (visited.has(nestedGuid)) continue;
      const nestedPath = prefabMap[nestedGuid];
      if (!nestedPath) {
        console.warn("[prefabs] guid не найден в карте:", nestedGuid, "в файле", prefabPath);
        continue;
      }
      const nestedKind = kindByGuid[nestedGuid] || detectKind(nestedPath);

      const doc = model.byFileId.get(g.fileID);
      const pi = doc && doc.data && doc.data.PrefabInstance;
      const mods = pi && pi.m_Modification && pi.m_Modification.m_Modifications;
      const nestedOverrides = new Map();
      if (Array.isArray(mods)) {
        for (const m of mods) {
          const tgt = m && m.target;
          if (!tgt) continue;
          if (tgt.guid !== nestedGuid) continue;
          const fid = String(tgt.fileID);
          if (!nestedOverrides.has(fid)) nestedOverrides.set(fid, []);
          nestedOverrides.get(fid).push([m.propertyPath, m.value]);
        }
      }

      let nested = null;
      try {
        nested = await loadPrefabBoundingBox({
          prefabPath: nestedPath,
          kind: nestedKind,
          getContent,
          getAssetBytes,
          prefabMap,
          kindByGuid,
          selfGuid: nestedGuid,
          visited,
          depth: depth + 1,
          overrides: nestedOverrides,
        });
      } catch (e) {
        console.warn("nested prefab:", nestedPath, e);
      }
      if (!nested || !nested.hasSprite) continue;

      const sx = g.localScale.x || 1;
      const sy = g.localScale.y || 1;
      const nxMinX = g.localPos.x + nested.minX * sx;
      const nxMaxX = g.localPos.x + nested.maxX * sx;
      const nyMinY = g.localPos.y + nested.minY * sy;
      const nyMaxY = g.localPos.y + nested.maxY * sy;
      if (nxMinX < minX) minX = nxMinX;
      if (nxMaxX > maxX) maxX = nxMaxX;
      if (nyMinY < minY) minY = nyMinY;
      if (nyMaxY > maxY) maxY = nyMaxY;
      if (!firstColor && nested.color) firstColor = nested.color;
      spriteCount += nested.spriteCount || 0;

      if (!bitmap && nested.bitmap) {
        bitmap = nested.bitmap;
        imagePPU = nested.imagePPU;
        imageWidth = nested.imageWidth;
        imageHeight = nested.imageHeight;
        docMinPx = nested.docMinPx;
        docMaxPx = nested.docMaxPx;
        docMinPy = nested.docMinPy;
        docMaxPy = nested.docMaxPy;
        docWidthPx = nested.docWidthPx;
        docHeightPx = nested.docHeightPx;
      }
    }
  }

  if (!spriteCount || !Number.isFinite(minX)) {
    return { hasSprite: false };
  }

  return {
    hasSprite: true,
    minX, minY, maxX, maxY,
    bitmap,
    imagePPU,
    imageWidth,
    imageHeight,
    docMinPx, docMaxPx, docMinPy, docMaxPy,
    docWidthPx, docHeightPx,
    color: firstColor || { r: 1, g: 1, b: 1, a: 1 },
    spriteCount,
  };
}
