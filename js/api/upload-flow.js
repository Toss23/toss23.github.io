// Загрузка файлов с устройства: одиночные файлы и папки.
// Все функции, отвечающие за процесс загрузки, вынесены из main.js.
// Модуль принимает зависимости через initUploadFlow.

import { getState, setState, removeDeleted } from "@core/store.js";
import * as storage from "@core/storage.js";
import { detectEol, fromLf } from "@core/encoding.js";
import { gitBlobSha, gitBlobShaFromBase64 } from "@core/git-sha.js";
import { readUploadedFile, saveUploadedEntry } from "@api/upload.js";

// Импорт git-sha отдельно — там есть gitBlobSha, но он не из encoding.
import { gitBlobSha as shaFromString, gitBlobShaFromBase64 as shaFromBase64 } from "@core/git-sha.js";

export function initUploadFlow({
  dialogs,
  progressBar,
  setStatus,
  renderFiles,
}) {

  async function handleUploadSelection(e) {
    const selected = [...(e.target.files || [])];
    if (!selected.length) return;

    const entries = selected.map((file) => {
      const rel = (file.webkitRelativePath || "").trim();
      return { file, path: rel || file.name };
    });

    e.target.value = "";

    await processUploadedEntries(entries);
  }

  async function computeUploadedSha(data, eol) {
    if (data.isBinary) {
      return shaFromBase64(data.content);
    }
    return shaFromString(fromLf(data.content, eol || "\n"));
  }

  async function isUploadedSameAsExisting({ mode, cloned, path, data, fileEntry }) {
    if (!fileEntry) return false;

    let currentSha = null;
    let currentIsBinary = !!fileEntry.isBinary;
    let currentEol = fileEntry.eol || "\n";

    if (mode === "local" && cloned) {
      const entry = await storage.getFile(cloned.key, path);
      if (!entry) return false;
      currentSha = entry.sha;
      currentIsBinary = !!entry.isBinary;
      if (!currentIsBinary) {
        currentEol = detectEol(entry.content) || "\n";
      }
    } else {
      currentSha = fileEntry.sha;
    }

    if (!currentSha) return false;
    if (currentIsBinary !== !!data.isBinary) return false;

    const newSha = await computeUploadedSha(data, currentEol);
    return newSha === currentSha;
  }

  async function processUploadedEntries(entries) {
    if (!entries.length) return;

    const { mode, cloned, currentPath } = getState();
    if (!mode) return;

    const base = (currentPath || "").replace(/\/+$/, "");

    progressBar.show(`Загрузка: 0 / ${entries.length}`);

    const added = [];
    let done = 0;
    let skipped = 0;
    let replaceAll = false;
    let skipAll = false;
    let cancelled = false;

    try {
      for (const entry of entries) {
        if (cancelled) break;

        const rel = (entry.path || entry.file?.name || "").trim();
        const clean = rel.split("/").filter(Boolean).join("/");
        if (!clean) { done++; continue; }
        const path = base ? `${base}/${clean}` : clean;

        const currentFiles = getState().files;
        const existsInFiles = currentFiles.some((f) => f.path === path);
        const existsInAdded = added.some((f) => f.path === path);
        const isDeleted = getState().deleted.has(path);
        const conflict = (existsInFiles || existsInAdded) && !isDeleted;

        if (conflict) {
          if (skipAll) {
            skipped++;
            done++;
            progressBar.update(done, entries.length);
            continue;
          }
          if (!replaceAll) {
            const decision = await askReplace(path);
            if (decision === "cancel") { cancelled = true; break; }
            if (decision === "replace-all") replaceAll = true;
            else if (decision === "skip-all") skipAll = true;
            else if (decision === "skip") {
              skipped++;
              done++;
              progressBar.update(done, entries.length);
              continue;
            }
          }
        }

        const data = await readUploadedFile(entry.file);

        if (existsInFiles && !isDeleted) {
          const existingEntry = getState().files.find((f) => f.path === path);
          const same = await isUploadedSameAsExisting({
            mode, cloned, path, data, fileEntry: existingEntry,
          });
          if (same) {
            skipped++;
            done++;
            progressBar.update(done, entries.length);
            continue;
          }
        }

        if (isDeleted) {
          removeDeleted(path);
          if (mode === "local" && cloned) {
            const newPending = (cloned.pendingDeletes || []).filter((p) => p !== path);
            cloned.pendingDeletes = newPending;
            await storage.updateRepoMeta(cloned.key, { pendingDeletes: newPending });
          }
        }

        if (existsInFiles) {
          setState({ files: getState().files.filter((f) => f.path !== path) });
        }
        if (existsInAdded) {
          const i = added.findIndex((f) => f.path === path);
          if (i >= 0) added.splice(i, 1);
        }

        await saveUploadedEntry({ mode, cloned, path, data });

        added.push({
          path,
          sha: null,
          baseSha: null,
          size: data.size,
          isNew: true,
          isBinary: data.isBinary,
          eol: "\n",
          content: data.isBinary ? data.content : null,
        });

        done++;
        progressBar.update(done, entries.length);
      }

      if (added.length) {
        setState({ files: [...getState().files, ...added] });
        renderFiles();
      }

      const parts = [`Загружено: ${added.length}`];
      if (skipped) parts.push(`пропущено: ${skipped}`);
      if (cancelled) parts.push("прервано");
      setStatus(parts.join(" · "));
    } catch (err) {
      setStatus("Ошибка загрузки: " + err.message, true);
    } finally {
      progressBar.hide();
    }
  }

  function askReplace(path) {
    return new Promise((resolve) => {
      dialogs.choose({
        title: "Файл уже существует",
        text: path,
        options: [
          { text: "Заменить", kind: "primary", onClick: () => resolve("replace") },
          { text: "Заменить все", onClick: () => resolve("replace-all") },
          { text: "Пропустить", onClick: () => resolve("skip") },
          { text: "Пропустить все", onClick: () => resolve("skip-all") },
        ],
        onDismiss: () => resolve("cancel"),
      });
    });
  }

  return { handleUploadSelection, processUploadedEntries };
}
