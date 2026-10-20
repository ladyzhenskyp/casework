# Casework: project notes for Claude

Read this first. It carries the decisions from the planning session so work can continue without re-asking.

## Who and why

- Owner: Patricia (Trish), client and data operations professional in NYC, job searching for operations, implementation, customer success and deployment roles. Mainly finance (especially private funds / fintech) and customer support operations.
- Experience to draw on: Customer Success Associate at Datazoic (onboarding through UAT, SQL to diagnose API and configuration issues), Data Operations Analyst II at Chronograph (private capital fund data, SQL via Retool), optical practice (insurance billing, EHR rollout).
- Casework is a portfolio piece and her own SQL interview practice tool. It must prove three things: she can solve real ops problems with SQL, she thinks like a product person, and she uses AI responsibly.
- Demo target: about 3 weeks from early October 2026, built alongside a job search. Scope discipline beats feature count. Flag anything that threatens the timeline.

## How to work with Patricia

- She is not a professional software engineer. Explain tradeoffs in plain English and recommend the simplest option that works.
- When recommending a technology, give one recommendation with a one-line reason, not a menu.
- Ask clarifying questions before big decisions, at most 3 at a time.
- No em dashes in anything she might publish (site copy, README, case text).
- Never invent users, testimonials, metrics or endorsements. All data is synthetic and labeled as such.

## The product

A SQL practice app built on realistic operations problems with messy synthetic data, and an AI tutor that gives graduated hints instead of answers.

- v1 domain: customer support operations (done: dataset and 15 cases). Next domain: private funds (week 3 if ahead, otherwise right after launch). Benefits enrollment was dropped.
- Hint ladder: level 1 concept nudge, level 2 structure hint, level 3 skeleton with blanks. The tutor sees the schema, the case, the learner's query and any error. It must never output a complete working solution.
- Answers are checked by comparing result rows, not query text.
- Progress is saved in the browser. No accounts in v1.

## Stack (decided)

- Frontend: plain JavaScript, no framework. GSAP for motion (landing page). three.js for the hero scene.
- SQL in the browser: DuckDB-WASM, loading the Parquet files in `data/out/`.
- Editor: CodeMirror (standard, lightweight, SQL support).
- Tutor backend: small FastAPI service whose only jobs are keeping the Claude API key server side and serving hints. Model: Claude Haiku. Reference solutions (`cases/solutions.json`, built by `cases/build.py`, gitignored) live on this server only.
- Hosting: Railway (Patricia already has an account). One service serves the static site and the tutor API. Keep Railway's Serverless / app sleeping OFF so hiring managers never hit a cold start.
- Public demo limits: monthly spending limit on the Anthropic Console, plus about 25 hints per visitor per day.
- Repo is public, including solution queries in `cases/cases.py`. Patricia approved this.

## Dataset (approved and generated)

See `docs/dataset.html` for the full reference. Summary:

- Fictional company Northwind Desk (scheduling software, basic / pro / enterprise plans). Six months of support data, April to September 2026. Snapshot date ("today") is 2026-10-01.
- 8 tables from 4 systems: `customers` (CRM), `helpdesk_orgs`, `tickets`, `ticket_events`, `agents`, `sla_policies` (helpdesk), `csat_responses` (survey tool), `integration_sync_log` (CRM to helpdesk nightly plan sync).
- 10 planted problems: auto-replies counted as responses, reopened tickets, wrong plan in the helpdesk (20 customers), failed syncs behind the drift (401 credential outage July 9 to 15, 429 rate limits), phone tickets logged in New York time (4 hours off), messy category labels, unmerged duplicate tickets, tickets owned by departed agents, untrustworthy CSAT (orphans, double ratings), customers missing from one system.
- `data/generate.py` is seeded and deterministic. `cases/build.py` runs every reference solution, checks that each case's "naive" query gives a different answer (the trap works), and writes `cases/cases.json` (public: prompts, rules, expected rows) and `cases/solutions.json` (private).
- Key results: dashboard SLA 92.3% vs real 84.0%. Case 15 breakdown: auto_reply_counted 645, timezone_shift 277, wrong_plan_tier 26.

## Answer-checking rules (approved)

- Row order doesn't count unless the case has `ordered: true`.
- Column names and column order don't count. If the values match the expected columns in any order, it's a match (the summary notes the different order). When it isn't a match and the column names line up in another order, mismatch samples are shown in that order. Built Oct 20.
- Numbers match to the precision of the expected value (if the key says 153.3, then 153.27 passes).
- Timestamps compare as `YYYY-MM-DD HH:MM:SS`, and midnight values as `YYYY-MM-DD`, so DATE and TIMESTAMP results both pass.
- Duplicate rows count (returning a row twice fails).
- Mismatch explanations are computed by the app (missing rows, extra rows, wrong values). The AI only puts them into words.
- Known tradeoff: expected rows ship to the browser, so answers can be found in developer tools. Solution queries cannot. Deliberate choice; worth mentioning in interviews.

## Design (approved)

- Landing page: `site/index.html`. SaaS product-launch style. Deep wine stage hero, cream page, wine closing band. Palette pinned by Patricia: light pinks, nudes, browns, creams, burgundies.
- Fonts: Geist for everything, Geist Mono for SQL and data. Logo: "The Lens", a small faceted wine gem, with the word "casework" in Unbounded 600, standing apart from the navigation bar.
- Buttons and pills: square with softly rounded corners (about 6 to 8px), not fully round.
- Hero: "The Query Filter", a three.js scene of support ticket cards gliding through a frame labeled with a live WHERE clause. Matching cards highlight the matched field and slide into a result stack with a row count. The clause cycles every 9 seconds. The scene tilts with the mouse. Reduced motion shows one still frame.
- Rejected directions (don't bring back): rubber stamps / paper / courtroom look, the gem "lens" object, a glowing orb, video-game-like magic effects.
- `docs/DESIGN.md` describes the SaaS world but predates the Lens logo, square corners and Query Filter hero. Update it when touching the design.
- The workspace (the app itself) reuses the product window shown on the landing page: case list sidebar, case brief, wine SQL editor, results grid with a status pill, tutor panel with hint levels. Calm, no hero effects, no tilt on working surfaces.

## Status and plan

Done:
- Landing page (`site/index.html`), rewritten for support operations, links into the workspace.
- Dataset, 15 cases, verified answer keys.
- Workspace (`site/app/`): case list, brief, CodeMirror editor, DuckDB-WASM loading `data/arrow/*.arrow`, result checking (`checker.js`) that never reveals expected rows, progress in localStorage. All 15 reference solutions verified to match inside DuckDB-WASM.
- `server/main.py`: FastAPI serving the site, `/data`, and `/cases.json` only (never `solutions.json`).

Next, in order:
1. Patricia finished Foundations (01 to 04) on Oct 20; fixes from that are built. She tests Core and Advanced (05 to 15) with the real tutor once it exists. Until then, give hints in chat the way the tutor will.
2. Tutor: FastAPI endpoint, three hint levels, guard that blocks complete solutions, daily hint cap, Claude Haiku. Needs Patricia's API key (set as a Railway variable, never pasted in chat).
3. Deploy to Railway (Serverless off). Then README, demo video script, update `docs/DESIGN.md` for the Lens logo, square corners, Query Filter hero and the workspace.

Built Oct 20 (from Patricia's testing of cases 01 to 04):
- Checker accepts columns in any order; brief heading is now "Return these columns".
- Extra-rows sample says "First 5 of N, in your query's order." The full grid has its own heading ("Your full result").
- Results grid marks empty text ("empty"), space-only values ("1 space") and leading/trailing spaces (faint dots).
- Run selection: highlight text and Run / Cmd+Enter runs only that; the button reads "Run selection"; summary starts "Ran your selection."
- Several queries at once (`site/app/statements.js` splits on semicolons outside quotes and comments): each gets a result tab, the last is checked and labeled CHECKED, runs stop at the first error.
- Case 03: from July 2026 about 7% more tickets have a blank category ("" or " "), made in a separate RNG pass so the rest of the dataset is unchanged. Without the blank rule, an empty category ranks 5th (316) ahead of integrations (261). This also changed the answer keys for cases 08 (integrations reopen rate now 16.5%), 09 and 13, which use cleaned categories. All 15 solutions re-verified in DuckDB-WASM.

Tutor rules and decisions:
- ONE small hint per request, the smallest that unblocks, then stop and wait. Never lay out the whole plan or several steps at once, and no runnable queries for the case's steps. When the learner asks "where do I start?", name only the first step. The same applies when Claude helps Patricia in chat.
- Full answer (decided Oct 20): unlocks only after real attempts (all three hint levels used plus several runs). Even then, work through it slowly: walk the learner toward the answer one piece at a time, checking understanding, rather than dumping the finished query. The case is marked "solved with help". The "Full solution: Never unlocks" card in the tutor panel must change to match.

After launch (Patricia's ideas, not v1):
- Quizzes and exams (Oct 20). Solving every case in a level unlocks an optional quiz: 3 to 5 new short questions on the same skills and tables, no tutor, checked the same way. Advanced levels get an exam instead: a longer case, timed, no hints, ending in a score summary. Reuses the existing checker; the new work is writing questions and answer keys (extend cases.py / build.py). Ties into the interview-prep mode from the original brief.
  - Patricia's direction: quiz questions should look like the questions a learner actually asks while working, to test understanding, not just repeat the case. Mix formats: spot the bug, predict the output, explain why, plus short queries. Later: personalize from each learner's own sticking points (errors hit, hints used), stored in the browser.
  - Seed questions from Patricia's own testing (Foundations): IN vs chained OR, and why OR needs parentheses next to AND; DESC vs ASC and what a tie-breaker column does; DISTINCT vs GROUP BY; unquoted 2026-10-01 being math; nesting functions vs joining them with AND; replace's three inputs; empty text vs spaces vs NULL, and why <> '' also drops NULL; a comma between tables pairs every row; what LEFT means in LEFT JOIN; why ON uses = and != makes unmatched rows "match everyone"; where the NULL after a LEFT JOIN comes from.
- Brainstorm later: other ways people learn (Patricia notes everyone works differently), to shape features after launch.
- Tutor visuals: show a small before-and-after table for the case's own join (the walkthrough that helped on case 04).

Open items:
- A phone-width navigation menu is still missing on the landing page.
- Local run: `python3 -m venv .venv`, `source .venv/bin/activate`, `pip install -r server/requirements.txt`, `uvicorn server.main:app --reload`.
