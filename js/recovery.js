// Аварийный режим восстановления.
// Загружается из boot.js, когда main.js не работает.
// Показывает последние коммиты через GitHub API и позволяет откатить (revert).
// Не имеет импортов — работает автономно, через fetch к api.github.com.

const APP_REPO_FALLBACK = { owner: "Toss23", repo: "toss23.github.io" };
const COMMITS_PER_PAGE = 30;

function detectAppRepo() {
  const host = (location.hostname || "").toLowerCase();
  const m = host.match(/^([a-z0-9-]+)\.github\.io$/);
  if (m) return { owner: m[1], repo: m[1] + ".github.io" };
  if (APP_REPO_FALLBACK && APP_REPO_FALLBACK.owner && APP_REPO_FALLBACK.repo) {
    return { owner: APP_REPO_FALLBACK.owner, repo: APP_REPO_FALLBACK.repo };
  }
  return null;
}

function getToken() {
  try { return localStorage.getItem("gh_token") || null; }
  catch { return null; }
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "только что";
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + " мин назад";
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " ч назад";
    return d.toLocaleDateString();
  } catch { return iso; }
}

async function gh(token, path, opts = {}) {
  const res = await fetch("https://api.github.com" + path, {
    method: opts.method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: opts.body,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try {
      const j = await res.json();
      if (j && j.message) msg += ": " + j.message;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function listCommits(token, owner, repo, branch) {
  return gh(token, `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${COMMITS_PER_PAGE}`);
}

/**
 * Создаёт новый коммит, возвращающий изменения отменяемого коммита.
 * Работает через низкоуровневые операции Git Data API:
 *  1. Берём HEAD ветки.
 *  2. Берём отменяемый коммит и его первого родителя.
 *  3. Сравниваем родителя и отменяемый — получаем список файлов.
 *  4. Строим «обратный» tree на основе HEAD tree, ссылаясь на blob-и родителя.
 *  5. Создаём коммит и двигаем ref.
 */
async function revertCommit(token, owner, repo, branch, targetSha) {
  const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  if (headSha === targetSha) {
    throw new Error("Этот коммит уже последний — откат невозможен");
  }

  const commitX = await gh(token, `/repos/${owner}/${repo}/git/commits/${targetSha}`);
  const parentSha = commitX.parents && commitX.parents[0] ? commitX.parents[0].sha : null;
  if (!parentSha) throw new Error("Нельзя отменить самый первый коммит");

  const parentTree = await gh(token, `/repos/${owner}/${repo}/git/trees/${parentSha}?recursive=1`);
  const parentBlobs = new Map();
  for (const t of parentTree.tree || []) {
    if (t.type === "blob") parentBlobs.set(t.path, t.sha);
  }

  const diff = await gh(token, `/repos/${owner}/${repo}/compare/${parentSha}...${targetSha}`);
  const files = diff.files || [];
  if (!files.length) throw new Error("Коммит не содержит изменений");

  const treeEntries = [];
  for (const f of files) {
    const path = f.filename;
    if (!path) continue;
    if (f.status === "added") {
      treeEntries.push({ path, mode: "100644", type: "blob", sha: null });
    } else if (f.status === "removed") {
      const sha = parentBlobs.get(path);
      if (sha) treeEntries.push({ path, mode: "100644", type: "blob", sha });
    } else if (f.status === "modified") {
      const sha = parentBlobs.get(path);
      if (sha) treeEntries.push({ path, mode: "100644", type: "blob", sha });
    } else if (f.status === "renamed") {
      treeEntries.push({ path, mode: "100644", type: "blob", sha: null });
      const prev = f.previous_filename;
      if (prev) {
        const sha = parentBlobs.get(prev);
        if (sha) treeEntries.push({ path: prev, mode: "100644", type: "blob", sha });
      }
    }
  }
  if (!treeEntries.length) throw new Error("Нет изменений для отката");

  const headCommit = await gh(token, `/repos/${owner}/${repo}/git/commits/${headSha}`);
  const baseTreeSha = headCommit.tree.sha;

  const newTree = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });

  const firstLine = (commitX.message || "").split("\n")[0].slice(0, 70);
  const message = `Revert "${firstLine}"\n\nThis reverts commit ${targetSha}.`;
  const newCommit = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [headSha],
    }),
  });

  await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });

  return newCommit.sha;
}

/* ---------- UI ---------- */

function injectStyles() {
  if (document.getElementById("recovery-style")) return;
  const style = document.createElement("style");
  style.id = "recovery-style";
  style.textContent = [
    "#recovery-screen{position:fixed;inset:0;z-index:2000;background:#1e1e1e;color:#ddd;display:flex;flex-direction:column;font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;}",
    ".recovery-header{display:flex;align-items:center;gap:8px;padding:12px 16px;background:#252526;border-bottom:1px solid #333;flex-shrink:0;}",
    ".recovery-header h1{flex:1;margin:0;font-size:16px;color:#ddd;}",
    ".recovery-info{padding:10px 16px;font-size:13px;color:#aaa;font-family:ui-monospace,Menlo,Consolas,monospace;border-bottom:1px solid #262626;flex-shrink:0;}",
    ".recovery-actions{display:flex;gap:6px;padding:10px 16px;background:#252526;border-bottom:1px solid #333;flex-shrink:0;flex-wrap:wrap;}",
    ".recovery-list{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;}",
    ".recovery-list li{padding:12px 16px;border-bottom:1px solid #262626;display:flex;gap:10px;align-items:center;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;}",
    ".recovery-list li:hover{background:#2a2d2e;}",
    ".recovery-list .rc-sha{color:#7db0f0;flex-shrink:0;font-size:11px;}",
    ".recovery-list .rc-msg{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".recovery-list .rc-meta{flex-shrink:0;font-size:11px;color:#888;}",
    ".recovery-list .rc-btn{flex-shrink:0;background:#6b2a2a;border:1px solid #8a3838;color:#ffcccc;padding:6px 12px;border-radius:4px;font-size:12px;cursor:pointer;min-height:32px;font-family:inherit;}",
    ".recovery-list .rc-btn:hover{background:#7d3232;}",
    ".recovery-list .rc-btn:disabled{opacity:0.4;cursor:not-allowed;}",
    ".recovery-status{padding:10px 16px;font-size:12px;color:#888;border-top:1px solid #333;text-align:center;font-family:ui-monospace,Menlo,Consolas,monospace;min-height:22px;flex-shrink:0;}",
    ".recovery-status.error{color:#f48771;}",
    ".recovery-status.ok{color:#6cc06c;}",
    ".recovery-empty{padding:40px 16px;text-align:center;color:#666;font-size:13px;}",
    ".recovery-btn{background:transparent;border:1px solid #3c3c3c;color:#ddd;border-radius:4px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit;min-height:34px;}",
    ".recovery-btn:hover{background:#2a2d2e;}",
  ].join("");
  document.head.appendChild(style);
}

function buildUI() {
  const root = document.createElement("div");
  root.id = "recovery-screen";
  root.innerHTML =
    '<div class="recovery-header">' +
      '<h1>Режим восстановления</h1>' +
      '<button id="recovery-exit" class="recovery-btn" title="Выйти">✕</button>' +
    '</div>' +
    '<div id="recovery-info" class="recovery-info"></div>' +
    '<div class="recovery-actions">' +
      '<button id="recovery-refresh" class="recovery-btn">🔄 Обновить</button>' +
      '<button id="recovery-open-app" class="recovery-btn">↩️ Вернуться в приложение</button>' +
    '</div>' +
    '<ul id="recovery-list" class="recovery-list"></ul>' +
    '<div id="recovery-status" class="recovery-status"></div>';
  return root;
}

export async function initRecovery() {
  const app = detectAppRepo();
  if (!app) {
    alert("Не удалось определить репозиторий приложения.");
    return;
  }

  const token = getToken();
  if (!token) {
    alert("Нужен токен GitHub. Войдите в приложение и попробуйте снова.");
    location.href = location.pathname;
    return;
  }

  let user;
  try {
    user = await gh(token, "/user");
  } catch (e) {
    alert("Токен не работает: " + e.message);
    return;
  }
  if (!user || !user.login || user.login.toLowerCase() !== app.owner.toLowerCase()) {
    alert("Вы не владелец этого репозитория.");
    return;
  }

  let repoInfo;
  try {
    repoInfo = await gh(token, `/repos/${app.owner}/${app.repo}`);
  } catch (e) {
    alert("Не удалось получить репозиторий: " + e.message);
    return;
  }
  const branch = repoInfo.default_branch || "main";

  injectStyles();
  const ui = buildUI();
  document.body.appendChild(ui);

  const infoEl = document.getElementById("recovery-info");
  const listEl = document.getElementById("recovery-list");
  const statusEl = document.getElementById("recovery-status");
  const refreshBtn = document.getElementById("recovery-refresh");
  const openBtn = document.getElementById("recovery-open-app");
  const exitBtn = document.getElementById("recovery-exit");

  infoEl.textContent = `${app.owner}/${app.repo} · ${branch}`;

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "recovery-status" + (kind ? " " + kind : "");
  }

  function renderCommits(commits) {
    listEl.innerHTML = "";
    if (!commits.length) {
      const empty = document.createElement("div");
      empty.className = "recovery-empty";
      empty.textContent = "Коммитов нет";
      listEl.appendChild(empty);
      return;
    }
    for (const c of commits) {
      const li = document.createElement("li");

      const sha = document.createElement("span");
      sha.className = "rc-sha";
      sha.textContent = c.sha.slice(0, 7);

      const msg = document.createElement("span");
      msg.className = "rc-msg";
      msg.textContent = (c.commit.message || "").split("\n")[0];
      msg.title = c.commit.message || "";

      const meta = document.createElement("span");
      meta.className = "rc-meta";
      meta.textContent = formatTime(c.commit.author && c.commit.author.date);

      const btn = document.createElement("button");
      btn.className = "rc-btn";
      btn.textContent = "Отменить";
      btn.addEventListener("click", () => doRevert(c, btn));

      li.appendChild(sha);
      li.appendChild(msg);
      li.appendChild(meta);
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  async function loadCommits() {
    setStatus("Загрузка коммитов…");
    try {
      const commits = await listCommits(token, app.owner, app.repo, branch);
      renderCommits(commits);
      setStatus(`Коммитов: ${commits.length}`);
    } catch (e) {
      setStatus("Ошибка: " + e.message, "error");
    }
  }

  async function doRevert(commit, btn) {
    const firstLine = (commit.commit.message || "").split("\n")[0];
    const ok = confirm(
      `Отменить коммит ${commit.sha.slice(0, 7)}?\n\n"${firstLine}"\n\n` +
      "Будет создан новый коммит, возвращающий изменения этого коммита.\n" +
      "Если файлы после него менялись кем-то ещё, возможен конфликт."
    );
    if (!ok) return;

    btn.disabled = true;
    btn.textContent = "…";
    setStatus("Откат " + commit.sha.slice(0, 7) + "…");
    try {
      const newSha = await revertCommit(token, app.owner, app.repo, branch, commit.sha);
      setStatus("Готово: новый коммит " + newSha.slice(0, 7), "ok");
      await loadCommits();
    } catch (e) {
      setStatus("Ошибка: " + e.message, "error");
      btn.disabled = false;
      btn.textContent = "Отменить";
    }
  }

  refreshBtn.addEventListener("click", loadCommits);
  openBtn.addEventListener("click", () => { location.href = location.pathname; });
  exitBtn.addEventListener("click", () => { location.href = location.pathname; });

  await loadCommits();
}
