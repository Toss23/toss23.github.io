const JS_EXT = new Set(["js", "mjs", "cjs", "ts", "jsx", "tsx"]);
const CSS_EXT = new Set(["css", "scss", "sass", "less"]);
const HTML_EXT = new Set(["html", "htm", "xhtml"]);
const MD_EXT = new Set(["md", "markdown"]);
const JSON_EXT = new Set(["json"]);

function extOf(path) {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  return path.slice(dot + 1).toLowerCase();
}

export function kindOf(path) {
  const ext = extOf(path);
  if (JS_EXT.has(ext)) return "js";
  if (CSS_EXT.has(ext)) return "css";
  if (HTML_EXT.has(ext)) return "html";
  if (MD_EXT.has(ext)) return "md";
  if (JSON_EXT.has(ext)) return "json";
  return "other";
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "?";
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / 1024 / 1024).toFixed(2) + " МБ";
}

function parseImports(content) {
  const out = [];
  const re = /^[ \t]*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ from: m[2], spec: m[1].trim() });
  }
  const re2 = /^[ \t]*import\s+["']([^"']+)["']\s*;?/gm;
  while ((m = re2.exec(content)) !== null) {
    out.push({ from: m[1], spec: "" });
  }
  return out;
}

function parseExports(content) {
  const fns = [];
  const values = [];
  const classes = [];
  const reExports = [];

  const fnRe = /^[ \t]*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm;
  const arrowRe = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/gm;
  const fnExprRe = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?function\s*\(([^)]*)\)/gm;
  const valRe = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/gm;
  const clsRe = /^[ \t]*export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/gm;
  const listRe = /^[ \t]*export\s*\{([^}]*)\}/gm;

  let m;
  while ((m = fnRe.exec(content)) !== null) {
    fns.push({ name: m[2], args: m[3], async: !!m[1] });
  }
  while ((m = arrowRe.exec(content)) !== null) {
    fns.push({ name: m[1], args: m[3], async: !!m[2] });
  }
  while ((m = fnExprRe.exec(content)) !== null) {
    fns.push({ name: m[1], args: m[3], async: !!m[2] });
  }
  while ((m = valRe.exec(content)) !== null) {
    values.push(m[1]);
  }
  while ((m = clsRe.exec(content)) !== null) {
    classes.push(m[1]);
  }
  while ((m = listRe.exec(content)) !== null) {
    const items = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const it of items) {
      const parts = it.split(/\s+as\s+/);
      reExports.push(parts[parts.length - 1].trim());
    }
  }
  return { fns, values, classes, reExports };
}

function parseLocalFunctions(content) {
  const fns = [];
  const re = /^[ \t]*function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm;
  const reAsync = /^[ \t]*async\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm;
  const reArrow = /^[ \t]*const\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/gm;
  let m;
  while ((m = reAsync.exec(content)) !== null) {
    fns.push({ name: m[1], args: m[2], async: true });
  }
  while ((m = re.exec(content)) !== null) {
    fns.push({ name: m[1], args: m[2], async: false });
  }
  while ((m = reArrow.exec(content)) !== null) {
    fns.push({ name: m[1], args: m[3], async: !!m[2] });
  }
  return fns;
}

function renderTree(paths) {
  const tree = {};
  for (const p of paths) {
    const parts = p.split("/");
    let node = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) node[part] = null;
      else {
        if (!node[part] || node[part] === null) node[part] = {};
        node = node[part];
      }
    }
  }
  const lines = [];
  function walk(node, prefix) {
    const keys = Object.keys(node).sort((a, b) => {
      const aDir = node[a] !== null;
      const bDir = node[b] !== null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      const isDir = node[key] !== null;
      lines.push(prefix + (isDir ? key + "/" : key));
      if (isDir) walk(node[key], prefix + "  ");
    }
  }
  walk(tree, "  ");
  return lines.join("\n");
}

function renderFileSection(info) {
  const { path, size, kind } = info;
  const out = [];
  out.push("### " + path + " · " + formatSize(size));

  if (kind !== "js") {
    out.push("_" + kind.toUpperCase() + " · не анализируется_");
    out.push("");
    return out.join("\n");
  }

  const { imports, exports, privates } = info.parsed;
  const hasSomething = imports.length || exports.fns.length ||
                       exports.values.length || exports.classes.length ||
                       exports.reExports.length || privates.length;

  if (!hasSomething) {
    out.push("_Нет экспортов и импортов._");
    out.push("");
    return out.join("\n");
  }

  if (imports.length) {
    out.push("**Импорты:**");
    const seen = new Set();
    for (const im of imports) {
      if (seen.has(im.from)) continue;
      seen.add(im.from);
      out.push("- `" + im.from + "`");
    }
    out.push("");
  }

  const exportLines = [];
  for (const f of exports.fns) {
    exportLines.push("- `" + (f.async ? "async " : "") + f.name + "(" + f.args + ")`");
  }
  for (const c of exports.classes) exportLines.push("- class `" + c + "`");
  for (const v of exports.values) exportLines.push("- const `" + v + "`");
  for (const r of exports.reExports) exportLines.push("- re-export `" + r + "`");
  if (exportLines.length) {
    out.push("**Экспорт:**");
    out.push(...exportLines);
    out.push("");
  }

  if (privates.length) {
    out.push("**Локальные функции:**");
    for (const f of privates) {
      out.push("- `" + (f.async ? "async " : "") + f.name + "(" + f.args + ")`");
    }
    out.push("");
  }

  return out.join("\n");
}

export function renderProjectMap({ repoLabel, branch, mode, files }) {
  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").slice(0, 16);
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);

  const lines = [];
  lines.push("# Карта проекта");
  lines.push("");
  lines.push("- **Репозиторий:** " + (repoLabel || "—"));
  lines.push("- **Ветка:** " + (branch || "—"));
  lines.push("- **Режим:** " + (mode || "—"));
  lines.push("- **Сгенерировано:** " + dateStr);
  lines.push("- **Файлов:** " + files.length);
  lines.push("- **Общий размер:** " + formatSize(totalBytes));
  lines.push("");

  lines.push("## Структура");
  lines.push("");
  lines.push("```");
  lines.push(renderTree(files.map((f) => f.path)));
  lines.push("```");
  lines.push("");

  lines.push("## Файлы");
  lines.push("");

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const info of sorted) {
    lines.push(renderFileSection(info));
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_Конец карты. Тела функций не включены. Для точечных патчей ИИ должен запросить содержимое конкретного файла._");

  return lines.join("\n");
}

export function parseFile(path, content) {
  const kind = kindOf(path);
  if (kind !== "js") return { path, kind, parsed: null };
  const imports = parseImports(content);
  const exports = parseExports(content);
  const privates = parseLocalFunctions(content);
  const exportedNames = new Set([
    ...exports.fns.map((f) => f.name),
    ...exports.values,
    ...exports.classes,
    ...exports.reExports,
  ]);
  const cleanPrivates = privates.filter((p) => !exportedNames.has(p.name));
  return { path, kind, parsed: { imports, exports, privates: cleanPrivates } };
}
