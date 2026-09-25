import { getBranchHeadSha, compareCommits, getBlobBySha } from "./github.js";
import * as storage from "./storage.js";

/**
 * Инкрементальный pull локальной копии.
 * Качает только файлы, изменившиеся с момента последнего headSha.
 * Файлы с локальными правками не трогает — они уходят в conflicts.
 */
export async function pullRepo(octokit, cloned, { onProgress } = {}) {
  const { owner, name, branch, key, headSha: baseHead } = cloned;

  const remoteHead = await getBranchHeadSha(octokit, owner, name, branch);
  if (remoteHead === baseHead) {
    return { newHeadSha: remoteHead, updated: 0, added: 0, removed: 0, conflicts: [] };
  }

  const diff = await compareCommits(octokit, owner, name, baseHead, remoteHead);
  const files = diff.files || [];

  const filesIndex = await storage.loadFilesIndex(key);

  // Локальные правки — эти файлы не трогаем.
  const localChanges = new Set();
  for (const f of filesIndex) {
    if (f.isNew) localChanges.add(f.path);
    else if (f.sha !== f.baseSha) localChanges.add(f.path);
  }

  const conflicts = [];
  const toSave = [];
  const toDelete = [];
  let updated = 0, added = 0, removed = 0;
  let done = 0;
  const total = files.length;

  for (const f of files) {
    const path = f.filename;
    const status = f.status;
    const isLocal = localChanges.has(path);

    try {
      if (status === "removed") {
        if (isLocal) {
          conflicts.push({ path, reason: "удалён на сервере, есть локальные правки" });
        } else {
          toDelete.push(path);
          removed++;
        }
      } else if (status === "renamed") {
        const oldPath = f.previous_filename;
        if (isLocal || (oldPath && localChanges.has(oldPath))) {
          conflicts.push({ path: oldPath || path, reason: "переименован на сервере" });
        } else {
          if (oldPath) toDelete.push(oldPath);
          const content = await getBlobBySha(octokit, owner, name, f.sha);
          toSave.push({
            path, content, sha: f.sha, baseSha: f.sha,
            baseContentLf: content, size: content.length,
          });
          added++;
        }
      } else if (status === "added" || status === "modified") {
        if (isLocal) {
          // Обновляем только base — свои правки оставляем.
          const entry = await storage.getFile(key, path);
          if (entry && !entry.isNew) {
            const content = await getBlobBySha(octokit, owner, name, f.sha);
            entry.baseSha = f.sha;
            entry.baseContentLf = content;
            toSave.push(entry);
            conflicts.push({ path, reason: "изменён и локально, и на сервере — база обновлена" });
          }
        } else {
          const content = await getBlobBySha(octokit, owner, name, f.sha);
          toSave.push({
            path, content, sha: f.sha, baseSha: f.sha,
            baseContentLf: content, size: content.length,
          });
          if (status === "added") added++; else updated++;
        }
      }
    } catch (e) {
      console.warn("pull:", path, e.message);
    }

    done++;
    onProgress?.(done, total);
  }

  if (toSave.length) await storage.saveFiles(key, toSave);
  if (toDelete.length) await storage.deleteFiles(key, toDelete);

  await storage.updateRepoMeta(key, { headSha: remoteHead });

  return { newHeadSha: remoteHead, updated, added, removed, conflicts };
}