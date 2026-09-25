import { $, el, clear } from "./dom.js";

export function initDialogs() {
  const modal = $("dialog-modal");
  const titleEl = $("dialog-title");
  const textEl = $("dialog-text");
  const actionsEl = $("dialog-actions");
  const inputEl = $("dialog-input");

  let resolver = null;
  let context = null;

  function close(result) {
    modal.classList.add("hidden");
    const r = resolver;
    resolver = null;
    context = null;
    if (r) r(result);
  }

  // Закрытие по клику на фон — только для alert-режима.
  modal.addEventListener("click", (e) => {
    if (e.target === modal && context?.dismissible) close(true);
  });

  function open({ title, text, buttons, dismissible = false, input = null }) {
    return new Promise((resolve) => {
      resolver = resolve;
      context = { dismissible };

      titleEl.textContent = title || "";
      textEl.textContent = text || "";
      textEl.classList.toggle("hidden", !text);

      if (input) {
        inputEl.classList.remove("hidden");
        inputEl.placeholder = input.placeholder || "";
        inputEl.value = input.initial || "";
        inputEl.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = inputEl.value.trim();
            if (v) close(v);
          } else if (e.key === "Escape") {
            close(null);
          }
        };
      } else {
        inputEl.classList.add("hidden");
        inputEl.onkeydown = null;
        inputEl.value = "";
      }

      clear(actionsEl);
      for (const b of buttons) {
        const btn = el("button", {
          text: b.text,
          class: [b.kind === "primary" ? "primary" : "", b.kind === "danger" ? "danger" : ""]
            .filter(Boolean).join(" "),
          onclick: () => close(b.value),
        });
        actionsEl.appendChild(btn);
      }

      modal.classList.remove("hidden");
      setTimeout(() => {
        if (input) inputEl.focus();
        else {
          const first = actionsEl.querySelector("button");
          if (first) first.focus();
        }
      }, 50);
    });
  }

  // Синхронный вариант без Promise — для случаев, когда важно
  // сохранить user gesture (например, вызов input.click()).
  function openRaw({ title, text, buttons }) {
    titleEl.textContent = title || "";
    textEl.textContent = text || "";
    textEl.classList.toggle("hidden", !text);
    inputEl.classList.add("hidden");

    clear(actionsEl);
    for (const b of buttons) {
      const btn = el("button", {
        text: b.text,
        class: [b.kind === "primary" ? "primary" : "", b.kind === "danger" ? "danger" : ""]
          .filter(Boolean).join(" "),
      });
      btn.addEventListener("click", () => {
        modal.classList.add("hidden");
        try { b.onClick(); } catch (e) { console.error(e); }
      });
      actionsEl.appendChild(btn);
    }
    modal.classList.remove("hidden");
  }

  return {
    choose({ title = "Выбор", text = "", options = [] } = {}) {
      openRaw({
        title,
        text,
        buttons: options.map((o) => ({
          text: o.text,
          kind: o.kind,
          onClick: o.onClick,
        })),
      });
    },

    confirm({
      title = "Подтверждение",
      text = "",
      okText = "ОК",
      cancelText = "Отмена",
      danger = false,
    } = {}) {
      return open({
        title, text,
        buttons: [
          { text: cancelText, value: false },
          { text: okText, value: true, kind: danger ? "danger" : "primary" },
        ],
        dismissible: false,
      });
    },

    alert({
      title = "Внимание",
      text = "",
      okText = "ОК",
    } = {}) {
      return open({
        title, text,
        buttons: [{ text: okText, value: true, kind: "primary" }],
        dismissible: true,
      });
    },

    prompt({
      title = "Введите значение",
      text = "",
      placeholder = "",
      initial = "",
      okText = "Создать",
      cancelText = "Отмена",
    } = {}) {
      return open({
        title, text,
        input: { placeholder, initial },
        buttons: [
          { text: cancelText, value: null },
          { text: okText, value: "__PROMPT_OK__", kind: "primary" },
        ],
        dismissible: true,
      }).then((v) => {
        if (v === "__PROMPT_OK__") return inputEl.value.trim() || null;
        return null;
      });
    },
  };
}