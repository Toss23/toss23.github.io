import { $ } from "@core/dom.js";
import { attachBackdropDismiss } from "@ui/modal-dismiss.js";

export function initUpdateModal({ onUpdate, onKeepLocal }) {
  const modal = $("update-modal");
  const title = $("update-modal-title");
  const text = $("update-modal-text");
  const btnYes = $("update-yes");
  const btnNo = $("update-no");

  let ctx = null;

  btnYes.addEventListener("click", () => { modal.classList.add("hidden"); ctx && onUpdate(ctx); });
  btnNo.addEventListener("click", () => { modal.classList.add("hidden"); ctx && onKeepLocal(ctx); });

  attachBackdropDismiss(modal, () => {
    modal.classList.add("hidden");
    ctx = null;
  });

  return {
    open(context) {
      ctx = context;
      const { dirtyCount } = context;
      title.textContent = "Есть обновления на GitHub";
      text.textContent = dirtyCount > 0
        ? `На GitHub появились новые коммиты. У вас ${dirtyCount} изменённых файлов — они не будут затронуты, если не конфликтуют с серверными.`
        : "На GitHub появились новые коммиты. Подтянуть изменения в локальную копию?";
      modal.classList.remove("hidden");
    },
  };
}