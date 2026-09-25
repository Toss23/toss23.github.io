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
  return eol === "\r\n" ? (text || "").replace(/\n/g, "\r\n") : (text || "");
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

export function isProbablyText(bytes) {
  const sample = bytes.slice(0, Math.min(8192, bytes.length));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}