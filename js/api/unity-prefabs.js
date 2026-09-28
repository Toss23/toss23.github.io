// Резолвер префабов Unity: по sourceGuid из PrefabInstance находит
// .prefab в репозитории, читает его и возвращает размеры bounding box.
//
// Если у префаба собственных SpriteRenderer нет (он контейнер),
// рекурсивно идём во вложенные PrefabInstance и объединяем их bbox'ы.
// Защита от циклов — visited set по guid, ограничение глубины — 6.
//
// Карта guid → path строится один раз и кэшируется в IndexedDB
// (ключ = репозиторий + ветка + headSha). При следующем коммите
// headSha меняется — карта строится заново.

import { get as idbGet, set as idbSet } from "https://esm.sh/idb-keyval@6";
import { parseUnityYaml, buildSceneModel } from "./unity-yaml.js";

const CACHE_PREFIX = "unity_prefabs:";
const MAX_DEPTH = 6;

function makeCacheKey(repoKey, headSha) {
  return CACHE_PREFIX + (repoKey || "repo") + "@" + (headSha || "unknown");
}

/**
 * Карта { guid: "путь/к/файлу.prefab" }.
 * Сканирует все .prefab.meta в files и извлекает оттуда guid.
 * Кэшируется в IndexedDB.
 */
export async function getPrefabMap({ repoKey, headSha, files, getContent, onProgress }) {
  const key = makeCacheKey(repoKey, headSha);

  try {
    const cached = await idbGet(key);
    if (cached && cached.guidToPath && typeof cached.guidToPath === "object") {
      return cached.guidToPath;
    }
  } catch (e) {
    console.warn("prefab map cache read:", e);
  }

  const metaFiles = (files || []).filter(
    (f) => f && typeof f.path === "string" && f.path.endsWith(".prefab.meta")
  );
  const guidToPath = {};
  const total = metaFiles.length;
  let done = 0;

  for (const mf of metaFiles) {
    done++;
    if (typeof onProgress === "function") {
      try { onProgress(done, total); } catch {}
    }
    try {
      const text = await getContent(mf.path);
      if (typeof text !== "string") continue;
      const m = text.match(/^guid:\s*([a-f0-9]+)/m);
      if (!m) continue;
      const prefabPath = mf.path.replace(/\.meta$/, "");
      guidToPath[m[1]] = prefabPath;
    } catch {}
  }

  try {
    await idbSet(key, { guidToPath, builtAt: Date.now() });
  } catch (e) {
    console.warn("prefab map cache write:", e);
  }

  return guidToPath;
}

/**
 * Читает .prefab и возвращает bounding box по всем SpriteRenderer,
 * включая вложенные префабы. Рекурсивный обход с защитой от циклов.
 *
 * Возвращает:
 *   { hasSprite: false }                                    — если спрайтов нет
 *   { hasSprite: true, minX, minY, maxX, maxY,              — иначе
 *     color, spriteCount }
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
  if (typeof text !== "string") return null;

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

  // --- 2. Вложенные префабы — рекурсивно, с объединением bbox
  if (prefabMap) {
    for (const g of model.gameObjects) {
      if (!g.isPrefabInstance) continue;
      const nestedGuid = g.sourceGuid;
      if (!nestedGuid) continue;
      if (visited.has(nestedGuid)) continue;
      const nestedPath = prefabMap[nestedGuid];
      if (!nestedPath) continue;

      let nested = null;
      try {
        nested = await loadPrefabBoundingBox({
          prefabPath: nestedPath,
          getContent,
          prefabMap,
          selfGuid: nestedGuid,
          visited,
          depth: depth + 1,
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
