export function initFullscreen(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  function update() {
    btn.textContent = document.fullscreenElement ? "⤡" : "⤢";
    btn.title = document.fullscreenElement ? "Выйти из полного экрана" : "На весь экран";
  }

  btn.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      console.warn("Fullscreen:", e);
    }
  });

  document.addEventListener("fullscreenchange", update);
  update();
}