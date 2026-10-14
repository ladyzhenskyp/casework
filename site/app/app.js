// Casework workspace: case list, brief, SQL editor, in-browser DuckDB and answer checking.
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
import {
  EditorView, EditorState, Compartment, Prec, keymap, placeholder, basicSetup,
  sql, PostgreSQL, HighlightStyle, syntaxHighlighting, tags, indentWithTab,
} from "../vendor/codemirror.js";
import { compareResults, normalizeValue, statusLabel } from "./checker.js";

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
  if (s.status === "solved") return `<span class="st ${s.hints ? "hinted" : "solved"}" title="${s.hints ? "Solved with hints" : "Solved"}">${CHECK}</span>`;
  if (s.status === "started") return '<span class="st started" title="Started"></span>';
  return '<span class="st" title="Not started"></span>';
}
function renderNav() {
  const nav = $("cases-nav");
  nav.innerHTML = LEVELS.map(([lv, name]) =>
    `<h2>${name}</h2>` + CASES.filter((c) => c.level === lv).map((c) =>
      `<button class="case-btn" type="button" data-id="${c.id}" ${current && c.id === current.id ? 'aria-current="true"' : ""}>
         <span class="n">${c.id}</span><span class="t">${esc(c.title)}</span>${statusIcon(c.id)}</button>`).join("")
  ).join("");
  nav.querySelectorAll(".case-btn").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.id)));
  const sel = $("case-select");
  sel.innerHTML = CASES.map((c) => `<option value="${c.id}">${c.id}. ${esc(c.title)}${caseState(c.id).status === "solved" ? " (solved)" : ""}</option>`).join("");
  if (current) sel.value = current.id;
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

function openCase(id) {
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
          if (u.docChanged && current && !loadingDoc) {
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
function resetResults(pill, text) {
  const p = $("status-pill");
  p.className = "pill pending"; p.textContent = pill;
  $("res-summary").textContent = text;
  $("res-meta").textContent = "";
  $("diff").hidden = true; $("diff").innerHTML = "";
  $("grid-wrap").hidden = true; $("grid").innerHTML = "";
  $("next-wrap").hidden = true;
}

function renderGrid(el, columns, rows, limit = MAX_ROWS_SHOWN) {
  const numeric = columns.map((_, i) => rows.length > 0 && rows.slice(0, 20).every((r) => r[i] === null || typeof r[i] === "number"));
  const head = `<thead><tr>${columns.map((c, i) => `<th${numeric[i] ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>`;
  const body = rows.slice(0, limit).map((r) => `<tr>${r.map((v) =>
    v === null ? '<td class="null">NULL</td>' : `<td${typeof v === "number" ? ' class="num"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("");
  el.innerHTML = head + `<tbody>${body}</tbody>`;
}

function miniTable(title, columns, rows, more) {
  const t = document.createElement("table"); t.className = "grid";
  renderGrid(t, columns, rows);
  return `<div><h3>${title}</h3><div class="mini">${t.outerHTML}</div>${more > rows.length ? `<p class="note">Showing ${rows.length} of ${more}.</p>` : ""}</div>`;
}

let running = false;
async function runQuery() {
  if (!conn || running || !current) return;
  const text = view.state.doc.toString().trim();
  if (!text) return;
  running = true; $("run-btn").disabled = true;
  const p = $("status-pill");
  p.className = "pill pending"; p.textContent = "Running";
  const t0 = performance.now();
  try {
    const res = await conn.query(text.replace(/;\s*$/, ""));
    const ms = Math.round(performance.now() - t0);
    const actual = readTable(res);
    const result = compareResults(actual, current.expected, { ordered: current.ordered });
    showResult(actual, result, ms);
  } catch (e) {
    p.className = "pill error"; p.textContent = "Error";
    $("res-summary").textContent = "DuckDB couldn't run that query. Here's what it said:";
    $("res-meta").textContent = "";
    $("diff").hidden = false;
    $("diff").innerHTML = `<div class="err">${esc(cleanError(e))}</div>`;
    $("grid-wrap").hidden = true; $("next-wrap").hidden = true;
  } finally {
    running = false; $("run-btn").disabled = false;
  }
}

function cleanError(e) {
  return String(e && e.message ? e.message : e).replace(/^Error:\s*/, "").trim();
}

function showResult(actual, result, ms) {
  const p = $("status-pill");
  p.className = `pill ${result.match ? "match" : "miss"}`;
  p.textContent = statusLabel(result);
  $("res-summary").textContent = result.summary;
  const n = actual.rows.length;
  $("res-meta").textContent = `${n.toLocaleString()} row${n === 1 ? "" : "s"} · ${ms} ms`;

  const d = result.details;
  const parts = [];
  if (!result.match && result.status !== "columns") {
    if (d.extraCount && d.extraCount < actual.rows.length) parts.push(miniTable("Rows in your result that shouldn't be there", actual.columns, d.extra, d.extraCount));
    if (d.repeatedCount) parts.push(miniTable("Returned more times than expected", actual.columns, d.repeated, d.repeatedCount));
  }
  $("diff").hidden = !parts.length;
  $("diff").innerHTML = parts.join("");

  if (n) { renderGrid($("grid"), actual.columns, actual.rows); $("grid-wrap").hidden = false; }
  else { $("grid-wrap").hidden = true; }

  const st = caseState(current.id);
  if (result.match) {
    if (st.status !== "solved") { st.status = "solved"; st.solvedAt = new Date().toISOString(); saveProgress(); renderNav(); }
    const idx = CASES.indexOf(current);
    $("next-wrap").hidden = idx >= CASES.length - 1;
  } else {
    $("next-wrap").hidden = true;
  }
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
  $("reset-btn").addEventListener("click", () => { if (current) { setEditor(starterQuery(current)); caseState(current.id).query = null; saveProgress(); view.focus(); } });
  $("next-btn").addEventListener("click", () => { const i = CASES.indexOf(current); if (i < CASES.length - 1) openCase(CASES[i + 1].id); });
  $("case-select").addEventListener("change", (e) => openCase(e.target.value));

  buildEditor();
  CASES = await (await fetch("/cases.json")).json();
  const fromHash = (location.hash.match(/case-(\d+)/) || [])[1];
  openCase(fromHash || progress.last || CASES[0].id);
  try {
    conn = await initDb();
    view.dispatch({ effects: sqlConf.reconfigure(sqlExtension()) });
    renderSchema();
    $("run-btn").disabled = false;
    resetResults("Ready", "Run your query to see results. Each run is checked against the answer key.");
    window.__casework = { conn, CASES, readTable, compareResults, setQuery: (q) => setEditor(q) }; // for automated tests
  } catch (e) {
    const p = $("status-pill"); p.className = "pill error"; p.textContent = "Couldn't load";
    $("res-summary").textContent = "The database didn't load. Check your connection and refresh the page.";
    $("diff").hidden = false; $("diff").innerHTML = `<div class="err">${esc(cleanError(e))}</div>`;
  }
}
addEventListener("hashchange", () => {
  const id = (location.hash.match(/case-(\d+)/) || [])[1];
  if (id && (!current || id !== current.id)) openCase(id);
});
main();
