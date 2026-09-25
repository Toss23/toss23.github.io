const KEYWORDS = new Set([
  "abstract","as","base","bool","break","byte","case","catch",
  "char","checked","class","const","continue","decimal","default",
  "delegate","do","double","else","enum","event","explicit","extern",
  "false","finally","fixed","float","for","foreach","goto","if",
  "implicit","in","int","interface","internal","is","lock","long",
  "namespace","new","null","object","operator","out","override",
  "params","private","protected","public","readonly","record","ref",
  "required","return","sbyte","sealed","short","sizeof","stackalloc",
  "static","string","struct","switch","this","throw","true","try",
  "typeof","uint","ulong","unchecked","unsafe","ushort","using","var",
  "virtual","void","volatile","while","dynamic","nint","nuint",
  "async","await","yield","init","with","file","global",
  "get","set","value","where","when"
]);

const TYPE_AFTER = new Set([
  "new","typeof","nameof","is","as","sizeof","default","in",
  "out","ref","stackalloc"
]);

function isIdentStart(c) {
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_" || c === "@";
}
function isIdent(c) {
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_";
}
function isDigit(c) { return c >= "0" && c <= "9"; }

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function isInterfaceName(name) {
  if (name.length < 2) return false;
  if (name[0] !== "I") return false;
  const c = name[1];
  return c >= "A" && c <= "Z";
}

export function tokenize(code) {
  const tokens = [];
  const n = code.length;
  let i = 0;
  let atLineStart = true;

  function push(type, text) { if (text) tokens.push({ type, text }); }

  while (i < n) {
    const c = code[i];
    if (c === "\n") { push("ws", "\n"); i++; atLineStart = true; continue; }
    if (c === " " || c === "\t" || c === "\r") {
      let j = i;
      while (j < n && (code[j] === " " || code[j] === "\t" || code[j] === "\r")) j++;
      push("ws", code.slice(i, j));
      i = j;
      continue;
    }
    if (c === "#" && atLineStart) {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      push("preprocessor", code.slice(i, j));
      i = j;
      atLineStart = false;
      continue;
    }
    atLineStart = false;

    if (c === "/" && code[i+1] === "/") {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      push("comment", code.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && code[i+1] === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j+1] === "/")) j++;
      if (j < n) j += 2;
      push("comment", code.slice(i, j));
      i = j;
      continue;
    }

    if (c === "@" && code[i+1] === "\"") {
      let j = i + 2;
      while (j < n) {
        if (code[j] === "\"" && code[j+1] === "\"") j += 2;
        else if (code[j] === "\"") { j++; break; }
        else j++;
      }
      push("string", code.slice(i, j));
      i = j;
      continue;
    }
    if (c === "$" && code[i+1] === "@" && code[i+2] === "\"") {
      let j = i + 3;
      while (j < n) {
        if (code[j] === "\"" && code[j+1] === "\"") j += 2;
        else if (code[j] === "\"") { j++; break; }
        else j++;
      }
      push("string", code.slice(i, j));
      i = j;
      continue;
    }
    if (c === "$" && code[i+1] === "\"") {
      let j = i + 2, depth = 0;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === "{") depth++;
        else if (code[j] === "}") depth = Math.max(0, depth - 1);
        else if (code[j] === "\"" && depth === 0) { j++; break; }
        j++;
      }
      push("string", code.slice(i, j));
      i = j;
      continue;
    }
    if (c === "\"") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === "\"") { j++; break; }
        j++;
      }
      push("string", code.slice(i, j));
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === "'") { j++; break; }
        j++;
      }
      push("char", code.slice(i, j));
      i = j;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(code[i+1]))) {
      let j = i;
      if (c === "0" && (code[i+1] === "x" || code[i+1] === "X")) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F_]/.test(code[j])) j++;
      } else if (c === "0" && (code[i+1] === "b" || code[i+1] === "B")) {
        j = i + 2;
        while (j < n && /[01_]/.test(code[j])) j++;
      } else {
        while (j < n && /[0-9_]/.test(code[j])) j++;
        if (code[j] === ".") { j++; while (j < n && /[0-9_]/.test(code[j])) j++; }
        if (code[j] === "e" || code[j] === "E") {
          j++;
          if (code[j] === "+" || code[j] === "-") j++;
          while (j < n && /[0-9_]/.test(code[j])) j++;
        }
      }
      while (j < n && /[fFdDmMuUlL]/.test(code[j])) j++;
      push("number", code.slice(i, j));
      i = j;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i;
      if (c === "@") j++;
      while (j < n && isIdent(code[j])) j++;
      const word = code.slice(i, j);
      const bare = c === "@" ? word.slice(1) : word;
      let type = "ident";
      if (KEYWORDS.has(bare)) type = "keyword";
      push(type, word);
      i = j;
      continue;
    }

    const three = code.slice(i, i + 3);
    const two = code.slice(i, i + 2);
    let op = c;
    if (["<<=", ">>=", "??=", "..."].includes(three)) op = three;
    else if (["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=",
              "*=", "/=", "%=", "=>", "?.", "??", "<<", ">>", "::",
              "->", "&=", "|=", "^="].includes(two)) op = two;
    push("op", op);
    i += op.length;
  }

  // Проход 1: атрибуты. Идентификаторы внутри [...] в начале строки.
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "op" || t.text !== "[") continue;

    let isLineStart = (k === 0);
    if (!isLineStart) {
      let p = k - 1;
      while (p >= 0 && tokens[p].type === "ws") {
        if (tokens[p].text.includes("\n")) { isLineStart = true; break; }
        p--;
      }
    }
    if (!isLineStart) continue;

    let depth = 1;
    let j = k + 1;
    while (j < tokens.length && depth > 0) {
      const tk = tokens[j];
      if (tk.type === "op" && tk.text === "[") depth++;
      else if (tk.type === "op" && tk.text === "]") depth--;
      if (depth === 0) break;
      j++;
    }
    if (depth > 0) continue;

    let parenDepth = 0;
    for (let x = k + 1; x < j; x++) {
      const tk = tokens[x];
      if (tk.type === "op") {
        if (tk.text === "(") parenDepth++;
        else if (tk.text === ")") parenDepth--;
        continue;
      }
      if (parenDepth === 0 && (tk.type === "ident" || tk.type === "keyword")) {
        tk.type = "attribute";
      }
    }
  }

  // Проход 2: методы, типы, интерфейсы.
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "ident") continue;

    let p = k - 1;
    while (p >= 0 && (tokens[p].type === "ws" || tokens[p].type === "comment")) p--;
    let nx = k + 1;
    while (nx < tokens.length && (tokens[nx].type === "ws" || tokens[nx].type === "comment")) nx++;

    const prev = p >= 0 ? tokens[p] : null;
    const next = nx < tokens.length ? tokens[nx] : null;

    if (next && next.text === "(") {
      t.type = "method";
      continue;
    }

    if (prev && prev.type === "op" && prev.text === ".") {
      if (isInterfaceName(t.text)) t.type = "interface";
      else if (/^[A-Z]/.test(t.text)) t.type = "type";
      continue;
    }

    if (prev && prev.type === "keyword" && TYPE_AFTER.has(prev.text)) {
      if (isInterfaceName(t.text)) t.type = "interface";
      else t.type = "type";
      continue;
    }

    if (isInterfaceName(t.text)) {
      t.type = "interface";
      continue;
    }

    if (/^[A-Z][A-Za-z0-9_]*$/.test(t.text)) {
      t.type = "type";
      continue;
    }
  }

  return tokens;
}

export function renderTokens(tokens) {
  let out = "";
  for (const t of tokens) {
    const text = escapeHtml(t.text);
    switch (t.type) {
      case "ws": out += text; break;
      case "keyword": out += '<span class="tok-keyword">' + text + "</span>"; break;
      case "control": out += '<span class="tok-control">' + text + "</span>"; break;
      case "type": out += '<span class="tok-type">' + text + "</span>"; break;
      case "interface": out += '<span class="tok-interface">' + text + "</span>"; break;
      case "attribute": out += '<span class="tok-attribute">' + text + "</span>"; break;
      case "method": out += '<span class="tok-method">' + text + "</span>"; break;
      case "string": out += '<span class="tok-string">' + text + "</span>"; break;
      case "char": out += '<span class="tok-char">' + text + "</span>"; break;
      case "comment": out += '<span class="tok-comment">' + text + "</span>"; break;
      case "number": out += '<span class="tok-number">' + text + "</span>"; break;
      case "preprocessor": out += '<span class="tok-preprocessor">' + text + "</span>"; break;
      case "op": out += '<span class="tok-op">' + text + "</span>"; break;
      default: out += text;
    }
  }
  return out;
}
