const bootScreen = document.getElementById("screen-boot");
const bootList = document.getElementById("boot-list");
const bootStatus = document.getElementById("boot-status");
const bootRetry = document.getElementById("boot-retry");

// Резервный адрес репозитория приложения. Используется, если hostname
// не вида *.github.io. Должен совпадать с APP_REPO в js/core/config.js.
const APP_REPO_FALLBACK = { owner: "Toss23", repo: "toss23.github.io" };

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
      method: "GET", cache: "no-store", signal: ctrl.signal, mode: "cors",
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
  if (res.ok) { setItem(id, "ok", "OK"); return true; }
  if (res.status === 0) setItem(id, "fail", "нет соединения");
  else setItem(id, "fail", "HTTP " + res.status);
  return false;
}

// ---- Восстановление: определение владельца сайта ----

// Владелец GitHub Pages-сайта выводится из hostname.
// Для «user page» вида owner.github.io — это owner.
// Кастомные домены не поддержаны (вернёт null).
function detectAppRepo() {
  const host = (location.hostname || "").toLowerCase();
  const m = host.match(/^([a-z0-9-]+)\.github\.io$/);
  if (m) return { owner: m[1], repo: m[1] + ".github.io" };
  if (APP_REPO_FALLBACK && APP_REPO_FALLBACK.owner && APP_REPO_FALLBACK.repo) {
    return { owner: APP_REPO_FALLBACK.owner, repo: APP_REPO_FALLBACK.repo };
  }
  return null;
}

function getStoredToken() {
  try { return localStorage.getItem("gh_token") || null; }
  catch { return null; }
}

async function fetchGhUser(token) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Ищем репозиторий сайта и проверяем право push.
// Кандидаты: owner.github.io (user page) и первый сегмент пути (project page).
async function findSiteRepo(token, app) {
  const candidates = [app.repo];
  // Если сайт раздаётся как project page, в URL есть сегмент с именем репо.
  const seg = (location.pathname || "/").replace(/^\/+/, "").split("/")[0];
  if (seg && seg !== "index.html" && !seg.includes(".") && seg !== app.repo) {
    candidates.push(seg);
  }
  for (const repo of candidates) {
    try {
      const res = await fetch(
        "https://api.github.com/repos/" + app.owner + "/" + repo,
        {
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.permissions && data.permissions.push) {
        return { repo, branch: data.default_branch || "main" };
      }
    } catch {}
  }
  return null;
}

function showRecoveryButton(owner, repo, branch) {
  if (document.getElementById("boot-recovery")) return;

  const link = document.createElement("a");
  link.id = "boot-recovery";
  link.href = "https://github.com/" + owner + "/" + repo + "/commits/" + branch;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "🔗 Открыть историю коммитов на GitHub";
  link.style.cssText = [
    "display:inline-block",
    "margin-top:12px",
    "padding:10px 16px",
    "border-radius:6px",
    "background:#2d7d3a",
    "color:#fff",
    "text-decoration:none",
    "font-weight:600",
    "font-size:14px",
  ].join(";");

  const parent = (bootRetry && bootRetry.parentNode) || bootScreen;
  if (!parent) return;
  if (bootRetry && bootRetry.nextSibling) {
    parent.insertBefore(link, bootRetry.nextSibling);
  } else {
    parent.appendChild(link);
  }
}

// Показывает кнопку восстановления, если залогиненный пользователь —
// владелец сайта и имеет права на запись в репозиторий.
async function tryShowRecovery() {
  const app = detectAppRepo();
  if (!app) return;
  const token = getStoredToken();
  if (!token) return;

  const user = await fetchGhUser(token);
  if (!user || !user.login) return;
  if (user.login.toLowerCase() !== app.owner.toLowerCase()) return;

  const target = await findSiteRepo(token, app);
  if (!target) return;

  showRecoveryButton(app.owner, target.repo, target.branch);
}

async function boot() {
  if (bootRetry) bootRetry.classList.add("hidden");
  setStatus("Загрузка ядра приложения…");

  const ok = await tryLoadMain();
  if (ok) { hideBoot(); return; }

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

  // Если залогинен владелец сайта — добавить кнопку восстановления,
  // ведущую на историю коммитов GitHub.
  try { await tryShowRecovery(); } catch (e) { console.warn("recovery:", e); }
}

boot();