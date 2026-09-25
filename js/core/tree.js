export function listDirectory(files, currentPath, deletedSet) {
  const base = (currentPath || "").replace(/\/+$/, "");
  const prefix = base ? base + "/" : "";

  const folders = new Set();
  const filesHere = [];

  for (const f of files) {
    if (deletedSet && deletedSet.has(f.path)) continue;

    // Файл не внутри текущей папки — пропускаем.
    // Без этой проверки файлы из корня «протекают» в подпапки.
    if (prefix && !f.path.startsWith(prefix)) continue;

    const rest = f.path.slice(prefix.length);
    if (!rest) continue;

    const slash = rest.indexOf("/");
    if (slash === -1) {
      // Файл прямо в текущей папке.
      // .gitkeep показываем только как маркер существования папки,
      // в списке файлов его не выводим.
      if (f.path.split("/").pop() === ".gitkeep") continue;
      filesHere.push(f);
    } else {
      // Файл внутри подпапки — сама подпапка всегда должна быть видна,
      // даже если в ней только .gitkeep.
      folders.add(rest.slice(0, slash));
    }
  }

  return {
    folders: [...folders].sort((a, b) => a.localeCompare(b)),
    files: filesHere.sort((a, b) => a.path.localeCompare(b.path)),
  };
}