import { setDirty } from "./store.js";
import { bytesToBase64, isProbablyText } from "./encoding.js";
import * as storage from "./storage.js";

// Расширения, которые гарантированно текст.
const TEXT_EXT = new Set([
  "txt", "md", "markdown", "rst", "log",
  "html", "htm", "xhtml", "css", "scss", "sass", "less",
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "vue", "svelte",
  "json", "json5", "jsonc", "map",
  "xml", "svg", "xsl", "xslt", "rss", "atom",
  "yml", "yaml", "toml", "ini", "cfg", "conf", "env",
  "cs", "csproj", "sln", "props", "targets",
  "py", "rb", "php", "java", "kt", "scala", "go", "rs",
  "c", "h", "cpp", "hpp", "cc", "hh", "m", "mm",
  "swift", "dart", "lua", "pl", "r",
  "sh", "bash", "zsh", "fish", "bat", "cmd", "ps1",
  "sql", "graphql", "gql",
  "gitignore", "gitattributes", "gitmodules",
  "editorconfig", "dockerfile", "makefile",
  "csv", "tsv", "diff", "patch",
]);

const TEXT_FILENAMES = new Set([
  "dockerfile", "makefile", "readme", "license", "changelog",
  "authors", "contributors", ".gitignore", ".gitattributes",
  ".editorconfig", ".env", ".babelrc", ".eslintrc", ".prettierrc",
]);

function isTextByExtension(name) {
  if (!name) return false;
  const lower = name.toLowerCase();

  if (TEXT_FILENAMES.has(lower)) return true;

  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = lower.slice(dot + 1);
  return TEXT_EXT.has(ext);
}

export async function readUploadedFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length === 0) {
    return { content: "", isBinary: false, size: 0 };
  }

  // BOM текстовых форматов — признак текста.
  const hasUtf8Bom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const hasUtf16BeBom = bytes[0] === 0xFE && bytes[1] === 0xFF;
  const hasUtf16LeBom = bytes[0] === 0xFF && bytes[1] === 0xFE;

  // Приоритет: известное текстовое расширение.
  if (isTextByExtension(file.name)) {
    let text;
    if (hasUtf16BeBom || hasUtf16LeBom) {
      text = new TextDecoder("utf-16").decode(bytes);
    } else {
      text = new TextDecoder("utf-8").decode(bytes);
    }
    console.log("[upload] text by ext", file.name, bytes.length);
    return { content: text, isBinary: false, size: bytes.length };
  }

  if (hasUtf8Bom) {
    const text = new TextDecoder("utf-8").decode(bytes);
    console.log("[upload] utf-8 BOM text", file.name, bytes.length);
    return { content: text, isBinary: false, size: bytes.length };
  }
  if (hasUtf16BeBom || hasUtf16LeBom) {
    const text = new TextDecoder("utf-16").decode(bytes);
    console.log("[upload] utf-16 text", file.name, bytes.length);
    return { content: text, isBinary: false, size: bytes.length };
  }

  if (isProbablyText(bytes)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    console.log("[upload] utf-8 text", file.name, bytes.length);
    return { content: text, isBinary: false, size: bytes.length };
  }

  console.log("[upload] binary", file.name, bytes.length);
  return { content: bytesToBase64(bytes), isBinary: true, size: bytes.length };
}

export async function saveUploadedEntry({ mode, cloned, path, data }) {
  const entry = {
    path,
    content: data.content,
    isBinary: !!data.isBinary,
    sha: null,
    baseSha: null,
    baseContentLf: data.isBinary ? "" : data.content,
    size: data.size,
    isNew: true,
  };

  if (mode === "local" && cloned) {
    await storage.saveFile(cloned.key, entry);
  }
  if (!data.isBinary) {
    setDirty(path, data.content);
  }

  return entry;
}