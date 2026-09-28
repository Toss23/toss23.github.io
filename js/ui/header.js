import { $ } from "@core/dom.js";

export function initHeader({ onLogout }) {
  const userInfo = $("user-info");
  const logout = $("logout");

  logout.addEventListener("click", () => onLogout());

  const consoleBtn = document.getElementById("console-btn");

  return {
    setUser(login) {
      userInfo.textContent = login ? `@${login}` : "";
      logout.disabled = !login;
    },
    setLoggedOut() {
      userInfo.textContent = "";
      logout.disabled = true;
    },
    setConsoleVisible(visible) {
      if (!consoleBtn) return;
      consoleBtn.classList.toggle("hidden", !visible);
    },
    getConsoleButton() {
      return consoleBtn;
    },
  };
}