import { $ } from "@core/dom.js";

export function initImageScreen() {
  const img = $("image-content");
  const pathLabel = $("image-path");
  let currentUrl = null;

  return {
    open(path, blob) {
      pathLabel.textContent = path;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(blob);
      img.src = currentUrl;
      img.alt = path;
    },
    close() {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
      img.src = "";
      pathLabel.textContent = "";
    },
  };
}