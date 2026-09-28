// Резолвер префабов Unity: по sourceGuid из PrefabInstance находит
// .prefab в репозитории, читает его и возвращает размеры bounding box.
//
// Особенности:
// - Если у префаба собственных SpriteRenderer нет, рекурсивно идём
//   во вложенные PrefabInstance и объединяем их bbox'ы.
// - Override'ы (m_Modifications) применяются к вложенному префабу перед
//   расчётом bbox: иначе позиции внутренних объектов берутся из
//   исходного файла, а не из переопределённых.
// - Карта guid → path строится один раз и кэшируется в IndexedDB
//   (ключ = репозиторий + ветка + headSha).

import { get as idbGet, set as idbSet } from "https://esm.sh/idb-keyval@6";
import { parseUnityYaml, buildSceneModel } from "./unity-yaml.js";

const CACHE_PREFIX = "unity_prefabs:";
const MAX_DEPTH = 6;

function makeCacheKey(repoKey, headSha) {
  return CACHE_PREFIX + (repoKey || "repo") + "@" + (headSha || "unknown");
}

export async function getPrefabMap({ repoKey, headSha, files, getContent, onProgress }) {
  const key = makeCacheKey(repoKey, headSha);

  try {
    const cached = await idbGet(key);
    if (cached && cached.guidToPath && typeof cached.guidToPath === "object") {
      console.log("[prefabs] карта из кэша, записей:", Object.keys(cached.guidToPath).length);
      return cached.guidToPath;
    }
  } catch (e) {
    console.warn("prefab map cache read:", e);
  }

  const metaFiles = (files || []).filter(
    (f) => f && typeof f.path === "string" && f.path.endsWith(".prefab.meta")
  );
  console.log("[prefabs] найдено .prefab.meta файлов:", metaFiles.length);

  const guidToPath = {};
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
      const prefabPath = mf.path.replace(/\.meta$/, "");
      guidToPath[m[1]] = prefabPath;
    } catch { skipped++; }
  }

  console.log("[prefabs] карта построена, записей:", Object.keys(guidToPath).length, "пропущено:", skipped);

  try {
    await idbSet(key, { guidToPath, builtAt: Date.now() });
  } catch (e) {
    console.warn("prefab map cache write:", e);
  }

  return guidToPath;
}

// Применяет одну строку override: m_LocalPosition.x → data.m_LocalPosition.x = value.
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

// overrides: Map<fileID-в-целевом-префабе, Array<[propertyPath, value]>>
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

/**
 * Читает .prefab и возвращает bounding box по всем SpriteRenderer,
 * включая вложенные префабы, с применением override'ов.
 *
 * Возвращает:
 *   { hasSprite: false }
 *   { hasSprite: true, minX, minY, maxX, maxY, color, spriteCount }
 */
export async function loadPrefabBoundingBox({
  prefabPath,
  getContent,
  prefabMap,
  selfGuid,
  visited,
  depth,
}) {
  if (typeof depth !== "number") depth = 0;
  if (depth > MAX_DEPTH) return null;
  if (!visited) visited = new Set();
  if (selfGuid && visited.has(selfGuid)) return null;
  if (selfGuid) visited.add(selfGuid);

  const text = await getContent(prefabPath);
  if (typeof text !== "string") {
    console.warn("[prefabs] пустой файл:", prefabPath);
    return null;
  }

  let docs, model;
  try {
    docs = parseUnityYaml(text);
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

  // --- 1. Собственные спрайты
  for (const g of model.gameObjects) {
    if (!g.hasSprite || g.sizeX === null || g.sizeY === null) continue;
    absorb(g.worldX, g.worldY, g.sizeX / 2, g.sizeY / 2, g.spriteColor);
    spriteCount++;
  }

  // --- 2. Вложенные префабы с применением overrides
  if (prefabMap) {
    for (const g of model.gameObjects) {
      if (!g.isPrefabInstance) continue;
      const nestedGuid = g.sourceGuid;
      if (!nestedGuid) continue;
      if (visited.has(nestedGuid)) continue;
      const nestedPath = prefabMap[nestedGuid];
      if (!nestedPath) {
        console.warn("[prefabs] вложенный guid не найден в карте:", nestedGuid, "в файле", prefabPath);
        continue;
      }

      // Собираем override'ы, которые прицелены именно во вложенный префаб.
      const doc = model.byFileId.get(g.fileID);
      const pi = doc && doc.data && doc.data.PrefabInstance;
      const mods = pi && pi.m_Modification && pi.m_Modification.m_Modifications;
      const overrides = new Map();
      if (Array.isArray(mods)) {
        for (const m of mods) {
          const tgt = m && m.target;
          if (!tgt) continue;
          // Применяем только override'ы, чей target.guid совпадает
          // с вложенным префабом (иначе они относятся к другим файлам).
          if (tgt.guid !== nestedGuid) continue;
          const fid = String(tgt.fileID);
          if (!overrides.has(fid)) overrides.set(fid, []);
          overrides.get(fid).push([m.propertyPath, m.value]);
        }
      }

      let nested = null;
      try {
        nested = await loadPrefabBoundingBox({
          prefabPath: nestedPath,
          getContent,
          prefabMap,
          selfGuid: nestedGuid,
          visited,
          depth: depth + 1,
          overrides,
        });
      } catch (e) {
        console.warn("nested prefab:", nestedPath, e);
      }
      if (!nested || !nested.hasSprite) continue;

      // Применяем локальный сдвиг и масштаб инстанса.
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
