import { $ } from "./dom.js";
import { readTokenFromFile } from "./auth.js";

export function initAuthScreen({ onToken }) {
  const fileInput = $("token-file");
  const loginBtn = $("login-btn");

  if (!fileInput || !loginBtn) {
    console.error("auth-screen: нет #token-file или #login-btn в HTML");
    return;
  }

  loginBtn.addEventListener("click", () => {
    // Сброс значения — иначе повторный выбор того же файла
    // не вызовет событие change.
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const token = await readTokenFromFile(file);
      fileInput.value = "";
      if (!token) {
        alert("Файл пустой или токен не распознан");
        return;
      }
      onToken(token);
    } catch (e) {
      console.error("Не удалось прочитать файл", e);
      alert("Не удалось прочитать файл: " + e.message);
    }
  });
}