import { toLf } from "@core/encoding.js";

const listeners = new Set();

const state = {
  octokit: null,
  user: null,
  repos: [],
  clonedMap: new Map(),
  repo: null,
  branch: null,
  branches: [],
  files: [],
  currentPath: "",
  openFile: null,
  dirty: new Map(),          // path -> LF-содержимое
  base: new Map(),           // path -> LF-исходник (remote)
  deleted: new Set(),        // path удалённых файлов
  mode: null,                // null | "remote" | "local"
  cloned: null,
  baseHeadSha: null,         // HEAD ветки в remote-режиме (для проверки базы)
  screen: "auth",
  openTabs: [],
  activeTab: null,
  selectionMode: false,      // режим выбора для удаления
  selection: new Set(),      // выбранные пути
  remoteChanges: new Map(),  // path -> "modified" | "added" | "removed" | "renamed"
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setDirty(path, content) {
  // dirty — всегда LF. Это защита от \r\r\n при последующем fromLf.
  state.dirty.set(path, toLf(content));
  notify();
}

export function removeDirty(path) {
  state.dirty.delete(path);
  notify();
}

export function clearDirty() {
  state.dirty.clear();
  notify();
}

function notify() {
  for (const fn of listeners) fn(state);
}

export function setDeleted(path) {
  state.deleted.add(path);
  notify();
}
export function removeDeleted(path) {
  state.deleted.delete(path);
  notify();
}
export function clearDeleted() {
  state.deleted.clear();
  notify();
}
export function setSelectionMode(on) {
  state.selectionMode = !!on;
  if (!on) state.selection.clear();
  notify();
}
export function toggleSelection(path) {
  if (state.selection.has(path)) state.selection.delete(path);
  else state.selection.add(path);
  notify();
}

export function addTabSafe(tab) { addTab(tab); }

export function addTab(tab) {
  if (!state.openTabs.some((t) => t.path === tab.path)) {
    state.openTabs.push(tab);
  }
  state.activeTab = tab.path;
  notify();
}

export function removeTab(path) {
  state.openTabs = state.openTabs.filter((t) => t.path !== path);
  if (state.activeTab === path) {
    state.activeTab = state.openTabs.length ? state.openTabs[state.openTabs.length - 1].path : null;
  }
  notify();
}

export function setActiveTab(path) {
  state.activeTab = path;
  notify();
}

export function clearTabs() {
  state.openTabs = [];
  state.activeTab = null;
  notify();
}

export function setRemoteChanges(map) {
  state.remoteChanges = map || new Map();
  notify();
}
export function clearRemoteChanges() {
  state.remoteChanges = new Map();
  notify();
}