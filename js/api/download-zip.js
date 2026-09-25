import { zip } from "https://esm.sh/fflate@0.8.2?bundle=all";
import { getBlobRaw } from "@api/github.js";
import * as storage from "@core/storage.js";
import { base64ToBytes } from "@core/encoding.js";

export async function buildRepoZip({
  octokit, owner, name, branch, mode, cloned,
  files, dirty, deleted, onProgress,
}) {
  const items = {};
  let done = 0;
  const total = files.length;

  for (const f of files) {
    if (!deleted.has(f.path)) {
      try {
        let bytes = null;

        // 1. Несохранённые правки (текст, LF).
        if (dirty.has(f.path)) {
          bytes = new TextEncoder().encode(dirty.get(f.path));
        }
        // 2. Local — из IndexedDB.
        else if (mode === "local" && cloned) {
          const entry = await storage.getFile(cloned.key, f.path);
          if (entry) {
            bytes = entry.isBinary
              ? base64ToBytes(entry.content)
              : new TextEncoder().encode(entry.content);
          }
        }

        // 3. Remote — тянем с GitHub.
        if (!bytes && f.sha && octokit) {
          const blob = await getBlobRaw(octokit, owner, name, f.sha);
          const buf = await blob.arrayBuffer();
          bytes = new Uint8Array(buf);
        }

        if (bytes) items[f.path] = bytes;
      } catch (e) {
        console.warn("zip:", f.path, e.message);
      }
    }
    done++;
    onProgress?.(done, total, f.path);
  }

  return new Promise((resolve, reject) => {
    zip(items, { level: 6 }, (err, data) => {
      if (err) return reject(err);
      resolve(new Blob([data], { type: "application/zip" }));
    });
  });
}
