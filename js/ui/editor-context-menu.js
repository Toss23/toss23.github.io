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
    if (cleanup) { cleanup(); cleanup = null; }
  }

  function onPointerDownOutside(e) {
    if (menu.contains(e.target)) return;
    close();
  }

  return {
    open({ items, anchorBottom = 16 }) {
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

      menu.style.bottom = anchorBottom + "px";
      menu.style.left = "50%";
      menu.style.transform = "translateX(-50%)";

      menu.classList.remove("hidden");

      // Закрытие по тапу вне меню — со следующего кадра,
      // чтобы не закрыть сразу же на текущем touchend.
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
