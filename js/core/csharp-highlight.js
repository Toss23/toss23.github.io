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

const MODIFIERS = new Set([
  "public","private","protected","internal","static","readonly","const",
  "sealed","abstract","virtual","override","new","partial","extern",
  "unsafe","volatile","async","required"
]);

const TYPE_AFTER = new Set([
  "new","typeof","nameof","is","as","sizeof","default","in",
  "out","ref","stackalloc"
]);

const BRACKET_OPEN = { "(": ")", "[": "]", "{": "}" };
const BRACKET_CLOSE = { ")": "(", "]": "[", "}": "{" };

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

  function push(type, text, pos) { if (text) tokens.push({ type, text, pos }); }

  while (i < n) {
    const c = code[i];
    const startPos = i;
    if (c === "\n") { push("ws", "\n", startPos); i++; atLineStart = true; continue; }
    if (c === " " || c === "\t" || c === "\r") {
      let j = i;
      while (j < n && (code[j] === " " || code[j] === "\t" || code[j] === "\r")) j++;
      push("ws", code.slice(i, j), startPos);
      i = j;
      continue;
    }
    if (c === "#" && atLineStart) {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      push("preprocessor", code.slice(i, j), startPos);
      i = j;
      atLineStart = false;
      continue;
    }
    atLineStart = false;

    if (c === "/" && code[i+1] === "/") {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      push("comment", code.slice(i, j), startPos);
      i = j;
      continue;
    }
    if (c === "/" && code[i+1] === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j+1] === "/")) j++;
      if (j < n) j += 2;
      push("comment", code.slice(i, j), startPos);
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
      push("string", code.slice(i, j), startPos);
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
      push("string", code.slice(i, j), startPos);
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
      push("string", code.slice(i, j), startPos);
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
      push("string", code.slice(i, j), startPos);
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
      push("char", code.slice(i, j), startPos);
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
      push("number", code.slice(i, j), startPos);
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
      push(type, word, startPos);
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
    push("op", op, startPos);
    i += op.length;
  }

  // Проход 1: атрибуты
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

  // Проход 2: методы, типы, интерфейсы
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "ident") continue;
    let p = k - 1;
    while (p >= 0 && (tokens[p].type === "ws" || tokens[p].type === "comment")) p--;
    let nx = k + 1;
    while (nx < tokens.length && (tokens[nx].type === "ws" || tokens[nx].type === "comment")) nx++;
    const prev = p >= 0 ? tokens[p] : null;
    const next = nx < tokens.length ? tokens[nx] : null;
    if (next && next.text === "(") { t.type = "method"; continue; }
    if (prev && prev.type === "op" && prev.text === ".") continue;
    if (prev && prev.type === "keyword" && TYPE_AFTER.has(prev.text)) {
      if (isInterfaceName(t.text)) t.type = "interface";
      else t.type = "type";
      continue;
    }
    if (isInterfaceName(t.text)) { t.type = "interface"; continue; }
    if (/^[A-Z][A-Za-z0-9_]*$/.test(t.text)) { t.type = "type"; continue; }
  }

  // Проход 3: аргументы
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "method") continue;
    let i = k + 1;
    while (i < tokens.length && (tokens[i].type === "ws" || tokens[i].type === "comment")) i++;
    if (i >= tokens.length || tokens[i].type !== "op" || tokens[i].text !== "(") continue;
    let depth = 1;
    let j = i + 1;
    while (j < tokens.length && depth > 0) {
      const tk = tokens[j];
      if (tk.type === "op" && tk.text === "(") depth++;
      else if (tk.type === "op" && tk.text === ")") depth--;
      if (depth === 0) break;
      j++;
    }
    if (depth > 0) continue;
    let after = j + 1;
    while (after < tokens.length && (tokens[after].type === "ws" || tokens[after].type === "comment")) after++;
    const afterTok = after < tokens.length ? tokens[after] : null;
    const isDeclaration = afterTok && afterTok.type === "op" &&
      (afterTok.text === "{" || afterTok.text === "=>");
    if (!isDeclaration) continue;
    let angle = 0;
    for (let x = i + 1; x < j; x++) {
      const tk = tokens[x];
      if (tk.type === "op") {
        if (tk.text === "<") angle++;
        else if (tk.text === ">") angle = Math.max(0, angle - 1);
        continue;
      }
      if (angle > 0) continue;
      if (tk.type === "ident") tk.type = "arg";
    }
  }

  // Проход 4-5: члены класса
  const memberMap = collectClassMembers(tokens);
  applyClassMembers(tokens, memberMap);

  return tokens;
}

function computeDepths(tokens) {
  const n = tokens.length;
  const depths = new Array(n).fill(0);
  let d = 0;
  for (let k = 0; k < n; k++) {
    const t = tokens[k];
    if (t.type === "op" && t.text === "}") d = Math.max(0, d - 1);
    depths[k] = d;
    if (t.type === "op" && t.text === "{") d++;
  }
  return depths;
}

function findClassBodyDepth(tokens) {
  const n = tokens.length;
  const depths = computeDepths(tokens);
  for (let k = 0; k < n; k++) {
    const t = tokens[k];
    if (t.type !== "keyword") continue;
    if (t.text !== "class" && t.text !== "struct" && t.text !== "record") continue;
    let j = k + 1;
    while (j < n && !(tokens[j].type === "op" && tokens[j].text === "{")) j++;
    if (j >= n) return -1;
    return depths[j] + 1;
  }
  return -1;
}

function collectClassMembers(tokens) {
  const map = new Map();
  const classBodyDepth = findClassBodyDepth(tokens);
  if (classBodyDepth < 0) return map;
  const depths = computeDepths(tokens);
  const stmtIdxs = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const d = depths[k];
    if (d !== classBodyDepth) continue;
    if (t.type === "op" && t.text === "{") {
      if (stmtIdxs.length > 0) processClassMember(tokens, stmtIdxs.splice(0), map);
      let inner = 1;
      let j = k + 1;
      while (j < tokens.length && inner > 0) {
        if (tokens[j].type === "op" && tokens[j].text === "{") inner++;
        else if (tokens[j].type === "op" && tokens[j].text === "}") inner--;
        j++;
      }
      k = j - 1;
      continue;
    }
    if (t.type === "op" && (t.text === ";" || t.text === "}")) {
      if (stmtIdxs.length > 0) processClassMember(tokens, stmtIdxs.splice(0), map);
      continue;
    }
    stmtIdxs.push(k);
  }
  if (stmtIdxs.length > 0) processClassMember(tokens, stmtIdxs, map);
  return map;
}

function processClassMember(tokens, idxs, map) {
  if (idxs.length === 0) return;
  let cutAt = idxs.length;
  let paren = 0, angle = 0, bracket = 0;
  for (let p = 0; p < idxs.length; p++) {
    const k = idxs[p];
    const t = tokens[k];
    if (t.type === "op") {
      if (paren === 0 && angle === 0 && bracket === 0) {
        if (t.text === "(" || t.text === "=>" || t.text === "=") { cutAt = p; break; }
      }
      if (t.text === "(") paren++;
      else if (t.text === ")") paren--;
      else if (t.text === "<") angle++;
      else if (t.text === ">") angle = Math.max(0, angle - 1);
      else if (t.text === "[") bracket++;
      else if (t.text === "]") bracket--;
    } else if (t.type === "keyword" && t.text === "where" && paren === 0 && angle === 0 && bracket === 0) {
      cutAt = p; break;
    }
  }
  const decl = [];
  for (let p = 0; p < cutAt; p++) {
    const k = idxs[p];
    const t = tokens[k];
    if (t.type === "ws" || t.type === "comment") continue;
    decl.push(k);
  }
  if (decl.length === 0) return;
  let nameIdx = -1;
  for (let p = decl.length - 1; p >= 0; p--) {
    const k = decl[p];
    if (tokens[k].type === "ident" || tokens[k].type === "type") { nameIdx = k; break; }
  }
  if (nameIdx < 0) return;
  let hasTypeBefore = false;
  for (const k of decl) {
    if (k >= nameIdx) break;
    const tk = tokens[k];
    if (tk.type === "keyword" && MODIFIERS.has(tk.text)) continue;
    if (tk.type === "keyword" && tk.text === "event") continue;
    hasTypeBefore = true;
    break;
  }
  if (!hasTypeBefore) return;
  let hasEvent = false;
  for (const k of decl) {
    if (k >= nameIdx) break;
    if (tokens[k].type === "keyword" && tokens[k].text === "event") { hasEvent = true; break; }
  }
  const name = tokens[nameIdx].text;
  if (hasEvent) map.set(name, "event");
  else if (/^_/.test(name) || /^[a-z]/.test(name)) map.set(name, "field");
  else map.set(name, "property");
}

function applyClassMembers(tokens, memberMap) {
  if (!memberMap || memberMap.size === 0) return;
  const n = tokens.length;
  const TYPE_CTX = new Set([
    "new","typeof","is","as","event","class","struct","interface",
    "enum","delegate","where"
  ]);
  for (let k = 0; k < n; k++) {
    const t = tokens[k];
    if (t.type !== "ident" && t.type !== "type") continue;
    if (!memberMap.has(t.text)) continue;
    let p = k - 1;
    while (p >= 0 && (tokens[p].type === "ws" || tokens[p].type === "comment")) p--;
    const prev = p >= 0 ? tokens[p] : null;
    if (prev && prev.type === "op" && prev.text === ".") continue;
    if (prev && prev.type === "keyword") {
      if (MODIFIERS.has(prev.text)) continue;
      if (TYPE_CTX.has(prev.text)) continue;
    }
    let nx = k + 1;
    while (nx < n && (tokens[nx].type === "ws" || tokens[nx].type === "comment")) nx++;
    const next = nx < n ? tokens[nx] : null;
    if (next && next.type === "op" && next.text === "(") continue;
    if (next && (next.type === "ident" || next.type === "type")) continue;
    t.type = memberMap.get(t.text);
  }
}

/**
 * Находит парную скобку для символа на позиции pos.
 * Возвращает пару [openPos, closePos] или null.
 */
export function findBracketPair(text, pos) {
  if (!text || pos < 0 || pos > text.length) return null;

  const left = pos - 1;
  const right = pos;

  function matchFromOpen(openIdx) {
    const openCh = text[openIdx];
    const closeCh = BRACKET_OPEN[openCh];
    if (!closeCh) return null;
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
      const ch = text[i];
      if (ch === openCh) depth++;
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) return [openIdx, i];
      }
    }
    return null;
  }

  function matchFromClose(closeIdx) {
    const closeCh = text[closeIdx];
    const openCh = BRACKET_CLOSE[closeCh];
    if (!openCh) return null;
    let depth = 0;
    for (let i = closeIdx; i >= 0; i--) {
      const ch = text[i];
      if (ch === closeCh) depth++;
      else if (ch === openCh) {
        depth--;
        if (depth === 0) return [i, closeIdx];
      }
    }
    return null;
  }

  if (right < text.length) {
    const ch = text[right];
    if (BRACKET_OPEN[ch]) {
      const pair = matchFromOpen(right);
      if (pair) return pair;
    }
    if (BRACKET_CLOSE[ch]) {
      const pair = matchFromClose(right);
      if (pair) return pair;
    }
  }

  if (left >= 0) {
    const ch = text[left];
    if (BRACKET_OPEN[ch]) {
      const pair = matchFromOpen(left);
      if (pair) return pair;
    }
    if (BRACKET_CLOSE[ch]) {
      const pair = matchFromClose(left);
      if (pair) return pair;
    }
  }

  return null;
}

export function renderPlain(text, bracketPair) {
  const safe = text == null ? "" : String(text);
  if (!bracketPair) return escapeHtml(safe);
  const a = bracketPair[0];
  const b = bracketPair[1];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo < 0 || hi >= safe.length || lo === hi) return escapeHtml(safe);
  return (
    escapeHtml(safe.slice(0, lo)) +
    '<span class="tok-bracket-match">' + escapeHtml(safe[lo]) + "</span>" +
    escapeHtml(safe.slice(lo + 1, hi)) +
    '<span class="tok-bracket-match">' + escapeHtml(safe[hi]) + "</span>" +
    escapeHtml(safe.slice(hi + 1))
  );
}

export function renderTokens(tokens, bracketPair) {
  let out = "";
  const highlightSet = bracketPair ? new Set(bracketPair) : null;

  function emit(text, cls, pos) {
    if (!text) return;
    if (highlightSet && pos !== undefined && text.length === 1 && highlightSet.has(pos)) {
      const baseCls = cls ? cls + " " : "";
      out += '<span class="' + baseCls + 'tok-bracket-match">' + text + "</span>";
    } else if (cls) {
      out += '<span class="' + cls + '">' + text + "</span>";
    } else {
      out += text;
    }
  }

  for (const t of tokens) {
    const text = escapeHtml(t.text);
    const cls = (() => {
      switch (t.type) {
        case "keyword": return "tok-keyword";
        case "control": return "tok-control";
        case "type": return "tok-type";
        case "interface": return "tok-interface";
        case "attribute": return "tok-attribute";
        case "method": return "tok-method";
        case "arg": return "tok-arg";
        case "field": return "tok-field";
        case "property": return "tok-property";
        case "event": return "tok-event";
        case "string": return "tok-string";
        case "char": return "tok-char";
        case "comment": return "tok-comment";
        case "number": return "tok-number";
        case "preprocessor": return "tok-preprocessor";
        case "op": return "tok-op";
        default: return null;
      }
    })();

    if (highlightSet && t.pos !== undefined && text.length === 1 && highlightSet.has(t.pos)) {
      const baseCls = cls ? cls + " " : "";
      out += '<span class="' + baseCls + 'tok-bracket-match">' + text + "</span>";
    } else if (cls) {
      out += '<span class="' + cls + '">' + text + "</span>";
    } else {
      out += text;
    }
  }
  return out;
}
