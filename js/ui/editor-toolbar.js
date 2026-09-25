import { $ } from "@core/dom.js";

const STORAGE_KEY = "editor_font_size";
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

export function initEditorToolbar({ editorScreen }) {
  const btnFind = $("btn-editor-find");
  const btnReplace = $("btn-editor-replace");
  const btnSettings = $("btn-editor-settings");

  const panel = $("editor-find-panel");
  const findInput = $("editor-find-input");
  const replaceInput = $("editor-replace-input");
  const btnPrev = $("editor-find-prev");
  const btnNext = $("editor-find-next");
  const btnClose = $("editor-find-close");
  const btnReplaceOne = $("editor-replace-one");
  const btnReplaceAll = $("editor-replace-all");

  const settingsModal = $("editor-settings-modal");
  const settingsClose = $("editor-settings-close");
  const settingsDone = $("editor-settings-done");
  const slider = $("editor-font-size");
  const sliderValue = $("editor-font-size-value");

  let matches = [];
  let cursor = -1;
  let panelMode = null;

  /* ---------- Размер шрифта ---------- */

  function applyFontSize(size) {
    const v = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
    document.documentElement.style.setProperty("--editor-font-size", v + "px");
    if (sliderValue) sliderValue.textContent = String(v);
    if (slider) slider.value = String(v);
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch {}
  }

  function loadFontSize() {
    let v = DEFAULT_FONT_SIZE;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n)) v = n;
      }
    } catch {}
    applyFontSize(v);
  }

  /* ---------- Панель поиска ---------- */

  function showPanel(mode) {
    if (!panel) return;
    panelMode = mode;
    panel.classList.remove("hidden");
    panel.classList.toggle("replace-mode", mode === "replace");
    if (replaceInput) replaceInput.classList.toggle("hidden", mode !== "replace");
    if (btnReplaceOne) btnReplaceOne.classList.toggle("hidden", mode !== "replace");
    if (btnReplaceAll) btnReplaceAll.classList.toggle("hidden", mode !== "replace");
    if (findInput) {
      findInput.focus();
      findInput.select();
    }
  }

  function hidePanel() {
    if (!panel) return;
    panel.classList.add("hidden");
    panelMode = null;
    matches = [];
    cursor = -1;
    if (editorScreen && editorScreen.focus) editorScreen.focus();
  }

  function computeMatches() {
    const q = (findInput && findInput.value) || "";
    if (!q) { matches = []; cursor = -1; return; }
    const text = editorScreen.getContent();
    const lc = text.toLowerCase();
    const ql = q.toLowerCase();
    matches = [];
    let i = 0;
    while (true) {
      i = lc.indexOf(ql, i);
      if (i === -1) break;
      matches.push({ start: i, end: i + q.length });
      i += q.length || 1;
    }
    if (cursor >= matches.length) cursor = -1;
  }

  function gotoNext() {
    computeMatches();
    if (!matches.length) return;
    cursor = (cursor + 1) % matches.length;
    const m = matches[cursor];
    editorScreen.selectRange(m.start, m.end);
  }

  function gotoPrev() {
    computeMatches();
    if (!matches.length) return;
    cursor = (cursor - 1 + matches.length) % matches.length;
    const m = matches[cursor];
    editorScreen.selectRange(m.start, m.end);
  }

  function replaceOne() {
    const q = (findInput && findInput.value) || "";
    const r = (replaceInput && replaceInput.value) || "";
    if (!q) return;
    const text = editorScreen.getContent();
    const idx = text.indexOf(q, cursor >= 0 && matches[cursor] ? matches[cursor].start : 0);
    if (idx === -1) return;
    const next = text.slice(0, idx) + r + text.slice(idx + q.length);
    editorScreen.setContent(next);
    matches = [];
    cursor = -1;
    gotoNext();
  }

  function replaceAll() {
    const q = (findInput && findInput.value) || "";
    const r = (replaceInput && replaceInput.value) || "";
    if (!q) return;
    const text = editorScreen.getContent();
    const next = text.split(q).join(r);
    editorScreen.setContent(next);
    matches = [];
    cursor = -1;
  }

  /* ---------- Подключения ---------- */

  if (btnFind) btnFind.addEventListener("click", () => showPanel("find"));
  if (btnReplace) btnReplace.addEventListener("click", () => showPanel("replace"));
  if (btnClose) btnClose.addEventListener("click", hidePanel);
  if (btnNext) btnNext.addEventListener("click", gotoNext);
  if (btnPrev) btnPrev.addEventListener("click", gotoPrev);
  if (btnReplaceOne) btnReplaceOne.addEventListener("click", replaceOne);
  if (btnReplaceAll) btnReplaceAll.addEventListener("click", replaceAll);

  if (findInput) {
    findInput.addEventListener("input", () => { matches = []; cursor = -1; });
    findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? gotoPrev() : gotoNext(); }
      else if (e.key === "Escape") { e.preventDefault(); hidePanel(); }
    });
  }
  if (replaceInput) {
    replaceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); replaceOne(); }
      else if (e.key === "Escape") { e.preventDefault(); hidePanel(); }
    });
  }

  if (btnSettings) {
    btnSettings.addEventListener("click", () => {
      if (!settingsModal) return;
      loadFontSize();
      settingsModal.classList.remove("hidden");
    });
  }
  const closeSettings = () => settingsModal && settingsModal.classList.add("hidden");
  if (settingsClose) settingsClose.addEventListener("click", closeSettings);
  if (settingsDone) settingsDone.addEventListener("click", closeSettings);
  if (slider) {
    slider.addEventListener("input", () => {
      const v = parseInt(slider.value, 10);
      if (!Number.isNaN(v)) applyFontSize(v);
    });
  }

  loadFontSize();

  return { hidePanel, applyFontSize };
}
