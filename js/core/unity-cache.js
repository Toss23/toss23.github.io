// Утилиты для работы с кэшем Unity-префабов в IndexedDB.
// Константы префикса и версии должны совпадать с теми, что использует
// js/api/unity-prefabs.js при формировании ключей.
//
// Здесь нет зависимости от парсера YAML — модуль лёгкий и подключается
// в repo-actions-modal для проверки и очистки кэша.

import { keys as idbKeys, del as idbDel } from "https://esm.sh/idb-keyval@6";

export const UNITY_CACHE_PREFIX = "unity_prefabs:";
export const UNITY_CACHE_VERSION = "v3";

function startsWithCachePrefix(key) {
  if (typeof key !== "string") return false;
  return key.startsWith(UNITY_CACHE_PREFIX + UNITY_CACHE_VERSION + ":");
}

function matchesRepo(key, owner, name) {
  if (!startsWithCachePrefix(key)) return false;
  const lower = key.toLowerCase();
  return lower.includes(String(owner).toLowerCase()) &&
         lower.includes(String(name).toLowerCase());
}

// Возвращает список ключей кэша, относящихся к репозиторию.
export async function findUnityCacheKeys(owner, name) {
  try {
    const all = await idbKeys();
    return all.filter((k) => matchesRepo(k, owner, name));
  } catch (e) {
    console.warn("unity-cache: не удалось прочитать ключи", e);
    return [];
  }
}

// Удаляет все ключи кэша репозитория. Возвращает число удалённых.
export async function clearUnityCache(owner, name) {
  const found = await findUnityCacheKeys(owner, name);
  let removed = 0;
  for (const k of found) {
    try { await idbDel(k); removed++; } catch {}
  }
  return removed;
}
