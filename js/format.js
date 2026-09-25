export function formatSize(bytes) {
  if (!bytes || bytes < 0) return "0 Б";
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " МБ";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " ГБ";
}