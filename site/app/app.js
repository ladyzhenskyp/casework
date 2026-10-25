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
import * as motion from "./motion.js";
import { createAccount } from "./account.js";

const TABLES = ["customers", "helpdesk_orgs", "tickets", "ticket_events", "agents", "sla_policies", "csat_responses", "integration_sync_log"];
const SYSTEMS = [
  ["CRM", ["customers"]],
  ["Helpdesk", ["helpdesk_orgs", "tickets", "ticket_events", "agents", "sla_policies"]],
  ["Survey tool", ["csat_responses"]],
  ["Integration", ["integration_sync_log"]],
];
const LEVELS = [["foundations", "Foundations"], ["bridge", "Bridge"], ["core", "Core"], ["advanced", "Advanced"]];
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
let DRILL_SETS = [];
const DRILLS = {}; // drill id -> drill (drills work like small cases)
let mode = "case"; // case | quiz | picker
let booted = false; // after the first load, switching items animates
let pickerLevel = null;
const findItem = (id) => CASES.find((c) => c.id === id) || DRILLS[id];
const isDrill = (item) => item?.kind === "drill";
let quiz = null; // quiz controller; quiz.active while a quiz is open
const lastRun = {}; // case id -> short description of the latest run, for the tutor

/* ---------------- progress (this browser, plus the account when signed in) ---------------- */
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { cases: {}, last: null }; }
  catch { return { cases: {}, last: null }; }
}
function saveProgress() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch { /* private mode: keep in memory */ }
  account?.queueSave();
}
let account = null;
const progress = loadProgress();
const settings = () => (progress.settings ||= { hideReturns: false, hideTables: false });
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
  const drillRow = (lv) => {
    const sets = DRILL_SETS.filter((d) => d.level === lv);
    if (!sets.length) return "";
    const all = sets.flatMap((d) => d.drills);
    const done = all.filter((d) => caseState(d.id).status === "solved").length;
    const here = (mode === "picker" && pickerLevel === lv) || (mode === "case" && isDrill(current) && current.level === lv);
    return `<button class="case-btn quiz-btn drill-btn" type="button" data-drills="${lv}" ${here ? 'aria-current="true"' : ""}>
       <span class="n" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 9.5 4.5 7l2 2L10 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
       <span class="t">${LEVELS.find(([k]) => k === lv)[1]} drills</span><span class="qscore">${done}/${all.length}</span></button>`;
  };
  nav.innerHTML = LEVELS.map(([lv, name]) =>
    `<h2>${name}</h2>` + CASES.filter((c) => c.level === lv).map((c) =>
      `<button class="case-btn" type="button" data-id="${c.id}" ${mode === "case" && current && c.id === current.id ? 'aria-current="true"' : ""}>
         <span class="n">${c.id}</span><span class="t">${esc(c.title)}</span>${statusIcon(c.id)}</button>`).join("") +
    drillRow(lv) +
    QUIZZES.filter((q) => q.level === lv).map((q) => {
      const best = progress.quizzes?.[q.id]?.best;
      return `<button class="case-btn quiz-btn" type="button" data-quiz="${q.id}" ${inQuiz && quiz.id === q.id ? 'aria-current="true"' : ""}>
         <span class="n" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 3h8M2 6h8M2 9h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
         <span class="t">${esc(q.title)}</span><span class="qscore">${best == null ? "" : `${best}/${q.questions.length}`}</span></button>`;
    }).join("")
  ).join("");
  nav.querySelectorAll(".case-btn[data-id]").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.id)));
  nav.querySelectorAll(".case-btn[data-quiz]").forEach((b) => b.addEventListener("click", () => openQuiz(b.dataset.quiz)));
  nav.querySelectorAll(".case-btn[data-drills]").forEach((b) => b.addEventListener("click", () => openDrills(b.dataset.drills)));
  const sel = $("case-select");
  sel.innerHTML = CASES.map((c) => `<option value="${c.id}">${c.id}. ${esc(c.title)}${caseState(c.id).status === "solved" ? " (solved)" : ""}</option>`).join("") +
    [...new Set(DRILL_SETS.map((d) => d.level))].map((lv) => `<option value="drills-${lv}">${LEVELS.find(([k]) => k === lv)[1]} drills</option>`).join("") +
    (isDrill(current) ? `<option value="${current.id}">Drill: ${esc(current.title)}</option>` : "") +
    QUIZZES.map((q) => `<option value="quiz-${q.id}">${esc(q.title)}</option>`).join("");
  if (inQuiz) sel.value = `quiz-${quiz.id}`;
  else if (mode === "picker") sel.value = `drills-${pickerLevel}`;
  else if (current) sel.value = current.id;
  const solved = CASES.filter((c) => caseState(c.id).status === "solved").length;
  $("progress-text").textContent = `${solved} of ${CASES.length} solved`;
  $("progress-bar").style.width = `${(100 * solved) / CASES.length}%`;
  motion.glide(nav, nav.querySelector('.case-btn[aria-current="true"]'), "nav", "nav-ind");
}

/* ---------------- brief ---------------- */
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function codeify(s) { return esc(s).replace(/'([^']+)'/g, "<code>'$1'</code>").replace(/\b([a-z]+_[a-z_]+)\b/g, "<code>$1</code>"); }

/** Rules, returned columns and tables. Columns and tables can be hidden for a harder practice. */
function renderScaffolding() {
  if (!current) return;
  const { hideReturns, hideTables } = settings();
  // Column names never count in checking, so naming rules are hidden along with the columns.
  const rules = hideReturns ? current.rules.filter((r) => !/^Name the /i.test(r)) : current.rules;
  $("case-rules").innerHTML = rules.map((r) => `<li>${codeify(r)}</li>`).join("");
  $("case-returns").innerHTML = hideReturns
    ? '<span class="col-chip hidden-chip">Hidden. Work out what the answer needs.</span>'
    : current.returns.map((r) => `<span class="col-chip">${esc(r)}</span>`).join("");
  $("case-tables").innerHTML = hideTables
    ? '<span class="col-chip hidden-chip">Hidden. Explore the Tables tab.</span>'
    : current.tables.map((t) => `<button type="button" class="col-chip table" data-t="${t}">${esc(t)}</button>`).join("");
  $("case-tables").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => showTable(b.dataset.t)));
  $("toggle-returns").textContent = hideReturns ? "Show" : "Hide";
  $("toggle-returns").setAttribute("aria-label", `${hideReturns ? "Show" : "Hide"} the columns to return`);
  $("toggle-tables").textContent = hideTables ? "Show" : "Hide";
  $("toggle-tables").setAttribute("aria-label", `${hideTables ? "Show" : "Hide"} the tables you'll need`);
  if (!hideTables) markUsedTables(); else document.querySelectorAll("details.tbl").forEach((d) => d.classList.remove("used"));
}

function starterQuery(c) {
  if (isDrill(c)) return `-- Drill: ${c.title}\nSELECT *\nFROM ${c.tables[0]}\nLIMIT 10;\n`;
  return `-- Case ${c.id}: ${c.title}\n-- Look around first, then write your answer.\nSELECT *\nFROM ${c.tables[0]}\nLIMIT 10;\n`;
}

function setMode(m) {
  mode = m;
  const card = m !== "case";
  if (m !== "quiz") quiz?.stop();
  if (m !== "picker") pickerLevel = null;
  $("quiz-card").hidden = !card;
  $("brief").hidden = card;
  const offText = m === "quiz"
    ? "Hints and the tutor are off during quizzes, so the score shows what you know. Afterward, each question links to the case that teaches it, where they're back on."
    : "Pick a drill to start. Hints and the tutor can help inside every drill.";
  document.querySelectorAll(".off-note").forEach((n) => { n.hidden = !card; n.textContent = offText; });
  document.querySelectorAll(".help-body").forEach((b) => { b.hidden = card; });
  $("editor-panel").hidden = m === "picker";
  $("results").hidden = m === "picker";
}

function openDrills(level) {
  const sets = DRILL_SETS.filter((d) => d.level === level);
  if (!sets.length) return;
  setMode("picker");
  pickerLevel = level;
  history.replaceState(null, "", `#drills-${level}`);
  const name = LEVELS.find(([k]) => k === level)[1];
  const card = $("quiz-card");
  card.innerHTML = `
    <div class="tags"><span class="tag case">Drills</span><span class="tag lvl-${level}">${name}</span></div>
    <h1>${name} drills</h1>
    <p class="prompt">Short exercises, one skill at a time. Click a drill to open it in the editor; each takes a few minutes and is checked right away. Do them in any order, and come back to repeat any of them.</p>
    <div class="drill-sets">${sets.map((set) => {
      const done = set.drills.filter((d) => caseState(d.id).status === "solved").length;
      return `<section class="drill-set">
        <div class="ds-head"><h2>${esc(set.title)}</h2><span class="ds-count">${done} of ${set.drills.length}</span></div>
        <p class="ds-intro">${esc(set.intro)}</p>
        <ol class="ds-list">${set.drills.map((d, i) => {
          const st = caseState(d.id).status;
          const tag = st === "solved" ? '<span class="ds-st done">Solved</span>' : st === "started" ? '<span class="ds-st">Started</span>' : "";
          return `<li><button type="button" class="ds-row" data-drill="${d.id}">
          <span class="n">${i + 1}</span><span class="t">${esc(d.title)}</span>${tag}<span class="go" aria-hidden="true">Open →</span></button></li>`;
        }).join("")}</ol>
        <button type="button" class="review-link" data-case="${set.review}">Review case ${set.review}</button>
      </section>`;
    }).join("")}</div>`;
  card.querySelectorAll("[data-drill]").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.drill)));
  card.querySelectorAll(".review-link").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.case)));
  renderNav();
  window.scrollTo(0, 0);
  if (booted) motion.switchIn();
}

/** What the "next" button after a match leads to. */
function nextStep() {
  if (isDrill(current)) {
    const set = DRILL_SETS.find((d) => d.id === current.set);
    const i = set.drills.findIndex((d) => d.id === current.id);
    return i < set.drills.length - 1
      ? { label: "Next drill", go: () => openCase(set.drills[i + 1].id) }
      : { label: "Back to drills", go: () => openDrills(current.level) };
  }
  const i = CASES.indexOf(current);
  return i < CASES.length - 1 ? { label: "Next case", go: () => openCase(CASES[i + 1].id) } : null;
}

function openQuiz(id) {
  const qz = QUIZZES.find((q) => q.id === id);
  if (!qz) return;
  setMode("quiz");
  quiz.start(qz);
  history.replaceState(null, "", `#quiz-${qz.id}`);
  renderNav();
  if (booted) motion.switchIn();
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
  current = findItem(id) || CASES[0];
  progress.last = current.id; saveProgress();
  history.replaceState(null, "", isDrill(current) ? `#drill-${current.id}` : `#case-${current.id}`);
  const lvl = LEVELS.find(([k]) => k === current.level)[1];
  const set = isDrill(current) ? DRILL_SETS.find((d) => d.id === current.set) : null;
  $("case-tags").innerHTML = (set
    ? `<span class="tag case">Drill</span><span class="tag lvl-${current.level}">${esc(set.title)}</span>`
    : `<span class="tag case">Case ${current.id}</span><span class="tag lvl-${current.level}">${lvl}</span>`) +
    current.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join("");
  $("case-title").textContent = current.title;
  $("case-prompt").innerHTML = esc(current.prompt);
  renderScaffolding();
  const st = caseState(current.id);
  setEditor(st.query ?? starterQuery(current));
  renderNav();
  markUsedTables();
  tutor?.render();
  resetResults(conn ? "Ready" : "Loading database",
    conn ? "Run your query to see results. Each run is checked against the answer key." : "Getting the database ready in your browser. The first visit takes a few seconds; after that it's quicker. You can read the case and start writing meanwhile.");
  document.querySelector(".work").scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  if (booted) motion.switchIn();
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
  $("checkin").hidden = true;
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
  // Columns fit their content; an empty last column takes the leftover width so
  // a two-column result doesn't spread across the whole panel.
  const head = `<thead><tr>${columns.map((c, i) => `<th${numeric[i] ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}<th class="fill" aria-hidden="true"></th></tr></thead>`;
  const body = rows.slice(0, limit).map((r) => `<tr>${r.map(cell).join("")}<td class="fill" aria-hidden="true"></td></tr>`).join("");
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
  checked = lastRan ? { actual: last, result: compareResults(last, tgt.expected, { ordered: tgt.ordered, hideColumns: !tgt.quiz && settings().hideReturns }) } : null;
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
  motion.settle($("results"));
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

  const nxt = quiz?.active ? null : nextStep();
  $("next-wrap").hidden = !(isChecked && checked.result.match && nxt);
  showCheckin(Boolean(isChecked && checked.result.match && !quiz?.active && !isDrill(current)));
  if (nxt) $("next-label").textContent = nxt.label;

  const hasRows = !r.error && r.rows.length > 0;
  $("grid-title").hidden = !hasRows;
  $("grid-title").textContent = total > 1 ? `Result ${i + 1}: ${r.rows?.length.toLocaleString() ?? 0} rows` : "Your full result";
  $("grid-wrap").hidden = !hasRows;
  if (hasRows) renderGrid($("grid"), r.columns, r.rows);
  else $("grid").innerHTML = "";
  if (!r.error && !r.rows.length) { note.hidden = false; note.textContent = isChecked ? "Your query returned no rows." : "This query returned no rows. It isn't checked."; }
}

/* ---------------- check-in after solving a case (beta feedback) ---------------- */
let ckDifficulty = null;
function showCheckin(solved) {
  const form = $("checkin");
  const done = (progress.checkins ||= {})[current?.id];
  if (!solved || done || !account?.user) { form.hidden = true; return; }
  if (form.hidden) {
    ckDifficulty = null;
    form.querySelectorAll("[data-d]").forEach((b) => b.setAttribute("aria-checked", "false"));
    $("ck-unclear").checked = false; $("ck-note").value = ""; $("ck-msg").textContent = "";
    $("ck-send").disabled = false;
  }
  form.hidden = false;
}
function setupCheckin() {
  const form = $("checkin");
  form.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    ckDifficulty = b.dataset.d;
    form.querySelectorAll("[data-d]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  }));
  const finish = (how, message) => {
    progress.checkins[current.id] = how; saveProgress();
    $("ck-msg").textContent = message;
    setTimeout(() => { form.hidden = true; }, how === "sent" ? 1400 : 0);
  };
  $("ck-skip").addEventListener("click", () => finish("skipped", ""));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("ck-note").value.trim(), unclear = $("ck-unclear").checked;
    if (!ckDifficulty && !note && !unclear) { $("ck-msg").textContent = "Pick an answer first, or press Skip."; return; }
    $("ck-send").disabled = true;
    const st = caseState(current.id);
    try {
      const res = await fetch("/api/checkin", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ case_id: current.id, difficulty: ckDifficulty, unclear, note, hints: st.hints || 0, runs: st.runs || 0 }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send that. Try again.");
      finish("sent", "Thanks! That helps a lot.");
    } catch (err) {
      $("ck-msg").textContent = err.message; $("ck-send").disabled = false;
    }
  });
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
const TABS = ["hints", "tables", "tutor"];
let currentTab = "hints";
function selectTab(which) {
  const dir = Math.sign(TABS.indexOf(which) - TABS.indexOf(currentTab)) || 1;
  const changed = which !== currentTab;
  currentTab = which;
  for (const t of TABS) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === which));
    $(`${t}-panel`).hidden = t !== which;
  }
  if (which === "tutor" && matchMedia("(min-width: 821px)").matches) requestAnimationFrame(() => $("ask-input").focus({ preventScroll: true }));
  motion.glide(document.querySelector(".side-tabs"), $(`tab-${which}`), "tabs", "tab-ind");
  if (changed) motion.tabIn($(`${which}-panel`), dir);
}
function showTable(t) {
  selectTab("tables");
  const d = document.querySelector(`details.tbl[data-t="${t}"]`);
  if (d) { d.open = true; d.scrollIntoView({ block: "nearest" }); }
}

/* ---------------- start ---------------- */
async function main() {
  $("run-kbd").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl Enter";
  for (const t of TABS) $(`tab-${t}`).addEventListener("click", () => selectTab(t));
  $("run-btn").addEventListener("click", runQuery);
  $("reset-btn").addEventListener("click", () => {
    const fix = quiz?.active && quiz.currentFix();
    if (fix) { setEditor(fix.broken); view.focus(); return; }
    if (current) { setEditor(starterQuery(current)); caseState(current.id).query = null; saveProgress(); view.focus(); } });
  $("next-btn").addEventListener("click", () => nextStep()?.go());
  for (const [btn, key] of [["toggle-returns", "hideReturns"], ["toggle-tables", "hideTables"]]) {
    $(btn).addEventListener("click", () => { settings()[key] = !settings()[key]; saveProgress(); renderScaffolding(); });
  }
  $("case-select").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v.startsWith("quiz-")) openQuiz(v.slice(5));
    else if (v.startsWith("drills-")) openDrills(v.slice(7));
    else openCase(v);
  });

  buildEditor();
  setupCheckin();
  const dbReady = initDb(); // the biggest wait (the database engine); start it first
  dbReady.catch(() => {});
  [CASES, QUIZZES, DRILL_SETS] = await Promise.all([
    fetch("/cases.json").then((r) => r.json()),
    fetch("/quizzes.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch("/drills.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  for (const set of DRILL_SETS) for (const d of set.drills) DRILLS[d.id] = d;
  account = createAccount({
    getProgress: () => progress,
    setProgress: (p) => {
      for (const k of Object.keys(progress)) delete progress[k];
      Object.assign(progress, p);
      progress.cases ||= {};
      try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch { /* keep in memory */ }
    },
    clearLocal: () => { try { localStorage.removeItem(STORE_KEY); } catch { /* nothing saved */ } },
    getPlace: () => mode === "quiz" ? (QUIZZES.find((q) => q.id === quiz.id)?.title || "A quiz")
      : mode === "picker" ? `${LEVELS.find(([k]) => k === pickerLevel)?.[1] || ""} drills`
      : current ? `${isDrill(current) ? "Drill" : `Case ${current.id}`}: ${current.title}` : "The workspace",
  });
  await account.start();
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
    getHidden: () => ({ columns: settings().hideReturns, tables: settings().hideTables }),
    onHelpUsed: () => renderNav(),
    getUser: () => account.user,
    onSignIn: () => account.openAuth("signin"),
  });
  const fromHash = (location.hash.match(/case-([A-Z]?\d+)/) || [])[1];
  const quizHash = (location.hash.match(/quiz-([a-z]+)/) || [])[1];
  const drillHash = (location.hash.match(/#drill-([a-z]+\d+)/) || [])[1];
  const drillsHash = (location.hash.match(/#drills-([a-z]+)/) || [])[1];
  openCase(drillHash || fromHash || (findItem(progress.last) ? progress.last : CASES[0].id));
  if (quizHash) openQuiz(quizHash);
  else if (drillsHash) openDrills(drillsHash);
  selectTab("hints");
  motion.entrance();
  booted = true;
  try {
    conn = await dbReady;
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
  const id = (location.hash.match(/case-([A-Z]?\d+)/) || [])[1];
  const qid = (location.hash.match(/quiz-([a-z]+)/) || [])[1];
  const did = (location.hash.match(/#drill-([a-z]+\d+)/) || [])[1];
  const dlv = (location.hash.match(/#drills-([a-z]+)/) || [])[1];
  if (did) { if (current?.id !== did || mode !== "case") openCase(did); }
  else if (dlv) { if (mode !== "picker" || pickerLevel !== dlv) openDrills(dlv); }
  else if (qid && !(quiz?.active && quiz.id === qid)) openQuiz(qid);
  else if (id && (mode !== "case" || !current || id !== current.id)) openCase(id);
});
main();
