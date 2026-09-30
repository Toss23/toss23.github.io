import { $ } from "@core/dom.js";
import { formatSize } from "@core/format.js";
import { attachBackdropDismiss } from "@ui/modal-dismiss.js";
import { findUnityCacheKeys, clearUnityCache } from "@core/unity-cache.js";
import { showBusy, hideBusy } from "@ui/busy.js";

export function initRepoActionsModal({
  onOpenRemote, onOpenLocal, onClone, onDeleteLocal, onDownloadZip, dialogs,
}) {
  const modal = $("repo-actions-modal");
  const title = $("repo-actions-title");
  const btnRemote = $("repo-actions-remote");
  const btnLocal = $("repo-actions-local");
  const btnClone = $("repo-actions-clone");
  const btnDelete = $("repo-actions-delete");
  const btnZip = $("repo-actions-zip");
  const btnCancel = $("repo-actions-cancel");
  const sizeInfo = $("clone-size-info");
  const sizeFill = $("clone-size-fill");
  const sizeText = $("clone-size-text");

  let current = null;
  let clearCacheBtn = null;

  // Кнопка «Очистить кэш Unity» — создаётся из JS, вставляется перед
  // кнопкой удаления локальной копии. Показывается только если
  // для репозитория есть сохранённые карты guid'ов в IndexedDB.
  function ensureClearCacheButton() {
    if (clearCacheBtn) return clearCacheBtn;
    if (!btnDelete || !btnDelete.parentNode) return null;
    const btn = document.createElement("button");
    btn.id = "repo-actions-clear-unity-cache";
    btn.type = "button";
    btn.className = "action-row danger hidden";
    btn.textContent = "🧹 Очистить кэш Unity";
    btn.addEventListener("click", onClearCacheClick);
    btnDelete.parentNode.insertBefore(btn, btnDelete);
    clearCacheBtn = btn;
    return btn;
  }

  async function onClearCacheClick() {
    if (!current) return;
    const repo = current;
    // Модалку НЕ закрываем — оставляем под оверлеем, чтобы после
    // завершения пользователь вернулся к тому же списку действий.
    const ok = await dialogs.confirm({
      title: "Очистить кэш Unity?",
      text:
        repo.full_name + "\n\n" +
        "Будут удалены сохранённые карты guid'ов для этого репозитория. " +
        "При следующем открытии сцены Unity карта построится заново.",
      okText: "Очистить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;

    const token = showBusy("Очистка кэша Unity…");
    try {
      const removed = await clearUnityCache(repo.owner.login, repo.name);
      console.log("[unity-cache] удалено ключей:", removed, "для", repo.full_name);
      // Кэша больше нет — прячем кнопку.
      if (clearCacheBtn) {
        clearCacheBtn.textContent = "🧹 Очистить кэш Unity";
        clearCacheBtn.classList.add("hidden");
      }
    } finally {
      hideBusy(token);
    }
  }

  btnRemote.addEventListener("click", () => {
    modal.classList.add("hidden");
    current && onOpenRemote(current);
  });
  btnLocal.addEventListener("click", () => {
    modal.classList.add("hidden");
    current && onOpenLocal(current);
  });
  btnClone.addEventListener("click", () => {
    modal.classList.add("hidden");
    current && onClone(current);
  });
  btnCancel.addEventListener("click", () => modal.classList.add("hidden"));
  attachBackdropDismiss(modal, () => modal.classList.add("hidden"));

  if (btnZip) btnZip.addEventListener("click", () => {
    modal.classList.add("hidden");
    current && onDownloadZip && onDownloadZip(current);
  });

  btnDelete.addEventListener("click", async () => {
    if (!current) return;
    modal.classList.add("hidden");
    const ok = await dialogs.confirm({
      title: "Удалить локальную копию?",
      text: current.full_name,
      okText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (ok) onDeleteLocal(current);
  });

  return {
    open(repo, isCloned) {
      current = repo;
      title.textContent = repo.full_name;

      btnLocal.classList.toggle("hidden", !isCloned);
      btnDelete.classList.toggle("hidden", !isCloned);
      btnClone.classList.toggle("hidden", isCloned);

      if (!isCloned) {
        sizeInfo.classList.remove("hidden");
        sizeFill.style.width = "0%";
        sizeFill.classList.remove("danger");
        sizeText.classList.remove("danger");
        sizeText.textContent = "Расчёт размера...";

        // Пока размер не посчитан — клонировать нельзя.
        btnClone.disabled = true;
      } else {
        sizeInfo.classList.add("hidden");
        btnClone.disabled = false;
      }

      // Проверяем наличие кэша Unity для этого репо. Операция асинхронная,
      // поэтому сначала прячем кнопку, потом показываем, если кэш есть.
      const btnCache = ensureClearCacheButton();
      if (btnCache) {
        btnCache.classList.add("hidden");
        btnCache.textContent = "🧹 Очистить кэш Unity";
        const repoFullName = repo.full_name;
        findUnityCacheKeys(repo.owner.login, repo.name).then((keys) => {
          if (!current || current.full_name !== repoFullName) return;
          if (!keys || keys.length === 0) return;
          btnCache.textContent = "🧹 Очистить кэш Unity (" + keys.length + ")";
          btnCache.classList.remove("hidden");
        }).catch((e) => {
          console.warn("unity-cache check:", e);
        });
      }

      modal.classList.remove("hidden");
    },

    // Пустой репозиторий — нет ни одного коммита.
    setEmpty(repoFullName) {
      if (!current || current.full_name !== repoFullName) return;
      if (sizeInfo.classList.contains("hidden")) return;

      sizeFill.style.width = "0%";
      sizeFill.classList.remove("danger");
      sizeText.classList.remove("danger");
      sizeText.textContent = "Репозиторий пуст — нет ни одного коммита";

      // Клонировать нечего, но открыть временно можно — там можно создать первый файл.
      btnClone.disabled = true;
      btnClone.classList.add("hidden");
    },

    // Вызывается из main.js, когда размеры получены.
    setSizes(repoFullName, { repoBytes, available }) {
      if (!current || current.full_name !== repoFullName) return;
      if (sizeInfo.classList.contains("hidden")) return;

      const haveData =
        typeof repoBytes === "number" && typeof available === "number";

      if (!haveData) {
        sizeText.textContent = "Размер недоступен";
        btnClone.disabled = true;
        return;
      }

      const overflow = repoBytes > available;
      const pct = available > 0
        ? Math.min(100, (repoBytes / available) * 100)
        : (repoBytes > 0 ? 100 : 0);

      sizeFill.style.width = pct + "%";
      sizeFill.classList.toggle("danger", overflow);
      sizeText.classList.toggle("danger", overflow);

      const text = overflow
        ? `${formatSize(repoBytes)} / ${formatSize(available)} · не хватит места`
        : `${formatSize(repoBytes)} / ${formatSize(available)}`;
      sizeText.textContent = text;

      // Клонирование — только если всё посчитано и места хватает.
      btnClone.disabled = overflow;
    },
  };
}
