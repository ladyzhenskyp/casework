// Result-based answer checking for Casework.
// Compares a learner's result rows with a case's expected rows, using the
// rules recorded in CLAUDE.md. Pure functions, no DOM, so it can be tested in Node.

/** Normalize one value the same way cases/build.py normalizes the answer key. */
export function normalizeValue(v, kind) {
  if (v === null || v === undefined) return null;
  if (kind === "timestamp" || kind === "date") {
    const d = v instanceof Date ? v : new Date(Number(v));
    if (Number.isNaN(d.getTime())) return String(v);
    const iso = d.toISOString(); // always UTC
    const s = iso.slice(0, 10) + " " + iso.slice(11, 19);
    return s.endsWith(" 00:00:00") ? s.slice(0, 10) : s;
  }
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") {
    const r = Math.round(v * 100) / 100;
    return Object.is(r, -0) ? 0 : r;
  }
  if (typeof v === "boolean" || typeof v === "string") return v;
  return String(v);
}

/** Number of decimal places used in each expected column (for numbers). */
function columnPrecision(expectedRows, ncols) {
  const prec = new Array(ncols).fill(null);
  for (const row of expectedRows) {
    row.forEach((v, i) => {
      if (typeof v === "number") {
        const s = String(v);
        const d = s.includes(".") ? s.split(".")[1].length : 0;
        prec[i] = Math.max(prec[i] ?? 0, d);
      }
    });
  }
  return prec;
}

function roundTo(v, d) {
  const f = 10 ** d;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Turn a row into a comparable key, rounding numbers to the expected precision. */
function rowKey(row, prec) {
  return JSON.stringify(row.map((v, i) => (typeof v === "number" && prec[i] !== null ? roundTo(v, prec[i]) : v)));
}

function counts(rows, prec) {
  const m = new Map();
  for (const r of rows) {
    const k = rowKey(r, prec);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** A column's values as one comparable string (sorted, rounded like the expected column). */
function columnSignature(rows, i, d) {
  const vals = rows.map((r) => (typeof r[i] === "number" && d !== null ? roundTo(r[i], d) : r[i]));
  return JSON.stringify(vals.map((v) => JSON.stringify(v)).sort());
}

/**
 * Column orders worth trying: for each expected column, the actual columns that hold
 * exactly the same values. Returns up to `limit` permutations (perm[j] = actual index).
 */
function candidateOrders(actual, expected, prec, limit = 24) {
  const n = expected.columns.length;
  const cand = [];
  for (let j = 0; j < n; j++) {
    const sig = columnSignature(expected.rows, j, prec[j]);
    cand.push([...Array(n).keys()].filter((i) => columnSignature(actual.rows, i, prec[j]) === sig));
    if (!cand[j].length) return [];
  }
  const out = [], perm = [], used = new Set();
  (function walk(j) {
    if (out.length >= limit) return;
    if (j === n) { out.push([...perm]); return; }
    for (const i of cand[j]) {
      if (used.has(i)) continue;
      used.add(i); perm.push(i); walk(j + 1); perm.pop(); used.delete(i);
    }
  })(0);
  return out;
}

/** Column order by matching names, when every expected name appears exactly once. */
function orderByName(actual, expected) {
  const names = actual.columns.map((c) => String(c).toLowerCase());
  const perm = expected.columns.map((c) => names.indexOf(String(c).toLowerCase()));
  return perm.every((i, j) => i >= 0 && names.lastIndexOf(names[i]) === i && perm.indexOf(i) === j) ? perm : null;
}

const isIdentity = (perm) => perm.every((i, j) => i === j);
const reorder = (rows, perm) => rows.map((r) => perm.map((i) => r[i]));

/**
 * Compare actual rows to the expected answer.
 * Column order doesn't count: if the values match the expected columns in a
 * different order, it's still a match.
 * Returns { match, status, summary, details } where details hold samples of
 * missing / extra / repeated rows for the UI and for the tutor's explanation.
 * details.columns is the column order the samples are shown in.
 */
export function compareResults(actual, expected, { ordered = false } = {}) {
  const expCols = expected.columns.length;
  const actCols = actual.columns.length;

  if (actCols !== expCols) {
    return {
      match: false, status: "columns",
      summary: `Your result has ${actCols} column${actCols === 1 ? "" : "s"}. This case expects ${expCols}: ${expected.columns.join(", ")}.`,
      details: { expectedRows: expected.rows.length, actualRows: actual.rows.length, expectedColumns: expected.columns, actualColumns: actual.columns },
    };
  }

  const prec = columnPrecision(expected.rows, expCols);
  const identity = [...Array(expCols).keys()];
  const asWritten = compareRows(actual, identity, expected, prec, ordered);
  if (asWritten.match) return asWritten;

  // Same values, columns in another order? That still counts.
  for (const perm of candidateOrders(actual, expected, prec)) {
    if (isIdentity(perm)) continue;
    const r = compareRows(actual, perm, expected, prec, ordered);
    if (r.match || r.status === "order") {
      r.reordered = true;
      r.summary += " Your columns are in a different order than the brief lists them, which is fine.";
      return r;
    }
  }

  // Not a match. If the column names line up in another order, explain the
  // difference in that order so the samples make sense.
  const byName = orderByName(actual, expected);
  if (byName && !isIdentity(byName)) return compareRows(actual, byName, expected, prec, ordered);
  return asWritten;
}

function compareRows(actual, perm, expected, prec, ordered) {
  const rows = isIdentity(perm) ? actual.rows : reorder(actual.rows, perm);
  const columns = perm.map((i) => actual.columns[i]);
  const base = { expectedRows: expected.rows.length, actualRows: actual.rows.length, columns };
  const exp = counts(expected.rows, prec);
  const act = counts(rows, prec);

  const missing = [], extra = [], repeated = [];
  for (const [k, n] of exp) {
    const a = act.get(k) || 0;
    if (a < n) missing.push({ row: JSON.parse(k), times: n - a });
  }
  for (const [k, n] of act) {
    const e = exp.get(k) || 0;
    if (e === 0) extra.push({ row: JSON.parse(k), times: n });
    else if (n > e) repeated.push({ row: JSON.parse(k), times: n - e });
  }
  const sum = (list) => list.reduce((s, x) => s + x.times, 0);
  const details = {
    ...base,
    missingCount: sum(missing), extraCount: sum(extra), repeatedCount: sum(repeated),
    missing: missing.slice(0, 5).map((x) => x.row),
    extra: extra.slice(0, 5).map((x) => x.row),
    repeated: repeated.slice(0, 5).map((x) => x.row),
  };

  if (!missing.length && !extra.length && !repeated.length) {
    if (ordered) {
      const sameOrder = rows.every((r, i) => rowKey(r, prec) === rowKey(expected.rows[i], prec));
      if (!sameOrder) {
        return { match: false, status: "order", summary: "You have exactly the right rows, but this case asks for a specific order.", details };
      }
    }
    return { match: true, status: "match", summary: `Solved. Your ${rows.length} row${rows.length === 1 ? "" : "s"} are the same as the answer key.`, details };
  }

  const parts = [];
  if (details.missingCount) parts.push(`${details.missingCount} expected row${details.missingCount === 1 ? " is" : "s are"} missing`);
  if (details.extraCount) parts.push(`${details.extraCount} row${details.extraCount === 1 ? "" : "s"} shouldn't be there`);
  if (details.repeatedCount) parts.push(`${details.repeatedCount} row${details.repeatedCount === 1 ? " is" : "s are"} repeated`);
  let status = "different";
  if (details.missingCount && !details.extraCount && !details.repeatedCount) status = "short";
  else if (!details.missingCount && (details.extraCount || details.repeatedCount)) status = "extra";
  const summary = parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
  return { match: false, status, summary, details };
}

/** Short label for the status pill. */
export function statusLabel(result) {
  const d = result.details;
  switch (result.status) {
    case "match": return "Match";
    case "order": return "Wrong order";
    case "columns": return "Wrong columns";
    case "short": return `${d.missingCount} row${d.missingCount === 1 ? "" : "s"} short`;
    case "extra": return `${d.extraCount + d.repeatedCount} extra row${d.extraCount + d.repeatedCount === 1 ? "" : "s"}`;
    default: return "Not a match";
  }
}
