// Закрытие модалки по клику на тёмный фон (вне содержимого).
// Использование:
//   attachBackdropDismiss(modalEl);
//   attachBackdropDismiss(modalEl, () => { ...кастомная логика... });
export function attachBackdropDismiss(modalEl, onClose) {
  if (!modalEl) return;
  modalEl.addEventListener("click", (e) => {
    if (e.target !== modalEl) return;
    if (typeof onClose === "function") onClose();
    else modalEl.classList.add("hidden");
  });
}
