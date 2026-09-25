import { $ } from "./dom.js";
import { readTokenFromFile } from "./auth.js";

export function initAuthScreen({ onToken }) {
  const fileInput = $("token-file");
  const loginBtn = $("login-btn");

  loginBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const token = await readTokenFromFile(file);
      fileInput.value = "";
      if (token) onToken(token);
    } catch (e) {
      console.error("Не удалось прочитать файл", e);
    }
  });
}