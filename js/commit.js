import { utf8ToB64 } from "./encoding.js";

export async function commitFiles(octokit, { owner, repo, branch, message, files }) {
  const { data: ref } = await octokit.git.getRef({
    owner, repo, ref: `heads/${branch}`,
  });
  const parentSha = ref.object.sha;

  const { data: parentCommit } = await octokit.git.getCommit({
    owner, repo, commit_sha: parentSha,
  });

  const treeItems = [];
  for (const f of files) {
    if (f.delete) {
      // sha: null в Git Data API удаляет файл из дерева.
      treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const content = f.isBinary ? f.content : utf8ToB64(f.content);
    const { data: blob } = await octokit.git.createBlob({
      owner, repo,
      content,
      encoding: "base64",
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const { data: newTree } = await octokit.git.createTree({
    owner, repo, base_tree: parentCommit.tree.sha, tree: treeItems,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner, repo, message, tree: newTree.sha, parents: [parentSha],
  });

  await octokit.git.updateRef({
    owner, repo, ref: `heads/${branch}`, sha: newCommit.sha,
  });

  return newCommit.sha;
}