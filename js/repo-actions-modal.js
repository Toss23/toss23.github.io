import { $ } from "./dom.js";
import { formatSize } from "./format.js";

export function initRepoActionsModal({
  onOpenRemote, onOpenLocal, onClone, onDeleteLocal, dialogs,
}) {
  const modal = $("repo-actions-modal");
  const title = $("repo-actions-title");
  const btnRemote = $("repo-actions-remote");
  const btnLocal = $("repo-actions-local");
  const btnClone = $("repo-actions-clone");
  const btnDelete = $("repo-actions-delete");
  const btnCancel = $("repo-actions-cancel");
  const sizeInfo = $("clone-size-info");
  const sizeFill = $("clone-size-fill");
  const sizeText = $("clone-size-text");

  let current = null;

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