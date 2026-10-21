// Casework workspace: case list, brief, SQL editor, in-browser DuckDB and answer checking.
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
import {
  EditorView, EditorState, Compartment, Prec, keymap, placeholder, basicSetup,
  sql, PostgreSQL, HighlightStyle, syntaxHighlighting, tags, indentWithTab,
} from "../vendor/codemirror.js";
import { compareResults, normalizeValue, statusLabel } from "./checker.js";
import { splitStatements } from "./statements.js";
import { createTutor } from "./tutor.js";
import { createQuiz } from "./quiz.js";

const TABLES = ["customers", "helpdesk_orgs", "tickets", "ticket_events", "agents", "sla_policies", "csat_responses", "integration_sync_log"];
const SYSTEMS = [
  ["CRM", ["customers"]],
  ["Helpdesk", ["helpdesk_orgs", "tickets", "ticket_events", "agents", "sla_policies"]],
  ["Survey tool", ["csat_responses"]],
  ["Integration", ["integration_sync_log"]],
];
const LEVELS = [["foundations", "Foundations"], ["core", "Core"], ["advanced", "Advanced"]];
const MAX_ROWS_SHOWN = 500;
const STORE_KEY = "casework.progress.v1";
const $ = (id) => document.getElementById(id);

let CASES = [];
let current = null;
let conn = null;
let view = null;
let schema = {};
let tableCounts = {};
let loadingDoc = false;
let tutor = null;
let QUIZZES = [];
let quiz = null; // quiz controller; quiz.active while a quiz is open
const lastRun = {}; // case id -> short description of the latest run, for the tutor

/* ---------------- progress (saved in this browser only) ---------------- */
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { cases: {}, last: null }; }
  catch { return { cases: {}, last: null }; }
}
function saveProgress() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch { /* private mode: keep in memory */ }
}
const progress = loadProgress();
const caseState = (id) => (progress.cases[id] ||= { status: "new", hints: 0, query: null });

/* ---------------- case list ---------------- */
const CHECK = '<svg viewBox="0 0 10 10" fill="none"><path d="M2 5.2 4.2 7.4 8 3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function statusIcon(id) {
  const s = caseState(id);
  if (s.status === "solved") {
    const title = s.walkthrough ? "Solved with help" : s.hints ? "Solved with hints" : "Solved";
    return `<span class="st ${s.hints || s.walkthrough ? "hinted" : "solved"}" title="${title}">${CHECK}</span>`;
  }
  if (s.status === "started") return '<span class="st started" title="Started"></span>';
  return '<span class="st" title="Not started"></span>';
}
function renderNav() {
  const nav = $("cases-nav");
  const inQuiz = quiz?.active;
  nav.innerHTML = LEVELS.map(([lv, name]) =>
    `<h2>${name}</h2>` + CASES.filter((c) => c.level === lv).map((c) =>
      `<button class="case-btn" type="button" data-id="${c.id}" ${!inQuiz && current && c.id === current.id ? 'aria-current="true"' : ""}>
         <span class="n">${c.id}</span><span class="t">${esc(c.title)}</span>${statusIcon(c.id)}</button>`).join("") +
    QUIZZES.filter((q) => q.level === lv).map((q) => {
      const best = progress.quizzes?.[q.id]?.best;
      return `<button class="case-btn quiz-btn" type="button" data-quiz="${q.id}" ${inQuiz && quiz.id === q.id ? 'aria-current="true"' : ""}>
         <span class="n" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 3h8M2 6h8M2 9h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
         <span class="t">${esc(q.title)}</span><span class="qscore">${best == null ? "" : `${best}/${q.questions.length}`}</span></button>`;
    }).join("")
  ).join("");
  nav.querySelectorAll(".case-btn[data-id]").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.id)));
  nav.querySelectorAll(".case-btn[data-quiz]").forEach((b) => b.addEventListener("click", () => openQuiz(b.dataset.quiz)));
  const sel = $("case-select");
  sel.innerHTML = CASES.map((c) => `<option value="${c.id}">${c.id}. ${esc(c.title)}${caseState(c.id).status === "solved" ? " (solved)" : ""}</option>`).join("") +
    QUIZZES.map((q) => `<option value="quiz-${q.id}">${esc(q.title)}</option>`).join("");
  if (inQuiz) sel.value = `quiz-${quiz.id}`;
  else if (current) sel.value = current.id;
  const solved = CASES.filter((c) => caseState(c.id).status === "solved").length;
  $("progress-text").textContent = `${solved} of ${CASES.length} solved`;
  $("progress-bar").style.width = `${(100 * solved) / CASES.length}%`;
}

/* ---------------- brief ---------------- */
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function codeify(s) { return esc(s).replace(/'([^']+)'/g, "<code>'$1'</code>").replace(/\b([a-z]+_[a-z_]+)\b/g, "<code>$1</code>"); }

function starterQuery(c) {
  return `-- Case ${c.id}: ${c.title}\n-- Look around first, then write your answer.\nSELECT *\nFROM ${c.tables[0]}\nLIMIT 10;\n`;
}

function setMode(mode) {
  const inQuiz = mode === "quiz";
  if (!inQuiz) quiz?.stop();
  $("quiz-card").hidden = !inQuiz;
  $("brief").hidden = inQuiz;
  $("tutor-off").hidden = !inQuiz;
  $("tutor-body").hidden = inQuiz;
  $("editor-panel").hidden = false;
  $("results").hidden = false;
}

function openQuiz(id) {
  const qz = QUIZZES.find((q) => q.id === id);
  if (!qz) return;
  setMode("quiz");
  quiz.start(qz);
  history.replaceState(null, "", `#quiz-${qz.id}`);
  renderNav();
}

let fixShown = null;
/** Show or hide the editor during a quiz; load the broken query when a new fix question appears. */
function quizEditor(show, question, done) {
  $("editor-panel").hidden = !show;
  $("results").hidden = !show;
  if (!show) { fixShown = null; return; }
  if (fixShown !== question) {
    fixShown = question;
    setEditor(question.broken);
    resetResults(conn ? "Ready" : "Loading database", "Fix the query and run it. Your run is checked right away.");
  }
}

function target() {
  const fix = quiz?.active ? quiz.currentFix() : null;
  if (fix) return { expected: fix.expected, ordered: false, quiz: true };
  if (quiz?.active) return null;
  return { expected: current.expected, ordered: current.ordered, quiz: false };
}

function openCase(id) {
  setMode("case");
  current = CASES.find((c) => c.id === id) || CASES[0];
  progress.last = current.id; saveProgress();
  history.replaceState(null, "", `#case-${current.id}`);
  const lvl = LEVELS.find(([k]) => k === current.level)[1];
  $("case-tags").innerHTML = `<span class="tag case">Case ${current.id}</span><span class="tag lvl-${current.level}">${lvl}</span>` +
    current.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join("");
  $("case-title").textContent = current.title;
  $("case-prompt").innerHTML = esc(current.prompt);
  $("case-rules").innerHTML = current.rules.map((r) => `<li>${codeify(r)}</li>`).join("");
  $("case-returns").innerHTML = current.returns.map((r) => `<span class="col-chip">${esc(r)}</span>`).join("");
  $("case-tables").innerHTML = current.tables.map((t) => `<button type="button" class="col-chip table" data-t="${t}">${esc(t)}</button>`).join("");
  $("case-tables").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showTable(b.dataset.t)));
  const st = caseState(current.id);
  setEditor(st.query ?? starterQuery(current));
  renderNav();
  markUsedTables();
  tutor?.render();
  resetResults(conn ? "Ready" : "Loading database",
    conn ? "Run your query to see results. Each run is checked against the answer key." : "Getting the support database ready in your browser.");
  document.querySelector(".work").scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

/* ---------------- editor ---------------- */
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#F49AAA" },
  { tag: [tags.string, tags.special(tags.string)], color: "#E8C4A4" },
  { tag: [tags.number, tags.bool, tags.null], color: "#F0B79F" },
  { tag: tags.comment, color: "#BC958E", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: "#F7D5CC" },
  { tag: tags.operator, color: "#E59AA6" },
  { tag: tags.typeName, color: "#F0B79F" },
]);
const sqlConf = new Compartment();
function sqlExtension() {
  const sch = {};
  for (const [t, cols] of Object.entries(schema)) sch[t] = cols.map((c) => c.name);
  return sql({ dialect: PostgreSQL, schema: sch, upperCaseKeywords: true });
}
function buildEditor() {
  view = new EditorView({
    parent: $("editor"),
    state: EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        sqlConf.of(sqlExtension()),
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        placeholder("Write your SQL here"),
        Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => { runQuery(); return true; } }])),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged) updateRunLabel();
          if (u.docChanged && current && !loadingDoc && !quiz?.active) {
            const st = caseState(current.id);
            st.query = u.state.doc.toString();
            if (st.status === "new") { st.status = "started"; renderNav(); }
            saveProgress();
          }
        }),
        EditorView.contentAttributes.of({ "aria-label": "SQL editor" }),
      ],
    }),
  });
}
function setEditor(text) {
  loadingDoc = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  loadingDoc = false;
}
function insertAtCursor(text) {
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
}

/* ---------------- DuckDB ---------------- */
async function initDb() {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } });
  const c = await db.connect();
  const buffers = await Promise.all(TABLES.map(async (t) => {
    const res = await fetch(`/data/${t}.arrow`);
    if (!res.ok) throw new Error(`Couldn't load the ${t} table (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }));
  for (let i = 0; i < TABLES.length; i++) await c.insertArrowFromIPCStream(buffers[i], { name: TABLES[i] });
  const cols = await c.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'main' ORDER BY table_name, ordinal_position`);
  const counts = {};
  for (const t of TABLES) counts[t] = Number((await c.query(`SELECT count(*) AS n FROM ${t}`)).toArray()[0].n);
  for (const r of cols.toArray()) (schema[r.table_name] ||= []).push({ name: r.column_name, type: r.data_type });
  tableCounts = counts;
  return c;
}

function columnKind(type) {
  const s = String(type);
  if (/^Timestamp/i.test(s)) return "timestamp";
  if (/^Date/i.test(s)) return "date";
  return "other";
}

function readTable(result) {
  const fields = result.schema.fields;
  const kinds = fields.map((f) => columnKind(f.type));
  const columns = fields.map((f) => f.name);
  const rows = [];
  const n = result.numRows;
  const vectors = fields.map((_, i) => result.getChildAt(i));
  for (let r = 0; r < n; r++) {
    rows.push(vectors.map((v, i) => {
      let val = v.get(r);
      if (val !== null && typeof val === "object" && !(val instanceof Date)) {
        val = typeof val.toJSON === "function" ? JSON.stringify(val.toJSON()) : String(val);
      }
      return normalizeValue(val, kinds[i]);
    }));
  }
  return { columns, rows };
}

/* ---------------- running and checking ---------------- */
// One run can hold several statements (separated by semicolons). Each gets a
// result tab; only the last one is checked against the answer key.
let runs = [];        // [{ columns, rows, ms, error }]
let checked = null;   // { actual, result } for the last statement, if it ran
let activeTab = 0;

function resetResults(pill, text) {
  const p = $("status-pill");
  p.className = "pill pending"; p.textContent = pill;
  $("res-summary").textContent = text;
  $("res-meta").textContent = "";
  runs = []; checked = null; activeTab = 0;
  $("res-tabs").hidden = true; $("res-tabs").innerHTML = "";
  $("tab-note").hidden = true;
  $("diff").hidden = true; $("diff").innerHTML = "";
  $("grid-title").hidden = true;
  $("grid-wrap").hidden = true; $("grid").innerHTML = "";
  $("next-wrap").hidden = true;
}

/** Show text values so blanks and stray spaces are visible. */
function cell(v) {
  if (v === null) return '<td class="null">NULL</td>';
  if (typeof v === "number") return `<td class="num">${esc(v)}</td>`;
  const s = String(v);
  if (s === "") return '<td><span class="blank" title="Empty text: zero characters">empty</span></td>';
  if (/^\s+$/.test(s)) {
    const k = s.length;
    return `<td><span class="blank" title="Only spaces">${k} space${k === 1 ? "" : "s"}</span></td>`;
  }
  const lead = s.match(/^\s*/)[0].length, trail = s.match(/\s*$/)[0].length;
  if (!lead && !trail) return `<td>${esc(s)}</td>`;
  const dot = (k) => `<span class="ws" title="${k} extra space${k === 1 ? "" : "s"}">${"·".repeat(k)}</span>`;
  return `<td>${lead ? dot(lead) : ""}${esc(s.slice(lead, s.length - trail))}${trail ? dot(trail) : ""}</td>`;
}

function renderGrid(el, columns, rows, limit = MAX_ROWS_SHOWN) {
  const numeric = columns.map((_, i) => rows.length > 0 && rows.slice(0, 20).every((r) => r[i] === null || typeof r[i] === "number"));
  const head = `<thead><tr>${columns.map((c, i) => `<th${numeric[i] ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>`;
  const body = rows.slice(0, limit).map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("");
  el.innerHTML = head + `<tbody>${body}</tbody>`;
}

function miniTable(title, columns, rows, total) {
  const t = document.createElement("table"); t.className = "grid";
  renderGrid(t, columns, rows);
  const note = total > rows.length ? `<p class="note">First ${rows.length} of ${total.toLocaleString()}, in your query's order.</p>` : "";
  return `<div><h3>${title}</h3><div class="mini">${t.outerHTML}</div>${note}</div>`;
}

function selectedText() {
  const { from, to } = view.state.selection.main;
  return from === to ? "" : view.state.sliceDoc(from, to);
}
function updateRunLabel() {
  $("run-label").textContent = selectedText().trim() ? "Run selection" : "Run";
}

let running = false;
async function runQuery() {
  if (!conn || running || !current || !target()) return;
  const selection = selectedText().trim();
  const statements = splitStatements(selection || view.state.doc.toString());
  if (!statements.length) return;
  running = true; $("run-btn").disabled = true;
  const p = $("status-pill");
  p.className = "pill pending"; p.textContent = "Running";
  const out = [];
  for (const stmt of statements) {
    const t0 = performance.now();
    try {
      const res = await conn.query(stmt);
      out.push({ ...readTable(res), ms: Math.round(performance.now() - t0) });
    } catch (e) {
      out.push({ error: cleanError(e) });
      break; // stop at the first error, like most SQL tools
    }
  }
  running = false; $("run-btn").disabled = false;
  showRuns(out, statements.length, Boolean(selection));
  if (quiz?.active) { if (checked) quiz.fixResult(checked.result); return; }
  lastRun[current.id] = describeRun(out, statements, Boolean(selection));
  tutor?.recordRun();
}

/** What the tutor is told about the latest run (computed facts only, never the answer key). */
function describeRun(out, statements, fromSelection) {
  const lines = [];
  if (fromSelection) lines.push("The learner ran only a highlighted selection.");
  if (statements.length > 1) lines.push(`The learner ran ${statements.length} queries; only the last is checked.`);
  const last = out[out.length - 1];
  if (last.error) {
    lines.push(`Query ${out.length} failed with this DuckDB error: ${last.error}`);
    if (statements.length > 1) lines.push(`The failing query was:\n${statements[out.length - 1]}`);
  } else if (checked) {
    const { actual, result } = checked;
    lines.push(`Checker: ${statusLabel(result)}. ${result.summary}`);
    lines.push(`Their result has ${actual.rows.length} rows with columns: ${actual.columns.join(", ")}.`);
    const d = result.details;
    if (d.extra?.length) lines.push(`Sample rows that shouldn't be there: ${JSON.stringify(d.extra.slice(0, 3))}`);
    if (d.repeated?.length) lines.push(`Sample repeated rows: ${JSON.stringify(d.repeated.slice(0, 3))}`);
  }
  return lines.join("\n");
}

function cleanError(e) {
  return String(e && e.message ? e.message : e).replace(/^Error:\s*/, "").trim();
}

function showRuns(out, total, fromSelection) {
  runs = out;
  const last = out[out.length - 1];
  const lastRan = out.length === total && !last.error;
  const tgt = target();
  checked = lastRan ? { actual: last, result: compareResults(last, tgt.expected, { ordered: tgt.ordered }) } : null;
  const p = $("status-pill");
  const ranWhat = fromSelection ? "Ran your selection. " : "";

  if (checked) {
    const { actual, result } = checked;
    p.className = `pill ${result.match ? "match" : "miss"}`;
    p.textContent = statusLabel(result);
    $("res-summary").textContent = ranWhat + result.summary;
    const n = actual.rows.length;
    $("res-meta").textContent = `${n.toLocaleString()} row${n === 1 ? "" : "s"} · ${actual.ms} ms`;
    const st = tgt.quiz ? {} : caseState(current.id);
    if (!tgt.quiz && result.match && st.status !== "solved") { st.status = "solved"; st.solvedAt = new Date().toISOString(); saveProgress(); renderNav(); }
  } else {
    p.className = "pill error"; p.textContent = "Error";
    const which = total > 1 ? `Query ${out.length} of ${total} didn't run, so nothing was checked. ` : "";
    $("res-summary").textContent = ranWhat + which + "DuckDB couldn't run it. Here's what it said:";
    $("res-meta").textContent = "";
  }

  const tabs = $("res-tabs");
  if (total > 1) {
    tabs.hidden = false;
    tabs.innerHTML = Array.from({ length: total }, (_, i) => {
      const r = out[i];
      const tag = i === total - 1 ? '<span class="chk">checked</span>' : "";
      const state = !r ? " skipped" : r.error ? " failed" : "";
      return `<button type="button" role="tab" class="res-tab${state}" data-i="${i}" ${r ? "" : "disabled"}>Result ${i + 1}${tag}</button>`;
    }).join("");
    tabs.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showTab(Number(b.dataset.i))));
  } else {
    tabs.hidden = true; tabs.innerHTML = "";
  }
  showTab(out.length - 1);
}

function showTab(i) {
  activeTab = i;
  const total = $("res-tabs").children.length || 1;
  $("res-tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.i) === i)));
  const r = runs[i];
  const isChecked = i === total - 1 && checked;
  const note = $("tab-note");
  note.hidden = isChecked || r.error || total === 1;
  note.textContent = "Not checked. Only the last query is checked against the answer key.";

  const diff = $("diff");
  const parts = [];
  if (r.error) {
    parts.push(`<div class="err">${esc(r.error)}</div>`);
  } else if (isChecked) {
    const { actual, result } = checked;
    const d = result.details;
    if (!result.match && result.status !== "columns") {
      const cols = d.columns || actual.columns;
      if (d.extraCount && d.extraCount < actual.rows.length) parts.push(miniTable("Rows in your result that shouldn't be there", cols, d.extra, d.extraCount));
      if (d.repeatedCount) parts.push(miniTable("Returned more times than expected", cols, d.repeated, d.repeatedCount));
    }
  }
  diff.hidden = !parts.length; diff.innerHTML = parts.join("");

  const idx = quiz?.active ? CASES.length : CASES.indexOf(current);
  $("next-wrap").hidden = !(isChecked && checked.result.match && idx < CASES.length - 1);

  const hasRows = !r.error && r.rows.length > 0;
  $("grid-title").hidden = !hasRows;
  $("grid-title").textContent = total > 1 ? `Result ${i + 1}: ${r.rows?.length.toLocaleString() ?? 0} rows` : "Your full result";
  $("grid-wrap").hidden = !hasRows;
  if (hasRows) renderGrid($("grid"), r.columns, r.rows);
  else $("grid").innerHTML = "";
  if (!r.error && !r.rows.length) { note.hidden = false; note.textContent = isChecked ? "Your query returned no rows." : "This query returned no rows. It isn't checked."; }
}

/* ---------------- tables panel ---------------- */
function renderSchema() {
  const counts = tableCounts;
  $("schema").innerHTML = SYSTEMS.map(([sys, tables]) =>
    `<div class="sys"><h3>${sys}</h3>` + tables.map((t) =>
      `<details class="tbl" data-t="${t}"><summary>${t}<small>${(counts[t] ?? 0).toLocaleString()} rows</small></summary><ul>` +
      (schema[t] || []).map((c) => `<li><button type="button" data-col="${c.name}">${c.name}<span>${c.type.toLowerCase()}</span></button></li>`).join("") +
      "</ul></details>").join("") + "</div>").join("");
  $("schema").querySelectorAll("button[data-col]").forEach((b) => b.addEventListener("click", () => insertAtCursor(b.dataset.col)));
  markUsedTables();
}
function markUsedTables() {
  if (!current) return;
  document.querySelectorAll("details.tbl").forEach((d) => d.classList.toggle("used", current.tables.includes(d.dataset.t)));
}
function selectTab(which) {
  const tutor = which === "tutor";
  $("tab-tutor").setAttribute("aria-selected", String(tutor));
  $("tab-tables").setAttribute("aria-selected", String(!tutor));
  $("tutor-panel").hidden = !tutor;
  $("tables-panel").hidden = tutor;
}
function showTable(t) {
  selectTab("tables");
  const d = document.querySelector(`details.tbl[data-t="${t}"]`);
  if (d) { d.open = true; d.scrollIntoView({ block: "nearest" }); }
}

/* ---------------- start ---------------- */
async function main() {
  $("run-kbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl Enter";
  $("tab-tutor").addEventListener("click", () => selectTab("tutor"));
  $("tab-tables").addEventListener("click", () => selectTab("tables"));
  $("run-btn").addEventListener("click", runQuery);
  $("reset-btn").addEventListener("click", () => {
    const fix = quiz?.active && quiz.currentFix();
    if (fix) { setEditor(fix.broken); view.focus(); return; }
    if (current) { setEditor(starterQuery(current)); caseState(current.id).query = null; saveProgress(); view.focus(); } });
  $("next-btn").addEventListener("click", () => { const i = CASES.indexOf(current); if (i < CASES.length - 1) openCase(CASES[i + 1].id); });
  $("case-select").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v.startsWith("quiz-")) openQuiz(v.slice(5)); else openCase(v);
  });

  buildEditor();
  [CASES, QUIZZES] = await Promise.all([
    fetch("/cases.json").then((r) => r.json()),
    fetch("/quizzes.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  quiz = createQuiz({
    getProgress: () => progress,
    save: () => { saveProgress(); renderNav(); },
    onLeave: () => openCase(progress.last || CASES[0].id),
    openCase: (id) => openCase(id),
    showEditor: quizEditor,
    onChange: () => {},
  });
  tutor = createTutor({
    getCase: () => current,
    getState: () => caseState(current.id),
    save: saveProgress,
    getQuery: () => view.state.doc.toString(),
    getLastRun: () => lastRun[current.id] || "",
    onHelpUsed: () => renderNav(),
  });
  const fromHash = (location.hash.match(/case-(\d+)/) || [])[1];
  const quizHash = (location.hash.match(/quiz-([a-z]+)/) || [])[1];
  openCase(fromHash || progress.last || CASES[0].id);
  if (quizHash) openQuiz(quizHash);
  try {
    conn = await initDb();
    view.dispatch({ effects: sqlConf.reconfigure(sqlExtension()) });
    renderSchema();
    $("run-btn").disabled = false;
    if (!quiz?.active) resetResults("Ready", "Run your query to see results. Each run is checked against the answer key.");
    else if (fixShown) resetResults("Ready", "Fix the query and run it. Your run is checked right away.");
    window.__casework = { conn, CASES, readTable, compareResults, setQuery: (q) => setEditor(q) }; // for automated tests
  } catch (e) {
    const p = $("status-pill"); p.className = "pill error"; p.textContent = "Couldn't load";
    $("res-summary").textContent = "The database didn't load. Check your connection and refresh the page.";
    $("diff").hidden = false; $("diff").innerHTML = `<div class="err">${esc(cleanError(e))}</div>`;
  }
}
addEventListener("hashchange", () => {
  const id = (location.hash.match(/case-(\d+)/) || [])[1];
  const qid = (location.hash.match(/quiz-([a-z]+)/) || [])[1];
  if (qid && !(quiz?.active && quiz.id === qid)) openQuiz(qid);
  else if (id && (quiz?.active || !current || id !== current.id)) openCase(id);
});
main();
