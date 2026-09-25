import { $ } from "./dom.js";
import { readTokenFromFile } from "./auth.js";

export function initAuthScreen({ onToken }) {
  const fileInput = $("token-file");
  const loginBtn = $("login-btn");

  console.log("[auth-screen] init", {
    fileInputFound: !!fileInput,
    loginBtnFound: !!loginBtn,
  });

  if (!fileInput || !loginBtn) {
    console.error("auth-screen: нет #token-file или #login-btn в HTML");
    return;
  }

  loginBtn.addEventListener("click", () => {
    console.log("[auth-screen] login btn clicked");
    try {
      fileInput.value = "";
      fileInput.click();
      console.log("[auth-screen] fileInput.click() вызван");
    } catch (e) {
      console.error("[auth-screen] не удалось открыть диалог:", e);
    }
  });

  fileInput.addEventListener("change", async () => {
    console.log("[auth-screen] change event, файлов:", fileInput.files?.length);
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const token = await readTokenFromFile(file);
      fileInput.value = "";
      if (!token) {
        alert("Файл пустой или токен не распознан");
        return;
      }
      console.log("[auth-screen] токен получен, длина:", token.length);
      onToken(token);
    } catch (e) {
      console.error("Не удалось прочитать файл", e);
      alert("Не удалось прочитать файл: " + e.message);
    }
  });
}