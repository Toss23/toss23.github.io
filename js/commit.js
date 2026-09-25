import { utf8ToB64 } from "./encoding.js";

export async function commitFiles(octokit, {
  owner, repo, branch, message, files, onProgress,
}) {
  const total = files.length + 3; // blobs + tree + commit + ref
  let done = 0;
  const tick = (label) => {
    done++;
    onProgress?.(done, total, label);
  };

  // 1. HEAD ветки
  const { data: ref } = await octokit.git.getRef({
    owner, repo, ref: `heads/${branch}`,
  });
  const parentSha = ref.object.sha;

  const { data: parentCommit } = await octokit.git.getCommit({
    owner, repo, commit_sha: parentSha,
  });

  // 2. Blob'ы
  const treeItems = [];
  for (const f of files) {
    if (f.delete) {
      treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      tick(`Удаление ${f.path}`);
      continue;
    }
    const content = f.isBinary ? f.content : utf8ToB64(f.content);
    const { data: blob } = await octokit.git.createBlob({
      owner, repo,
      content,
      encoding: "base64",
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    tick(`Загрузка ${f.path}`);
  }

  // 3. Новое дерево
  const { data: newTree } = await octokit.git.createTree({
    owner, repo,
    base_tree: parentCommit.tree.sha,
    tree: treeItems,
  });
  tick("Создание дерева");

  // 4. Коммит
  const { data: newCommit } = await octokit.git.createCommit({
    owner, repo,
    message,
    tree: newTree.sha,
    parents: [parentSha],
  });
  tick("Создание коммита");

  // 5. Сдвигаем ветку
  await octokit.git.updateRef({
    owner, repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });
  tick("Обновление ветки");

  return newCommit.sha;
}