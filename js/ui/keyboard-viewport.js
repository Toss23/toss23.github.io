export function initKeyboardViewport() {
  const vv = window.visualViewport;
  if (!vv) return;

  let rafId = null;
  let timeouts = [];

  function apply() {
    const h = vv.height;
    const top = vv.offsetTop || 0;
    document.documentElement.style.setProperty("--app-height", h + "px");
    document.documentElement.style.setProperty("--app-top", top + "px");
  }

  function updateSoon() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      apply();
    });
    for (const t of timeouts) clearTimeout(t);
    timeouts = [
      setTimeout(apply, 50),
      setTimeout(apply, 150),
      setTimeout(apply, 400),
    ];
  }

  vv.addEventListener("resize", updateSoon);
  vv.addEventListener("scroll", updateSoon);
  window.addEventListener("orientationchange", () => setTimeout(updateSoon, 200));

  document.addEventListener("focusin", updateSoon, true);
  document.addEventListener("focusout", () => setTimeout(updateSoon, 80), true);
  window.addEventListener("resize", updateSoon);

  apply();
  updateSoon();
}
