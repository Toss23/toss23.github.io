import { $ } from "@core/dom.js";
import { tokenize, renderTokens } from "@core/csharp-highlight.js";

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
  })[c]);
}

// Подсвечиваем только строки, которые похожи на C#-код.
// Заголовки карты, дерево, метаданные, размеры — не трогаем.
function looksLikeCSharpLine(line) {
  const t = line.trim();
  if (!t) return false;

  // Заголовки Markdown
  if (/^#{1,6}\s/.test(t)) return false;
  // Метаданные шапки
  if (/^(Репозиторий|Ветка|Режим|Сгенерировано|Файлов|Общий размер):/.test(t)) return false;
  // Заголовки секций без подсветки
  if (/^(imports|exports|private|namespace|using):/.test(t)) return false;
  // Подвал
  if (t === "# Конец" || t === "Тела функций не включены.") return false;
  // Маркер не-анализа
  if (/^\([A-ZА-Я]+, не анализируется\)$/.test(t)) return false;

  // Признаки C#-кода:
  if (/^(class|struct|interface|enum|record|event)\s+/.test(t)) return true;
  if (/^(public|private|protected|internal|static|sealed|abstract|virtual|override|async)\s+/.test(t)) return true;
  if (/—\s*(свойство|поле|конструктор)/.test(t)) return true;
  // Строка с отступом и парой скобок — сигнатура метода
  if (/^\s{2,}\S/.test(line) && /[\w<>\[\],?\s]+\s+\w+\s*\(/.test(line)) return true;

  return false;
}

function highlightMapText(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  for (const line of lines) {
    if (looksLikeCSharpLine(line)) {
      try {
        const tokens = tokenize(line);
        out.push(renderTokens(tokens, null));
      } catch (e) {
        out.push(escapeHtml(line));
      }
    } else {
      out.push(escapeHtml(line));
    }
  }
  return out.join("\n");
}

export function initMapPreviewHighlight() {
  const mapModal = $("ai-map-preview-modal");
  const mapBody = $("ai-map-preview-body");
  const mapHl = $("ai-map-preview-hl");
  const mapHlCode = $("ai-map-preview-hl-code");

  if (!mapModal || !mapBody || !mapHlCode) return;

  let lastValue = null;

  function update() {
    const text = mapBody.value || "";
    if (text === lastValue) return;
    lastValue = text;
    mapHlCode.innerHTML = highlightMapText(text);
    syncScroll();
  }

  function syncScroll() {
    if (!mapHl) return;
    mapHl.scrollTop = mapBody.scrollTop;
    mapHl.scrollLeft = mapBody.scrollLeft;
  }

  mapBody.addEventListener("scroll", syncScroll);

  // ai-modal.js показывает модалку через classList.remove("hidden").
  // Ловим это событие и на следующем кадре рендерим подсветку —
  // к этому моменту value уже установлен.
  const observer = new MutationObserver(() => {
    if (!mapModal.classList.contains("hidden")) {
      requestAnimationFrame(() => requestAnimationFrame(update));
    }
  });
  observer.observe(mapModal, { attributes: true, attributeFilter: ["class"] });

  if (!mapModal.classList.contains("hidden")) update();
}
