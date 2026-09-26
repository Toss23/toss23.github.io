const JS_EXT = new Set(["js", "mjs", "cjs", "ts", "jsx", "tsx"]);
const CS_EXT = new Set(["cs"]);
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
  if (CS_EXT.has(ext)) return "cs";
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

/* ============================================================
   JavaScript
   ============================================================ */

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
  while ((m = fnRe.exec(content)) !== null) fns.push({ name: m[2], args: m[3], async: !!m[1] });
  while ((m = arrowRe.exec(content)) !== null) fns.push({ name: m[1], args: m[3], async: !!m[2] });
  while ((m = fnExprRe.exec(content)) !== null) fns.push({ name: m[1], args: m[3], async: !!m[2] });
  while ((m = valRe.exec(content)) !== null) values.push(m[1]);
  while ((m = clsRe.exec(content)) !== null) classes.push(m[1]);
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
  while ((m = reAsync.exec(content)) !== null) fns.push({ name: m[1], args: m[2], async: true });
  while ((m = re.exec(content)) !== null) fns.push({ name: m[1], args: m[2], async: false });
  while ((m = reArrow.exec(content)) !== null) fns.push({ name: m[1], args: m[3], async: !!m[2] });
  return fns;
}

/* ============================================================
   C#
   ============================================================ */

const CS_KEYWORDS = new Set([
  "if", "for", "while", "switch", "foreach", "using", "return", "new",
  "catch", "lock", "do", "else", "case", "throw", "await", "yield",
  "sizeof", "typeof", "nameof", "is", "as", "in", "out", "ref",
  "checked", "unchecked", "base", "this", "stackalloc", "fixed",
]);

function stripCsStrings(s) {
  return s
    .replace(/\/\/.*$/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@"(?:[^"]|"")*"/g, '""')
    .replace(/\$@"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\$"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function stripModifiers(s) {
  return s.replace(/^(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial|readonly|required|const|volatile|file)\s+)+/, "");
}

function parseCsharpMember(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith("//") || s.startsWith("/*") || s.startsWith("*")) return null;
  if (s === "{" || s === "}" || s === "};" || s === ");") return null;
  if (s.startsWith("[")) return null;
  if (s.startsWith("#")) return null;
  if (s.startsWith("case ") || s.startsWith("default:")) return null;

  s = stripModifiers(s);
  if (!s) return null;

  let m;

  m = s.match(/^event\s+([A-Za-z_][A-Za-z0-9_<>,.\[\]?]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;{=]/);
  if (m) return { kind: "event", type: m[1], name: m[2] };

  m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?(?:\{|$)/);
  if (m && !CS_KEYWORDS.has(m[1]) && /^[A-Z]/.test(m[1])) {
    return { kind: "ctor", name: m[1], args: m[2] };
  }

  m = s.match(/^([A-Za-z_][A-Za-z0-9_<>,.\[\]?]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/);
  if (m && !CS_KEYWORDS.has(m[1])) {
    return { kind: "method", returnType: m[1], name: m[2], args: m[3] };
  }

  m = s.match(/^([A-Za-z_][A-Za-z0-9_<>,.\[\]?]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*([;{=]|=>)/);
  if (m) {
    const type = m[1];
    const name = m[2];
    const after = m[3];
    if (after === "{" || s.includes("=>")) return { kind: "property", type, name };
    if (after === "=") return { kind: "property", type, name };
    return { kind: "field", type, name };
  }

  return null;
}

function parseCsharpFile(content) {
  const usings = [];
  const usingRe = /^\s*using\s+(?:static\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*(?:=[^;]+)?;/gm;
  let m;
  while ((m = usingRe.exec(content)) !== null) usings.push(m[1]);

  const nsMatch = content.match(/namespace\s+([A-Za-z_][A-Za-z0-9_.]*)/);
  const namespace = nsMatch ? nsMatch[1] : "";

  const lines = content.split("\n");
  const types = [];

  let depth = 0;
  let pendingType = null;
  const typeStack = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const clean = stripCsStrings(raw);

    if (!pendingType) {
      const typeMatch = raw.match(/^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|internal|private|protected|static|abstract|sealed|partial|unsafe|new|file)\s+)*(class|struct|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)\s*([^{;]*)/);
      if (typeMatch) {
        pendingType = {
          kind: typeMatch[1],
          name: typeMatch[2],
          bases: (typeMatch[3] || "").trim().replace(/^:\s*/, ""),
          members: [],
        };
      }
    }

    const opens = (clean.match(/{/g) || []).length;
    const closes = (clean.match(/}/g) || []).length;

    if (pendingType && opens > 0) {
      const bodyDepth = depth + 1;
      typeStack.push({ type: pendingType, bodyDepth });
      types.push(pendingType);
      pendingType = null;
    }

    const current = typeStack[typeStack.length - 1];
    if (current && depth === current.bodyDepth) {
      const member = parseCsharpMember(raw.trim());
      if (member) current.type.members.push(member);
    }

    depth += opens - closes;

    while (typeStack.length && depth < typeStack[typeStack.length - 1].bodyDepth) {
      typeStack.pop();
    }
  }

  return { usings, namespace, types };
}

/* ============================================================
   Общая структура файла
   ============================================================ */

export const SERVICE_FOLDER_RE = /^(bin|obj|Debug|Release|packages|node_modules|\.vs|\.vscode|\.idea|\.git|TestResults|artifacts|net\d+(?:\.\d+)?|netstandard\d+(?:\.\d+)?|netcoreapp\d+(?:\.\d+)?)$/i;

export function hasServiceFolder(path) {
  if (typeof path !== "string") return false;
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    if (SERVICE_FOLDER_RE.test(parts[i])) return true;
  }
  return false;
}

export function isAnalyzable(path) {
  const k = kindOf(path);
  return k === "js" || k === "cs";
}

export function parseFile(path, content) {
  const kind = kindOf(path);
  if (kind === "cs") {
    return { path, kind, parsed: { csharp: parseCsharpFile(content) } };
  }
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

/* ============================================================
   Дерево
   ============================================================ */

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

/* ============================================================
   Рендер секции файла
   ============================================================ */

function renderJsSection(info) {
  const out = [];
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

function renderCsSection(info) {
  const out = [];
  const { usings, namespace, types } = info.parsed.csharp;

  if (namespace) {
    out.push("**Пространство имён:** `" + namespace + "`");
    out.push("");
  }
  if (usings.length) {
    out.push("**Using:**");
    for (const u of usings) out.push("- `" + u + "`");
    out.push("");
  }
  if (!types.length) {
    out.push("_Нет объявлений типов._");
    out.push("");
    return out.join("\n");
  }

  for (const t of types) {
    const header = "`" + t.kind + " " + t.name + "`" + (t.bases ? " : " + t.bases : "");
    out.push("**" + header + "**");
    if (!t.members.length) {
      out.push("- _(нет членов)_");
    } else {
      for (const m of t.members) {
        if (m.kind === "method") {
          out.push("- `" + m.returnType + " " + m.name + "(" + m.args + ")`");
        } else if (m.kind === "ctor") {
          out.push("- `" + m.name + "(" + m.args + ")` _(конструктор)_");
        } else if (m.kind === "property") {
          out.push("- `" + m.type + " " + m.name + "` _(свойство)_");
        } else if (m.kind === "field") {
          out.push("- `" + m.type + " " + m.name + "` _(поле)_");
        } else if (m.kind === "event") {
          out.push("- `event " + m.type + " " + m.name + "`");
        }
      }
    }
    out.push("");
  }

  return out.join("\n");
}

function renderFileSection(info) {
  const { path, size, kind } = info;
  const out = [];
  out.push("### " + path);

  if (kind === "js") {
    out.push(renderJsSection(info));
    return out.join("\n");
  }
  if (kind === "cs") {
    out.push(renderCsSection(info));
    return out.join("\n");
  }

  out.push("_" + kind.toUpperCase() + " \u00B7 не анализируется_");
  out.push("");
  return out.join("\n");
}

/* ============================================================
   Карта проекта
   ============================================================ */

export function renderProjectMap({ repoLabel, branch, mode, files }) {
  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").slice(0, 16);
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);

  const lines = [];
  lines.push("# Карта проекта");
  lines.push("");
  lines.push("- **Репозиторий:** " + (repoLabel || "\u2014"));
  lines.push("- **Ветка:** " + (branch || "\u2014"));
  lines.push("- **Режим:** " + (mode || "\u2014"));
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
