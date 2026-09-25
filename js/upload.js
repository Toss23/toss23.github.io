import { setDirty } from "./store.js";
import { bytesToBase64, isProbablyText } from "./encoding.js";
import * as storage from "./storage.js";

export async function readUploadedFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length === 0) {
    return { content: "", isBinary: false, size: 0 };
  }

  if (isProbablyText(bytes)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { content: text, isBinary: false, size: bytes.length };
  }

  return { content: bytesToBase64(bytes), isBinary: true, size: bytes.length };
}

export async function saveUploadedEntry({ mode, cloned, path, data }) {
  const entry = {
    path,
    content: data.content,
    isBinary: data.isBinary,
    sha: null,
    baseSha: null,
    baseContentLf: data.isBinary ? "" : data.content,
    size: data.size,
    isNew: true,
  };

  if (mode === "local" && cloned) {
    await storage.saveFile(cloned.key, entry);
  }
  if (!data.isBinary) {
    setDirty(path, data.content);
  }

  return entry;
}