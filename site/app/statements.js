// Split editor text into separate SQL statements on semicolons, ignoring
// semicolons inside quotes and comments. Drops pieces that hold only comments
// or whitespace. Pure function, testable in Node.

export function splitStatements(text) {
  const out = [];
  let start = 0, i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], next = text[i + 1];
    if (c === "'" || c === '"') {
      i++;
      while (i < n) {
        if (text[i] === c && text[i + 1] === c) { i += 2; continue; } // '' escape
        if (text[i] === c) break;
        i++;
      }
      i++;
    } else if (c === "-" && next === "-") {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === ";") {
      out.push(text.slice(start, i));
      start = ++i;
    } else {
      i++;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => stripComments(s).trim() !== "");
}

function stripComments(s) {
  return s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?(\*\/|$)/g, "");
}
