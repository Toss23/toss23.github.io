import { $ } from "@core/dom.js";
import { readTokenFromFile } from "@api/auth.js";

export function initAuthScreen({ onToken }) {
  const tokenInput = $("token-input");
  const tokenToggle = $("token-toggle");
  const loginBtn = $("login-btn");
  const fromFileBtn = $("login-from-file");
  const fileInput = $("token-file");

  if (!tokenInput || !loginBtn || !fileInput) {
    console.error("auth-screen: не найдены элементы (token-input, login-btn, token-file)");
    return;
  }

  function normalizeToken(raw) {
    return String(raw || "").trim().replace(/\s+/g, "");
  }

  function refreshLoginState() {
    const value = normalizeToken(tokenInput.value);
    loginBtn.disabled = value.length < 10;
  }

  tokenInput.addEventListener("input", refreshLoginState);

  tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitInput();
    }
  });

  if (tokenToggle) {
    tokenToggle.addEventListener("click", () => {
      const isPassword = tokenInput.type === "password";
      tokenInput.type = isPassword ? "text" : "password";
      tokenToggle.textContent = isPassword ? "🙈" : "👁";
      tokenToggle.title = isPassword ? "Скрыть токен" : "Показать токен";
    });
  }

  function submitInput() {
    const token = normalizeToken(tokenInput.value);
    if (token.length < 10) return;
    onToken(token);
  }

  loginBtn.addEventListener("click", submitInput);

  if (fromFileBtn && fileInput) {
    fromFileBtn.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const raw = await readTokenFromFile(file);
      fileInput.value = "";
      const token = normalizeToken(raw);
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

  refreshLoginState();
  setTimeout(() => tokenInput.focus(), 100);
}
