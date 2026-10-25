# Casework: project notes for Claude

Read this first. It carries the decisions from the planning session so work can continue without re-asking.

## Who and why

- Owner: Patricia (Trish), client and data operations professional in NYC, job searching for operations, implementation, customer success and deployment roles. Mainly finance (especially private funds / fintech) and customer support operations.
- Experience to draw on: Customer Success Associate at Datazoic (onboarding through UAT, SQL to diagnose API and configuration issues), Data Operations Analyst II at Chronograph (private capital fund data, SQL via Retool), optical practice (insurance billing, EHR rollout).
- Casework is a portfolio piece and her own SQL interview practice tool. It must prove three things: she can solve real ops problems with SQL, she thinks like a product person, and she uses AI responsibly.
- Demo target was about 3 weeks from early October 2026. On Oct 21 Patricia said the timeline no longer matters much: Casework is also her own learning journey to write SQL well, so learning quality comes before shipping speed. Still mention schedule impact briefly, but don't push back on learning features for timeline reasons.

## How to work with Patricia

- Delivering files to her Mac: after copying files into the outputs folder and writing them to ~/Projects/casework, ALWAYS compare md5 hashes on the Mac with the cloud copies. On Oct 22 a write right after copying delivered the previous version of app.js and app.css; earlier "reverts" (landing page, requirements.txt, app.css) were most likely the same thing, not her editor. If a hash differs, write again and re-check.

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
- Workspace motion (Oct 24, Patricia asked for it to feel more dynamic; she chose subtle and quick): `site/app/motion.js` uses the browser's Web Animations API, no library. First-load entrance (top bar, staggered case list, main sections, side panel), a short glide-in of the main column when switching cases/drills/quizzes, a highlight that slides to the selected item in the case list, a sliding underline between side tabs, and a quick fade on new results. First version was about 0.2 to 0.36 s; Patricia found it too fast (Oct 24), so cases/drills/quizzes and the case list now run about 0.4 to 0.6 s while side tabs stay at 0.22 s (she liked those). Hover in the case list is a lighter tint that fades in, so it reads as a preview rather than clashing with the gliding selection. Everything is skipped under prefers-reduced-motion. Still no tilt or hero effects on working surfaces.
- The workspace (the app itself) reuses the product window shown on the landing page: case list sidebar, case brief, wine SQL editor, results grid with a status pill, tutor panel with hint levels. Calm, no hero effects, no tilt on working surfaces.

## Beta accounts (built Oct 25)

- Patricia wants two friends to beta test the whole site, with their own logins. Decisions: email + password; invite code required to sign up; built-in feedback button.
- `server/accounts.py`: one SQLite file (CASEWORK_DB; locally data/casework.db, gitignored; on Railway a volume at /data). Tables users, sessions, progress (one JSON blob per user), feedback. PBKDF2-SHA256 600k rounds (works on Apple's Python 3.9), random session token in an HttpOnly SameSite=Lax cookie (Secure on https), only its SHA-256 stored. Same-site Origin check on every state-changing route, JSON bodies only. Sign-in throttled per address and per email; generic "email and password don't match" message.
- Routes in `server/main.py`: /api/me, /api/signup, /api/login, /api/logout, PUT /api/progress (+ /api/progress-beacon on tab close), /api/feedback, /admin (owner only, by CASEWORK_ADMIN_EMAILS), /api/admin/reset-password (signs the user out everywhere).
- Hints and the tutor now require sign-in (protects API credit); daily limit counts per account. Guests can still solve everything; progress stays in their browser.
- `site/app/account.js`: Sign in / Create account dialog, account menu (feedback, admin link, sign out), progress merged (furthest status per case, max hints and quiz scores) on sign-in and on load, saved to the server about a second after changes. Signing out clears the browser's copy.
- Hosting: root `main.py` re-exports the app so Railway's builder starts `uvicorn main:app` by itself; root `requirements.txt` holds the packages (server/requirements.txt points to it); `.python-version` is 3.12. Launch checklist for Patricia: `docs/beta-launch.md` (push, Railway project from GitHub, volume at /data, variables ANTHROPIC_API_KEY / CASEWORK_DB / CASEWORK_INVITE_CODES / CASEWORK_ADMIN_EMAILS, generate domain, Serverless off).

Beta hardening (built Oct 25): tutor daily counts live in the database (`usage` table: day, who, replies, off_topic), so restarts don't reset them; per-person and site-wide limits checked in one locked transaction. Tutor rule 8 keeps it on topic (SQL, data, the cases' ops metrics, interview explanations); off-topic replies start with the marker [off-topic], which the server strips and counts. Admin page shows tutor use today / 7 days / all time and off-topic counts per tester. Sign-up dialog has a privacy line. A Console spend-limit error now shows a friendly "spending limit" message. Privacy and guardrails doc for Patricia: https://claude.ai/artifact/UKwSBHfyHZX14dPMps8avT

Sign-in gate (Oct 25, Patricia's request): during the beta the whole workspace needs an account. A middleware in `server/main.py` redirects /app/ to /signin/ (the #case-XX part of the address is kept) and returns 401 for /cases.json, /quizzes.json, /drills.json and /data/* without a session. The landing page stays public and gained a "Sign in" nav link. `site/signin.html` is a standalone sign-in / create-account page (split layout: wine panel with pitch, cream card with form, privacy note on sign-up). Switch: CASEWORK_REQUIRE_LOGIN (default on); set it to 0 to open the workspace to guests again, e.g. for hiring managers, who otherwise can't get in without an invite code. Patricia chose the switch over a guest demo.

Case check-ins and load time (Oct 25): after solving a case (not drills or quizzes), signed-in testers see a short check-in (too easy / about right / too hard, "something in the brief was unclear", optional note), stored in a `checkins` table (one row per person per case, with their hints and runs) and summarized per case on /admin. Answered or skipped check-ins don't come back (progress.checkins). Patricia wants general feedback to stay in the top bar's Feedback button, not the side panel. Load time: the in-browser database engine (duckdb-eh.wasm, about 36 MB, 7 MB compressed) is the main wait; compiling it dominated (7 s in the test container, likely 1 to 3 s on a laptop). The landing and sign-in pages now prefetch it while idle, and the workspace starts loading the database before anything else.

## Status and plan

Done:
- Landing page (`site/index.html`), rewritten for support operations, links into the workspace.
- Dataset, 15 cases, verified answer keys.
- Workspace (`site/app/`): case list, brief, CodeMirror editor, DuckDB-WASM loading `data/arrow/*.arrow`, result checking (`checker.js`) that never reveals expected rows, progress in localStorage. All 15 reference solutions verified to match inside DuckDB-WASM.
- `server/main.py`: FastAPI serving the site, `/data`, and `/cases.json` only (never `solutions.json`).

Next, in order:
1. Patricia finished Foundations (01 to 04) on Oct 20; fixes from that are built. She tests Core and Advanced (05 to 15) with the real tutor once it exists. Until then, give hints in chat the way the tutor will.
2. Tutor: built Oct 20 (see "Tutor" below). Patricia tests it with her real key and reports how the hints feel.
3. Deploy to Railway (Serverless off). Then README, demo video script, update `docs/DESIGN.md` for the Lens logo, square corners, Query Filter hero and the workspace.

Built Oct 20 (from Patricia's testing of cases 01 to 04):
- Checker accepts columns in any order; brief heading is now "Return these columns".
- Extra-rows sample says "First 5 of N, in your query's order." The full grid has its own heading ("Your full result").
- Results grid marks empty text ("empty"), space-only values ("1 space") and leading/trailing spaces (faint dots).
- Run selection: highlight text and Run / Cmd+Enter runs only that; the button reads "Run selection"; summary starts "Ran your selection."
- Several queries at once (`site/app/statements.js` splits on semicolons outside quotes and comments): each gets a result tab, the last is checked and labeled CHECKED, runs stop at the first error.
- Case 03: from July 2026 about 7% more tickets have a blank category ("" or " "), made in a separate RNG pass so the rest of the dataset is unchanged. Without the blank rule, an empty category ranks 5th (316) ahead of integrations (261). This also changed the answer keys for cases 08 (integrations reopen rate now 16.5%), 09 and 13, which use cleaned categories. All 15 solutions re-verified in DuckDB-WASM.

Tutor (built Oct 20):
- Server: `server/tutor.py`, routes in `server/main.py`. `GET /api/tutor` returns replies left today and whether it's in sample mode; `POST /api/tutor` takes case_id, mode (hint / ask / walkthrough), level, question, the editor text, a description of the last run (checker facts only), recent thread, and run count.
- Model `claude-haiku-5-5` (override with CASEWORK_MODEL), effort low, no temperature (Haiku 5.5 rejects sampling params). Raw HTTPS with httpx, anthropic-version 2023-06-01.
- Key: ANTHROPIC_API_KEY from the environment, or from the project's `.env` (gitignored; Patricia created it Oct 20; Claude never reads its contents). No key = sample mode with canned replies.
- Prompt: system rules + case brief, schema, the reference solution and the trap query marked private. Learner text is treated as data.
- Guard: every SQL snippet in a reply runs against the real data in a locked DuckDB (no external access, 3 s limit, SELECT/WITH only). If it returns the case's exact answer (any row or column order), Claude is asked once more; if that leaks too, a safe fallback is shown.
- Limits: 25 replies per visitor per day (by forwarded IP), 600 per server per day (CASEWORK_HINTS_PER_DAY / CASEWORK_HINTS_SERVER_DAY). Failed replies are refunded. Plus Patricia's Console credit ($4.85 prepaid, auto-reload off).
- Side panel tabs (Oct 24, Patricia's request): Hints | Tables | Tutor. Hints holds the ladder, Get a hint, walkthrough and their replies; Tutor holds the question chat and ask box. One saved thread per case; messages carry a kind so each tab shows its own. Hints and Tutor both show an off note during quizzes and on the drill picker.
- Panel (`site/app/tutor.js`): hint ladder Nudge, Structure, Skeleton, Walkthrough; "Get a hint" climbs one level per press (then more skeleton hints); an ask box (Enter sends); thread saved per case in localStorage. Walkthrough unlocks after the level 3 hint plus 3 more runs; once started, the case shows "Solved with help" when solved.
- Tested with a fake Claude server (guard retry and fallback, refunds, limits, errors) and in the browser at desktop and phone widths. Not yet tested against real Haiku output.

Tutor rules and decisions:
- ONE small hint per request, the smallest that unblocks, then stop and wait. Never lay out the whole plan or several steps at once, and no runnable queries for the case's steps. When the learner asks "where do I start?", name only the first step. The same applies when Claude helps Patricia in chat.
- Full answer (decided Oct 20): unlocks only after real attempts (all three hint levels used plus several runs). Even then, work through it slowly: walk the learner toward the answer one piece at a time, checking understanding, rather than dumping the finished query. The case is marked "solved with help". The "Full solution: Never unlocks" card in the tutor panel must change to match.

Quizzes (built Oct 21, Foundations only so far):
- Questions live in `cases/quizzes.py`; `cases/build.py` verifies every answer it can (spot: the bug changes the real result and the fixed line corrects it; predict: runs the small example tables; choice: runs a proof query; fix: the broken query fails and the solution's rows become the answer key) and writes `cases/quizzes.json`, served at `/quizzes.json`.
- Foundations quiz: 6 questions from Patricia's own sticking points (AND before OR, unquoted date, nesting functions, blank vs NULL, what LEFT JOIN returns, = in ON). Types: spot the bug, why (multiple choice), fix it (real editor + checker), predict the output (pick a result table).
- Decisions: feedback right after each question with a short explanation; 6 questions; always open (no unlock); tutor off during quizzes; results card links each question to the case that teaches it; best score saved in localStorage and shown in the case list.
- UI: `site/app/quiz.js`; quiz row at the end of its level in the case list (and in the phone dropdown); address `#quiz-foundations`.
- Next: Core quiz and the Advanced exam (timed, one long case, no hints), written from Patricia's sticking points on cases 05 to 15.

Drills and Bridge level (built Oct 21):
- Patricia found the jump from Foundations to Core too steep (Core introduces about nine new ideas at once) and wants more practice by repetition. Timeline no longer a constraint.
- Drills (`cases/drills.py` -> `cases/drills.json`, served at `/drills.json`): short single-skill exercises that work like small cases (same brief, editor, checker, tutor). Each has a "naive" query with the skill's classic mistake; build.py checks the mistake changes the answer. Foundations: 4 sets x 4 (AND/OR/IN, writing dates, cleaning text incl. a case-03-style top topics drill, joins). Bridge: 5 sets x 3 (counting by group, HAVING, CASE, grouping by time, CTEs). Ids like `andor1`, address `#drill-andor1`; the set picker is `#drills-foundations`. Progress lives in the same localStorage map as cases; the header's "N of 20 solved" counts cases only.
- Bridge level (cases B1 to B5, between Foundations and Core), one new idea each, each with a verified trap: B1 GROUP BY/COUNT/MAX (trap: BETWEEN drops Sept 30), B2 HAVING (trap: forgetting the status filter in WHERE), B3 CASE buckets (trap: < vs <=), B4 date_trunc month (trap: month() returns a number), B5 CTE (trap: averaging over the wrong period). Landing page updated to "Twenty cases" with Bridge rows.
- Drill text3 had a tie at the LIMIT boundary (bug and login both 113); fixed with an alphabetical tie-break rule. Watch for ties whenever an ordered answer uses LIMIT.
- Next: a Bridge quiz written from Patricia's sticking points on the Bridge cases and drills (same approach as the Foundations quiz). Also add "(not equal to)" next to != in the Foundations quiz explanation.

After launch (Patricia's ideas, not v1):
- Quizzes and exams (Oct 20; Foundations quiz built Oct 21, see above). Solving every case in a level unlocks an optional quiz: 3 to 5 new short questions on the same skills and tables, no tutor, checked the same way. Advanced levels get an exam instead: a longer case, timed, no hints, ending in a score summary. Reuses the existing checker; the new work is writing questions and answer keys (extend cases.py / build.py). Ties into the interview-prep mode from the original brief.
  - Patricia's direction: quiz questions should look like the questions a learner actually asks while working, to test understanding, not just repeat the case. Mix formats: spot the bug, predict the output, explain why, plus short queries. Later: personalize from each learner's own sticking points (errors hit, hints used), stored in the browser.
  - Seed questions from Patricia's own testing (Foundations): IN vs chained OR, and why OR needs parentheses next to AND; DESC vs ASC and what a tie-breaker column does; DISTINCT vs GROUP BY; unquoted 2026-10-01 being math; nesting functions vs joining them with AND; replace's three inputs; empty text vs spaces vs NULL, and why <> '' also drops NULL; a comma between tables pairs every row; what LEFT means in LEFT JOIN; why ON uses = and != makes unmatched rows "match everyone"; where the NULL after a LEFT JOIN comes from.
- Brainstorm later: other ways people learn (Patricia notes everyone works differently), to shape features after launch.
- Hide-the-scaffolding toggles (built Oct 22): "Hide" / "Show" next to "Return these columns" and "Tables you'll need" in every case and drill brief, saved per browser in progress.settings (hideReturns, hideTables; both shown by default). Patricia keeps columns hidden and tables shown. While columns are hidden: rules starting "Name the" are hidden (names never count), the wrong-columns message gives only the count, and the tutor is told not to name the hidden items unless asked. Skill tags still show; hiding them could be a later option. Exams could force both hidden.
- Tutor visuals: show a small before-and-after table for the case's own join (the walkthrough that helped on case 04).

Open items:
- A phone-width navigation menu is still missing on the landing page.
- Local run: `python3 -m venv .venv`, `source .venv/bin/activate`, `pip install -r server/requirements.txt`, `uvicorn server.main:app --reload`.
