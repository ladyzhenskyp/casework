// The tutor panel: hint ladder, questions, and the walkthrough that unlocks after
// a learner has used every hint level and kept trying. Talks to /api/tutor; the
// Claude API key and the reference solutions stay on the server.

const RUNS_TO_UNLOCK = 3;   // runs after the level 3 hint before the walkthrough opens
const HISTORY_SENT = 8;     // earlier messages sent along so the tutor builds on them
const THREAD_KEPT = 30;     // messages saved per case in this browser
const LABEL = { 1: "Nudge", 2: "Structure", 3: "Skeleton", ask: "Answer", walkthrough: "Walkthrough" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Small, safe markdown: code blocks, inline code, bold, italics, lists, paragraphs. */
export function renderMarkdown(text) {
  const blocks = [];
  let s = String(text).replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = esc(s)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  const out = [];
  for (const para of s.split(/\n{2,}/)) {
    const lines = para.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*] /.test(l))) out.push(`<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*] /, "")}</li>`).join("")}</ul>`);
    else if (lines.every((l) => /^\s*\d+[.)] /.test(l))) out.push(`<ol>${lines.map((l) => `<li>${l.replace(/^\s*\d+[.)] /, "")}</li>`).join("")}</ol>`);
    else if (/^\u0000\d+\u0000$/.test(lines.join("").trim())) out.push(lines.join(""));
    else out.push(`<p>${lines.join("<br>")}</p>`);
  }
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

export function createTutor({ getCase, getState, save, getQuery, getLastRun, getHidden, onHelpUsed, getUser, onSignIn }) {
  let busy = false;
  let busyMode = null;
  // Hints (levels 1 to 3) and the walkthrough show in the Hints tab; questions in the Tutor tab.
  const inHints = (m) => (m.role === "learner" ? m.kind === "walkthrough" : m.kind !== "ask");
  let remaining = null;
  let sample = false;

  const st = () => {
    const s = getState();
    s.thread ||= [];
    s.level ||= 0;           // highest hint level received
    s.runs ||= 0;            // runs of this case
    s.runsAtL3 ??= null;     // run count when level 3 arrived
    return s;
  };

  function unlocked(s) {
    return s.walkthrough || (s.level >= 3 && s.runsAtL3 !== null && s.runs - s.runsAtL3 >= RUNS_TO_UNLOCK);
  }

  function note(text, isError = false, where = null) {
    for (const id of where ? [where] : ["hint-note", "hints-note"]) {
      const n = $(id);
      n.textContent = text || "";
      n.classList.toggle("error", isError);
    }
  }

  function remainingText() {
    if (sample) return "Sample mode: the tutor isn't connected to Claude on this server.";
    if (remaining === null) return "";
    return `${remaining} tutor ${remaining === 1 ? "reply" : "replies"} left today.`;
  }

  function render() {
    const c = getCase();
    if (!c) return;
    const s = st();
    document.querySelectorAll(".rung[data-level]").forEach((r) => {
      const lv = Number(r.dataset.level);
      r.classList.toggle("used", s.level >= lv);
      r.classList.toggle("next", s.level + 1 === lv);
    });
    const open = unlocked(s);
    const walk = $("walk-rung");
    walk.classList.toggle("used", Boolean(s.walkthrough));
    walk.classList.toggle("next", open && !s.walkthrough);
    const left = s.level >= 3 && s.runsAtL3 !== null ? Math.max(0, RUNS_TO_UNLOCK - (s.runs - s.runsAtL3)) : null;
    $("walk-text").textContent = s.walkthrough ? "In progress. The case will count as solved with help."
      : open ? "Unlocked. The tutor walks you through it one step at a time."
      : left !== null ? `Unlocks after ${left} more run${left === 1 ? "" : "s"}`
      : "Unlocks after all three hints and 3 more runs";

    const hb = $("hint-btn");
    const guest = getUser && !getUser();
    hb.textContent = guest ? "Sign in to get hints" : s.level >= 3 ? "Another skeleton hint" : `Get a hint (${["Nudge", "Structure", "Skeleton"][s.level]})`;
    $("ask-input").placeholder = guest ? "Sign in to ask the tutor" : "Ask about this case, an error, or a SQL idea";
    hb.disabled = busy;
    $("walk-btn").hidden = !open;
    $("walk-btn").textContent = s.walkthrough ? "Next step" : "Walk me through it";
    $("walk-btn").disabled = busy;
    $("ask-btn").disabled = busy;

    const draw = (m) => m.role === "learner"
      ? `<div class="msg learner"><p>${esc(m.text)}</p></div>`
      : `<div class="msg tutor"><div class="msg-tag">${esc(LABEL[m.kind] || "Tutor")}</div>${renderMarkdown(m.text)}</div>`;
    const thinking = '<div class="msg tutor thinking"><span></span><span></span><span></span><span class="sr">The tutor is thinking</span></div>';
    $("hint-thread").innerHTML = s.thread.filter(inHints).map(draw).join("") + (busy && busyMode !== "ask" ? thinking : "");
    const asked = s.thread.filter((m) => !inHints(m));
    $("thread").innerHTML = (asked.length ? asked.map(draw).join("")
      : '<p class="empty-chat">No questions yet. Try "Why is my result too long?" or "What does HAVING do?"</p>')
      + (busy && busyMode === "ask" ? thinking : "");
    if (!busy) note(guest ? "Hints and the tutor are for signed-in beta testers. Everything else works without an account." : remainingText());
  }

  async function ask(mode, question = "") {
    const c = getCase();
    if (!c || busy) return;
    if (getUser && !getUser()) { onSignIn?.(); return; }
    const s = st();
    const level = mode === "hint" ? Math.min(3, s.level + 1) : null;
    if (question) s.thread.push({ role: "learner", kind: mode, text: question });
    else if (mode === "walkthrough" && !s.walkthrough) s.thread.push({ role: "learner", kind: "walkthrough", text: "Walk me through it." });
    busy = true; busyMode = mode; render(); scrollThread(mode);
    const history = s.thread.slice(-HISTORY_SENT - (question ? 1 : 0), question ? -1 : undefined)
      .map((m) => ({ role: m.role === "learner" ? "learner" : "tutor", text: m.text }));
    try {
      const res = await fetch("/api/tutor", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ case_id: c.id, mode, level, question, query: getQuery(), last_result: getLastRun(), history, runs: s.runs, hidden: getHidden?.() || {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data.remaining === "number") remaining = data.remaining;
      if (!res.ok) throw new Error(data.error || `The tutor couldn't answer (HTTP ${res.status}).`);
      sample = Boolean(data.sample);
      s.thread.push({ role: "tutor", kind: mode === "hint" ? level : mode, text: data.reply });
      if (mode === "hint") {
        s.hints = (s.hints || 0) + 1;
        if (level > s.level) s.level = level;
        if (level === 3 && s.runsAtL3 === null) s.runsAtL3 = s.runs;
      }
      if (mode === "walkthrough") s.walkthrough = true;
      onHelpUsed?.();
      busy = false; busyMode = null;
      s.thread = s.thread.slice(-THREAD_KEPT);
      save(); render(); scrollThread(mode);
    } catch (e) {
      if (question) { s.thread.pop(); $("ask-input").value = question; }
      else if (mode === "walkthrough" && !s.walkthrough) s.thread.pop();
      busy = false; busyMode = null; render();
      note(e.message === "Failed to fetch" ? "Couldn't reach the tutor. Check your connection and try again." : e.message, true,
        mode === "ask" ? "hint-note" : "hints-note");
    }
  }

  function scrollThread(mode) {
    const last = $(mode === "ask" ? "thread" : "hint-thread").lastElementChild;
    if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  $("hint-btn").addEventListener("click", () => ask("hint"));
  $("walk-btn").addEventListener("click", () => ask("walkthrough"));
  $("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (getUser && !getUser()) { onSignIn?.(); return; }
    const q = $("ask-input").value.trim();
    if (!q) return;
    $("ask-input").value = "";
    ask("ask", q);
  });
  $("ask-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("ask-form").requestSubmit(); }
  });

  fetch("/api/tutor").then((r) => r.json()).then((d) => { remaining = d.remaining; sample = d.sample; render(); }).catch(() => {});

  return {
    render,
    recordRun() { st().runs += 1; save(); render(); },
  };
}
