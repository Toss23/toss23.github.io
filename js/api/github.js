import { LIMITS } from "@core/config.js";
import { b64ToUtf8, utf8ToB64 } from "@core/encoding.js";

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
    .filter((t) => t.type === "blob" && t.size < LIMITS.MAX_FILE_SIZE)
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