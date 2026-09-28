// Панель отладки с логами. Открывается/закрывается кнопкой в шапке.
// Перехватывает console.log/warn/error/info и складывает в панель.
// Есть кнопка копирования в буфер обмена.
//
// Модуль создаётся один раз. Если вызвать повторно — вернёт тот же API.

let apiRef = null;

export function initConsoleOverlay() {
  if (apiRef) return apiRef;

  const panel = document.createElement("div");
  panel.id = "console-overlay";
  panel.className = "hidden";
  panel.style.cssText = [
    "position:fixed",
    "left:0", "right:0", "bottom:0",
    "max-height:50vh",
    "display:flex",
    "flex-direction:column",
    "background:rgba(0,0,0,0.9)",
    "color:#ddd",
    "z-index:99999",
    "border-top:1px solid #444",
    "font:11px/1.4 ui-monospace,Menlo,Consolas,monospace",
  ].join(";");

  const head = document.createElement("div");
  head.style.cssText = "display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #333;flex-shrink:0;";

  const title = document.createElement("span");
  title.textContent = "Console";
  title.style.cssText = "flex:1;font-weight:bold;color:#7db0f0;";
  head.appendChild(title);

  const btnCopy = document.createElement("button");
  btnCopy.type = "button";
  btnCopy.title = "Скопировать всё";
  btnCopy.textContent = "📋";
  btnCopy.style.cssText = "background:#2d2d2d;color:#ddd;border:1px solid #444;border-radius:3px;padding:4px 10px;font-size:12px;cursor:pointer;min-height:26px;";
  head.appendChild(btnCopy);

  const btnClear = document.createElement("button");
  btnClear.type = "button";
  btnClear.title = "Очистить";
  btnClear.textContent = "🗑";
  btnClear.style.cssText = "background:#2d2d2d;color:#ddd;border:1px solid #444;border-radius:3px;padding:4px 10px;font-size:12px;cursor:pointer;min-height:26px;";
  head.appendChild(btnClear);

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.title = "Закрыть";
  btnClose.textContent = "✕";
  btnClose.style.cssText = "background:#2d2d2d;color:#ddd;border:1px solid #444;border-radius:3px;padding:4px 10px;font-size:12px;cursor:pointer;min-height:26px;";
  head.appendChild(btnClose);

  panel.appendChild(head);

  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow-y:auto;padding:6px 8px;white-space:pre-wrap;word-break:break-word;-webkit-overflow-scrolling:touch;";
  panel.appendChild(body);

  document.body.appendChild(panel);

  const lines = [];
  const MAX_LINES = 1000;

  function fmtArg(a) {
    if (a instanceof Error) return a.stack || a.message || String(a);
    if (typeof a === "object" && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }

  function appendLine(kind, args) {
    const text = args.map(fmtArg).join(" ");
    lines.push(text);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    const line = document.createElement("div");
    line.style.color = kind === "error" ? "#f48771" : kind === "warn" ? "#e2c08d" : "#ddd";
    line.textContent = text;
    body.appendChild(line);
    while (body.childNodes.length > MAX_LINES) body.removeChild(body.firstChild);
    panel.scrollTop = panel.scrollHeight;
    body.scrollTop = body.scrollHeight;
  }

  // Перехват console. Оригиналы сохраняем, чтобы писать и в настоящую консоль.
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.log = function (...a) { try { appendLine("log", a); } catch {} orig.log.apply(console, a); };
  console.info = function (...a) { try { appendLine("log", a); } catch {} orig.info.apply(console, a); };
  console.warn = function (...a) { try { appendLine("warn", a); } catch {} orig.warn.apply(console, a); };
  console.error = function (...a) { try { appendLine("error", a); } catch {} orig.error.apply(console, a); };

  window.addEventListener("error", (e) => appendLine("error", ["window.error:", e.message]));
  window.addEventListener("unhandledrejection", (e) => appendLine("error", ["unhandledrejection:", e.reason]));

  function copyAll() {
    const text = lines.join("\n");
    const done = () => {
      btnCopy.textContent = "✓";
      setTimeout(() => { btnCopy.textContent = "📋"; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    done();
  }

  btnCopy.addEventListener("click", copyAll);
  btnClear.addEventListener("click", () => { body.innerHTML = ""; lines.length = 0; });
  btnClose.addEventListener("click", () => hide());

  let visible = false;

  function show() {
    if (visible) return;
    visible = true;
    panel.classList.remove("hidden");
    body.scrollTop = body.scrollHeight;
  }

  function hide() {
    if (!visible) return;
    visible = false;
    panel.classList.add("hidden");
  }

  function toggle() {
    if (visible) hide(); else show();
  }

  apiRef = { show, hide, toggle, isVisible: () => visible, copyAll };
  return apiRef;
}
