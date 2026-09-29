import { LIMITS } from "@core/config.js";
import { b64ToUtf8, utf8ToB64 } from "@core/encoding.js";

// Расширения бинарных ассетов, для которых лимит размера не применяем:
// они не читаются как текст, а только скачиваются по SHA или по raw-URL.
const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "tga", "tif", "tiff", "psd", "psb", "exr", "hdr",
  "wav", "mp3", "ogg", "aiff", "flac", "aac", "m4a", "weba",
  "mp4", "mov", "webm", "avi",
  "fbx", "obj", "dae", "blend", "max", "mb", "ma", "3ds", "skp",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "ttf", "otf", "woff", "woff2", "eot",
  "dll", "so", "dylib", "exe", "bin", "unitypackage",
]);

function isBinaryAssetPath(path) {
  const name = String(path || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXT.has(name.slice(dot + 1));
}

export async function listRepos(octokit) {
  return octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: LIMITS.PAGE_SIZE,
    sort: "updated",
  });
}

export async function listBranches(octokit, owner, repo) {
  return octokit.paginate(octokit.repos.listBranches, {
    owner, repo,
    per_page: LIMITS.PAGE_SIZE,
  });
}

export async function listFiles(octokit, owner, repo, ref) {
  const { data } = await octokit.git.getTree({
    owner, repo, tree_sha: ref, recursive: "1",
  });
  return data.tree
    .filter((t) => {
      if (t.type !== "blob") return false;
      // Бинарные ассеты не отсеиваем по размеру — они нужны целиком,
      // их содержимое не читается как текст, а только скачивается.
      if (isBinaryAssetPath(t.path)) return true;
      return t.size < LIMITS.MAX_FILE_SIZE;
    })
    .map((t) => ({ path: t.path, sha: t.sha, size: t.size }));
}

export async function getFile(octokit, owner, repo, path, ref) {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
  return b64ToUtf8(data.content);
}

export async function getBranchHeadSha(octokit, owner, repo, branch) {
  const { data } = await octokit.git.getRef({
    owner, repo, ref: `heads/${branch}`,
  });
  return data.object.sha;
}

export async function getBlobBySha(octokit, owner, repo, sha) {
  const { data } = await octokit.git.getBlob({ owner, repo, file_sha: sha });
  return b64ToUtf8(data.content);
}

export async function compareCommits(octokit, owner, repo, base, head) {
  const { data } = await octokit.repos.compareCommitsWithBasehead({
    owner, repo, basehead: `${base}...${head}`,
  });
  return data;
}

export async function listCommits(octokit, owner, repo, branch, { perPage = 30, page = 1 } = {}) {
  const { data } = await octokit.repos.listCommits({
    owner, repo, sha: branch, per_page: perPage, page,
  });
  return data;
}

export async function getCommit(octokit, owner, repo, sha) {
  const { data } = await octokit.git.getCommit({ owner, repo, commit_sha: sha });
  return data;
}

export async function getBlobRaw(octokit, owner, repo, sha) {
  const { data } = await octokit.git.getBlob({ owner, repo, file_sha: sha });
  const clean = (data.content || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: data.mime_type || "application/octet-stream" });
}

// Скачивает сырой файл через raw.githubusercontent.com.
// Не портит бинарные данные (в отличие от base64-обёрток octokit).
// token — опционально, нужен для приватных репозиториев.
export async function fetchRawAsset(owner, repo, branch, path, token) {
  const cleanPath = String(path).split("/").map(encodeURIComponent).join("/");
  const cleanBranch = encodeURIComponent(branch || "main");
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${cleanBranch}/${cleanPath}`;
  const headers = { "Accept": "application/octet-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function initEmptyRepo(octokit, owner, repo, branch) {
  const content = `# ${repo}\n`;

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: "README.md",
    message: "Initial commit",
    content: utf8ToB64(content),
    branch,
  });

  return data.commit.sha;
}