import { get, set, setMany, del, delMany } from "https://esm.sh/idb-keyval@6";

const PREFIX_META = "repo:";
const PREFIX_FILES_INDEX = "files:";
const PREFIX_FILE = "file:";
const PREFIX_INDEX = "repos";

const BATCH = 500;

export function makeRepoKey(owner, name, branch) {
  return `${owner}/${name}@${branch}`;
}

/* ---------- Индекс всех копий ---------- */

async function readIndex() {
  return (await get(PREFIX_INDEX)) || [];
}

async function writeIndex(list) {
  await set(PREFIX_INDEX, list);
}

/* ---------- Чтение ---------- */

export async function listClonedRepos() {
  return readIndex();
}

export async function loadRepoMeta(key) {
  return (await get(PREFIX_META + key)) || null;
}

export async function loadFilesIndex(key) {
  return (await get(PREFIX_FILES_INDEX + key)) || [];
}

export async function getFile(key, path) {
  return (await get(PREFIX_FILE + key + ":" + path)) || null;
}

/**
 * Проверяет, есть ли в локальной копии незакоммиченные изменения.
 * Сравнивает sha и baseSha у каждого файла, учитывает isNew и pendingDeletes.
 */
export async function repoHasChanges(key) {
  const meta = await loadRepoMeta(key);
  if (!meta) return false;
  if ((meta.pendingDeletes || []).length > 0) return true;
  const idx = await loadFilesIndex(key);
  for (const f of idx) {
    if (f.isNew) return true;
    if (f.baseSha !== undefined && f.sha !== f.baseSha) return true;
  }
  return false;
}

/**
 * Проверяет, есть ли в локальной копии незакоммиченные изменения.
 * Сравнивает sha и baseSha у каждого файла, учитывает isNew и pendingDeletes.
 */
export async function repoHasChanges(key) {
  const meta = await loadRepoMeta(key);
  if (!meta) return false;
  if ((meta.pendingDeletes || []).length > 0) return true;
  const idx = await loadFilesIndex(key);
  for (const f of idx) {
    if (f.isNew) return true;
    if (f.baseSha !== undefined && f.sha !== f.baseSha) return true;
  }
  return false;
}

/* ---------- Сохранение ---------- */

export async function saveRepo(meta, files, { onProgress } = {}) {
  const key = meta.key;
  const total = files.length;

  // Файлы — батчами
  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const pairs = slice.map((f) => [PREFIX_FILE + key + ":" + f.path, f]);
    await setMany(pairs);
    onProgress?.(Math.min(i + slice.length, total), total);
  }

  // Индекс файлов
  const filesIndex = files.map((f) => ({
    path: f.path,
    sha: f.sha,
    baseSha: f.baseSha ?? f.sha,
    size: f.size ?? byteLength(f.content),
  }));
  await set(PREFIX_FILES_INDEX + key, filesIndex);

  // Мета
  await set(PREFIX_META + key, meta);

  // Общий индекс
  const idx = await readIndex();
  const i = idx.findIndex((m) => m.key === key);
  if (i >= 0) idx[i] = meta;
  else idx.push(meta);
  await writeIndex(idx);
}

export async function deleteFiles(key, paths) {
  if (!paths || paths.length === 0) return;

  // Удаляем содержимое
  const fileKeys = paths.map((p) => PREFIX_FILE + key + ":" + p);
  for (let i = 0; i < fileKeys.length; i += BATCH) {
    await delMany(fileKeys.slice(i, i + BATCH));
  }

  // Обновляем индекс
  const idx = await loadFilesIndex(key);
  const dead = new Set(paths);
  const filtered = idx.filter((f) => !dead.has(f.path));
  await set(PREFIX_FILES_INDEX + key, filtered);
}

export async function saveFile(key, file) {
  await set(PREFIX_FILE + key + ":" + file.path, file);

  const idx = await loadFilesIndex(key);
  const meta = {
    path: file.path,
    sha: file.sha,
    baseSha: file.baseSha !== undefined ? file.baseSha : file.sha,
    isNew: !!file.isNew,
    isBinary: !!file.isBinary,
    size: file.size ?? byteLength(file.content),
    _movedFrom: file._movedFrom || null,
  };
  const i = idx.findIndex((f) => f.path === file.path);
  if (i >= 0) idx[i] = meta;
  else idx.push(meta);
  await set(PREFIX_FILES_INDEX + key, idx);
}

export async function saveFiles(key, files) {
  const idx = await loadFilesIndex(key);
  const filePairs = [];
  for (const file of files) {
    filePairs.push([PREFIX_FILE + key + ":" + file.path, file]);
    const meta = {
      path: file.path,
      sha: file.sha,
      baseSha: file.baseSha !== undefined ? file.baseSha : file.sha,
      isNew: !!file.isNew,
      isBinary: !!file.isBinary,
      size: file.size ?? byteLength(file.content),
      _movedFrom: file._movedFrom || null,
    };
    const i = idx.findIndex((f) => f.path === file.path);
    if (i >= 0) idx[i] = meta;
    else idx.push(meta);
  }
  if (filePairs.length) {
    for (let i = 0; i < filePairs.length; i += BATCH) {
      await setMany(filePairs.slice(i, i + BATCH));
    }
  }
  await set(PREFIX_FILES_INDEX + key, idx);
}

export async function updateRepoMeta(key, patch) {
  const meta = await loadRepoMeta(key);
  if (!meta) return;
  Object.assign(meta, patch);
  await set(PREFIX_META + key, meta);

  const idx = await readIndex();
  const i = idx.findIndex((m) => m.key === key);
  if (i >= 0) {
    idx[i] = { ...idx[i], ...patch };
    await writeIndex(idx);
  }
}

/* ---------- Удаление ---------- */

export async function deleteRepo(key) {
  // Сначала убираем из индекса — копия больше не видна.
  const all = await readIndex();
  await writeIndex(all.filter((m) => m.key !== key));

  // Удаляем файлы батчами.
  const idx = await loadFilesIndex(key);
  const keys = idx.map((f) => PREFIX_FILE + key + ":" + f.path);
  for (let i = 0; i < keys.length; i += BATCH) {
    await delMany(keys.slice(i, i + BATCH));
  }

  await del(PREFIX_FILES_INDEX + key);
  await del(PREFIX_META + key);
}

/* ---------- Хранилище ---------- */

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); }
  catch { return null; }
}

export async function requestPersistent() {
  if (!navigator.storage?.persist) return false;
  try {
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

/* ---------- Утилиты ---------- */

function byteLength(str) {
  return new TextEncoder().encode(str).length;
}