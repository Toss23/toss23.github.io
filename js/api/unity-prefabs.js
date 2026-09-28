// Резолвер префабов и спрайт-ассетов Unity.
// По guid находит ассет в репозитории:
//   - .prefab      → рекурсивный обход с применением override'ов
//   - .psb/.psd    → размеры из заголовка Photoshop-файла
//   - .png/.jpg/.tga → размеры из заголовка изображения
//
// Пиксельные размеры делятся на PPU=100 (стандарт Unity), получаются
// локальные единицы. Карта guid → { path, kind } кэшируется в IndexedDB,
// ключ включает версию, чтобы старый кэш не мешал.

import { get as idbGet, set as idbSet } from "https://esm.sh/idb-keyval@6";
import { parseUnityYaml, buildSceneModel } from "./unity-yaml.js";
import { readPsdInfo } from "@core/psd-preview.js";
import { parseSpriteMeta } from "./unity-sprite-meta.js";

const CACHE_PREFIX = "unity_prefabs:";
const CACHE_VERSION = "v3";
const MAX_DEPTH = 6;
const DEFAULT_PPU = 100;

// Сканируем все .meta файлы — не только известные расширения.
// Guid может быть у чего угодно (.prefab, .psb, .controller, .anim,
// .mat, .asset, .cs, …), и нам важно не пропустить цель ссылки.
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

// Битовая маска первого байта PNG/JPEG/PSD — чтобы не пытаться парсить
// как картинку то, что ею не является (например, .controller).
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
  if (metaFiles.length === 0) {
    console.warn("[prefabs] в репозитории не найдено ни одного .meta файла. " +
      "Guid-ссылки разрешить не получится.");
  }

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
    // Небольшая карта — покажем её целиком, чтобы можно было сверить вручную.
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

// --- Чтение размеров из заголовков изображений ---

function readPngSize(bytes) {
  // PNG: 8 байт сигнатуры, затем IHDR. Ширина — 4 байта по смещению 16,
  // высота — 4 байта по смещению 20, big-endian.
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function readJpegSize(bytes) {
  // JPEG: маркеры. Ищем SOF0/1/2/3 (0xC0-0xC3) и читаем размеры.
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

    // Приоритетный путь — getAssetBytes: умеет читать большие файлы,
    // даже если их нет в state.files (через GitHub API напрямую).
    if (typeof getAssetBytes === "function") {
      try {
        const b = await getAssetBytes(assetPath);
        if (b instanceof Uint8Array && b.length > 0) bytes = b;
      } catch (e) {
        console.warn("[prefabs] getAssetBytes:", assetPath, e);
      }
    }

    // Резервный путь — обычный getContent (для локального режима и мелочей).
    if (!bytes) {
      const content = await getContent(assetPath);
      if (content === null || content === undefined) {
        console.warn("[prefabs] ассет недоступен:", assetPath);
        return null;
      }
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

    if (!bytes || bytes.length < 8) {
      console.warn("[prefabs] слишком мало байт:", assetPath, bytes ? bytes.length : 0);
      return null;
    }
    console.log("[prefabs] прочитано", bytes.length, "байт из", assetPath);

    if (!looksLikeImage(kind, bytes)) return null;

    if (kind === "psb" || kind === "psd") {
      const info = readPsdInfo(bytes);
      if (info && info.width && info.height) {
        console.log("[prefabs] PSD/PSB размеры:", info.width, "×", info.height, "(", assetPath, ")");
        return { width: info.width, height: info.height };
      }
      console.warn("[prefabs] readPsdInfo вернул null для", assetPath);
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

// --- Override'ы ---

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

// --- Основная функция ---

/**
 * Возвращает bounding box ассета в локальных единицах.
 *   { hasSprite: false }
 *   { hasSprite: true, minX, minY, maxX, maxY, color, spriteCount }
 */
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
    // 1. Читаем .meta — там PPU и список спрайтов атласа.
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

    // 2. Если .meta дала список спрайтов — считаем bbox по ним.
    if (metaInfo && metaInfo.sprites.length) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const s of metaInfo.sprites) {
        const x0 = s.rect.x / metaInfo.ppu;
        const y0 = s.rect.y / metaInfo.ppu;
        const x1 = (s.rect.x + s.rect.width) / metaInfo.ppu;
        const y1 = (s.rect.y + s.rect.height) / metaInfo.ppu;
        if (x0 < minX) minX = x0;
        if (y0 < minY) minY = y0;
        if (x1 > maxX) maxX = x1;
        if (y1 > maxY) maxY = y1;
      }
      console.log(
        "[prefabs] bbox атласа:",
        (maxX - minX).toFixed(2), "×", (maxY - minY).toFixed(2),
        "·", metaInfo.sprites.length, "спрайтов"
      );
      return {
        hasSprite: true,
        minX, minY, maxX, maxY,
        color: { r: 1, g: 1, b: 1, a: 1 },
        spriteCount: metaInfo.sprites.length,
      };
    }

    // 3. Fallback — читаем заголовок самого файла.
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
    };
  }

  // --- Префаб: рекурсивный разбор ---
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
    }
  }

  if (!spriteCount || !Number.isFinite(minX)) {
    return { hasSprite: false };
  }

  return {
    hasSprite: true,
    minX, minY, maxX, maxY,
    color: firstColor || { r: 1, g: 1, b: 1, a: 1 },
    spriteCount,
  };
}
