import { UI } from "@core/config.js";
import { $ } from "@core/dom.js";

let node;
let timer;

export function initStatus() {
  node = $("status");
}

export function setStatus(text, isError = false) {
  if (!node) return;
  node.textContent = text;
  node.className = isError ? "error" : "";
  clearTimeout(timer);
  if (!isError && text) {
    timer = setTimeout(() => { node.textContent = ""; }, UI.STATUS_TIMEOUT_MS);
  }
}