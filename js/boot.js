const bootScreen = document.getElementById("screen-boot");
const bootList = document.getElementById("boot-list");
const bootStatus = document.getElementById("boot-status");
const bootRetry = document.getElementById("boot-retry");

function setStatus(text, isError = false) {
  if (!bootStatus) return;
  bootStatus.textContent = text;
  bootStatus.className = isError ? "error" : "";
}

function setItem(id, state, msg = "") {
  if (!bootList) return;
  const li = bootList.querySelector(`li[data-mod="${id}"]`);
  if (!li) return;
  li.classList.remove("pending", "ok", "fail");
  li.classList.add(state);
  const msgEl = li.querySelector(".msg");
  if (msgEl) msgEl.textContent = msg;
}

function hideBoot() {
  if (bootScreen) bootScreen.classList.add("hidden");
}

async function ping(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      mode: "cors",
    });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, error: e.message || String(e) };
  }
}

async function tryLoadMain() {
  setItem("core", "pending");
  try {
    await import("./main.js");
    setItem("core", "ok", "OK");
    return true;
  } catch (e) {
    setItem("core", "fail", (e.message || "не загрузился").slice(0, 80));
    return false;
  }
}

async function checkDep(id, url) {
  setItem(id, "pending");
  const res = await ping(url);
  if (res.ok) {
    setItem(id, "ok", "OK");
    return true;
  }
  if (res.status === 0) {
    setItem(id, "fail", "нет соединения");
  } else {
    setItem(id, "fail", "HTTP " + res.status);
  }
  return false;
}

async function boot() {
  if (bootRetry) bootRetry.classList.add("hidden");
  setStatus("Загрузка ядра приложения…");

  const ok = await tryLoadMain();
  if (ok) {
    hideBoot();
    return;
  }

  // Ядро не загрузилось — проверяем внешние зависимости.
  setStatus("Ядро не загрузилось. Проверяем внешние модули…", true);

  const deps = [
    { id: "octokit", url: "https://esm.sh/@octokit/rest@21" },
    { id: "idb", url: "https://esm.sh/idb-keyval@6" },
    { id: "diff", url: "https://esm.sh/diff@5" },
  ];

  let anyFail = false;
  for (const d of deps) {
    const okDep = await checkDep(d.id, d.url);
    if (!okDep) anyFail = true;
  }

  if (anyFail) {
    setStatus(
      "Часть модулей недоступна. Вероятно, нужен VPN — сайт не может " +
      "подключиться к esm.sh. Включите VPN и нажмите «Повторить».",
      true
    );
  } else {
    setStatus(
      "Внешние модули доступны, но ядро приложения не загрузилось. " +
      "Откройте консоль (F12) и пришлите первую красную строку.",
      true
    );
  }

  if (bootRetry) {
    bootRetry.classList.remove("hidden");
    bootRetry.onclick = () => location.reload();
  }
}

boot();