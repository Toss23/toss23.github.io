import { $ } from "@core/dom.js";

export function initHeader({ onLogout }) {
  const userInfo = $("user-info");
  const logout = $("logout");

  logout.addEventListener("click", () => onLogout());

  return {
    setUser(login) {
      userInfo.textContent = login ? `@${login}` : "";
      logout.disabled = !login;
    },
    setLoggedOut() {
      userInfo.textContent = "";
      logout.disabled = true;
    },
  };
}