// Декодирование PSD/PSB в ImageBitmap.
//
// Каскад:
//   1. @webtoon/psd — быстрая, но падает на нестандартных PSB.
//   2. ag-psd      — читает больше форматов, но тоже падает.
//   3. Превью из Image Resources — маленькая JPEG-картинка без альфы.
//   4. Собственный парсер composite — RLE/raw для 8-bit RGB/RGBA.
//
// Каждый парсер получает копию данных, чтобы неудачные попытки не влияли
// на последующие. Кэш — в памяти на время сессии.

import { extractPsdThumbnail } from "@core/psd-preview.js";

const cache = new Map();

export async function loadPsbImage(bytes, cacheKey) {
  if (!bytes || !bytes.length) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  logHeader(bytes);

  let bitmap = await tryWebtoon(bytes);
  if (!bitmap) { console.log("[psb-image] fallback → ag-psd"); bitmap = await tryAgPsd(bytes); }
  if (!bitmap) { console.log("[psb-image] fallback → превью"); bitmap = await tryThumbnail(bytes); }
  if (!bitmap) { console.log("[psb-image] fallback → собственный парсер"); bitmap = await tryOwnParser(bytes); }

  if (bitmap && cacheKey) cache.set(cacheKey, bitmap);
  return bitmap;
}

function logHeader(bytes) {
  try {
    if (bytes.length < 26) { console.warn("[psb-image] слишком мало байт:", bytes.length); return; }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sig = view.getUint32(0, false);
    const sigStr = String.fromCharCode((sig >>> 24) & 0xFF, (sig >>> 16) & 0xFF, (sig >>> 8) & 0xFF, sig & 0xFF);
    const version = view.getUint16(4, false);
    const channels = view.getUint16(12, false);
    const height = view.getUint32(14, false);
    const width = view.getUint32(18, false);
    const depth = view.getUint16(22, false);
    const colorMode = view.getUint16(24, false);
    console.log("[psb-image] header:", sigStr, "v" + version,
      "ch=" + channels, depth + "bit",
      "mode=" + colorMode, "size=" + width + "×" + height);
  } catch (e) {
    console.warn("[psb-image] logHeader:", e && e.message ? e.message : e);
  }
}

function copyBytes(bytes) {
  // Возвращает независимую копию Uint8Array. Гарантирует, что ни один
  // парсер не испортит данные для следующих.
  return new Uint8Array(bytes);
}

function toArrayBuffer(bytes) {
  const copy = copyBytes(bytes);
  return copy.buffer;
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
    if (typeof readPsd !== "function") return null;

    const buffer = toArrayBuffer(bytes);
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
    if (!canvas) return null;

    console.log("[psb-image] ag-psd ок:", canvas.width + "×" + canvas.height);
    return await createImageBitmap(canvas);
  } catch (e) {
    console.warn("[psb-image] ag-psd:", e && e.message ? e.message : e);
    return null;
  }
}

async function tryThumbnail(bytes) {
  try {
    // Превью читаем от оригинала, не от копии — extractPsdThumbnail
    // не должен ничего менять, но если меняет — не хочется влиять.
    const blob = extractPsdThumbnail(copyBytes(bytes));
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

// --- Собственный парсер composite image ---
// PSD/PSB 8-bit RGB(A), compression 0 (raw) или 1 (RLE).

async function tryOwnParser(bytes) {
  try {
    if (bytes.length < 26) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, false) !== 0x38425053) return null;
    const version = view.getUint16(4, false);
    if (version !== 1 && version !== 2) return null;
    const channels = view.getUint16(12, false);
    const height = view.getUint32(14, false);
    const width = view.getUint32(18, false);
    const depth = view.getUint16(22, false);
    const colorMode = view.getUint16(24, false);

    if (depth !== 8) { console.warn("[psb-image] own: только 8-bit, у нас " + depth + "bit"); return null; }
    if (colorMode !== 3) { console.warn("[psb-image] own: только RGB, mode=" + colorMode); return null; }
    if (channels < 3 || channels > 4) { console.warn("[psb-image] own: channels=" + channels); return null; }
    if (!width || !height) return null;
    if (width * height > 100_000_000) return null;

    let offset = 26;
    const cmLen = view.getUint32(offset, false);
    offset += 4 + cmLen;
    const irLen = view.getUint32(offset, false);
    offset += 4 + irLen;
    if (version === 2) {
      const lo = view.getUint32(offset, false);
      const hi = view.getUint32(offset + 4, false);
      offset += 8 + lo + hi * 0x100000000;
    } else {
      const lmLen = view.getUint32(offset, false);
      offset += 4 + lmLen;
    }
    if (offset + 2 > bytes.length) return null;
    const compression = view.getUint16(offset, false);
    offset += 2;

    console.log("[psb-image] own: compression=" + compression,
      "channels=" + channels, "size=" + width + "×" + height);

    const rgba = new Uint8ClampedArray(width * height * 4);

    if (compression === 0) {
      for (let c = 0; c < channels; c++) {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (offset >= bytes.length) break;
            setPx(rgba, y, x, c, bytes[offset++], width);
          }
        }
      }
    } else if (compression === 1) {
      // Длины строк RLE: PSD — uint16, PSB — uint32.
      const entrySize = version === 2 ? 4 : 2;
      const byteLengths = new Array(height * channels);
      for (let i = 0; i < height * channels; i++) {
        if (entrySize === 4) {
          byteLengths[i] = view.getUint32(offset, false);
        } else {
          byteLengths[i] = view.getUint16(offset, false);
        }
        offset += entrySize;
      }
      for (let c = 0; c < channels; c++) {
        for (let y = 0; y < height; y++) {
          const len = byteLengths[y * channels + c];
          const end = offset + len;
          let x = 0;
          while (offset < end && x < width) {
            const n = bytes[offset++];
            if (n < 128) {
              const cnt = n + 1;
              for (let i = 0; i < cnt && offset < end && x < width; i++) {
                setPx(rgba, y, x, c, bytes[offset++], width);
                x++;
              }
            } else if (n > 128) {
              const cnt = 257 - n;
              if (offset >= end) break;
              const v = bytes[offset++];
              for (let i = 0; i < cnt && x < width; i++) {
                setPx(rgba, y, x, c, v, width);
                x++;
              }
            }
          }
          offset = end;
        }
      }
    } else {
      console.warn("[psb-image] own: compression=" + compression + " не поддержан");
      return null;
    }

    // RGB (3 канала) — альфу делаем непрозрачной.
    if (channels === 3) {
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    }

    const imageData = new ImageData(rgba, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    console.log("[psb-image] own ок:", width + "×" + height);
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn("[psb-image] own parser:", e && e.message ? e.message : e);
    return null;
  }
}

function setPx(rgba, y, x, c, v, width) {
  const idx = (y * width + x) * 4;
  if (c === 0) rgba[idx] = v;
  else if (c === 1) rgba[idx + 1] = v;
  else if (c === 2) rgba[idx + 2] = v;
  else if (c === 3) rgba[idx + 3] = v;
}
