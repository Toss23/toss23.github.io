import { getBranchHeadSha, getBlobBySha, listFiles } from "./github.js";
import { toLf } from "./encoding.js";

export async function cloneRepo(octokit, { owner, name, branch, onProgress }) {
  const headSha = await getBranchHeadSha(octokit, owner, name, branch);
  const tree = await listFiles(octokit, owner, name, branch);
  const files = [];
  const total = tree.length;
  const totalBytes = tree.reduce((s, f) => s + (f.size || 0), 0);
  let done = 0;
  let bytes = 0;

  const queue = [...tree];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      try {
        const content = await getBlobBySha(octokit, owner, name, entry.sha);
        files.push({
          path: entry.path,
          sha: entry.sha,
          baseSha: entry.sha,
          size: entry.size || 0,
          content,
          baseContentLf: toLf(content),
        });
      } catch (e) {
        console.warn("skip", entry.path, e.message);
      }
      done++;
      bytes += entry.size || 0;
      onProgress?.(done, total, bytes, totalBytes);
    }
  });
  await Promise.all(workers);

  return { headSha, files, totalBytes };
}

export async function checkRemoteHead(octokit, { owner, name, branch }) {
  return getBranchHeadSha(octokit, owner, name, branch);
}