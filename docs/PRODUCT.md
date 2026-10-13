# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain JavaScript frontend (no framework), DuckDB-WASM for running SQL in the browser, a small FastAPI backend that only proxies the AI tutor and keeps the Claude API key server side. Progress saved in the browser, no accounts in v1. Animation library: GSAP (user installed its skills). Name: Casework (chosen by the user).

## Users

Primary for the landing page: hiring managers and interviewers for finance (especially private funds / fintech) and customer support operations roles, evaluating Patricia (an operations / implementation / customer success candidate) through a portfolio link, usually in under three minutes.
Primary for the app itself: operations professionals practicing SQL for interviews, starting with Patricia herself.

## Product Purpose

A SQL practice app built around realistic, industry-specific operations problems on messy synthetic data, with an AI tutor that gives graduated hints instead of answers. Success: a hiring manager understands within a minute that the author can solve real ops problems with SQL, thinks like a product person, and uses AI responsibly.

## Positioning

Problems are real operations scenarios (reconcile a carrier file against enrollment records), not abstract exercises. Answers are checked by comparing result rows, not query text. The AI tutor is constrained by design to a three-level hint ladder (concept nudge, structure hint, skeleton with blanks) and never outputs a full solution.

## Operating Context

v1 domain: Customer support operations (decided by the user; it matches the roles she is applying for). About 15 cases from SELECT/WHERE through window functions and reconciliation, on one synthetic support database with planted data problems. Second domain: Private funds (funds, general partners, quarterly metrics, capital calls, a hidden units error), added in week 3 if ahead, otherwise right after launch. Benefits enrollment was dropped as the v1 domain. Delivered with a short demo video and README.

## Capabilities and Constraints

- Must be demoable within about 3 weeks, built alongside a job search. Scope discipline over feature count.
- SQL runs in the browser; no hosted query database.
- Public demo has a daily hint cap and an API spending limit.
- Future (not v1): private funds domain (next), other domains, quizzes and exams, interview prep modes, spaced review, accounts.

## Brand Commitments

- Palette pinned by the user: light pinks, nudes, browns, creams, burgundies.
- User wants a dynamic site: motion, moving parts, an alluring color scheme, striking imagery. Not a plain static page. References the user gave: the Next.js Conf site and Shopify's design site (both bold, motion-forward).
- The site must feel like a modern SaaS web application (user, after seeing the stamped version). No courtroom, legal-file, stamp or rubber-stamp vibes. Palette stays.
- Writing: plain English, no em dashes in published copy.

## Evidence on Hand

No real users, testimonials, metrics or logos. All data is synthetic and must be labeled as such. Never invent customers, usage numbers or endorsements.

## Product Principles

1. Real operations scenarios first; SQL is the tool, not the topic.
2. Teach, don't tell: the tutor guides, the learner writes the query.
3. Show the product working rather than describing it.
4. One finished domain beats several half-built ones.

## Accessibility & Inclusion

Respect prefers-reduced-motion for all animation. Text contrast to WCAG AA.
