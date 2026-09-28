export function initFullscreen(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  // API не поддерживается (iOS Safari, некоторые WebView) — скрываем кнопку.
  if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) {
    btn.classList.add("hidden");
    console.log("[fullscreen] API не поддерживается, кнопка скрыта");
    return;
  }

  // Подсветка активного состояния. Инжектируем один раз.
  if (!document.getElementById("fullscreen-active-style")) {
    const style = document.createElement("style");
    style.id = "fullscreen-active-style";
    style.textContent =
      "#fullscreen-btn.active{background:#3a3d41 !important;color:#fff !important;}";
    document.head.appendChild(style);
  }

  function isFs() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function update() {
    btn.textContent = "⛶";
    btn.title = isFs() ? "Выйти из полного экрана" : "На весь экран";
    btn.classList.toggle("active", isFs());
  }

  async function toggle() {
    try {
      if (isFs()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else {
          console.warn("Fullscreen API недоступен на этом устройстве");
        }
      }
    } catch (e) {
      console.warn("Fullscreen:", e);
    }
  }

  btn.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
  update();
}