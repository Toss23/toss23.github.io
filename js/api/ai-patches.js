function normalizeText(s) {
  if (typeof s !== "string") return s;
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Некорректный JSON: " + e.message);
  }
  if (!data || typeof data !== "object") {
    throw new Error("JSON должен быть объектом");
  }
  const changes = Array.isArray(data.changes) ? data.changes : null;
  if (!changes) {
    throw new Error("В JSON нет поля 'changes' (массив)");
  }

  const out = [];
  changes.forEach((c, i) => {
    const norm = normalizeChange(c, i);
    if (norm) {
      if (typeof norm.find === "string") norm.find = normalizeText(norm.find);
      if (typeof norm.replace === "string") norm.replace = normalizeText(norm.replace);
      out.push(norm);
    }
  });

  if (!out.length) throw new Error("Нет валидных операций в 'changes'");
  return { version: data.version || 1, changes: out };
}

function normalizeChange(c, index) {
  if (!c || typeof c !== "object") return null;
  const type = c.type;
  const path = typeof c.path === "string" ? c.path.replace(/^\/+/, "") : null;
  if (!path) return null;

  if (type === "replace" || type === "replaceAll") {
    if (typeof c.find !== "string" || typeof c.replace !== "string") return null;
    return { type, path, find: c.find, replace: c.replace, comment: c.comment || "", _index: index };
  }
  if (type === "create" || type === "fullContent") {
    if (typeof c.content !== "string") return null;
    return { type, path, content: c.content, comment: c.comment || "", _index: index };
  }
  if (type === "delete") {
    return { type, path, comment: c.comment || "", _index: index };
  }
  return null;
}

/**
 * currentContent:
 *   - string — текст файла (LF)
 *   - { binary: true } — бинарник
 *   - null — файла нет
 */
export function checkChange(change, currentContent) {
  if (currentContent && typeof currentContent === "string") {
    currentContent = normalizeText(currentContent);
  }
  const type = change.type;

  if (type === "delete") {
    if (currentContent === null) {
      return { ok: false, status: "fail", reason: "файл не найден" };
    }
    if (currentContent?.binary) {
      return { ok: true, status: "warn", reason: "бинарный файл будет удалён" };
    }
    return { ok: true, status: "ok", reason: "файл будет удалён" };
  }

  if (type === "create") {
    if (currentContent !== null) {
      if (currentContent?.binary) {
        return { ok: false, status: "fail", reason: "бинарник нельзя перезаписать текстом" };
      }
      return { ok: true, status: "warn", reason: "файл уже существует — будет перезаписан" };
    }
    return { ok: true, status: "ok", reason: "файл будет создан" };
  }

  if (type === "fullContent") {
    if (currentContent === null) {
      return { ok: true, status: "warn", reason: "файла нет — будет создан" };
    }
    if (currentContent?.binary) {
      return { ok: false, status: "fail", reason: "бинарник нельзя перезаписать текстом" };
    }
    return { ok: true, status: "ok", reason: "содержимое будет заменено целиком" };
  }

  if (type === "replace" || type === "replaceAll") {
    if (currentContent === null) {
      return { ok: false, status: "fail", reason: "файл не найден" };
    }
    if (currentContent?.binary) {
      return { ok: false, status: "fail", reason: "бинарный файл — патч не поддерживается" };
    }
    if (!change.find) {
      return { ok: false, status: "fail", reason: "пустой 'find'" };
    }

    const count = countOccurrences(currentContent, change.find);
    if (count === 0) {
      return { ok: false, status: "fail", reason: "'find' не найден в файле" };
    }
    if (type === "replace" && count > 1) {
      return {
        ok: false,
        status: "fail",
        reason: `'find' встречается ${count} раз — нужно уникальное совпадение`,
      };
    }
    return {
      ok: true,
      status: type === "replaceAll" && count > 1 ? "warn" : "ok",
      reason: type === "replaceAll"
        ? `заменено вхождений: ${count}`
        : "фрагмент найден",
    };
  }

  return { ok: false, status: "fail", reason: "неизвестный тип" };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while (true) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    count++;
    idx += needle.length;
  }
  return count;
}

export function applyChange(change, currentContent) {
  if (currentContent && typeof currentContent === "string") {
    currentContent = normalizeText(currentContent);
  }
  const type = change.type;
  if (type === "delete") return { delete: true };
  if (type === "create" || type === "fullContent") return { content: change.content };
  if (type === "replace") {
    if (currentContent === null || currentContent?.binary) throw new Error("Файл недоступен");
    return { content: currentContent.replace(change.find, change.replace) };
  }
  if (type === "replaceAll") {
    if (currentContent === null || currentContent?.binary) throw new Error("Файл недоступен");
    return { content: currentContent.split(change.find).join(change.replace) };
  }
  throw new Error("Неизвестный тип");
}