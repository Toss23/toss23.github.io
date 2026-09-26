import {
  getState, setState, subscribe,
  setDirty, removeDirty, clearDirty,
  setDeleted, removeDeleted, clearDeleted,
  setSelectionMode, toggleSelection,
  setRemoteChanges, clearRemoteChanges,
  addTab, removeTab, setActiveTab, clearTabs,
} from "@core/store.js";
import { gitBlobSha, gitBlobShaFromBase64 } from "@core/git-sha.js";
import { detectEol, toLf, fromLf, base64ToBytes, bytesToBase64 } from "@core/encoding.js";
import { formatSize } from "@core/format.js";

import { loadToken, saveToken, clearToken, createClient, fetchUser } from "@api/auth.js";
import {
  listRepos, listBranches, listFiles, getFile,
  compareCommits, listCommits, getCommit, getBlobRaw,
  initEmptyRepo,
} from "@api/github.js";
import { commitFiles } from "@api/commit.js";
import { readUploadedFile, saveUploadedEntry } from "@api/upload.js";
import { buildRepoZip } from "@api/download-zip.js";
import { cloneRepo, checkRemoteHead } from "@api/clone.js";
import { pullRepo } from "@api/pull.js";
import { revertCommit } from "@api/revert.js";

import { initStatus, setStatus } from "@ui/status.js";
import { initHeader } from "@ui/header.js";
import { initNav } from "@ui/nav.js";
import { initDialogs } from "@ui/dialogs.js";
import { initProgressBar } from "@ui/progress-bar.js";
import { initFullscreen } from "@ui/fullscreen.js";
import { initDropZone } from "@ui/drop-zone.js";
import { showBusy, hideBusy, updateBusyText, forceHideBusy } from "@ui/busy.js";
import { initHistoryModal } from "@ui/history-modal.js";
import { initRepoActionsModal } from "@ui/repo-actions-modal.js";
import { initUpdateModal } from "@ui/update-modal.js";
import { initAiModal } from "@ui/ai-modal.js";
import { parseJson, checkChange, applyChange } from "@api/ai-patches.js";
import { parseFile, renderProjectMap, isAnalyzable, hasServiceFolder } from "@api/project-map.js";
import { initEditorTabs } from "@ui/editor-tabs.js";
import { initMapSelectModal } from "@ui/map-select-modal.js";
import { initEditorKeybar } from "@ui/editor-keybar.js";
import { initCustomKeyboard } from "@ui/custom-keyboard.js";
import { initKeyboardViewport } from "@ui/keyboard-viewport.js";

import { initAuthScreen } from "@screens/auth-screen.js";
import { initReposScreen } from "@screens/repos-screen.js";
import { initFilesScreen } from "@screens/files-screen.js";
import { initEditorScreen } from "@screens/editor-screen.js";
import { initEditorToolbar } from "@ui/editor-toolbar.js";
import { initEditorContextMenu } from "@ui/editor-context-menu.js";
import { initMapPreviewHighlight } from "@ui/map-preview-highlight.js";
import { initHistoryScreen } from "@screens/history-screen.js";
import { initImageScreen } from "@screens/image-screen.js";
import { initCommitScreen } from "@screens/commit-screen.js";

import { SCREENS, isImagePath } from "@core/config.js";
import * as storage from "@core/storage.js";

/* ---------- Утилиты ---------- */

function isEmptyRepoError(e) {
  if (!e) return false;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("repository is empty") ||
         msg.includes("git repository is empty") ||
         (e.status === 409 && msg.includes("empty"));
}

/* ---------- Инициализация ---------- */

initStatus();
initKeyboardViewport();
initFullscreen("fullscreen-btn");
const progressBar = initProgressBar();
const dialogs = initDialogs();

const header = initHeader({ onLogout: confirmLogout });
const nav = initNav({ onExitRepo: exitRepo, onBack: goBack, onCommit: openCommit });
initAuthScreen({ onToken: login });

const reposScreen = initReposScreen({ onSelect: handleRepoSelect });
const filesScreen = initFilesScreen({
  onOpenFolder: openFolder,
  onOpenFile: openFile,
  onBranchChange: selectBranch,
  onCreateMenu: openCreateMenu,
  onMoreMenu: openMoreMenu,
  onEnterSelection: enterSelection,
  onCancelSelection: cancelSelection,
  onToggleSelect: (path) => {
    toggleSelection(path);
    renderFiles();
  },
  onConfirmDelete: confirmDeleteSelected,
  onOpenHistory: openHistory,
  onRename: renameSelected,
  onDownload: downloadSelected,
  onMove: moveSelected,
  onMoveFile: moveEntry,
  onLongPressSelect: (path) => {
    const { selectionMode } = getState();
    if (selectionMode) return;
    setSelectionMode(true);
    toggleSelection(path);
    renderFiles();
  },
});

/* ---------- Загрузка с устройства ---------- */

const uploadInput = document.getElementById("upload-input");
const btnUpload = document.getElementById("btn-upload");
const uploadFolderInput = document.getElementById("upload-folder-input");

const supportsFolderUpload = (() => {
  const probe = document.createElement("input");
  probe.type = "file";
  const hasProp = "webkitdirectory" in probe || "directory" in probe;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent || "");
  return hasProp && !isMobile;
})();

function openUploadDialog() {
  if (!supportsFolderUpload) {
    uploadInput.value = "";
    uploadInput.click();
    return;
  }

  dialogs.choose({
    title: "Что загрузить?",
    text:
      "Файлы — можно выбрать несколько.\n" +
      "Папка — загрузится вся структура внутри.",
    options: [
      {
        text: "📄 Файлы",
        onClick: () => {
          uploadInput.value = "";
          uploadInput.click();
        },
      },
      {
        text: "📁 Папку",
        kind: "primary",
        onClick: () => {
          uploadFolderInput.value = "";
          uploadFolderInput.click();
        },
      },
    ],
  });
}

function openCreateMenu() {
  const { mode } = getState();
  if (!mode) return;
  dialogs.choose({
    title: "Создать",
    onDismiss: () => {},
    options: [
      { text: "📄 Создать файл", onClick: () => createFile() },
      { text: "📁 Создать папку", onClick: () => createFolder() },
      { text: "📤 Загрузить", kind: "primary", onClick: () => openUploadDialog() },
      { text: "Отмена", onClick: () => {} },
    ],
  });
}

function openMoreMenu() {
  const { mode, files } = getState();
  if (!mode) return;
  dialogs.choose({
    title: "Другое",
    onDismiss: () => {},
    options: [
      {
        text: "📦 Скачать архив (ZIP)",
        onClick: () => {
          if (!files.length) return;
          downloadRepoZip();
        },
      },
      { text: "Отмена", onClick: () => {} },
    ],
  });
}

if (uploadInput) uploadInput.addEventListener("change", handleUploadSelection);
if (uploadFolderInput) uploadFolderInput.addEventListener("change", handleUploadSelection);

const dropZone = initDropZone({
  isActive: () => {
    const s = getState();
    return !!s.mode && s.screen === SCREENS.FILES;
  },
  onFiles: (entries) => processUploadedEntries(entries),
});

const aiModal = initAiModal({
  onLoadJson: async (text) => {
    isPasteInProgress = true;
    try {
      return await handleAiJsonLoad(text);
    } finally {
      isPasteInProgress = false;
    }
  },
  onApply: handleAiApply,
  onGenerateMap: handleGenerateProjectMap,
  onGenerateFullInstructions: handleGenerateFullInstructions,
});



const btnAi = document.getElementById("btn-ai");
if (btnAi) {
  btnAi.addEventListener("click", () => {
    if (!getState().mode) return;
    aiModal.open();
  });
}

const editorScreen = initEditorScreen({
  onStateChange: handleEditorState,
  onSave: saveFileToLocal,
  onRevert: confirmRevertFile,
  onAutosave: handleAutosave,
  onContextMenu: showEditorContextMenu,
});

const customKeyboard = initCustomKeyboard({
  editorScreen,
  onVisibilityChange: () => refreshNav(),
});

initEditorToolbar({ editorScreen, customKeyboard });

const editorContextMenu = initEditorContextMenu();

initMapPreviewHighlight();

const editorTabs = initEditorTabs({
  onSwitch: switchTab,
  onClose: closeTab,
});

const mapSelectModal = initMapSelectModal();
const commitScreen = initCommitScreen({
  onSubmit: commit,
  onCancel: () => {},
  onRevertAll: revertAll,
});
const repoActionsModal = initRepoActionsModal({
  onOpenRemote: openRepoRemote,
  onOpenLocal: openRepoLocal,
  onClone: cloneAndOpen,
  onDeleteLocal: deleteLocalCopy,
  onDownloadZip: downloadRepoZip,
  dialogs,
});
const updateModal = initUpdateModal({
  onUpdate: async (ctx) => {
    dismissedRemoteSha = null;
    await runPull(ctx);
  },
  onKeepLocal: (ctx) => {
    if (ctx.auto) {
      dismissedRemoteSha = ctx.remoteSha;
    } else {
      enterLocalMode(ctx.repo, ctx.meta);
    }
  },
});

const historyScreen = initHistoryScreen({
  onOpenCommit: openHistoryCommit,
  onBack: () => { setScreen(SCREENS.FILES); renderFiles(); },
  onRefresh: () => openHistory(),
});

const historyModal = initHistoryModal({ onRevert: handleRevertCommit });

const imageScreen = initImageScreen();

/* ---------- Авто-проверка обновлений в local ---------- */

let localWatchTimer = null;
let dismissedRemoteSha = null;
let pullInProgress = false; // just a test

function startLocalWatch() {
  stopLocalWatch();
  localWatchTimer = setInterval(localWatchTick, 15000);
}

function stopLocalWatch() {
  if (localWatchTimer) {
    clearInterval(localWatchTimer);
    localWatchTimer = null;
  }
  dismissedRemoteSha = null;
}

async function localWatchTick() {
  // Идёт pull — не открываем окно повторно.
  if (pullInProgress) return;

  const { mode, cloned, screen, octokit, repo, branch } = getState();
  if (mode !== "local" || !cloned || !octokit || !repo) return;
  if (screen !== SCREENS.FILES && screen !== SCREENS.EDITOR && screen !== SCREENS.HISTORY) return;

  // Не открываем новое окно, пока висит предыдущее.
  const modal = document.getElementById("update-modal");
  if (modal && !modal.classList.contains("hidden")) return;

  // Оверлей блокировки — тоже стоп.
  const busy = document.getElementById("busy-overlay");
  if (busy && !busy.classList.contains("hidden")) return;

  try {
    const remoteSha = await checkRemoteHead(octokit, {
      owner: repo.owner, name: repo.name, branch,
    });
    if (!remoteSha) return;
    if (remoteSha === cloned.headSha) return;
    if (remoteSha === dismissedRemoteSha) return;

    const repoLike = {
      owner: { login: repo.owner },
      name: repo.name,
      full_name: repo.fullName,
      default_branch: repo.defaultBranch,
    };

    updateModal.open({
      repo: repoLike,
      meta: cloned,
      remoteSha,
      dirtyCount: getState().dirty.size,
      auto: true,
    });
  } catch (e) {
    console.warn("localWatch:", e.message);
  }
}

/* ---------- Экраны ---------- */

const SCREEN_IDS = {
  [SCREENS.AUTH]: "screen-auth",
  [SCREENS.REPOS]: "screen-repos",
  [SCREENS.FILES]: "screen-files",
  [SCREENS.EDITOR]: "screen-editor",
  [SCREENS.HISTORY]: "screen-history",
  [SCREENS.IMAGE]: "screen-image",
};

function refreshNav() {
  const s = getState().screen;
  const isAppScreen = s === SCREENS.FILES || s === SCREENS.EDITOR ||
                      s === SCREENS.HISTORY || s === SCREENS.IMAGE;
  if (!isAppScreen) {
    nav.setVisible(false);
    return;
  }
  // На экране редактора — скрыть nav, если кастомная клавиатура видна.
  if (s === SCREENS.EDITOR && customKeyboard && customKeyboard.isVisible && customKeyboard.isVisible()) {
    nav.setVisible(false);
    return;
  }
  nav.setVisible(true);
}

function setScreen(name) {
  for (const [key, id] of Object.entries(SCREEN_IDS)) {
    document.getElementById(id).classList.toggle("hidden", key !== name);
  }
  document.getElementById("app-header").classList.toggle("hidden", name === SCREENS.AUTH);
  setState({ screen: name });
  // refreshNav вызывается после обновления state.
  refreshNav();
}

/* ---------- Навигация ---------- */

async function goBack() {
  const { screen, currentPath } = getState();

  if (screen === SCREENS.IMAGE) {
    imageScreen.close();
    setState({ openFile: null });
    setScreen(SCREENS.FILES);
    renderFiles();
    return;
  }

  if (screen === SCREENS.HISTORY) {
    setScreen(SCREENS.FILES);
    renderFiles();
    return;
  }

  if (screen === SCREENS.EDITOR) {
    await maybeAutoSave();
    editorScreen.close();
    setState({ openFile: null });
    setScreen(SCREENS.FILES);
    renderFiles();
    return;
  }

  if (screen === SCREENS.FILES) {
    if (currentPath) {
      const parts = currentPath.split("/").filter(Boolean);
      parts.pop();
      const parent = parts.length ? parts.join("/") + "/" : "";
      setState({ currentPath: parent });
      renderFiles();
    } else {
      exitRepo();
    }
  }
}

async function refreshRepoDirty() {
  const { repos, clonedMap } = getState();
  const clones = await storage.listClonedRepos();
  const dirtySet = new Set();
  for (const c of clones) {
    const fullName = `${c.owner}/${c.name}`;
    try {
      const hasChanges = await storage.repoHasChanges(c.key);
      if (hasChanges) dirtySet.add(fullName);
    } catch {}
  }
  setState({ clonedDirty: dirtySet });
  reposScreen.setRepos(repos, clonedMap, dirtySet);
}

async function exitRepo() {
  stopLocalWatch();
  await maybeAutoSave();
  if (!(await confirmDiscard())) return;
  clearTabs();
  renderTabs();
  editorScreen.close();
  setState({
    repo: null, branch: null, branches: [], files: [],
    currentPath: "", openFile: null,
    mode: null, cloned: null, base: new Map(), baseHeadSha: null,
  });
  clearDirty();
  clearDeleted();
  clearRemoteChanges();
  setSelectionMode(false);
  setScreen(SCREENS.REPOS);
  // Обновляем список — у текущего репо может теперь быть или не быть изменений.
  refreshRepoDirty();
}

async function maybeAutoSave() {
  const { mode, openFile, dirty } = getState();
  if (mode !== "local" || !openFile) return;
  if (!dirty.has(openFile.path)) return;
  await saveFileToLocal(openFile.path, dirty.get(openFile.path));
}

/* ---------- Авторизация ---------- */

async function login(token) {
  if (!token) return;
  setStatus("Проверка токена...");
  try {
    const octokit = createClient(token);
    const user = await fetchUser(octokit);
    saveToken(token);
    setState({ octokit, user });
    header.setUser(user.login);

    const persistent = await storage.requestPersistent();
    console.log("Persistent storage:", persistent);

    setScreen(SCREENS.REPOS);
    await loadAllRepos();
  } catch (e) {
    setStatus("Ошибка токена: " + e.message, true);
    clearToken();
    header.setLoggedOut();
    setScreen(SCREENS.AUTH);
  }
}

function logout() {
  stopLocalWatch();
  clearToken();
  clearTabs();
  renderTabs();
  editorScreen.close();
  Object.assign(getState(), {
    octokit: null, user: null, repos: [], clonedMap: new Map(),
    repo: null, branch: null, branches: [], files: [],
    currentPath: "", openFile: null, mode: null, cloned: null,
    base: new Map(), baseHeadSha: null,
  });
  clearDirty();
  clearDeleted();
  clearRemoteChanges();
  setSelectionMode(false);
  reposScreen.reset();
  setState({ clonedDirty: new Set() });
  header.setLoggedOut();
  setScreen(SCREENS.AUTH);
}

/* ---------- Репозитории ---------- */

async function loadAllRepos() {
  setStatus("Загрузка репозиториев...");
  const [list, clones, est] = await Promise.all([
    listRepos(getState().octokit),
    storage.listClonedRepos(),
    storage.estimateStorage(),
  ]);

  const clonedMap = new Map();
  const dirtySet = new Set();
  for (const c of clones) {
    const fullName = `${c.owner}/${c.name}`;
    clonedMap.set(fullName, c.totalBytes || 0);
    try {
      const hasChanges = await storage.repoHasChanges(c.key);
      if (hasChanges) dirtySet.add(fullName);
    } catch (e) {
      console.warn("repoHasChanges:", fullName, e.message);
    }
  }

  setState({ repos: list, clonedMap, clonedDirty: dirtySet });
  reposScreen.setRepos(list, clonedMap, dirtySet);

  if (est) {
    setStatus(
      `Репозиториев: ${list.length} · кэш: ${formatSize(est.usage)} / ${formatSize(est.quota)}`
    );
  } else {
    setStatus(`Репозиториев: ${list.length}`);
  }
}

async function handleRepoSelect(repo) {
  const key = storage.makeRepoKey(repo.owner.login, repo.name, repo.default_branch);
  const meta = await storage.loadRepoMeta(key);

  if (meta) {
    repoActionsModal.open(repo, true);
    return;
  }

  const { octokit } = getState();

  let isEmpty = false;
  try {
    await checkRemoteHead(octokit, {
      owner: repo.owner.login, name: repo.name, branch: repo.default_branch,
    });
  } catch (e) {
    if (isEmptyRepoError(e)) isEmpty = true;
    else console.warn("Проверка репо:", e.message);
  }

  if (isEmpty) {
    const ok = await dialogs.confirm({
      title: "Пустой репозиторий",
      text:
        `${repo.full_name}\n\n` +
        "В нём нет ни одного коммита. Инициализировать? " +
        "Будет создан файл README.md и первый коммит в ветке " +
        `${repo.default_branch}.`,
      okText: "Инициализировать",
      cancelText: "Выйти",
    });
    if (!ok) return;

    progressBar.show("Инициализация репозитория...");
    try {
      const sha = await initEmptyRepo(
        octokit,
        repo.owner.login, repo.name, repo.default_branch
      );
      setStatus(`Инициализировано: ${sha.slice(0, 7)}`);
    } catch (e) {
      setStatus("Ошибка инициализации: " + e.message, true);
      progressBar.hide();
      return;
    }
    progressBar.hide();

    repoActionsModal.open(repo, false);

    try {
      const [tree, est] = await Promise.all([
        listFiles(octokit, repo.owner.login, repo.name, repo.default_branch),
        storage.estimateStorage(),
      ]);

      const repoBytes = tree.reduce((s, f) => s + (f.size || 0), 0);
      const available = est ? Math.max(0, est.quota - est.usage) : 0;

      repoActionsModal.setSizes(repo.full_name, { repoBytes, available });
    } catch (e) {
      console.warn("Не удалось оценить размер:", e);
      repoActionsModal.setSizes(repo.full_name, {});
    }
    return;
  }

  repoActionsModal.open(repo, false);

  try {
    const [tree, est] = await Promise.all([
      listFiles(octokit, repo.owner.login, repo.name, repo.default_branch),
      storage.estimateStorage(),
    ]);

    const repoBytes = tree.reduce((s, f) => s + (f.size || 0), 0);
    const available = est ? Math.max(0, est.quota - est.usage) : 0;

    repoActionsModal.setSizes(repo.full_name, { repoBytes, available });
  } catch (e) {
    console.warn("Не удалось оценить размер:", e);
    repoActionsModal.setSizes(repo.full_name, {});
  }
}

/* ---------- Режим 1: remote ---------- */

async function openRepoRemote(repo) {
  stopLocalWatch();
  if (!(await confirmDiscard())) return;
  clearTabs();
  renderTabs();
  const { octokit } = getState();

  setState({
    mode: "remote", cloned: null, base: new Map(), baseHeadSha: null,
    repo: {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
    },
    branch: null, branches: [], files: [], currentPath: "", openFile: null,
  });
  clearDirty();
  clearDeleted();
  clearRemoteChanges();
  setSelectionMode(false);
  editorScreen.close();

  setStatus(`Загрузка веток ${repo.full_name}...`);

  let branches = [];
  try {
    branches = await listBranches(octokit, repo.owner.login, repo.name);
  } catch (e) {
    if (isEmptyRepoError(e)) {
      setStatus("Репозиторий пуст — нет ни одного коммита", true);
      setState({
        branches: [{ name: repo.default_branch }],
        branch: repo.default_branch,
        baseHeadSha: null,
        files: [],
      });
      setScreen(SCREENS.FILES);
      renderFiles();
      return;
    }
    setStatus("Ошибка загрузки веток: " + e.message, true);
    return;
  }

  let baseHeadSha = null;
  try {
    baseHeadSha = await checkRemoteHead(octokit, {
      owner: repo.owner.login, name: repo.name, branch: repo.default_branch,
    });
  } catch (e) {
    if (!isEmptyRepoError(e)) {
      console.warn("checkRemoteHead:", e.message);
    }
  }

  setState({ branches, branch: repo.default_branch, baseHeadSha });

  try {
    await loadTree();
  } catch (e) {
    if (isEmptyRepoError(e)) {
      setState({ files: [] });
      setStatus("Репозиторий пуст", false);
    } else {
      setStatus("Ошибка загрузки дерева: " + e.message, true);
    }
  }

  setScreen(SCREENS.FILES);
  renderFiles();
}

async function selectBranch(branch) {
  if (branch === getState().branch) return;
  const { mode, octokit, repo } = getState();

  if (mode === "local") {
    setStatus("В локальном режиме ветка фиксирована", true);
    renderFiles();
    return;
  }
  if (!(await confirmDiscard())) { renderFiles(); return; }

  let baseHeadSha = null;
  try {
    baseHeadSha = await checkRemoteHead(octokit, {
      owner: repo.owner, name: repo.name, branch,
    });
  } catch (e) {
    console.warn("checkRemoteHead:", e.message);
  }

  setState({ branch, files: [], currentPath: "", openFile: null, baseHeadSha });
  clearDirty();
  clearDeleted();
  clearRemoteChanges();
  clearTabs();
  renderTabs();
  setSelectionMode(false);
  editorScreen.close();
  await loadTree();
  renderFiles();
}

async function loadTree() {
  const { octokit, repo, branch } = getState();
  setStatus("Загрузка дерева...");
  const tree = await listFiles(octokit, repo.owner, repo.name, branch);
  setState({
    files: tree.map((f) => ({ path: f.path, sha: f.sha, size: f.size })),
  });
  setStatus(`Файлов: ${tree.length}`);
}

/* ---------- Режим 2: local ---------- */

async function openRepoLocal(repo) {
  if (!(await confirmDiscard())) return;
  const key = storage.makeRepoKey(repo.owner.login, repo.name, repo.default_branch);
  const meta = await storage.loadRepoMeta(key);
  if (!meta) { setStatus("Локальная копия не найдена", true); return; }

  setStatus("Проверка обновлений...");
  let remoteSha;
  try {
    remoteSha = await checkRemoteHead(getState().octokit, {
      owner: repo.owner.login, name: repo.name, branch: meta.branch,
    });
  } catch (e) {
    setStatus("Не удалось проверить head: " + e.message, true);
    return;
  }
  setStatus("");

  if (remoteSha !== meta.headSha) {
    updateModal.open({ repo, meta, remoteSha, dirtyCount: getState().dirty.size });
    return;
  }
  await enterLocalMode(repo, meta);
}

async function repairLegacyClone(meta, filesIndex) {
  const key = meta.key;
  let fixed = 0;

  for (const m of filesIndex) {
    if (m.baseSha !== undefined && m.isNew !== undefined) continue;

    const entry = await storage.getFile(key, m.path);
    if (!entry) continue;

    let newSha;
    if (entry.isBinary) {
      newSha = await gitBlobShaFromBase64(entry.content);
    } else {
      newSha = await gitBlobSha(entry.content);
    }

    entry.sha = newSha;
    entry.baseSha = newSha;
    entry.isNew = false;
    if (!entry.isBinary && !entry.baseContentLf) {
      entry.baseContentLf = toLf(entry.content);
    }
    await storage.saveFile(key, entry);

    m.sha = newSha;
    m.baseSha = newSha;
    m.isNew = false;
    fixed++;
  }

  await storage.updateRepoMeta(key, { repaired: true });

  if (fixed > 0) {
    console.log(`[repairLegacyClone] восстановлено файлов: ${fixed}`);
    return true;
  }
  return false;
}

async function enterLocalMode(repo, meta) {
  let filesIndex = await storage.loadFilesIndex(meta.key);

  if (!meta.repaired) {
    const didFix = await repairLegacyClone(meta, filesIndex);
    if (didFix) {
      filesIndex = await storage.loadFilesIndex(meta.key);
      meta = { ...meta, repaired: true };
    }
  }

  try {
    const remoteHead = await checkRemoteHead(getState().octokit, {
      owner: repo.owner.login, name: repo.name, branch: meta.branch,
    });
    if (remoteHead && remoteHead !== meta.headSha) {
      const diff = await compareCommits(
        getState().octokit, repo.owner.login, repo.name, meta.headSha, remoteHead
      );
      const changes = new Map();
      for (const f of diff.files || []) {
        if (f.status === "removed" && f.filename) changes.set(f.filename, "removed");
        else if (f.status === "added" && f.filename) changes.set(f.filename, "added");
        else if (f.status === "modified" && f.filename) changes.set(f.filename, "modified");
        else if (f.status === "renamed") {
          if (f.previous_filename) changes.set(f.previous_filename, "renamed");
          if (f.filename) changes.set(f.filename, "added");
        }
      }
      setRemoteChanges(changes);
    } else {
      clearRemoteChanges();
    }
  } catch (e) {
    console.warn("Не удалось сравнить с сервером:", e.message);
    clearRemoteChanges();
  }

  setState({
    mode: "local",
    cloned: meta,
    base: new Map(),
    baseHeadSha: meta.headSha,
    repo: {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
    },
    branch: meta.branch,
    branches: [{ name: meta.branch }],
    files: filesIndex.map((f) => ({
      path: f.path,
      sha: f.sha,
      baseSha: f.baseSha !== undefined ? f.baseSha : f.sha,
      size: f.size || 0,
      isNew: !!f.isNew,
      isBinary: !!f.isBinary,
      _movedFrom: f._movedFrom || null,
    })),
    currentPath: "",
    openFile: null,
  });
  clearDirty();
  clearDeleted();
  for (const p of meta.pendingDeletes || []) setDeleted(p);
  setSelectionMode(false);
  editorScreen.close();
  setScreen(SCREENS.FILES);
  renderFiles();
  setStatus(`📦 Локальная копия · ${meta.branch} · ${formatSize(meta.totalBytes || 0)}`);
  startLocalWatch();
}

async function cloneAndOpen(repo) {
  if (!(await confirmDiscard())) return;
  const { octokit } = getState();
  const owner = repo.owner.login;
  const name = repo.name;
  const branch = repo.default_branch;

  const persistent = await storage.requestPersistent();
  if (!persistent) console.warn("Постоянное хранилище не предоставлено");

  showBusy("Клонирование репозитория…");
  progressBar.show("Клонирование: подготовка...");
  setStatus("");
  try {
    const { headSha, files, totalBytes } = await cloneRepo(octokit, {
      owner, name, branch,
      onProgress: (done, total, bytes, totalBytes) => {
        progressBar.update(done, total, bytes, totalBytes);
      },
    });

    const key = storage.makeRepoKey(owner, name, branch);
    const meta = {
      key, owner, name, branch,
      fullName: repo.full_name,
      defaultBranch: branch,
      headSha,
      clonedAt: Date.now(),
      fileCount: files.length,
      totalBytes,
      pendingDeletes: [],
      repaired: true,
    };

    progressBar.show("Сохранение: 0%");
    await storage.saveRepo(meta, files, {
      onProgress: (done, total) => progressBar.update(done, total),
    });

    const clonedMap = new Map(getState().clonedMap);
    clonedMap.set(repo.full_name, totalBytes);
    setState({ clonedMap });
    reposScreen.setRepos(getState().repos, clonedMap);

    setStatus(`Склонировано: ${files.length} файлов · ${formatSize(totalBytes)}`);
    await enterLocalMode(repo, meta);
  } catch (e) {
    setStatus("Ошибка клонирования: " + e.message, true);
  } finally {
    forceHideBusy();
    progressBar.hide();
  }
}

async function deleteLocalCopy(repo) {
  const key = storage.makeRepoKey(repo.owner.login, repo.name, repo.default_branch);

  showBusy("Удаление локальной копии…");
  progressBar.showIndeterminate("Удаление локальной копии...");
  try {
    await new Promise((r) => setTimeout(r, 120));
    await storage.deleteRepo(key);

    const clonedMap = new Map(getState().clonedMap);
    clonedMap.delete(repo.full_name);
    setState({ clonedMap });
    reposScreen.setRepos(getState().repos, clonedMap);

    setStatus("Локальная копия удалена");
  } catch (e) {
    setStatus("Ошибка удаления: " + e.message, true);
  } finally {
    forceHideBusy();
    progressBar.hide();
  }
}

/* ---------- Вкладки редактора ---------- */

function renderTabs() {
  const state = getState();
  const dirty = new Set(state.dirty.keys());
  for (const f of state.files) {
    if (f.isNew) { dirty.add(f.path); continue; }
    if (f.baseSha !== undefined && f.sha !== f.baseSha) dirty.add(f.path);
  }
  editorTabs.render(state.openTabs, state.activeTab, dirty);
}

async function switchTab(path) {
  const state = getState();
  if (!path || state.activeTab === path) return;
  const file = state.files.find((f) => f.path === path);
  if (!file) {
    removeTab(path);
    renderTabs();
    return;
  }
  await openFile(file);
}

async function closeTab(path) {
  const state = getState();
  const wasActive = state.activeTab === path;

  const captured = editorScreen.captureDirty?.();
  if (captured && captured.path === path && captured.unsaved) {
    setDirty(path, captured.current);
  }

  removeTab(path);
  renderTabs();

  if (wasActive) {
    const after = getState();
    if (after.openTabs.length) {
      const last = after.openTabs[after.openTabs.length - 1];
      await switchTab(last.path);
    } else {
      editorScreen.close();
      setState({ openFile: null });
      setScreen(SCREENS.FILES);
      renderFiles();
    }
  }
}

/* ---------- Файлы ---------- */

function renderFiles() {
  const state = getState();
  const changed = new Set(state.dirty.keys());

  for (const f of state.files) {
    if (f.isNew) { changed.add(f.path); continue; }
    if (f.baseSha !== undefined && f.sha !== f.baseSha) changed.add(f.path);
  }

  filesScreen.render({
    files: state.files,
    currentPath: state.currentPath,
    dirtyPaths: changed,
    deletedSet: state.deleted,
    branch: state.branch,
    branches: state.branches,
    mode: state.mode,
    selectionMode: state.selectionMode,
    selection: state.selection,
    remoteChanges: state.remoteChanges,
  });
}

function openFolder(name) {
  const { currentPath } = getState();

  if (name === "..") {
    const base = (currentPath || "").replace(/\/+$/, "");
    if (!base) return;
    const parts = base.split("/").filter(Boolean);
    parts.pop();
    const parent = parts.length ? parts.join("/") + "/" : "";
    setState({ currentPath: parent });
    renderFiles();
    return;
  }

  setState({ currentPath: currentPath + name + "/" });
  renderFiles();
}

/* ---------- Загрузка с устройства ---------- */

async function handleUploadSelection(e) {
  const selected = [...(e.target.files || [])];
  if (!selected.length) return;

  const entries = selected.map((file) => {
    const rel = (file.webkitRelativePath || "").trim();
    return { file, path: rel || file.name };
  });

  e.target.value = "";

  await processUploadedEntries(entries);
}

async function computeUploadedSha(data, eol) {
  if (data.isBinary) {
    return gitBlobShaFromBase64(data.content);
  }
  return gitBlobSha(fromLf(data.content, eol || "\n"));
}

async function isUploadedSameAsExisting({ mode, cloned, path, data, fileEntry }) {
  if (!fileEntry) return false;

  let currentSha = null;
  let currentIsBinary = !!fileEntry.isBinary;
  let currentEol = fileEntry.eol || "\n";

  if (mode === "local" && cloned) {
    const entry = await storage.getFile(cloned.key, path);
    if (!entry) return false;
    currentSha = entry.sha;
    currentIsBinary = !!entry.isBinary;
    if (!currentIsBinary) {
      currentEol = detectEol(entry.content) || "\n";
    }
  } else {
    currentSha = fileEntry.sha;
  }

  if (!currentSha) return false;

  // Тип должен совпадать.
  if (currentIsBinary !== !!data.isBinary) return false;

  const newSha = await computeUploadedSha(data, currentEol);
  return newSha === currentSha;
}

async function processUploadedEntries(entries) {
  if (!entries.length) return;

  const { mode, cloned, currentPath } = getState();
  if (!mode) return;

  const base = (currentPath || "").replace(/\/+$/, "");

  progressBar.show(`Загрузка: 0 / ${entries.length}`);

  const added = [];
  let done = 0;
  let skipped = 0;
  let replaceAll = false;
  let skipAll = false;
  let cancelled = false;

  try {
    for (const entry of entries) {
      if (cancelled) break;

      const rel = (entry.path || entry.file?.name || "").trim();
      const clean = rel.split("/").filter(Boolean).join("/");
      if (!clean) { done++; continue; }
      const path = base ? `${base}/${clean}` : clean;

      const currentFiles = getState().files;
      const existsInFiles = currentFiles.some((f) => f.path === path);
      const existsInAdded = added.some((f) => f.path === path);
      const isDeleted = getState().deleted.has(path);
      const conflict = (existsInFiles || existsInAdded) && !isDeleted;

      if (conflict) {
        if (skipAll) {
          skipped++;
          done++;
          progressBar.update(done, entries.length);
          continue;
        }
        if (!replaceAll) {
          const decision = await askReplace(path);
          if (decision === "cancel") { cancelled = true; break; }
          if (decision === "replace-all") replaceAll = true;
          else if (decision === "skip-all") skipAll = true;
          else if (decision === "skip") {
            skipped++;
            done++;
            progressBar.update(done, entries.length);
            continue;
          }
        }
      }

      // Читаем файл заранее — он нужен и для сравнения, и для сохранения.
      const data = await readUploadedFile(entry.file);

      // Если файл уже есть и его содержимое идентично загружаемому —
      // не помечаем изменённым, просто идём дальше.
      if (existsInFiles && !isDeleted) {
        const existingEntry = getState().files.find((f) => f.path === path);
        const same = await isUploadedSameAsExisting({
          mode, cloned, path, data, fileEntry: existingEntry,
        });
        if (same) {
          skipped++;
          done++;
          progressBar.update(done, entries.length);
          continue;
        }
      }

      if (isDeleted) {
        removeDeleted(path);
        if (mode === "local" && cloned) {
          const newPending = (cloned.pendingDeletes || []).filter((p) => p !== path);
          cloned.pendingDeletes = newPending;
          await storage.updateRepoMeta(cloned.key, { pendingDeletes: newPending });
        }
      }

      if (existsInFiles) {
        setState({ files: getState().files.filter((f) => f.path !== path) });
      }
      if (existsInAdded) {
        const i = added.findIndex((f) => f.path === path);
        if (i >= 0) added.splice(i, 1);
      }

      await saveUploadedEntry({ mode, cloned, path, data });

      added.push({
        path,
        sha: null,
        baseSha: null,
        size: data.size,
        isNew: true,
        isBinary: data.isBinary,
        eol: "\n",
        content: data.isBinary ? data.content : null,
      });

      done++;
      progressBar.update(done, entries.length);
    }

    if (added.length) {
      setState({ files: [...getState().files, ...added] });
      renderFiles();
    }

    const parts = [`Загружено: ${added.length}`];
    if (skipped) parts.push(`пропущено: ${skipped}`);
    if (cancelled) parts.push("прервано");
    setStatus(parts.join(" · "));
  } catch (err) {
    setStatus("Ошибка загрузки: " + err.message, true);
  } finally {
    progressBar.hide();
  }
}

function askReplace(path) {
  return new Promise((resolve) => {
    dialogs.choose({
      title: "Файл уже существует",
      text: path,
      options: [
        { text: "Заменить", kind: "primary", onClick: () => resolve("replace") },
        { text: "Заменить все", onClick: () => resolve("replace-all") },
        { text: "Пропустить", onClick: () => resolve("skip") },
        { text: "Пропустить все", onClick: () => resolve("skip-all") },
      ],
      onDismiss: () => resolve("cancel"),
    });
  });
}

/* ---------- Автосохранение ---------- */

function handleAutosave(path, contentLf) {
  const { mode, cloned, dirty } = getState();
  if (mode !== "local" || !cloned) return;
  if (!dirty.has(path)) return;
  saveFileToLocal(path, contentLf).then(() => {
    setStatus("Автосохранение");
  }).catch((e) => {
    console.warn("autosave:", e);
  });
}

/* ---------- Контекстное меню редактора ---------- */

async function showEditorContextMenu(pos) {
  const textarea = document.getElementById("file-content");
  if (!textarea) return;
  const hasSelection = textarea.selectionStart !== textarea.selectionEnd;

  // Координаты тапа. Если пришли без координат — берём центр textarea.
  let x = pos?.x, y = pos?.y;
  if (typeof x !== "number" || typeof y !== "number") {
    const r = textarea.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }

  // Нижняя граница — верх кастомной клавиатуры, если она видна.
  const kbHeight = customKeyboard?.getHeight?.() || 0;
  const bottomLimit = window.innerHeight - kbHeight - 8;

  const items = [];
  if (hasSelection) {
    items.push({ text: "Копировать", onClick: () => editorCopy(textarea) });
    items.push({ text: "Вырезать", onClick: () => editorCut(textarea) });
  }
  items.push({ text: "Вставить", onClick: () => editorPaste(textarea) });
  items.push({ text: "Выделить всё", onClick: () => {
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
  }});
  items.push({ text: "Отмена", onClick: () => {} });

  editorContextMenu.open({ items, x, y, bottomLimit });
}

async function editorCopy(textarea) {
  const text = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  if (!text) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      textarea.focus();
      document.execCommand("copy");
    }
    setStatus("Скопировано");
  } catch (e) {
    setStatus("Не удалось скопировать", true);
  }
}

async function editorCut(textarea) {
  const text = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  if (!text) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      textarea.focus();
      document.execCommand("copy");
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText("", start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    setStatus("Вырезано");
  } catch (e) {
    setStatus("Не удалось вырезать", true);
  }
}

async function editorPaste(textarea) {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (!text) { setStatus("Буфер пуст"); return; }
      textarea.focus();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.setRangeText(text, start, end, "end");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      setStatus("Вставлено");
    } else {
      setStatus("Вставка недоступна, используйте Ctrl+V", true);
    }
  } catch (e) {
    setStatus("Нет доступа к буферу обмена", true);
  }
}

function editorFindSelection(textarea) {
  const text = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  const findBtn = document.getElementById("btn-editor-find");
  if (findBtn) findBtn.click();
  const input = document.getElementById("editor-find-input");
  if (input) {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }
}

/* ---------- AI-патчи ---------- */

let isPasteInProgress = false;
let pendingCommitMessage = null;

function groupKeyForPath(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "cs") return "cs";
  if (["js", "mjs", "cjs", "ts", "jsx", "tsx"].includes(ext)) return "js";
  return "other";
}

function filterFilesBySelection(files, selection) {
  if (!selection) return files;
  const paths = selection.paths instanceof Set ? selection.paths : selection;
  const types = selection.types instanceof Set ? selection.types : null;
  const includeUnanalyzed = selection.includeUnanalyzed !== false;
  const includeService = selection.includeService === true;
  return files.filter((f) => {
    const slash = f.path.indexOf("/");
    const top = slash < 0 ? f.path : f.path.slice(0, slash);
    if (!paths.has(top)) return false;
    if (types && !types.has(groupKeyForPath(f.path))) return false;
    if (!includeUnanalyzed && !isAnalyzable(f.path)) return false;
    if (!includeService && hasServiceFolder(f.path)) return false;
    return true;
  });
}

async function handleGenerateProjectMap() {
  const { mode, files, repo, branch } = getState();
  if (!files.length) {
    await dialogs.alert({
      title: "Пустой репозиторий",
      text: "Нет файлов для анализа.",
    });
    return;
  }

  const selection = await mapSelectModal.ask(files);
  if (!selection) return;

  const subset = filterFilesBySelection(files, selection);
  if (!subset.length) {
    await dialogs.alert({ title: "Нечего обрабатывать", text: "Выбрано 0 файлов." });
    return;
  }

  showBusy("Генерация карты проекта…");
  progressBar.show("Чтение файлов: 0 / " + subset.length);
  try {
    const result = [];
    let done = 0;
    for (const f of subset) {
      progressBar.update(done, subset.length);
      updateBusyText("Обработка: " + f.path);
      try {
        const content = await getCurrentFileContent(f.path);
        const text = (content === null || (content && content.binary)) ? "" : content;
        const r = parseFile(f.path, text);
        r.size = f.size || 0;
        result.push(r);
      } catch (e) {
        console.warn("map:", f.path, e.message);
        result.push({ path: f.path, size: f.size || 0, kind: "other", parsed: null });
      }
      done++;
    }
    progressBar.update(done, subset.length);

    const md = renderProjectMap({
      repoLabel: repo?.fullName || "",
      branch: branch || "",
      mode: mode || "",
      files: result,
    });

    setTimeout(() => {
      aiModal.openMapPreview(md, () => downloadText("project-map.md", md));
    }, 0);
    setStatus("Карта проекта готова к скачиванию");
  } catch (e) {
    setStatus("Ошибка генерации: " + e.message, true);
  } finally {
    forceHideBusy();
    progressBar.hide();
  }
}

function downloadText(filename, text, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}


async function handleGenerateFullInstructions() {
  const { mode, files, repo, branch } = getState();
  if (!files.length) {
    await dialogs.alert({ title: "Пустой репозиторий", text: "Нет файлов для анализа." });
    return;
  }

  const selection = await mapSelectModal.ask(files);
  if (!selection) return;

  const subset = filterFilesBySelection(files, selection);
  if (!subset.length) {
    await dialogs.alert({ title: "Нечего обрабатывать", text: "Выбрано 0 файлов." });
    return;
  }

  showBusy("Формирование полной инструкции…");
  progressBar.show("Чтение файлов: 0 / " + subset.length);
  try {
    const result = [];
    let done = 0;
    for (const f of subset) {
      progressBar.update(done, subset.length);
      updateBusyText("Обработка: " + f.path);
      try {
        const content = await getCurrentFileContent(f.path);
        const text = (content === null || (content && content.binary)) ? "" : content;
        const r = parseFile(f.path, text);
        r.size = f.size || 0;
        result.push(r);
      } catch (e) {
        result.push({ path: f.path, size: f.size || 0, kind: "other", parsed: null });
      }
      done++;
    }
    progressBar.update(done, subset.length);

    const mapMd = renderProjectMap({
      repoLabel: repo?.fullName || "",
      branch: branch || "",
      mode: mode || "",
      files: result,
    });

    let instText = "";
    try {
      const res = await fetch("./ai-instructions.md", { cache: "no-store" });
      if (res.ok) instText = await res.text();
      else instText = "_(ai-instructions.md не найден: HTTP " + res.status + ")_";
    } catch (e) {
      instText = "_(ai-instructions.md не прочитан: " + e.message + ")_";
    }

    const header =
      "# Полная инструкция для AI\n\n" +
      "Этот файл объединяет:\n" +
      "1. Формат JSON-патчей, который принимает приложение.\n" +
      "2. Карту проекта — структуру, импорты, экспорты.\n" +
      "3. Правила работы с проектом.\n\n" +
      "---\n\n";

    const full =
      header +
      "## Часть 1. Формат JSON-патчей\n\n" +
      instText +
      "\n\n---\n\n" +
      "## Часть 2. Карта проекта\n\n" +
      mapMd;

    setTimeout(() => {
      aiModal.openMapPreview(full, () => downloadText("ai-full-instructions.md", full));
    }, 0);
    setStatus("Полная инструкция готова");
  } catch (e) {
    setStatus("Ошибка: " + e.message, true);
  } finally {
    forceHideBusy();
    progressBar.hide();
  }
}

async function getCurrentFileContent(path) {
  const { octokit, repo, branch, dirty, mode, cloned, files, deleted } = getState();

  if (deleted.has(path)) return null;

  // 1. Несохранённые правки
  if (dirty.has(path)) {
    return dirty.get(path);
  }

  // 2. Local — из IndexedDB
  if (mode === "local" && cloned) {
    const entry = await storage.getFile(cloned.key, path);
    if (!entry) return null;
    if (entry.isBinary) return { binary: true };
    return toLf(entry.content);
  }

  // 3. Remote — из state.files
  const file = files.find(f => f.path === path);
  if (!file) return null;
  if (file.isBinary) return { binary: true };
  if (file.isNew && typeof file.content === "string") {
    return file.content;
  }

  // 4. Remote — из GitHub
  if (!file.sha) return null;
  try {
    const raw = await getFile(octokit, repo.owner, repo.name, path, branch);
    return toLf(raw);
  } catch (e) {
    return null;
  }
}

async function handleAiJsonLoad(text) {
  let parsed;
  try {
    parsed = parseJson(text);
  } catch (e) {
    // Если пришло из вставки — кинем ошибку наверх,
    // чтобы она показалась прямо в модалке.
    if (isPasteInProgress) throw e;
    await dialogs.alert({ title: "Ошибка JSON", text: e.message });
    return;
  }

  pendingCommitMessage = parsed.commit || null;

  const items = [];
  for (const change of parsed.changes) {
    const content = await getCurrentFileContent(change.path);
    const check = checkChange(change, content);
    items.push({ change, check, checked: check.ok });
  }

  aiModal.showPreview(items);
}

async function handleAiApply(changes) {
  if (!changes.length) return;
  const applied = [];
  const failed = [];

  for (const change of changes) {
    try {
      const content = await getCurrentFileContent(change.path);
      const check = checkChange(change, content);
      if (!check.ok) {
        failed.push({ change, reason: check.reason });
        continue;
      }
      const result = applyChange(change, content);
      await applyAiResult(change.path, result);
      applied.push({ type: change.type, path: change.path });
    } catch (e) {
      failed.push({ change, reason: e.message || "неизвестная ошибка" });
    }
  }

  aiModal.showReport({ applied, failed });
  renderFiles();

  if (applied.length && pendingCommitMessage) {
    const msg = pendingCommitMessage;
    pendingCommitMessage = null;
    aiModal.close();
    setTimeout(() => openCommit(msg), 150);
  } else {
    pendingCommitMessage = null;
  }
}

async function applyAiResult(path, result) {
  const { mode, cloned } = getState();

  // Удаление
  if (result.delete) {
    setDeleted(path);
    removeDirty(path);

    // Убираем из state.files (визуально исчезнет сразу)
    setState({ files: getState().files.filter(f => f.path !== path) });

    if (mode === "local" && cloned) {
      const existing = await storage.getFile(cloned.key, path);
      if (existing && !existing.isNew) {
        const pending = [...getState().deleted];
        cloned.pendingDeletes = pending;
        await storage.updateRepoMeta(cloned.key, { pendingDeletes: pending });
      } else if (existing) {
        await storage.deleteFiles(cloned.key, [path]);
      }
    }
    return;
  }

  // Запись содержимого (LF)
  const lfContent = toLf(result.content);
  setDirty(path, lfContent);
  removeDeleted(path);

  const files = getState().files;
  const idx = files.findIndex(f => f.path === path);

  if (mode === "local" && cloned) {
    const existing = await storage.getFile(cloned.key, path);
    const eol = existing ? (detectEol(existing.content) || "\n") : "\n";
    const contentOrig = fromLf(lfContent, eol);
    const newSha = await gitBlobSha(contentOrig);

    const entry = {
      path,
      content: contentOrig,
      sha: newSha,
      baseSha: existing ? existing.baseSha : null,
      baseContentLf: existing ? existing.baseContentLf : "",
      size: new TextEncoder().encode(contentOrig).length,
      isNew: existing ? !!existing.isNew : true,
      isBinary: false,
    };
    await storage.saveFile(cloned.key, entry);

    const meta = {
      path,
      sha: newSha,
      baseSha: existing ? existing.baseSha : null,
      size: entry.size,
      isNew: entry.isNew,
      isBinary: false,
      eol,
    };
    if (idx >= 0) {
      const arr = [...files]; arr[idx] = meta;
      setState({ files: arr });
    } else {
      setState({ files: [...files, meta] });
    }
  } else {
    // Remote — если файла не было в списке, добавляем как новый
    if (idx < 0) {
      setState({ files: [...files, {
        path, sha: null, baseSha: null,
        size: new TextEncoder().encode(lfContent).length,
        isNew: true, eol: "\n", isBinary: false,
      }]});
    }
  }
}

/* ---------- Перемещение drag-and-drop ---------- */

async function moveEntry(srcPath, destFolderPath) {
  const { files, deleted } = getState();

  const cleanDest = (destFolderPath || "").replace(/\/+$/, "");

  const isFolder = files.some((f) => f.path.startsWith(srcPath + "/"));
  const entry = files.find((f) => f.path === srcPath);
  if (!entry && !isFolder) return;

  const base = srcPath.split("/").pop();
  const newPath = cleanDest ? `${cleanDest}/${base}` : base;

  if (newPath === srcPath) return;

  if (isFolder && (newPath === srcPath || newPath.startsWith(srcPath + "/"))) {
    await dialogs.alert({
      title: "Нельзя переместить",
      text: "Папку нельзя поместить внутрь самой себя",
    });
    return;
  }

  if (isFolder) {
    const inside = files.filter((f) => f.path.startsWith(srcPath + "/"));
    for (const f of inside) {
      const candidate = newPath + f.path.slice(srcPath.length);
      if (files.some((x) => x.path === candidate) && !deleted.has(candidate)) {
        await dialogs.alert({
          title: "Конфликт имён",
          text: `Уже существует: ${candidate}`,
        });
        return;
      }
    }
  } else {
    if (files.some((f) => f.path === newPath) && !deleted.has(newPath)) {
      await dialogs.alert({ title: "Уже существует", text: newPath });
      return;
    }
  }

  try {
    if (isFolder) {
      await renameFolder(srcPath, newPath);
    } else {
      await renameFile(srcPath, newPath);
    }
    renderFiles();
    setStatus(`Перемещено: ${srcPath} → ${newPath}`);
  } catch (e) {
    setStatus("Ошибка перемещения: " + e.message, true);
    console.error("moveEntry:", e);
  }
}

/* ---------- Перемещение через диалог ---------- */

let moveModalInstance = null;

function initMoveModal() {
  const modal = document.getElementById("move-modal");
  const list = document.getElementById("move-list");
  const titleEl = document.getElementById("move-modal-title");
  const closeBtn = document.getElementById("move-modal-close");
  if (!modal || !list) return { open: async () => null };

  let resolver = null;

  function close(path) {
    modal.classList.add("hidden");
    const r = resolver;
    resolver = null;
    if (r) r(path);
  }

  if (closeBtn) closeBtn.addEventListener("click", () => close(null));

  modal.addEventListener("click", (e) => {
    if (e.target !== modal) return;
    close(null);
  });

  return {
    open({ title, options }) {
      return new Promise((resolve) => {
        resolver = resolve;
        if (titleEl) titleEl.textContent = title || "Переместить";
        list.innerHTML = "";

        for (const o of options) {
          const li = document.createElement("li");
          if (o.current) li.classList.add("current");

          const icon = document.createElement("span");
          icon.className = "icon";
          icon.textContent = o.icon || "📁";
          li.appendChild(icon);

          const name = document.createElement("span");
          name.className = "name";
          name.textContent = o.label;
          li.appendChild(name);

          if (o.current) {
            const check = document.createElement("span");
            check.className = "icon";
            check.textContent = "✓";
            li.appendChild(check);
          } else {
            li.addEventListener("click", () => close(o.value));
          }

          list.appendChild(li);
        }
        modal.classList.remove("hidden");
      });
    },
  };
}

async function moveSelected() {
  const { selection, files, currentPath } = getState();
  console.log("[moveSelected] selection size:", selection?.size);
  if (!selection || selection.size !== 1) return;

  const sel = [...selection][0];
  const isFolder = sel.endsWith("/");
  const srcPath = isFolder ? sel.slice(0, -1) : sel;
  const srcName = srcPath.split("/").pop();

  const currentFolder = (currentPath || "").replace(/\/+$/, "");

  const folderSet = new Set();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join("/"));
    }
  }

  const options = [{
    value: "",
    label: "Корень репозитория",
    icon: "🏠",
    current: currentFolder === "",
  }];

  const sorted = [...folderSet].sort((a, b) => a.localeCompare(b));
  for (const folder of sorted) {
    if (isFolder && (folder === srcPath || folder.startsWith(srcPath + "/"))) continue;
    options.push({
      value: folder,
      label: folder,
      icon: "📁",
      current: folder === currentFolder,
    });
  }

  if (!moveModalInstance) moveModalInstance = initMoveModal();

  const dest = await moveModalInstance.open({
    title: `Переместить: ${srcName}`,
    options,
  });

  if (dest === null || dest === undefined) return;
  if (dest === currentFolder) return;

  await moveEntry(srcPath, dest);
}

/* ---------- Скачивание ---------- */

async function downloadRepoZip() {
  const { octokit, repo, branch, mode, cloned, files, dirty, deleted } = getState();
  if (!repo || !files.length) {
    await dialogs.alert({
      title: "Нечего скачивать",
      text: "В репозитории нет файлов.",
    });
    return;
  }

  const zipName = repo.name + "-" + branch + ".zip";
  showBusy("Формирование архива…");
  progressBar.show("Архивация: 0 / " + files.length);
  try {
    const blob = await buildRepoZip({
      octokit, owner: repo.owner, name: repo.name, branch,
      mode, cloned, files, dirty, deleted,
      onProgress: (done, total, path) => {
        progressBar.update(done, total);
        updateBusyText("Архивация: " + done + " / " + total + " — " + path);
      },
    });
    downloadBlob(blob, zipName);
    setStatus("Архив скачан: " + zipName);
  } catch (e) {
    setStatus("Ошибка архивации: " + e.message, true);
  } finally {
    forceHideBusy();
    progressBar.hide();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

async function downloadSelected() {
  const { selection, files, mode, cloned, dirty } = getState();
  if (!selection || selection.size === 0) return;

  const paths = [...selection].filter((p) => !p.endsWith("/"));
  if (!paths.length) {
    await dialogs.alert({
      title: "Нечего скачивать",
      text: "Выбраны только папки. Скачивание папок не поддерживается.",
    });
    return;
  }

  progressBar.show(`Скачивание: 0 / ${paths.length}`);
  let done = 0;
  let failed = 0;

  try {
    for (const path of paths) {
      done++;
      progressBar.update(done, paths.length);
      try {
        const blob = await buildFileBlob(path, files, mode, cloned, dirty);
        if (!blob) { failed++; continue; }
        triggerDownload(blob, path.split("/").pop());
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        console.warn("download:", path, e.message);
        failed++;
      }
    }

    const parts = [`Скачано: ${paths.length - failed}`];
    if (failed) parts.push(`ошибок: ${failed}`);
    setStatus(parts.join(" · "));
  } finally {
    progressBar.hide();
  }
}

async function buildFileBlob(path, files, mode, cloned, dirty) {
  const file = files.find((f) => f.path === path);
  if (!file) return null;

  if (mode === "local" && cloned) {
    const entry = await storage.getFile(cloned.key, path);
    if (!entry) return null;
    if (entry.isBinary) {
      return new Blob([base64ToBytes(entry.content)]);
    }
    return new Blob([entry.content], { type: "text/plain" });
  }

  if (file.isNew) {
    if (file.isBinary && file.content) {
      return new Blob([base64ToBytes(file.content)]);
    }
    if (dirty.has(path)) {
      return new Blob([dirty.get(path)], { type: "text/plain" });
    }
    return new Blob([""]);
  }

  if (!file.sha) return null;
  const { octokit, repo } = getState();
  return getBlobRaw(octokit, repo.owner, repo.name, file.sha);
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/* ---------- Просмотр бинарных файлов и изображений ---------- */

async function openBinaryFile(file) {
  const { octokit, repo } = getState();
  if (!octokit || !repo) return;

  if (isImagePath(file.path)) {
    return openImage(file);
  }

  await dialogs.alert({
    title: "Бинарный файл",
    text: `${file.path}\n${formatSize(file.size || 0)}\n\nПросмотр недоступен.`,
  });
}

async function openImage(file) {
  const { octokit, repo, cloned, mode } = getState();
  if (!octokit || !repo) return;

  setStatus(`Загрузка ${file.path}...`);
  try {
    let blob = null;

    if (mode === "local" && cloned && file.isNew) {
      const entry = await storage.getFile(cloned.key, file.path);
      if (entry && entry.isBinary) {
        const bytes = base64ToBytes(entry.content);
        blob = new Blob([bytes]);
      }
    }

    if (!blob) {
      let sha = file.sha;
      if (!sha && mode === "local" && cloned) {
        const entry = await storage.getFile(cloned.key, file.path);
        sha = entry?.sha;
      }
      if (!sha) {
        setStatus("Нет данных для просмотра", true);
        return;
      }
      blob = await getBlobRaw(octokit, repo.owner, repo.name, sha);
    }

    imageScreen.open(file.path, blob);
    setState({ openFile: { path: file.path } });
    setScreen(SCREENS.IMAGE);
    setStatus("");
  } catch (e) {
    setStatus("Не удалось открыть: " + e.message, true);
  }
}

/* ---------- Revert коммита ---------- */

async function handleRevertCommit(commit) {
  const { octokit, repo, branch, mode } = getState();
  if (!octokit || !repo) return;

  if (mode === "local") {
    await dialogs.alert({
      title: "Только в remote",
      text: "Отмена коммита доступна в режиме «Открыть временно». В локальной копии сделайте pull.",
    });
    return;
  }

  const ok = await dialogs.confirm({
    title: "Отменить коммит?",
    text:
      `Будет создан новый коммит, возвращающий изменения ` +
      `${commit.sha.slice(0, 7)} «${(commit.commit.message || "").split("\n")[0].slice(0, 40)}».\n\n` +
      "История не переписывается.",
    okText: "Отменить",
    cancelText: "Отмена",
    danger: true,
  });
  if (!ok) return;

  progressBar.show("Отмена коммита...");
  setStatus("");
  try {
    const newSha = await revertCommit(octokit, {
      owner: repo.owner,
      repo: repo.name,
      branch,
      commitSha: commit.sha,
      commitMessage: commit.commit.message || "",
    });

    setState({ baseHeadSha: newSha });
    setStatus(`Revert: ${newSha.slice(0, 7)}`);

    await loadTree();
    renderFiles();
  } catch (e) {
    setStatus("Ошибка revert: " + e.message, true);
  } finally {
    progressBar.hide();
  }
}

/* ---------- Переименование ---------- */

async function renameSelected() {
  const { selection } = getState();
  if (!selection || selection.size !== 1) return;

  const sel = [...selection][0];
  const isFolder = sel.endsWith("/");
  const oldPath = isFolder ? sel.slice(0, -1) : sel;
  const baseName = oldPath.split("/").pop() || oldPath;

  const newName = await dialogs.prompt({
    title: isFolder ? "Переименовать папку" : "Переименовать файл",
    text: `Текущее: ${oldPath}`,
    placeholder: "Новое имя",
    initial: baseName,
    okText: "Переименовать",
  });
  if (!newName) return;

  const clean = normalizeName(newName);
  if (!clean || clean === baseName) return;

  const parentPath = oldPath.includes("/")
    ? oldPath.slice(0, oldPath.lastIndexOf("/"))
    : "";
  const newPath = parentPath ? `${parentPath}/${clean}` : clean;

  if (isFolder) {
    await renameFolder(oldPath, newPath);
  } else {
    await renameFile(oldPath, newPath);
  }

  setSelectionMode(false);
  renderFiles();
  setStatus(`Переименовано: ${oldPath} → ${newPath}`);
}

async function renameFile(oldPath, newPath) {
  const { mode, cloned, files, octokit, repo, branch, dirty } = getState();

  const fileEntry = files.find((f) => f.path === oldPath);
  if (!fileEntry) return;

  if (files.some((f) => f.path === newPath) && !getState().deleted.has(newPath)) {
    await dialogs.alert({ title: "Файл уже существует", text: newPath });
    return;
  }

  let content = null;
  let contentLf = null;
  let eol = fileEntry.eol || null;
  let isBinary = !!fileEntry.isBinary;

  if (mode === "local" && cloned) {
    const entry = await storage.getFile(cloned.key, oldPath);
    if (entry) {
      content = entry.content;
      isBinary = !!entry.isBinary;
      if (!isBinary) {
        eol = detectEol(content) || "\n";
        contentLf = toLf(content);
      }
    }
  }

  if (content === null && !isBinary) {
    const d = dirty.get(oldPath);
    if (d !== undefined && d !== null) {
      contentLf = d;
      eol = eol || "\n";
      content = fromLf(d, eol);
    }
  }

  if (content === null && fileEntry.isNew && fileEntry.content) {
    content = fileEntry.content;
    isBinary = true;
  }

  if (content === null) {
    const ext = (oldPath.split(".").pop() || "").toLowerCase();
    const looksBinary = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "pdf", "zip", "gz", "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "webm"].includes(ext);

    if (looksBinary) {
      try {
        const blob = await getBlobRaw(octokit, repo.owner, repo.name, fileEntry.sha);
        const buf = await blob.arrayBuffer();
        content = bytesToBase64(new Uint8Array(buf));
        isBinary = true;
      } catch (e) {
        console.warn("rename binary read:", e.message);
        return;
      }
    } else {
      try {
        const raw = await getFile(octokit, repo.owner, repo.name, oldPath, branch);
        eol = detectEol(raw) || "\n";
        contentLf = toLf(raw);
        content = fromLf(contentLf, eol);
        isBinary = false;
      } catch (e) {
        console.warn("rename read:", e.message);
        return;
      }
    }
  }

  if (content === null) {
    setStatus("Не удалось прочитать содержимое файла", true);
    return;
  }

  if (!isBinary) {
    if (!eol) eol = detectEol(content) || "\n";
    if (contentLf === null) contentLf = toLf(content);
  }

  const size = isBinary
    ? base64ToBytes(content).length
    : new TextEncoder().encode(content).length;

  const originalBaseSha =
    fileEntry.baseSha !== undefined ? fileEntry.baseSha
    : fileEntry.isNew ? null
    : fileEntry.sha;

  const meta = {
    path: newPath,
    sha: null,
    baseSha: null,
    size,
    isNew: true,
    eol,
    isBinary,
    content: isBinary ? content : null,
  };

  const wasDeleted = getState().deleted.has(newPath);
  const canRestore =
    wasDeleted &&
    fileEntry._movedFrom &&
    fileEntry._movedFrom.path === newPath;

  let restoredToOriginal = false;

  if (canRestore) {
    const currentSha = isBinary
      ? await gitBlobShaFromBase64(content)
      : await gitBlobSha(fromLf(contentLf, eol));

    const restoredBaseSha =
      fileEntry._movedFrom.baseSha !== undefined
        ? fileEntry._movedFrom.baseSha
        : fileEntry._movedFrom.sha;

    meta.sha = currentSha;
    meta.baseSha = restoredBaseSha;
    meta.isNew = false;
    removeDeleted(newPath);

    if (currentSha === restoredBaseSha) {
      restoredToOriginal = true;
    }
  } else {
    if (wasDeleted) removeDeleted(newPath);
    if (fileEntry._movedFrom) {
      meta._movedFrom = fileEntry._movedFrom;
    } else if (!fileEntry.isNew) {
      meta._movedFrom = {
        path: oldPath,
        sha: fileEntry.sha,
        baseSha: originalBaseSha,
      };
      setDeleted(oldPath);
    }
  }

  if (mode === "local" && cloned) {
    const localEntry = {
      path: newPath,
      content,
      sha: meta.sha,
      baseSha: meta.baseSha,
      baseContentLf: meta.isNew ? "" : contentLf,
      size,
      isNew: meta.isNew,
      isBinary,
      _movedFrom: meta._movedFrom || null,
    };
    await storage.saveFile(cloned.key, localEntry);
    if (fileEntry.isNew) {
      await storage.deleteFiles(cloned.key, [oldPath]);
    }
  }

  const remaining = files.filter((f) => f.path !== oldPath);
  remaining.push(meta);

  removeDirty(oldPath);
  removeDirty(newPath);

  if (!isBinary && !restoredToOriginal) {
    setDirty(newPath, contentLf);
  }

  setState({ files: remaining });

  if (mode === "local" && cloned) {
    const pending = [...getState().deleted];
    cloned.pendingDeletes = pending;
    await storage.updateRepoMeta(cloned.key, { pendingDeletes: pending });
  }
}

async function renameFolder(oldPrefix, newPrefix) {
  const { files } = getState();
  const inside = files.filter((f) => f.path.startsWith(oldPrefix + "/"));

  if (!inside.length) {
    await dialogs.alert({ title: "Папка пустая", text: oldPrefix });
    return;
  }

  const existing = new Set(files.map((f) => f.path));
  for (const f of inside) {
    const candidate = newPrefix + f.path.slice(oldPrefix.length);
    if (existing.has(candidate) && !getState().deleted.has(candidate)) {
      await dialogs.alert({
        title: "Конфликт имён",
        text: `Уже существует: ${candidate}`,
      });
      return;
    }
  }

  for (const f of inside) {
    const newPath = newPrefix + f.path.slice(oldPrefix.length);
    await renameFile(f.path, newPath);
  }
}

async function openFile(file) {
  if (file.isBinary) {
    return openBinaryFile(file);
  }
  if (isImagePath(file.path)) {
    return openImage(file);
  }

  // Сохраняем содержимое предыдущей вкладки, если есть несохранённые правки.
  const prev = getState().openFile;
  if (prev && prev.path !== file.path) {
    const captured = editorScreen.captureDirty?.();
    if (captured && captured.unsaved) setDirty(captured.path, captured.current);
  }

  const { octokit, repo, branch, dirty, mode, cloned } = getState();

  let contentLf, baseSha, eol;

  if (mode === "local" && cloned) {
    const entry = await storage.getFile(cloned.key, file.path);
    if (!entry) { setStatus("Файл не найден в копии", true); return; }

    if (entry.isBinary) {
      return openBinaryFile(file);
    }
    if (entry.content === undefined || entry.content === null) {
      setStatus("Файл пуст или повреждён", true);
      return;
    }

    eol = detectEol(entry.content);
    baseSha = entry.baseSha;
    contentLf = dirty.has(file.path) ? dirty.get(file.path) : toLf(entry.content);
  } else {
    if (dirty.has(file.path)) {
      contentLf = dirty.get(file.path);
      baseSha = file.sha;
      eol = file.eol || "\n";
    } else {
      setStatus(`Открытие ${file.path}...`);
      try {
        const raw = await getFile(octokit, repo.owner, repo.name, file.path, branch);
        eol = detectEol(raw);
        contentLf = toLf(raw);
        baseSha = file.sha;
      } catch (e) {
        setStatus("Не удалось открыть файл: " + e.message, true);
        return;
      }
      setStatus("");
    }
    file.eol = eol;
  }

  setState({ openFile: { path: file.path } });
  editorScreen.open({ path: file.path, baseSha, eol, content: contentLf });
  editorScreen.setLocalMode(mode === "local");
  addTab({ path: file.path });
  renderTabs();
  setScreen(SCREENS.EDITOR);
}

function handleEditorState(path, { unsaved, current }) {
  if (unsaved) setDirty(path, current);
  else removeDirty(path);
  if (getState().screen === SCREENS.FILES) renderFiles();
  renderTabs();
}

/* ---------- Сохранение в локальную копию ---------- */

async function saveFileToLocal(path, contentLf) {
  const { cloned, files, mode } = getState();
  if (mode !== "local" || !cloned) return;

  const fileEntry = files.find((f) => f.path === path);
  if (!fileEntry) return;

  const entry = await storage.getFile(cloned.key, path);
  if (!entry) return;

  const eol = detectEol(entry.content);
  const contentOrig = fromLf(contentLf, eol);
  const newSha = await gitBlobSha(contentOrig);

  entry.content = contentOrig;
  entry.sha = newSha;
  entry.size = new TextEncoder().encode(contentOrig).length;
  await storage.saveFile(cloned.key, entry);

  fileEntry.sha = newSha;
  fileEntry.size = entry.size;

  removeDirty(path);
  editorScreen.markSaved(path);
  renderFiles();
  setStatus("Сохранено в локальную копию");
}

async function flushDirtyToLocal() {
  const { cloned, dirty, files, mode } = getState();
  if (mode !== "local" || !cloned || dirty.size === 0) return;

  for (const [path, contentLf] of [...dirty.entries()]) {
    const fileEntry = files.find((f) => f.path === path);
    if (!fileEntry) continue;

    const entry = await storage.getFile(cloned.key, path);
    if (!entry) continue;

    const eol = detectEol(entry.content);
    const contentOrig = fromLf(contentLf, eol);
    const newSha = await gitBlobSha(contentOrig);

    entry.content = contentOrig;
    entry.sha = newSha;
    entry.size = new TextEncoder().encode(contentOrig).length;
    await storage.saveFile(cloned.key, entry);

    fileEntry.sha = newSha;
    fileEntry.size = entry.size;
  }
  clearDirty();
  editorScreen.markSaved();
}

/* ---------- Создание файлов и папок ---------- */

function normalizeName(name) {
  return name.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function fullPathOf(name) {
  const { currentPath } = getState();
  const base = (currentPath || "").replace(/\/+$/, "");
  const clean = normalizeName(name);
  return base ? base + "/" + clean : clean;
}

async function createFile() {
  const { mode, cloned, deleted, files } = getState();
  if (!mode) return;

  const name = await dialogs.prompt({
    title: "Создать файл",
    placeholder: "например: Program.cs",
    okText: "Создать",
  });
  if (!name) return;

  const path = fullPathOf(name);

  if (files.some((f) => f.path === path) && !deleted.has(path)) {
    await dialogs.alert({ title: "Файл уже существует", text: path });
    return;
  }

  if (deleted.has(path)) {
    removeDeleted(path);
    if (mode === "local" && cloned) {
      const newPending = (cloned.pendingDeletes || []).filter((p) => p !== path);
      cloned.pendingDeletes = newPending;
      await storage.updateRepoMeta(cloned.key, { pendingDeletes: newPending });
    }
    renderFiles();
    setStatus(`Удаление отменено: ${path}`);
    return;
  }

  const entry = {
    path, content: "", sha: null, baseSha: null,
    baseContentLf: "", size: 0, isNew: true,
  };

  if (mode === "local" && cloned) await storage.saveFile(cloned.key, entry);

  setState({
    files: [...files, {
      path, sha: null, baseSha: null, size: 0, isNew: true, eol: "\n",
    }],
  });
  renderFiles();
  setStatus(`Создан файл: ${path}`);
}

async function createFolder() {
  const { mode, cloned, deleted, files } = getState();
  if (!mode) return;

  const name = await dialogs.prompt({
    title: "Создать папку",
    placeholder: "например: src/utils",
    okText: "Создать",
  });
  if (!name) return;

  const folderPath = fullPathOf(name);
  const keepPath = folderPath + "/.gitkeep";

  if (files.some((f) => f.path === keepPath) && !deleted.has(keepPath)) {
    await dialogs.alert({ title: "Папка уже существует", text: folderPath });
    return;
  }

  if (deleted.has(keepPath)) {
    removeDeleted(keepPath);
    if (mode === "local" && cloned) {
      const newPending = (cloned.pendingDeletes || []).filter((p) => p !== keepPath);
      cloned.pendingDeletes = newPending;
      await storage.updateRepoMeta(cloned.key, { pendingDeletes: newPending });
    }
    renderFiles();
    setStatus(`Удаление отменено: ${folderPath}`);
    return;
  }

  const entry = {
    path: keepPath, content: "", sha: null, baseSha: null,
    baseContentLf: "", size: 0, isNew: true,
  };

  if (mode === "local" && cloned) await storage.saveFile(cloned.key, entry);

  setState({
    files: [...files, {
      path: keepPath, sha: null, baseSha: null, size: 0, isNew: true, eol: "\n",
    }],
  });
  renderFiles();
  setStatus(`Создана папка: ${folderPath}`);
}

/* ---------- Режим удаления ---------- */

function enterSelection() {
  setSelectionMode(true);
  renderFiles();
}

function cancelSelection() {
  setSelectionMode(false);
  renderFiles();
}

async function confirmDeleteSelected() {
  const { selection, files, mode, cloned, deleted } = getState();
  if (!selection || selection.size === 0) return;

  const pathsToDelete = new Set();
  for (const sel of selection) {
    if (sel.endsWith("/")) {
      for (const f of files) {
        if (f.path.startsWith(sel)) pathsToDelete.add(f.path);
      }
    } else {
      pathsToDelete.add(sel);
    }
  }

  const remainingAfter = files.filter(
    (f) =>
      !pathsToDelete.has(f.path) &&
      !deleted.has(f.path) &&
      !f.isNew
  ).length;

  if (remainingAfter === 0) {
    await dialogs.alert({
      title: "Нельзя удалить все файлы",
      text:
        "GitHub не позволяет создать коммит без единого файла в дереве.\n\n" +
        "Оставьте хотя бы один файл — например, README.md. " +
        "Остальные можно удалить.",
    });
    return;
  }

  const ok = await dialogs.confirm({
    title: "Удалить выбранное?",
    text: `Элементов: ${selection.size}. Файлы и папки будут помечены на удаление при коммите.`,
    okText: "Удалить",
    cancelText: "Отмена",
    danger: true,
  });
  if (!ok) return;

  const remaining = [];
  const newDeletes = new Set(deleted);
  const toRemoveFromIndexedDB = [];

  for (const f of files) {
    if (!pathsToDelete.has(f.path)) { remaining.push(f); continue; }
    removeDirty(f.path);

    if (f.isNew) {
      if (mode === "local" && cloned) toRemoveFromIndexedDB.push(f.path);
    } else {
      newDeletes.add(f.path);
    }
  }

  if (mode === "local" && cloned) {
    if (toRemoveFromIndexedDB.length) {
      await storage.deleteFiles(cloned.key, toRemoveFromIndexedDB);
    }
    const pending = [...newDeletes].filter((p) => {
      const f = files.find((x) => x.path === p);
      return f && !f.isNew;
    });
    cloned.pendingDeletes = pending;
    await storage.updateRepoMeta(cloned.key, { pendingDeletes: pending });
  }

  clearDeleted();
  for (const p of newDeletes) {
    const f = files.find((x) => x.path === p);
    if (f && !f.isNew) setDeleted(p);
  }

  setState({ files: remaining });
  setSelectionMode(false);
  renderFiles();
  setStatus(`Помечено на удаление: ${pathsToDelete.size}`);
}

/* ---------- Откат ---------- */

async function confirmRevertFile(path) {
  const { files, deleted, mode } = getState();
  const fileEntry = files.find((f) => f.path === path);
  if (!fileEntry) return;

  let title;
  let text;

  if (fileEntry.isNew) {
    title = "Отменить создание файла?";
    text = path + "\n\nФайл будет удалён из локальной копии. Если файл уже есть на GitHub — вернётся к серверной версии.";
  } else if (deleted.has(path)) {
    title = "Отменить удаление?";
    text = path + "\n\nФайл вернётся к версии из GitHub.";
  } else if (mode === "local") {
    title = "Откатить изменения?";
    text = path + "\n\nФайл вернётся к последней сохранённой версии. Несохранённые правки будут потеряны.";
  } else {
    title = "Откатить изменения?";
    text = path + "\n\nФайл будет загружен заново с GitHub. Несохранённые правки будут потеряны.";
  }

  const ok = await dialogs.confirm({
    title,
    text,
    okText: "Откатить",
    cancelText: "Отмена",
    danger: true,
  });
  if (!ok) return;

  await revertFile(path);
}

async function confirmLogout() {
  const { dirty, mode, clonedMap } = getState();
  const clonedCount = clonedMap ? clonedMap.size : 0;
  const dirtyCount = dirty ? dirty.size : 0;

  let text = "Токен будет удалён из браузера. Войти заново потребуется снова.";

  if (clonedCount > 0) {
    text += "\n\nЛокальные копии (" + clonedCount + " шт.) останутся — их можно открыть после повторного входа.";
  }

  if (mode !== "local" && dirtyCount > 0) {
    text += "\n\nВнимание: у вас " + dirtyCount + " несохранённых файлов в текущем репозитории. Они будут потеряны.";
  }

  const ok = await dialogs.confirm({
    title: "Выйти из аккаунта?",
    text,
    okText: "Выйти",
    cancelText: "Отмена",
    danger: true,
  });
  if (!ok) return;

  logout();
}

async function revertFile(path) {
  const { cloned, mode, files, octokit, repo, branch } = getState();
  const fileEntry = files.find((f) => f.path === path);
  if (!fileEntry) return;

  // Remote-режим — откат к версии с GitHub.
  if (mode === "remote") {
    if (fileEntry.isNew) {
      // Новый файл в remote не имеет версии на GitHub — просто убираем.
      removeDirty(path);
      setState({ files: files.filter((f) => f.path !== path) });
      editorScreen.close();
      setState({ openFile: null });
      setScreen(SCREENS.FILES);
      renderFiles();
      setStatus("Создание отменено");
      return;
    }
    try {
      const raw = await getFile(octokit, repo.owner, repo.name, path, branch);
      const eol = detectEol(raw);
      const contentLf = toLf(raw);
      removeDirty(path);
      editorScreen.revert({ content: contentLf, baseSha: fileEntry.sha });
      renderFiles();
      setStatus("Изменения отменены");
    } catch (e) {
      setStatus("Ошибка отката: " + e.message, true);
    }
    return;
  }

  // Local-режим.
  if (mode !== "local" || !cloned) return;

  if (fileEntry.isNew) {
    await storage.deleteFiles(cloned.key, [path]);
    removeDirty(path);
    setState({ files: files.filter((f) => f.path !== path) });
    editorScreen.close();
    setState({ openFile: null });
    setScreen(SCREENS.FILES);
    renderFiles();
    setStatus("Создание отменено");
    return;
  }

  const entry = await storage.getFile(cloned.key, path);
  if (!entry) return;

  const eol = detectEol(entry.content);
  entry.content = fromLf(entry.baseContentLf, eol);
  entry.sha = entry.baseSha;
  entry.size = new TextEncoder().encode(entry.content).length;
  await storage.saveFile(cloned.key, entry);

  fileEntry.sha = entry.sha;
  fileEntry.size = entry.size;

  removeDirty(path);
  editorScreen.revert({ content: entry.baseContentLf, baseSha: entry.baseSha });
  renderFiles();
  setStatus("Изменения отменены");
}

async function revertAll() {
  const { cloned, mode, files, deleted } = getState();
  if (mode !== "local" || !cloned) return;

  const modified = files.filter(
    (f) => !f.isNew && !deleted.has(f.path) && f.baseSha !== undefined && f.sha !== f.baseSha
  );
  const created = files.filter((f) => f.isNew && !deleted.has(f.path));
  const removed = [...deleted];

  const total = modified.length + created.length + removed.length;
  if (total === 0) { setStatus("Нечего откатывать"); return; }

  const ok = await dialogs.confirm({
    title: "Откатить все изменения?",
    text: `Будет отменено: создано ${created.length}, изменено ${modified.length}, удалено ${removed.length}. Продолжить?`,
    okText: "Откатить",
    cancelText: "Отмена",
    danger: true,
  });
  if (!ok) return;

  const toSave = [];
  for (const f of modified) {
    const entry = await storage.getFile(cloned.key, f.path);
    if (!entry) continue;
    const eol = detectEol(entry.content);
    entry.content = fromLf(entry.baseContentLf, eol);
    entry.sha = entry.baseSha;
    entry.size = new TextEncoder().encode(entry.content).length;
    toSave.push(entry);
    f.sha = entry.sha;
    f.size = entry.size;
  }
  if (toSave.length) await storage.saveFiles(cloned.key, toSave);

  const createdPaths = created.map((f) => f.path);
  if (createdPaths.length) await storage.deleteFiles(cloned.key, createdPaths);

  await storage.updateRepoMeta(cloned.key, { pendingDeletes: [] });
  cloned.pendingDeletes = [];

  const createdSet = new Set(createdPaths);
  setState({ files: files.filter((f) => !createdSet.has(f.path)) });

  clearDirty();
  clearDeleted();
  editorScreen.close();
  setState({ openFile: null });
  setScreen(SCREENS.FILES);
  renderFiles();
  setStatus("Все изменения отменены");
}

/* ---------- Коммит ---------- */

async function openCommit(initialMessage) {
  const { mode, cloned, dirty, files, base, deleted } = getState();

  if (mode === "local" && cloned) await flushDirtyToLocal();

  const items = [];
  const usedPaths = new Set();

  for (const f of files) {
    if (deleted.has(f.path)) continue;

    if (f.isNew) {
      let currentText = dirty.get(f.path);
      if (currentText === undefined && mode === "local" && cloned) {
        const entry = await storage.getFile(cloned.key, f.path);
        currentText = entry ? toLf(entry.content) : "";
      }
      items.push({ path: f.path, baseText: null, currentText: currentText ?? "" });
      usedPaths.add(f.path);
      continue;
    }

    if (f.sha !== f.baseSha) {
      let baseText = null, currentText = null;
      if (mode === "local" && cloned) {
        const entry = await storage.getFile(cloned.key, f.path);
        if (entry) {
          baseText = entry.baseContentLf ?? "";
          currentText = toLf(entry.content);
        }
      } else {
        baseText = base.get(f.path) ?? "";
        currentText = dirty.get(f.path) ?? "";
      }
      if (currentText !== null) {
        items.push({ path: f.path, baseText, currentText });
        usedPaths.add(f.path);
      }
    }
  }

  for (const [path, content] of dirty.entries()) {
    if (usedPaths.has(path) || deleted.has(path)) continue;
    items.push({
      path,
      baseText: base.has(path) ? base.get(path) : null,
      currentText: content,
    });
  }

  for (const path of deleted) {
    let baseText = "";
    if (mode === "local" && cloned) {
      const entry = await storage.getFile(cloned.key, path);
      baseText = entry?.baseContentLf ?? entry?.content ?? "";
    } else {
      baseText = base.get(path) ?? "";
    }
    items.push({ path, type: "delete", baseText, currentText: "" });
  }

  const filtered = items.filter((it) => {
    if (it.type === "delete") return true;
    if (it.baseText === null || it.baseText === undefined) return true;
    if (it.currentText === null || it.currentText === undefined) return true;
    return it.baseText !== it.currentText;
  });

  if (filtered.length === 0) { setStatus("Нет изменений"); return; }
  commitScreen.open(filtered, { mode, message: initialMessage });
}

/* ---------- Проверка устаревшей базы ---------- */

async function handleStaleBase(remoteHead, localHead) {
  const { octokit, repo, mode, dirty, deleted, files } = getState();

  const ourPaths = new Set([...dirty.keys(), ...deleted]);
  if (mode === "local") {
    for (const f of files) {
      if (f.isNew) ourPaths.add(f.path);
      else if (f.baseSha !== undefined && f.sha !== f.baseSha) ourPaths.add(f.path);
    }
  }
  if (ourPaths.size === 0) return true;

  let remotePaths = new Set();
  try {
    const diff = await compareCommits(octokit, repo.owner, repo.name, localHead, remoteHead);
    for (const f of diff.files || []) {
      if (f.filename) remotePaths.add(f.filename);
      if (f.previous_filename) remotePaths.add(f.previous_filename);
    }
  } catch (e) {
    console.warn("compareCommits:", e.message);
  }

  const overlap = [...ourPaths].filter((p) => remotePaths.has(p));
  if (overlap.length === 0) {
    setStatus("На GitHub есть новые коммиты, но конфликтов нет");
    return true;
  }

  const list = overlap.slice(0, 8).map((p) => `• ${p}`).join("\n");
  const more = overlap.length > 8 ? `\n…и ещё ${overlap.length - 8}` : "";
  return dialogs.confirm({
    title: "Есть изменения на GitHub",
    text:
      `${overlap.length} файлов изменены и у вас, и на сервере:\n\n${list}${more}\n\n` +
      "Продолжить — ваши версии перезапишут серверные. Лучше отменить и сделать pull.",
    okText: "Всё равно коммитить",
    cancelText: "Отмена",
    danger: true,
  });
}

/* ---------- Инкрементальный pull ---------- */

async function runPull(ctx) {
  const { repo, meta } = ctx;
  const { octokit, mode, cloned } = getState();

  pullInProgress = true;

  if (mode === "local" && cloned) {
    try { await flushDirtyToLocal(); } catch (e) { console.warn(e); }
  }

  const busyToken = showBusy("Обновление локальной копии…");
  progressBar.show("Подтягивание изменений...");

  try {
    const res = await pullRepo(octokit, meta, {
      onProgress: (done, total) => {
        progressBar.update(done, total);
        updateBusyText(`Обновление: ${done} / ${total}`);
      },
    });

    await enterLocalMode(repo, { ...meta, headSha: res.newHeadSha });

    const parts = [];
    if (res.updated) parts.push(`обновлено ${res.updated}`);
    if (res.added) parts.push(`добавлено ${res.added}`);
    if (res.removed) parts.push(`удалено ${res.removed}`);
    if (res.conflicts?.length) parts.push(`конфликтов ${res.conflicts.length}`);

    setStatus(parts.length ? `Pull: ${parts.join(", ")}` : "Уже актуально");

    if (res.conflicts?.length) {
      const lines = res.conflicts.slice(0, 10).map((c) => `• ${c.path} — ${c.reason}`).join("\n");
      const more = res.conflicts.length > 10 ? `\n…и ещё ${res.conflicts.length - 10}` : "";
      forceHideBusy();
      progressBar.hide();
      await dialogs.alert({
        title: "Часть файлов не обновлена",
        text: `Локальные правки не затронуты в ${res.conflicts.length} файлах:\n\n${lines}${more}`,
      });
    }
  } catch (e) {
    console.error("runPull error:", e);
    setStatus("Ошибка pull: " + e.message, true);
  } finally {
    pullInProgress = false;
    // Двойная страховка: сначала с токеном, потом принудительно.
    hideBusy(busyToken);
    forceHideBusy();
    progressBar.hide();
  }
}

/* ---------- История коммитов ---------- */

async function openHistory() {
  const { octokit, repo, branch, mode, cloned, baseHeadSha } = getState();
  if (!repo) return;

  historyScreen.setRepoLabel(`${repo.fullName} · ${branch}`);
  setScreen(SCREENS.HISTORY);
  setStatus("Загрузка истории...");

  try {
    const commits = await listCommits(octokit, repo.owner, repo.name, branch, { perPage: 40 });
    const currentSha = mode === "local" && cloned ? cloned.headSha : baseHeadSha;
    historyScreen.render(commits, currentSha);
    setStatus("");
  } catch (e) {
    setStatus("Ошибка загрузки истории: " + e.message, true);
  }
}

async function openHistoryCommit(commit) {
  if (!commit) return;
  const { octokit, repo, mode } = getState();
  if (!repo) return;

  setStatus("Загрузка коммита...");
  try {
    const commitData = await getCommit(octokit, repo.owner, repo.name, commit.sha);
    const parents = commitData.parents || [];
    const parentSha = parents[0]?.sha;

    const files = [];

    if (!parentSha) {
      files.push({ path: "(первый коммит)", baseText: "", currentText: "" });
    } else {
      const diff = await compareCommits(octokit, repo.owner, repo.name, parentSha, commit.sha);
      const changes = (diff.files || []).slice(0, 60);

      for (const f of changes) {
        const path = f.filename;
        try {
          if (f.status === "removed") {
            const old = await getFile(octokit, repo.owner, repo.name, path, parentSha);
            files.push({ path, baseText: old, currentText: "" });
          } else if (f.status === "added") {
            const cur = await getFile(octokit, repo.owner, repo.name, path, commit.sha);
            files.push({ path, baseText: "", currentText: cur });
          } else if (f.status === "modified") {
            const cur = await getFile(octokit, repo.owner, repo.name, path, commit.sha);
            const old = await getFile(octokit, repo.owner, repo.name, path, parentSha);
            files.push({ path, baseText: old, currentText: cur });
          } else if (f.status === "renamed") {
            const cur = await getFile(octokit, repo.owner, repo.name, path, commit.sha);
            let old = "";
            if (f.previous_filename) {
              try {
                old = await getFile(octokit, repo.owner, repo.name, f.previous_filename, parentSha);
              } catch {}
            }
            files.push({
              path: `${f.previous_filename} → ${path}`,
              baseText: old, currentText: cur,
            });
          }
        } catch (e) {
          files.push({ path, baseText: "", currentText: "(не удалось загрузить)" });
        }
      }
    }

    const isLocal = mode === "local";
    const canRevert = !isLocal && !!parentSha;
    const hint = isLocal
      ? "В локальной копии откат — через «Обновить»"
      : (!parentSha ? "Первый коммит отменить нельзя" : null);
    historyModal.openCommit(commit, files, { canRevert, hint });
    setStatus("");
  } catch (e) {
    setStatus("Ошибка: " + e.message, true);
  }
}

/* ---------- Коммит ---------- */

async function commit(message) {
  const { octokit, repo, branch, dirty, mode, cloned, files, openFile, base, deleted } = getState();

  if (mode === "local" && cloned) await flushDirtyToLocal();

  try {
    const remoteHead = await checkRemoteHead(octokit, {
      owner: repo.owner, name: repo.name, branch,
    });
    const localHead = mode === "local" && cloned ? cloned.headSha : getState().baseHeadSha;
    if (remoteHead && localHead && remoteHead !== localHead) {
      const proceed = await handleStaleBase(remoteHead, localHead);
      if (!proceed) { commitScreen.setBusy(false); return; }
    }
  } catch (e) {
    console.warn("Проверка базы:", e.message);
  }

  const payload = [];
  const usedPaths = new Set();

  for (const f of files) {
    if (deleted.has(f.path)) continue;

    if (f.isNew) {
      let content;
      let entry = null;
      let isBinary = !!f.isBinary;

      if (mode === "local" && cloned) {
        entry = await storage.getFile(cloned.key, f.path);
        if (entry) {
          content = entry.content;
          isBinary = !!entry.isBinary;
        } else {
          content = "";
        }
      } else {
        if (f.isBinary) {
          content = f.content || "";
          if (!content) {
            console.warn("Бинарный файл без содержимого:", f.path);
          }
        } else {
          content = dirty.has(f.path) ? fromLf(dirty.get(f.path), f.eol || "\n") : "";
        }
      }
      payload.push({ path: f.path, content, isNew: true, entry, isBinary });
      usedPaths.add(f.path);
      continue;
    }

    if (f.sha !== f.baseSha) {
      if (mode === "local" && cloned) {
        const entry = await storage.getFile(cloned.key, f.path);
        if (entry) payload.push({
          path: f.path, content: entry.content, entry,
          isBinary: !!entry.isBinary,
        });
      } else if (dirty.has(f.path)) {
        payload.push({
          path: f.path,
          content: fromLf(dirty.get(f.path), f.eol || "\n"),
          isBinary: false,
        });
      }
      usedPaths.add(f.path);
    }
  }

  for (const [path, contentLf] of dirty.entries()) {
    if (usedPaths.has(path) || deleted.has(path)) continue;
    const f = files.find((x) => x.path === path);
    const eol = f?.eol || "\n";
    payload.push({ path, content: fromLf(contentLf, eol), isNew: !base.has(path), isBinary: false });
  }

  for (const path of deleted) payload.push({ path, delete: true });

  const filteredPayload = payload.filter((p) => {
    if (p.delete) return true;
    if (p.content === null || p.content === undefined) return true;
    if (p.isNew) return true;
    const baseText = p.entry
      ? (p.entry.baseContentLf ?? "")
      : (base.has(p.path) ? base.get(p.path) : null);
    if (baseText === null) return true;
    return baseText !== p.content;
  });

  if (filteredPayload.length === 0) { setStatus("Нет изменений"); return; }

  payload.length = 0;
  payload.push(...filteredPayload);

  commitScreen.setBusy(true);
  setStatus("Коммит...");
  showBusy("Отправка коммита…");
  progressBar.show(`Коммит: 0 / ${payload.length + 3}`);
  try {
    const newHeadSha = await commitFiles(octokit, {
      owner: repo.owner, repo: repo.name, branch, message,
      files: payload.map((p) => ({
        path: p.path,
        content: p.content,
        delete: p.delete,
        isBinary: p.isBinary,
      })),
      onProgress: (done, total, label) => {
        progressBar.update(done, total);
        if (label) {
          const el = document.getElementById("progress-label");
          if (el) el.textContent = `${done} / ${total} · ${label}`;
        }
      },
    });

    if (mode === "local" && cloned) {
      const toSave = [];
      for (const p of payload) {
        if (p.delete) continue;
        const sha = p.isBinary
          ? await gitBlobShaFromBase64(p.content)
          : await gitBlobSha(p.content);
        if (p.entry) {
          p.entry.sha = sha;
          p.entry.baseSha = sha;
          p.entry.isNew = false;
          p.entry._movedFrom = null;
          if (!p.entry.isBinary) {
            p.entry.baseContentLf = toLf(p.content);
          }
          p.entry.size = p.entry.isBinary
            ? base64ToBytes(p.content).length
            : new TextEncoder().encode(p.content).length;
          toSave.push(p.entry);
        }
        const f = files.find((x) => x.path === p.path);
        if (f) {
          f.sha = sha;
          f.baseSha = sha;
          f.isNew = false;
          f._movedFrom = null;
        }
      }
      if (toSave.length) await storage.saveFiles(cloned.key, toSave);

      const pathsToRemove = payload.filter((p) => p.delete).map((p) => p.path);
      if (pathsToRemove.length) await storage.deleteFiles(cloned.key, pathsToRemove);

      await storage.updateRepoMeta(cloned.key, {
        headSha: newHeadSha,
        pendingDeletes: [],
      });
      cloned.headSha = newHeadSha;
      cloned.pendingDeletes = [];
      setState({ baseHeadSha: newHeadSha });
      if (pathsToRemove.length) {
        const dead = new Set(pathsToRemove);
        setState({ files: files.filter((f) => !dead.has(f.path)) });
      }
    } else {
      for (const p of payload) {
        if (p.delete) continue;
        const sha = p.isBinary
          ? await gitBlobShaFromBase64(p.content)
          : await gitBlobSha(p.content);
        const f = files.find((x) => x.path === p.path);
        if (f) {
          f.sha = sha;
          f.baseSha = sha;
          f.isNew = false;
          f._movedFrom = null;
          if (p.isBinary) f.content = null;
        }
        if (openFile?.path === p.path) editorScreen.updateBaseSha(sha);
        if (!p.isBinary) base.set(p.path, toLf(p.content));
      }
      const pathsToRemove = payload.filter((p) => p.delete).map((p) => p.path);
      if (pathsToRemove.length) {
        const dead = new Set(pathsToRemove);
        setState({ files: files.filter((f) => !dead.has(f.path)) });
      }
      setState({ baseHeadSha: newHeadSha });
    }

    clearDirty();
    clearDeleted();
    clearRemoteChanges();
    editorScreen.markSaved();
    commitScreen.close();
    renderFiles();
    setStatus(`Закоммичено: ${newHeadSha.slice(0, 7)}`);
    // Обновить «грязность» клонированного репо в списке.
    if (mode === "local") refreshRepoDirty();
    // Если выйдем в список репо — статус уже обновится в exitRepo,
    // но обновим и сейчас, на случай возврата через кнопку «Назад».
  } catch (e) {
    setStatus("Ошибка коммита: " + e.message, true);
  } finally {
    forceHideBusy();
    progressBar.hide();
    commitScreen.setBusy(false);
  }
}

/* ---------- Свайпы между вкладками ---------- */

function initEditorSwipe() {
  const screenEl = document.getElementById("screen-editor");
  if (!screenEl) return;

  let startX = 0, startY = 0, startTime = 0, tracking = false;

  screenEl.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.target;
    if (t.closest("#file-content")) return;
    if (t.closest("#editor-keybar")) return;
    if (t.closest("#editor-find-panel")) return;
    if (t.closest("input, textarea, select")) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });

  screenEl.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startTime;
    if (dt > 800) return;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.7) return;

    const state = getState();
    const tabs = state.openTabs;
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((tab) => tab.path === state.activeTab);
    if (idx < 0) return;

    let nextIdx;
    if (dx < 0) nextIdx = (idx + 1) % tabs.length;
    else nextIdx = (idx - 1 + tabs.length) % tabs.length;

    switchTab(tabs[nextIdx].path);
  }, { passive: true });
}

/* ---------- Утилиты ---------- */

async function confirmDiscard() {
  const { dirty, mode } = getState();

  // В local-режиме сначала сохраняем всё из dirty в IndexedDB.
  // Так правки не потеряются при выходе из репозитория или переключении.
  if (mode === "local") {
    try {
      await flushDirtyToLocal();
    } catch (e) {
      console.warn("flush on discard:", e);
    }
    return true;
  }

  if (dirty.size === 0) return true;
  return dialogs.confirm({
    title: "Есть несохранённые изменения",
    text: `Изменено файлов: ${dirty.size}. Продолжить и потерять их?`,
    okText: "Потерять",
    cancelText: "Отмена",
    danger: true,
  });
}

function commitCount() {
  const { files, dirty, deleted } = getState();
  const changed = new Set(deleted);

  for (const f of files) {
    if (f.isNew) { changed.add(f.path); continue; }
    if (f.baseSha !== undefined && f.sha !== f.baseSha) changed.add(f.path);
  }
  for (const p of dirty.keys()) changed.add(p);
  return changed.size;
}

subscribe(() => {
  nav.setCommitCount(commitCount());
});

/* ---------- Старт ---------- */

initEditorSwipe();
renderTabs();
setScreen(SCREENS.AUTH);
const savedToken = loadToken();
if (savedToken) login(savedToken);
else header.setLoggedOut();
