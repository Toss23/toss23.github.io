import { $ } from "@core/dom.js";
import { attachBackdropDismiss } from "@ui/modal-dismiss.js";
import {
  getIconsEnabled, setIconsEnabled,
  getIconsStandard, setIconsStandard,
  getIconsUnity, setIconsUnity,
  getKeyboardEnabled,
  getEditorTabSize, setEditorTabSize,
  getEditorFontFamily, setEditorFontFamily,
  getEditorAutosave, setEditorAutosave,
  getEditorWordWrap, setEditorWordWrap,
  getEditorBracketHighlight, setEditorBracketHighlight,
  SETTINGS_EVENT,
} from "@core/settings.js";

export function initSettingsModal({ customKeyboard } = {}) {
  const modal = $("settings-modal");
  const closeBtn = $("settings-close");
  const doneBtn = $("settings-done");
  const cbIcons = $("settings-icons-enabled");
  const cbStandard = $("settings-icons-standard");
  const cbUnity = $("settings-icons-unity");
  const cbKeyboard = $("settings-keyboard-enabled");
  const rowStandard = $("settings-icons-standard-row");
  const rowUnity = $("settings-icons-unity-row");
  const rowKeyboard = $("settings-keyboard-row");

  const selTabSize = $("settings-editor-tab-size");
  const selFont = $("settings-editor-font");
  const cbAutosave = $("settings-editor-autosave");
  const cbWordWrap = $("settings-editor-wordwrap");
  const cbBracket = $("settings-editor-bracket");

  if (!modal) return { open() {} };

  function applyState() {
    if (cbIcons) cbIcons.checked = getIconsEnabled();
    if (cbStandard) cbStandard.checked = getIconsStandard();
    if (cbUnity) cbUnity.checked = getIconsUnity();
    if (cbKeyboard) cbKeyboard.checked = getKeyboardEnabled();

    if (selTabSize) selTabSize.value = String(getEditorTabSize());
    if (selFont) selFont.value = getEditorFontFamily();
    if (cbAutosave) cbAutosave.checked = getEditorAutosave();
    if (cbWordWrap) cbWordWrap.checked = getEditorWordWrap();
    if (cbBracket) cbBracket.checked = getEditorBracketHighlight();

    // Подпункты иконок видны только при включённом главном тумблере.
    const main = getIconsEnabled();
    if (rowStandard) rowStandard.classList.toggle("hidden", !main);
    if (rowUnity) rowUnity.classList.toggle("hidden", !main);

    // Кастомная клавиатура — только на тач-устройствах.
    if (rowKeyboard) {
      const isTouch = customKeyboard && customKeyboard.isTouch
        ? customKeyboard.isTouch()
        : true;
      rowKeyboard.classList.toggle("hidden", !isTouch);
    }
  }

  function close() { modal.classList.add("hidden"); }

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (doneBtn) doneBtn.addEventListener("click", close);
  attachBackdropDismiss(modal, close);

  if (cbIcons) {
    cbIcons.addEventListener("change", () => {
      setIconsEnabled(cbIcons.checked);
      applyState();
    });
  }
  if (cbStandard) {
    cbStandard.addEventListener("change", () => setIconsStandard(cbStandard.checked));
  }
  if (cbUnity) {
    cbUnity.addEventListener("change", () => setIconsUnity(cbUnity.checked));
  }
  if (cbKeyboard) {
    cbKeyboard.addEventListener("change", () => {
      const v = cbKeyboard.checked;
      if (customKeyboard && customKeyboard.setEnabled) {
        customKeyboard.setEnabled(v);
      }
    });
  }

  if (selTabSize) {
    selTabSize.addEventListener("change", () => {
      setEditorTabSize(parseInt(selTabSize.value, 10));
    });
  }
  if (selFont) {
    selFont.addEventListener("change", () => {
      setEditorFontFamily(selFont.value);
    });
  }
  if (cbAutosave) {
    cbAutosave.addEventListener("change", () => setEditorAutosave(cbAutosave.checked));
  }
  if (cbWordWrap) {
    cbWordWrap.addEventListener("change", () => setEditorWordWrap(cbWordWrap.checked));
  }
  if (cbBracket) {
    cbBracket.addEventListener("change", () => setEditorBracketHighlight(cbBracket.checked));
  }

  // Синхронизация с редактором: если там переключили клавиатуру —
  // обновить состояние тумблера в модалке.
  window.addEventListener(SETTINGS_EVENT, () => {
    if (cbKeyboard) cbKeyboard.checked = getKeyboardEnabled();
  });

  return {
    open() {
      applyState();
      modal.classList.remove("hidden");
    },
  };
}
