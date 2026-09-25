import { diffLines } from "https://esm.sh/diff@5";

export function computeLineDiff(oldText, newText) {
  const parts = diffLines(oldText, newText);
  let added = 0, removed = 0;
  for (const p of parts) {
    const lines = p.count || 0;
    if (p.added) added += lines;
    else if (p.removed) removed += lines;
  }
  return { parts, added, removed };
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);

export function renderDiffHtml(parts) {
  let html = "";
  for (const p of parts) {
    const cls = p.added ? "add" : p.removed ? "rem" : "ctx";
    const prefix = p.added ? "+" : p.removed ? "-" : " ";
    const lines = p.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    for (const line of lines) {
      html += `<div class="diff-line ${cls}">${prefix} ${esc(line)}</div>`;
    }
  }
  return html;
}