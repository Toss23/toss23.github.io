// Резолвер префабов Unity: по sourceGuid из PrefabInstance находит
// .prefab в репозитории, читает его и возвращает размеры bounding box.
//
// Карта guid → path строится один раз и кэшируется в IndexedDB
// (ключ = репозиторий + ветка + headSha). При следующем коммите
// headSha меняется — карта строится заново.

import { get as idbGet, set as idbSet } from "https://esm.sh/idb-keyval@6";
import { parseUnityYaml, buildSceneModel } from "./unity-yaml.js";

const CACHE_PREFIX = "unity_prefabs:";

function makeCacheKey(repoKey, headSha) {
  return CACHE_PREFIX + (repoKey || "repo") + "@" + (headSha || "unknown");
}

/**
 * Возвращает карту { guid: "путь/к/файлу.prefab" }.
 * Сканирует все .prefab.meta в files и извлекает оттуда guid.
 * Результат кэшируется в IndexedDB.
 *
 * onProgress(done, total) вызывается по мере чтения .meta файлов.
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
 * Читает .prefab и возвращает размеры bounding box по всем SpriteRenderer
 * внутри. Учитывает вложенные объекты и локальные трансформы префаба.
 *
 * Возвращает:
 *   { hasSprite: false }                          — если спрайтов нет
 *   { hasSprite: true, sizeX, sizeY,              — иначе
 *     centerX, centerY, color, spriteCount }
 *
 * Результат не кэшируется: размеры маленькие, а сам файл читается быстро.
 * Если понадобится — легко добавить кэш по ключу path@sha.
 */
export async function loadPrefabBoundingBox({ prefabPath, getContent }) {
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
  let count = 0;
  let firstColor = null;

  for (const g of model.gameObjects) {
    if (!g.hasSprite) continue;
    const hw = (g.sizeX || 0) / 2;
    const hh = (g.sizeY || 0) / 2;
    if (g.worldX - hw < minX) minX = g.worldX - hw;
    if (g.worldX + hw > maxX) maxX = g.worldX + hw;
    if (g.worldY - hh < minY) minY = g.worldY - hh;
    if (g.worldY + hh > maxY) maxY = g.worldY + hh;
    if (!firstColor && g.spriteColor) firstColor = g.spriteColor;
    count++;
  }

  if (!count) return { hasSprite: false };

  return {
    hasSprite: true,
    sizeX: Math.max(0, maxX - minX),
    sizeY: Math.max(0, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    color: firstColor || { r: 1, g: 1, b: 1, a: 1 },
    spriteCount: count,
  };
}
