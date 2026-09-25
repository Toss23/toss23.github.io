import { getFile, compareCommits } from "./github.js";
import { commitFiles } from "./commit.js";

export async function revertCommit(octokit, { owner, repo, branch, commitSha, commitMessage }) {
  const { data: commit } = await octokit.git.getCommit({
    owner, repo, commit_sha: commitSha,
  });
  const parentSha = commit.parents?.[0]?.sha;
  if (!parentSha) throw new Error("Первый коммит отменить нельзя");

  const diff = await compareCommits(octokit, owner, repo, parentSha, commitSha);
  const payload = [];

  for (const f of diff.files || []) {
    const path = f.filename;
    try {
      if (f.status === "added") {
        // Файл был добавлен — при откате удаляем.
        payload.push({ path, delete: true });
      } else if (f.status === "removed") {
        // Файл был удалён — при откате восстанавливаем.
        const content = await getFile(octokit, owner, repo, path, parentSha);
        payload.push({ path, content });
      } else if (f.status === "modified") {
        // Файл был изменён — при откате возвращаем старую версию.
        const content = await getFile(octokit, owner, repo, path, parentSha);
        payload.push({ path, content });
      } else if (f.status === "renamed") {
        // Файл был переименован — при откате возвращаем на старое место.
        if (f.previous_filename) {
          const oldContent = await getFile(octokit, owner, repo, f.previous_filename, parentSha);
          payload.push({ path: f.previous_filename, content: oldContent });
          payload.push({ path, delete: true });
        }
      }
    } catch (e) {
      console.warn("revert skip:", path, e.message);
    }
  }

  if (payload.length === 0) throw new Error("Нечего откатывать");

  const firstLine = (commitMessage || "").split("\n")[0].slice(0, 60);
  const message = `Revert "${firstLine || commitSha.slice(0, 7)}"`;

  return commitFiles(octokit, { owner, repo, branch, message, files: payload });
}