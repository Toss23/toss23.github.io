// Декодирование PSD/PSB в ImageBitmap через @webtoon/psd.
// Кэш — в памяти на время сессии (по пути к файлу).
// При любой ошибке возвращает null — вызывающий код должен иметь fallback.

const cache = new Map();

export async function loadPsbImage(bytes, cacheKey) {
  if (!bytes || !bytes.length) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const mod = await import("https://esm.sh/@webtoon/psd@0.4.0");
    const Psd = mod.default || mod.Psd || mod;
    if (!Psd || typeof Psd.parse !== "function") {
      console.warn("[psb-image] @webtoon/psd API не найден");
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
    const bitmap = await createImageBitmap(blob);
    if (cacheKey) cache.set(cacheKey, bitmap);
    return bitmap;
  } catch (e) {
    console.warn("[psb-image] ошибка:", e && e.message ? e.message : e);
    return null;
  }
}
