export function initKeyboardViewport() {
  const vv = window.visualViewport;
  if (!vv) return;

  function update() {
    document.documentElement.style.setProperty("--app-height", vv.height + "px");
  }

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 150));
  update();
}
