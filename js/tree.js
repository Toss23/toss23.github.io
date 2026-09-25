export function listDirectory(files, currentPath, deletedSet) {
  const base = (currentPath || "").replace(/\/+$/, "");
  const prefix = base ? base + "/" : "";

  const folders = new Set();
  const filesHere = [];

  for (const f of files) {
    if (deletedSet && deletedSet.has(f.path)) continue;
    if (prefix && !f.path.startsWith(prefix)) continue;

    const rest = f.path.slice(prefix.length);
    if (!rest) continue;

    const slash = rest.indexOf("/");
    if (slash === -1) filesHere.push(f);
    else folders.add(rest.slice(0, slash));
  }

  return {
    folders: [...folders].sort((a, b) => a.localeCompare(b)),
    files: filesHere.sort((a, b) => a.path.localeCompare(b.path)),
  };
}