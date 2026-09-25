import { Octokit } from "https://esm.sh/@octokit/rest@21";
import { STORAGE_KEYS } from "./config.js";

export function loadToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function saveToken(token) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
}

export function createClient(token) {
  return new Octokit({
    auth: token,
    request: {
      fetch: (url, options = {}) =>
        fetch(url, { ...options, cache: "no-store" }),
    },
  });
}

export async function fetchUser(octokit) {
  const { data } = await octokit.users.getAuthenticated();
  return data;
}

export function readTokenFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).trim());
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}