// Разбор заголовка PSD/PSB и извлечение встроенного JPEG-превью.
// Браузеры не умеют рисовать PSD/PSB нативно, но Photoshop обычно
// кладёт в файл маленькое превью (ресурс 1033 или 1036 в секции
// Image Resources). Его и показываем.

const PSD_SIGNATURE = 0x38425053; // "8BPS"
const RES_SIGNATURE = 0x3842494D; // "8BIM"

// Ресурсы превью. 1033 — Photoshop 4.0, 1036 — Photoshop 5.0+.
// У PSB используется тот же формат ресурсов.
const THUMB_RES_IDS = new Set([1033, 1036]);
const THUMB_HEADER_BYTES = 28;

export function readPsdInfo(bytes) {
  if (!bytes || bytes.length < 26) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, false) !== PSD_SIGNATURE) return null;
  const version = view.getUint16(4, false);
  if (version !== 1 && version !== 2) return null;

  return {
    version,                              // 1 = PSD, 2 = PSB
    channels: view.getUint16(12, false),
    height: view.getUint32(14, false),
    width: view.getUint32(18, false),
    depth: view.getUint16(22, false),
    colorMode: view.getUint16(24, false),
  };
}

export function extractPsdThumbnail(bytes) {
  const info = readPsdInfo(bytes);
  if (!info) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 26; // после заголовка

  // Секция Color Mode Data.
  if (offset + 4 > bytes.length) return null;
  const colorModeLen = view.getUint32(offset, false);
  offset += 4 + colorModeLen;
  if (offset + 4 > bytes.length) return null;

  // Секция Image Resources.
  const resourcesLen = view.getUint32(offset, false);
  offset += 4;
  const resourcesEnd = offset + resourcesLen;
  if (resourcesEnd > bytes.length) return null;

  let thumbnail = null;

  while (offset + 12 <= resourcesEnd) {
    if (view.getUint32(offset, false) !== RES_SIGNATURE) break;
    offset += 4;

    const id = view.getUint16(offset, false);
    offset += 2;

    // Pascal-строка имени, выровненная до чётного размера
    // (включая байт длины). Пустое имя — 2 байта нулей.
    if (offset >= resourcesEnd) break;
    const nameLen = bytes[offset];
    offset += 1 + nameLen;
    if ((1 + nameLen) % 2 !== 0) offset += 1;

    if (offset + 4 > resourcesEnd) break;
    const dataLen = view.getUint32(offset, false);
    offset += 4;
    if (offset + dataLen > resourcesEnd) break;

    if (THUMB_RES_IDS.has(id) && dataLen > THUMB_HEADER_BYTES) {
      const jpegStart = offset + THUMB_HEADER_BYTES;
      const jpegEnd = offset + dataLen;
      // Проверяем сигнатуру JPEG (FF D8), чтобы не подсунуть мусор.
      if (
        jpegEnd - jpegStart > 2 &&
        bytes[jpegStart] === 0xFF && bytes[jpegStart + 1] === 0xD8
      ) {
        const jpegBytes = bytes.slice(jpegStart, jpegEnd);
        thumbnail = new Blob([jpegBytes], { type: "image/jpeg" });
      }
    }

    offset += dataLen;
    if (dataLen % 2 !== 0) offset += 1; // padding до чётного
  }

  return thumbnail;
}
