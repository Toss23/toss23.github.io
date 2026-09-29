// Декодирование PSD/PSB в ImageBitmap. Используется только ag-psd.
// Fallback — встроенное JPEG-превью из Image Resources (на случай,
// если ag-psd почему-то упадёт).
// Кэш — в памяти, ключ — путь к файлу.

import { extractPsdThumbnail } from "@core/psd-preview.js";

const cache = new Map();

export async function loadPsbImage(bytes, cacheKey) {
  if (!bytes || !bytes.length) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  let bitmap = await tryAgPsd(bytes);
  if (!bitmap) {
    console.log("[psb-image] ag-psd не справился, пробую превью");
    bitmap = await tryThumbnail(bytes);
  }

  if (bitmap && cacheKey) cache.set(cacheKey, bitmap);
  return bitmap;
}

async function tryAgPsd(bytes) {
  try {
    const mod = await import("https://esm.sh/ag-psd@27?bundle");
    const readPsd = mod.readPsd || (mod.default && mod.default.readPsd);
    if (typeof readPsd !== "function") {
      console.warn("[psb-image] ag-psd: readPsd не найден");
      return null;
    }

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const psd = readPsd(buffer, {
      skipLayerImageData: true,
      skipCompositeImageData: false,
      skipThumbnail: true,
      useImageData: false,
      useRawThumbnail: false,
    });

    let canvas = psd && psd.canvas;
    if (!canvas && psd && psd.imageData) {
      const id = psd.imageData;
      canvas = document.createElement("canvas");
      canvas.width = id.width;
      canvas.height = id.height;
      canvas.getContext("2d").putImageData(id, 0, 0);
    }
    if (!canvas) {
      console.warn("[psb-image] ag-psd: composite пустой");
      return null;
    }

    console.log("[psb-image] ag-psd ок:", canvas.width + "×" + canvas.height);
    return await createImageBitmap(canvas);
  } catch (e) {
    console.warn("[psb-image] ag-psd:", e && e.message ? e.message : e);
    return null;
  }
}

async function tryThumbnail(bytes) {
  try {
    const blob = extractPsdThumbnail(bytes);
    if (!blob) {
      console.warn("[psb-image] встроенного превью нет");
      return null;
    }
    const bitmap = await createImageBitmap(blob);
    console.log("[psb-image] превью:", bitmap.width + "×" + bitmap.height);
    return bitmap;
  } catch (e) {
    console.warn("[psb-image] превью не удалось:", e && e.message ? e.message : e);
    return null;
  }
}
