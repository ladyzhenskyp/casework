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
- Column names don't count; values are compared column by column, in order.
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
- Landing page design (hero and nav final; sections below the hero still describe the old benefits domain and must be rewritten for support data).
- Dataset, 15 cases, verified answer keys.

Next, in order:
1. Workspace: case list, case brief, CodeMirror editor, DuckDB-WASM runner, results grid.
2. Answer checking with mismatch details, plus progress saved in the browser.
3. Tutor: FastAPI on Railway, three hint levels, guard that blocks complete solutions, daily hint cap. Patricia needs her Claude API key with a spending limit by this point.
4. Rewrite landing sections for support data, connect landing to the workspace, README, demo video script.

Open items:
- Patricia will give more feedback on the 15 cases after testing them in the app.
- A phone-width navigation menu is still missing on the landing page.
