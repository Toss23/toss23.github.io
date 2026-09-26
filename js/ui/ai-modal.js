import { $, el, clear } from "@core/dom.js";
import { attachBackdropDismiss } from "@ui/modal-dismiss.js";

export function initAiModal({ onLoadJson, onApply, onGenerateMap, onGenerateFullInstructions }) {
  const modal = $("ai-modal");
  const btnLoad = $("ai-load-json");
  const btnPaste = $("ai-paste-json");
  const pasteModal = $("ai-paste-modal");
  const pasteTextarea = $("ai-paste-textarea");
  const pasteError = $("ai-paste-error");
  const pasteClose = $("ai-paste-close");
  const pasteCancel = $("ai-paste-cancel");
  const pasteSubmit = $("ai-paste-submit");
  const pasteFromClipboard = $("ai-paste-from-clipboard");
  const btnMap = $("ai-generate-map");
  const btnFull = $("ai-generate-full");
  const fileInput = $("ai-json-input");
  const bodyEl = $("ai-body");
  const footerEl = $("ai-footer");
  const closeBtn = $("ai-close");
  const mapModal = $("ai-map-preview-modal");
  const mapBody = $("ai-map-preview-body");
  const mapClose = $("ai-map-preview-close");
  const mapCancel = $("ai-map-preview-cancel");
  const mapDownload = $("ai-map-preview-download");

  if (!modal) return { open() {}, showPreview() {}, showReport() {}, close() {} };

  let currentItems = [];

  function close() { modal.classList.add("hidden"); }
  if (closeBtn) closeBtn.addEventListener("click", close);

  /* ---------- Вставка JSON ---------- */

  function openPaste() {
    if (!pasteModal || !pasteTextarea) return;
    pasteTextarea.value = "";
    if (pasteError) {
      pasteError.classList.add("hidden");
      pasteError.textContent = "";
    }
    pasteModal.classList.remove("hidden");
    setTimeout(() => pasteTextarea.focus(), 50);
  }

  function closePaste() {
    if (!pasteModal) return;
    pasteModal.classList.add("hidden");
  }

  function showPasteError(msg) {
    if (!pasteError) return;
    pasteError.textContent = msg || "";
    pasteError.classList.toggle("hidden", !msg);
  }

  async function submitPaste() {
    if (!pasteTextarea) return;
    const text = pasteTextarea.value.trim();
    if (!text) {
      showPasteError("Пустое поле. Вставьте JSON.");
      return;
    }
    showPasteError("");
    try {
      await onLoadJson(text);
      closePaste();
    } catch (e) {
      showPasteError(e.message || String(e));
    }
  }

  if (btnPaste) btnPaste.addEventListener("click", openPaste);
  if (pasteClose) pasteClose.addEventListener("click", closePaste);
  if (pasteCancel) pasteCancel.addEventListener("click", closePaste);
  if (pasteSubmit) pasteSubmit.addEventListener("click", submitPaste);

  if (pasteTextarea) {
    pasteTextarea.addEventListener("input", () => {
      if (pasteError) pasteError.classList.add("hidden");
    });
    pasteTextarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitPaste();
      }
    });
  }

  if (pasteFromClipboard) {
    pasteFromClipboard.addEventListener("click", async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          showPasteError("Буфер обмена недоступен. Вставьте вручную.");
          return;
        }
        const text = await navigator.clipboard.readText();
        if (!text) {
          showPasteError("Буфер обмена пуст.");
          return;
        }
        if (pasteTextarea) {
          pasteTextarea.value = text;
          pasteTextarea.focus();
        }
        showPasteError("");
      } catch (e) {
        showPasteError("Нет доступа к буферу. Вставьте вручную.");
      }
    });
  }
  attachBackdropDismiss(modal, close);

  function openMapPreview(content, onDownload) {
    if (!mapModal || !mapBody) return;
    mapBody.value = content || "";
    mapModal.classList.remove("hidden");
    if (mapDownload) {
      mapDownload.onclick = () => {
        try { if (onDownload) onDownload(); }
        catch (e) { console.error("map download:", e); }
      };
    }
  }

  function closeMapPreview() {
    if (!mapModal) return;
    mapModal.classList.add("hidden");
  }

  if (mapClose) mapClose.addEventListener("click", closeMapPreview);
  if (mapCancel) mapCancel.addEventListener("click", closeMapPreview);
  attachBackdropDismiss(mapModal, closeMapPreview);

  if (btnMap && onGenerateMap) {
    btnMap.addEventListener("click", () => onGenerateMap());
  }

  if (btnFull && onGenerateFullInstructions) {
    btnFull.addEventListener("click", () => onGenerateFullInstructions());
  }

  if (btnLoad && fileInput) {
    btnLoad.addEventListener("click", () => { fileInput.value = ""; fileInput.click(); });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await onLoadJson(text);
      } catch (e) {
        console.error("ai: load json", e);
      } finally {
        fileInput.value = "";
      }
    });
  }

  function renderEmpty() {
    clear(bodyEl); clear(footerEl);
    bodyEl.appendChild(el("div", {
      class: "ai-empty",
      text: "Нажмите «Загрузить JSON», чтобы увидеть, какие изменения будут применены.",
    }));
  }

  function renderList(items) {
    clear(bodyEl); clear(footerEl);
    currentItems = items;

    for (const item of items) {
      const row = el("li", { class: "ai-item" });
      const label = el("label", { class: "ai-item-label" });

      const cb = el("input", { type: "checkbox", class: "ai-checkbox" });
      cb.checked = item.checked;
      cb.disabled = !item.check.ok;
      cb.addEventListener("change", () => { item.checked = cb.checked; });
      label.appendChild(cb);

      const info = el("div", { class: "ai-item-info" });
      const title = el("div", { class: "ai-item-title" });
      title.appendChild(el("span", { class: "ai-item-type", text: "[" + item.change.type + "]" }));
      title.appendChild(document.createTextNode(" "));
      title.appendChild(el("span", { class: "ai-item-path", text: item.change.path }));
      info.appendChild(title);

      const meta = el("div", { class: "ai-item-meta" });
      meta.appendChild(el("span", {
        class: "ai-item-status ai-status-" + item.check.status,
        text: item.check.status === "ok" ? "✓" : item.check.status === "warn" ? "⚠" : "✗",
      }));
      meta.appendChild(el("span", { class: "ai-item-reason", text: item.check.reason }));
      info.appendChild(meta);

      if (item.change.type === "replace" || item.change.type === "replaceAll") {
        const snip = el("details", { class: "ai-snippet" });
        snip.appendChild(el("summary", { text: "Показать фрагмент" }));
        snip.appendChild(el("div", { class: "ai-snippet-label", text: "Найти:" }));
        const pre1 = el("pre", { class: "ai-pre ai-pre-find" });
        pre1.textContent = item.change.find.slice(0, 500) + (item.change.find.length > 500 ? "\n…" : "");
        snip.appendChild(pre1);
        snip.appendChild(el("div", { class: "ai-snippet-label", text: "Заменить на:" }));
        const pre2 = el("pre", { class: "ai-pre ai-pre-replace" });
        pre2.textContent = item.change.replace.slice(0, 500) + (item.change.replace.length > 500 ? "\n…" : "");
        snip.appendChild(pre2);
        info.appendChild(snip);
      }

      if (item.change.type === "create" || item.change.type === "fullContent") {
        const snip = el("details", { class: "ai-snippet" });
        snip.appendChild(el("summary", { text: "Показать содержимое" }));
        const pre = el("pre", { class: "ai-pre ai-pre-content" });
        pre.textContent = item.change.content.slice(0, 1000) + (item.change.content.length > 1000 ? "\n…" : "");
        snip.appendChild(pre);
        info.appendChild(snip);
      }

      label.appendChild(info);
      row.appendChild(label);
      bodyEl.appendChild(row);
    }

    const applicable = items.filter(it => it.check.ok).length;
    footerEl.appendChild(el("div", {
      class: "ai-info",
      text: `Готово к применению: ${applicable} из ${items.length}`,
    }));
    footerEl.appendChild(el("div", { class: "ai-footer-spacer" }));

    const btnCancel = el("button", {
      class: "icon-btn", text: "Отмена",
      onclick: () => close(),
    });
    const btnApply = el("button", {
      class: "primary", text: "Применить выбранные",
    });
    btnApply.addEventListener("click", () => {
      const selected = currentItems
        .filter(it => it.checked && it.check.ok)
        .map(it => it.change);
      onApply(selected);
    });

    footerEl.appendChild(btnCancel);
    footerEl.appendChild(btnApply);
  }

  function renderReport(report) {
    clear(bodyEl); clear(footerEl);
    const { applied, failed } = report;

    const summary = el("div", { class: "ai-report-summary" });
    summary.appendChild(el("div", { class: "ai-report-line", text: `Применено: ${applied.length}` }));
    if (failed.length) {
      summary.appendChild(el("div", {
        class: "ai-report-line ai-report-line-error",
        text: `Не применилось: ${failed.length}`,
      }));
    }
    bodyEl.appendChild(summary);

    if (applied.length) {
      bodyEl.appendChild(el("div", { class: "ai-report-section", text: "Применённые операции:" }));
      const ul = el("ul", { class: "ai-report-list" });
      for (const it of applied) {
        ul.appendChild(el("li", { class: "ai-report-ok", text: `✓ ${it.type} · ${it.path}` }));
      }
      bodyEl.appendChild(ul);
    }

    if (failed.length) {
      bodyEl.appendChild(el("div", { class: "ai-report-section", text: "Не применилось:" }));
      const ul = el("ul", { class: "ai-report-list" });
      for (const it of failed) {
        ul.appendChild(el("li", {
          class: "ai-report-fail",
          text: `✗ ${it.change.type} · ${it.change.path} — ${it.reason}`,
        }));
      }
      bodyEl.appendChild(ul);

      const jsonForAi = { version: 1, changes: failed.map(f => f.change) };
      const jsonStr = JSON.stringify(jsonForAi, null, 2);

      const block = el("div", { class: "ai-copy-block" });
      block.appendChild(el("div", {
        class: "ai-report-section",
        text: "Скопируйте это и отправьте ИИ для исправления:",
      }));
      const ta = el("textarea", { class: "ai-copy-textarea", readonly: true });
      ta.value = jsonStr;
      block.appendChild(ta);

      const btnCopy = el("button", { class: "icon-btn", text: "📋 Скопировать JSON" });
      btnCopy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(jsonStr);
        } catch {
          ta.select(); document.execCommand("copy");
        }
        btnCopy.textContent = "✓ Скопировано";
        setTimeout(() => { btnCopy.textContent = "📋 Скопировать JSON"; }, 1500);
      });
      block.appendChild(btnCopy);
      bodyEl.appendChild(block);
    }

    footerEl.appendChild(el("button", {
      class: "primary", text: "Закрыть",
      onclick: () => close(),
    }));
  }

  renderEmpty();

  return {
    open() { modal.classList.remove("hidden"); renderEmpty(); },
    showPreview(items) { renderList(items); },
    showReport(report) { renderReport(report); },
    close,
    openMapPreview(content, onDownload) { openMapPreview(content, onDownload); },
    closeMapPreview() { closeMapPreview(); },
    openPaste() { openPaste(); },
    closePaste() { closePaste(); },
  };
}