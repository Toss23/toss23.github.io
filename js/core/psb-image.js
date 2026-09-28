// Декодирование PSD/PSB в ImageBitmap.
//
// Стратегия каскадная:
//   1. Пробуем @webtoon/psd — полное изображение со всеми слоями.
//      Даёт точные пиксели, но падает на некоторых PSB-файлах.
//   2. Fallback: извлекаем встроенное JPEG-превью из секции Image Resources.
//      Photoshop обычно пишет туда маленькую картинку (256×256 или 1024×1024).
//      Качество ниже, но работает всегда, когда превью есть.
//
// Кэш — в памяти на время сессии.

import { extractPsdThumbnail } from "@core/psd-preview.js";

const cache = new Map();

export async function loadPsbImage(bytes, cacheKey) {
  if (!bytes || !bytes.length) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  // 1. Полный рендер через @webtoon/psd
  let bitmap = await tryWebtoon(bytes);

  // 2. Fallback — встроенное JPEG-превью
  if (!bitmap) {
    console.log("[psb-image] @webtoon/psd не справился, пробую встроенное превью");
    bitmap = await tryThumbnail(bytes);
  }

  if (bitmap && cacheKey) cache.set(cacheKey, bitmap);
  return bitmap;
}

async function tryWebtoon(bytes) {
  try {
    const mod = await import("https://esm.sh/@webtoon/psd@0.4.0");
    const Psd = mod.default || mod.Psd || mod;
    if (!Psd || typeof Psd.parse !== "function") {
      console.warn("[psb-image] API @webtoon/psd не найден");
      return null;
    }

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const psdFile = Psd.parse(buffer);
    const composite = await psdFile.composite();
    const width = psdFile.width;
    const height = psdFile.height;
    if (!width || !height) return null;

    let rgba = composite;
    if (composite instanceof ArrayBuffer) {
      rgba = new Uint8ClampedArray(composite);
    } else if (composite instanceof Uint8Array && !(composite instanceof Uint8ClampedArray)) {
      rgba = new Uint8ClampedArray(composite.buffer, composite.byteOffset, composite.byteLength);
    }
    if (!rgba || rgba.length !== width * height * 4) {
      console.warn("[psb-image] неожиданный размер composite:", rgba ? rgba.length : 0);
      return null;
    }

    const imageData = new ImageData(rgba, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn("[psb-image] @webtoon/psd:", e && e.message ? e.message : e);
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
