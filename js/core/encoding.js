export function b64ToUtf8(b64) {
  const bin = atob((b64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  // ignoreBOM: true сохраняет BOM как \uFEFF в строке,
  // чтобы SHA после повторного кодирования совпал с серверным.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

export function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function detectEol(text) {
  return text && text.includes("\r\n") ? "\r\n" : "\n";
}

export function toLf(text) {
  return (text || "").replace(/\r\n/g, "\n");
}

export function fromLf(text, eol) {
  // Сначала нормализуем к LF — это защищает от двойного преобразования,
  // если входные данные уже содержат \r\n.
  const lf = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return eol === "\r\n" ? lf.replace(/\n/g, "\r\n") : lf;
}

export function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const clean = (b64 || "").replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Эвристика «текст или бинарник» без падения на невалидном UTF-8.
// Считаем долю «печатных» байтов (ASCII + многобайтовый UTF-8, TAB/LF/CR).
// Если меньше 90% — считаем бинарником. Нули (>1%) — точно бинарник.
export function isProbablyText(bytes) {
  const sample = bytes.slice(0, Math.min(8192, bytes.length));
  if (sample.length === 0) return true;

  let nulCount = 0;
  let printable = 0;

  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) { nulCount++; continue; }
    if (
      b === 9 || b === 10 || b === 13 ||               // TAB, LF, CR
      (b >= 0x20 && b <= 0x7e) ||                       // ASCII printable
      b >= 0x80                                         // любой байт многобайтового UTF-8
    ) {
      printable++;
    }
  }

  if (nulCount / sample.length > 0.01) return false;
  return printable / sample.length >= 0.9;
}