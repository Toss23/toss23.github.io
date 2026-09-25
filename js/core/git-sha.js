export async function gitBlobShaBytes(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const full = new Uint8Array(header.length + bytes.length);
  full.set(header, 0);
  full.set(bytes, header.length);
  const hash = await crypto.subtle.digest("SHA-1", full);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function gitBlobSha(content) {
  const bytes = new TextEncoder().encode(content);
  return gitBlobShaBytes(bytes);
}

export async function gitBlobShaFromBase64(base64) {
  const clean = (base64 || "").replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return gitBlobShaBytes(bytes);
}