// Quizzes: one question at a time, instant feedback, a results card with links
// back to the cases that teach each idea. Fix-it questions use the real editor
// and checker; the rest are answered on the card. The tutor is off in quizzes.

import { renderMarkdown } from "./tutor.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const md = (s) => renderMarkdown(s).replace(/^<p>([\s\S]*)<\/p>$/, "$1");
const LETTERS = "ABCD";
const TYPE_LABEL = { spot: "Spot the bug", choice: "Why", predict: "Predict the output", fix: "Fix it" };

function miniTable({ columns, rows }) {
  const cell = (v) => v === null ? '<td class="null">NULL</td>'
    : typeof v === "number" ? `<td class="num">${v}</td>`
    : /^\s+$/.test(v) ? `<td><span class="blank">${v.length} space${v.length === 1 ? "" : "s"}</span></td>`
    : v === "" ? '<td><span class="blank">empty</span></td>' : `<td>${esc(v)}</td>`;
  return `<table class="grid"><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("")}</tbody></table>`;
}

export function createQuiz({ getProgress, save, onLeave, openCase, showEditor, onChange }) {
  let quiz = null;
  let qi = -1;          // -1 intro, questions.length = results
  let answers = [];     // per question: { picked, correct, revealed }
  let picked = null;

  const state = () => ((getProgress().quizzes ||= {})[quiz.id] ||= { best: null, attempts: 0 });
  const q = () => quiz.questions[qi];

  function start(qz) {
    quiz = qz; qi = -1; answers = []; picked = null;
    render();
  }

  function dots() {
    return `<div class="q-dots" aria-hidden="true">${quiz.questions.map((_, i) => {
      const a = answers[i];
      const cls = a ? (a.correct ? "right" : "wrong") : i === qi ? "now" : "";
      return `<span class="${cls}"></span>`;
    }).join("")}</div>`;
  }

  function render() {
    const card = $("quiz-card");
    const s = state();
    if (qi === -1 || qi >= quiz.questions.length) showEditor(false);
    if (qi === -1) {
      card.innerHTML = `
        <div class="tags"><span class="tag case">Quiz</span><span class="tag lvl-${quiz.level}">${esc(quiz.title.replace(" quiz", ""))}</span><span class="tag">${quiz.questions.length} questions</span></div>
        <h1>${esc(quiz.title)}</h1>
        <p class="prompt">${esc(quiz.intro)}</p>
        <ul class="q-topics">${quiz.questions.map((x) => `<li><span>${TYPE_LABEL[x.type]}</span>${esc(x.concept)}</li>`).join("")}</ul>
        ${s.best !== null ? `<p class="q-best">Your best score: ${s.best} of ${quiz.questions.length}</p>` : ""}
        <div class="q-actions"><button type="button" class="next-btn" id="q-start">Start quiz</button></div>`;
      $("q-start").addEventListener("click", () => { qi = 0; render(); });
    } else if (qi >= quiz.questions.length) {
      renderResults(card);
    } else {
      renderQuestion(card);
    }
    onChange?.();
    card.scrollIntoView?.({ block: "start" });
    window.scrollTo(0, 0);
  }

  function renderQuestion(card) {
    const x = q();
    const a = answers[qi];
    let body = "";
    if (x.type === "spot") {
      body = `<ol class="q-lines" role="listbox" aria-label="Query lines">${x.lines.map((l, i) => {
        const n = i + 1;
        const cls = [picked === n ? "picked" : "", a && n === x.answer ? "answer" : "", a && picked === n && !a.correct ? "missed" : ""].join(" ");
        return `<li><button type="button" class="${cls}" data-pick="${n}" ${a ? "disabled" : ""} aria-pressed="${picked === n}"><span class="ln">${n}</span><code>${esc(l)}</code></button></li>`;
      }).join("")}</ol>`;
    } else if (x.type === "choice") {
      body = `<div class="q-options">${x.options.map((o, i) => {
        const cls = [picked === i ? "picked" : "", a && i === x.answer ? "answer" : "", a && picked === i && !a.correct ? "missed" : ""].join(" ");
        return `<button type="button" class="q-opt ${cls}" data-pick="${i}" ${a ? "disabled" : ""} aria-pressed="${picked === i}"><span class="letter">${LETTERS[i]}</span><span>${md(o)}</span></button>`;
      }).join("")}</div>`;
    } else if (x.type === "predict") {
      body = `<pre class="q-code"><code>${esc(x.code)}</code></pre>
        <div class="q-options tables">${x.options.map((o, i) => {
          const cls = [picked === i ? "picked" : "", a && i === x.answer ? "answer" : "", a && picked === i && !a.correct ? "missed" : ""].join(" ");
          return `<button type="button" class="q-opt ${cls}" data-pick="${i}" ${a ? "disabled" : ""} aria-pressed="${picked === i}"><span class="letter">${LETTERS[i]}</span><div class="mini">${miniTable(o)}</div></button>`;
        }).join("")}</div>`;
    } else if (x.type === "fix") {
      body = `<p class="q-fixnote">Return this column: <span class="col-chip">${x.returns.map(esc).join("</span> <span class=\"col-chip\">")}</span>. The checker below grades your fix the same way it grades cases.</p>`;
    }

    let foot;
    if (a) {
      const last = qi === quiz.questions.length - 1;
      foot = `<div class="q-feedback ${a.correct ? "right" : "wrong"}" role="status">
          <strong>${a.correct ? "Correct." : a.revealed ? "Here's the fix." : "Not quite."}</strong> ${md(x.explain)}
        </div>
        <div class="q-actions"><button type="button" class="next-btn" id="q-next">${last ? "See your results" : "Next question"}</button></div>`;
    } else if (x.type === "fix") {
      foot = `<div class="q-actions"><button type="button" class="ghost" id="q-reveal">Show me the fix</button></div>`;
    } else {
      foot = `<div class="q-actions"><button type="button" class="next-btn" id="q-check" ${picked === null ? "disabled" : ""}>Check answer</button></div>`;
    }

    card.innerHTML = `
      <div class="q-head">
        <div class="tags"><span class="tag case">${esc(quiz.title)}</span><span class="tag">Question ${qi + 1} of ${quiz.questions.length}</span><span class="tag">${TYPE_LABEL[x.type]}</span></div>
        ${dots()}
      </div>
      <h1>${esc(x.title)}</h1>
      <p class="prompt">${md(x.prompt)}</p>
      ${body}
      ${foot}`;

    card.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
      picked = Number(b.dataset.pick); render();
    }));
    $("q-check")?.addEventListener("click", check);
    $("q-next")?.addEventListener("click", () => { qi += 1; picked = null; if (qi >= quiz.questions.length) finish(); render(); });
    $("q-reveal")?.addEventListener("click", () => { answers[qi] = { correct: false, revealed: true }; render(); });
    showEditor(x.type === "fix", x, Boolean(a));
  }

  function check() {
    const x = q();
    if (picked === null) return;
    answers[qi] = { picked, correct: picked === x.answer };
    render();
  }

  /** Called by the workspace after a run during a fix question. */
  function fixResult(result) {
    if (!quiz || qi < 0 || qi >= quiz.questions.length || q().type !== "fix" || answers[qi]) return;
    if (result.match) { answers[qi] = { correct: true }; render(); }
  }

  function finish() {
    const s = state();
    const score = answers.filter((a) => a?.correct).length;
    s.attempts += 1;
    s.last = score;
    s.best = Math.max(s.best ?? 0, score);
    s.at = new Date().toISOString();
    save();
  }

  function renderResults(card) {
    const score = answers.filter((a) => a?.correct).length;
    const n = quiz.questions.length;
    const msg = score === n ? "Every one right. These ideas are solid."
      : score >= n - 1 ? "Nearly all right. Have a look at the one you missed."
      : "Worth a second look at the ones you missed. Each links to the case that teaches it.";
    card.innerHTML = `
      <div class="q-head"><div class="tags"><span class="tag case">${esc(quiz.title)}</span><span class="tag">Results</span></div>${dots()}</div>
      <h1>${score} of ${n} right</h1>
      <p class="prompt">${msg}</p>
      <ul class="q-review">${quiz.questions.map((x, i) => {
        const ok = answers[i]?.correct;
        return `<li class="${ok ? "right" : "wrong"}"><span class="mark" aria-label="${ok ? "Right" : "Missed"}">${ok ? "✓" : "✗"}</span>
          <span class="what"><b>${esc(x.concept)}</b><span>${TYPE_LABEL[x.type]}: ${esc(x.title)}</span></span>
          <button type="button" class="review-link" data-case="${x.review}">Review case ${x.review}</button></li>`;
      }).join("")}</ul>
      <div class="q-actions">
        <button type="button" class="next-btn" id="q-retake">Retake quiz</button>
        <button type="button" class="ghost" id="q-back">Back to the cases</button>
      </div>`;
    card.querySelectorAll(".review-link").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.case)));
    $("q-retake").addEventListener("click", () => start(quiz));
    $("q-back").addEventListener("click", () => onLeave());
  }

  return {
    start,
    fixResult,
    get active() { return quiz !== null; },
    get id() { return quiz?.id; },
    currentFix() { return quiz && qi >= 0 && qi < quiz.questions.length && q().type === "fix" ? q() : null; },
    stop() { quiz = null; },
  };
}
