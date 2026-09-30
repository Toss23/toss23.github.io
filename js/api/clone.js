import { getBranchHeadSha, getBlobRaw, listFiles } from "@api/github.js";
import { toLf, isProbablyText, bytesToBase64 } from "@core/encoding.js";

// Расширения, которые гарантированно бинарные. Определение по расширению
// надёжнее эвристики isProbablyText: PSB/PSD и прочие сжатые файлы часто
// состоят в основном из байтов >0x80, и эвристика ошибочно считает их текстом.
const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "tga", "tif", "tiff", "psd", "psb", "exr", "hdr",
  "wav", "mp3", "ogg", "aiff", "flac", "aac", "m4a", "weba",
  "mp4", "mov", "webm", "avi",
  "fbx", "obj", "dae", "blend", "max", "mb", "ma", "3ds", "skp",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "ttf", "otf", "woff", "woff2", "eot",
  "dll", "so", "dylib", "exe", "bin", "unitypackage",
]);

function isBinaryPath(path) {
  const name = String(path || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXT.has(name.slice(dot + 1));
}

export async function cloneRepo(octokit, { owner, name, branch, onProgress }) {
  const headSha = await getBranchHeadSha(octokit, owner, name, branch);
  const tree = await listFiles(octokit, owner, name, branch);
  const files = [];
  const total = tree.length;
  const totalBytes = tree.reduce((s, f) => s + (f.size || 0), 0);
  let done = 0;
  let bytes = 0;

  const queue = [...tree];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      try {
        // Читаем blob как байты — getBlobRaw возвращает Blob,
        // не декодируя в UTF-8.
        const blob = await getBlobRaw(octokit, owner, name, entry.sha);
        const buf = await blob.arrayBuffer();
        const raw = new Uint8Array(buf);

        // Бинарник определяем двумя способами:
        //   1. По расширению — надёжно для известных типов.
        //   2. По эвристике — для всего остального.
        const byExt = isBinaryPath(entry.path);
        const isBinary = byExt || !isProbablyText(raw);

        let content;
        let baseContentLf;
        if (isBinary) {
          content = bytesToBase64(raw);
          baseContentLf = "";
        } else {
          content = new TextDecoder("utf-8", { ignoreBOM: true }).decode(raw);
          baseContentLf = toLf(content);
        }

        files.push({
          path: entry.path,
          sha: entry.sha,
          baseSha: entry.sha,
          size: entry.size || 0,
          content,
          baseContentLf,
          isBinary,
        });
      } catch (e) {
        console.warn("skip", entry.path, e.message);
      }
      done++;
      bytes += entry.size || 0;
      onProgress?.(done, total, bytes, totalBytes);
    }
  });

  await Promise.all(workers);

  return { headSha, files, totalBytes };
}

export async function checkRemoteHead(octokit, { owner, name, branch }) {
  return getBranchHeadSha(octokit, owner, name, branch);
}
