// Декодирование PSD/PSB в ImageBitmap.
//
// Каскад:
//   1. @webtoon/psd — быстрая, лёгкая, но падает на некоторых PSB.
//   2. ag-psd      — тяжелее, но читает больше форматов и даёт альфу.
//   3. Превью из Image Resources — маленькая JPEG-картинка без альфы.
//
// Кэш — в памяти на время сессии.

import { extractPsdThumbnail } from "@core/psd-preview.js";

const cache = new Map();

export async function loadPsbImage(bytes, cacheKey) {
  if (!bytes || !bytes.length) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  let bitmap = await tryWebtoon(bytes);
  if (!bitmap) {
    console.log("[psb-image] @webtoon/psd не справился, пробую ag-psd");
    bitmap = await tryAgPsd(bytes);
  }
  if (!bitmap) {
    console.log("[psb-image] ag-psd не справился, пробую встроенное превью");
    bitmap = await tryThumbnail(bytes);
  }

  if (bitmap && cacheKey) cache.set(cacheKey, bitmap);
  return bitmap;
}

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function tryWebtoon(bytes) {
  try {
    const mod = await import("https://esm.sh/@webtoon/psd@0.4.0");
    const Psd = mod.default || mod.Psd || mod;
    if (!Psd || typeof Psd.parse !== "function") return null;

    const buffer = toArrayBuffer(bytes);
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
    if (!rgba || rgba.length !== width * height * 4) return null;

    const imageData = new ImageData(rgba, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    console.log("[psb-image] @webtoon/psd ок:", width + "×" + height);
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn("[psb-image] @webtoon/psd:", e && e.message ? e.message : e);
    return null;
  }
}

async function tryAgPsd(bytes) {
  try {
    const mod = await import("https://esm.sh/ag-psd@27?bundle");
    const readPsd = mod.readPsd || (mod.default && mod.default.readPsd);
    if (typeof readPsd !== "function") {
      console.warn("[psb-image] ag-psd: readPsd не найден");
      return null;
    }

    const buffer = toArrayBuffer(bytes);
    // skipLayerImageData — не читаем пиксели слоёв, только composite.
    // useImageData: false — ag-psd сам создаёт canvas через DOM.
    const psd = readPsd(buffer, {
      skipLayerImageData: true,
      skipCompositeImageData: false,
      skipThumbnail: true,
      useImageData: false,
      useRawThumbnail: false,
    });

    let canvas = psd && psd.canvas;
    // На случай, если ag-psd вернул imageData вместо canvas.
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
