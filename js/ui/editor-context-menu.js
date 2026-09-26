import { $ } from "@core/dom.js";

let menuEl = null;
let cleanup = null;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement("div");
  menuEl.id = "editor-context-menu";
  menuEl.className = "editor-context-menu hidden";
  document.body.appendChild(menuEl);
  return menuEl;
}

export function initEditorContextMenu() {
  const menu = ensureMenu();

  function close() {
    if (menu.classList.contains("hidden")) return;
    menu.classList.add("hidden");
    menu.innerHTML = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.bottom = "";
    menu.style.transform = "";
    if (cleanup) { cleanup(); cleanup = null; }
  }

  function onPointerDownOutside(e) {
    if (menu.contains(e.target)) return;
    close();
  }

  return {
    open({ items, x, y, bottomLimit }) {
      menu.innerHTML = "";

      for (const it of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ecm-item";
        btn.textContent = it.text;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const fn = it.onClick;
          close();
          try { fn?.(); } catch (err) { console.error(err); }
        });
        menu.appendChild(btn);
      }

      // Показываем меню в натуральном размере, чтобы измерить.
      menu.style.left = "0px";
      menu.style.top = "0px";
      menu.style.bottom = "auto";
      menu.style.transform = "none";
      menu.classList.remove("hidden");

      const rect = menu.getBoundingClientRect();
      const margin = 8;
      const maxY = typeof bottomLimit === "number" ? bottomLimit : window.innerHeight - margin;

      // Над пальцем.
      let left = (x ?? window.innerWidth / 2) - rect.width / 2;
      let top = (y ?? window.innerHeight / 2) - rect.height - 12;

      // Если места над пальцем нет — показываем под ним.
      if (top < margin) top = (y ?? 0) + 12;

      // Не выходим за левый/правый край.
      if (left < margin) left = margin;
      if (left + rect.width > window.innerWidth - margin) {
        left = window.innerWidth - margin - rect.width;
      }

      // Не выходим за верх и низ (низ ограничен клавиатурой).
      if (top < margin) top = margin;
      if (top + rect.height > maxY) top = Math.max(margin, maxY - rect.height);

      menu.style.left = left + "px";
      menu.style.top = top + "px";

      requestAnimationFrame(() => {
        document.addEventListener("pointerdown", onPointerDownOutside, true);
        document.addEventListener("touchstart", onPointerDownOutside, true);
        cleanup = () => {
          document.removeEventListener("pointerdown", onPointerDownOutside, true);
          document.removeEventListener("touchstart", onPointerDownOutside, true);
        };
      });
    },
    close,
  };
}
