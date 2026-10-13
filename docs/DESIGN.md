---
name: Casework
description: SQL practice on real benefits-enrollment operations problems, presented as a modern SaaS product in wine, cream, blush and cocoa.
colors:
  stage: "#1F080E"
  stage-2: "#2E0D16"
  wine: "#7A1F31"
  wine-hi: "#922A3E"
  rose: "#E59AA6"
  cream: "#FBF4EF"
  blush: "#F5DEDA"
  blush-2: "#EFCFC9"
  nude: "#D9B5A2"
  panel: "#FDF9F6"
  surface: "#FFFFFF"
  cocoa: "#2F1D18"
  mocha: "#77584C"
  line: "rgba(47,29,24,.12)"
  on-stage: "#FBEAE6"
  on-stage-2: "#D7AFA9"
  match-green: "#336B48"
  match-tint: "#E5F0E8"
  cause-1: "#F2B8C0"
  cause-2: "#E07A8B"
  cause-3: "#D9B5A2"
  cause-4: "#B8506A"
  cause-5: "#F6E3D8"
typography:
  display:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(42px, 5.6vw, 86px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.045em"
  display-close:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(48px, 8vw, 124px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(38px, 5vw, 72px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
  statement:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(34px, 4.6vw, 68px)"
    fontWeight: 650
    lineHeight: 1.06
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title-app:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  body-app:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
  label-group:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  code:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  window: "18px"
  card: "20px"
  band: "28px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  max: "1280px"
  section: "clamp(80px, 10vw, 150px)"
  head-gap: "clamp(40px, 5vw, 64px)"
  card: "24px"
  panel: "18px"
  cell: "8px 12px"
  stack: "12px"
components:
  button-primary:
    backgroundColor: "{colors.on-stage}"
    textColor: "{colors.stage}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "52px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-stage}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "52px"
  button-wine:
    backgroundColor: "{colors.wine}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  button-wine-hover:
    backgroundColor: "{colors.wine-hi}"
  button-run:
    backgroundColor: "{colors.rose}"
    textColor: "{colors.stage}"
    rounded: "7px"
    padding: "7px 12px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cocoa}"
    rounded: "9px"
    height: "38px"
  tag-case:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.wine}"
    typography: "{typography.mono}"
    rounded: "{rounded.xs}"
    padding: "3px 8px"
  tag-skill:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.mocha}"
    typography: "{typography.mono}"
    rounded: "{rounded.xs}"
    padding: "3px 8px"
  status-match:
    backgroundColor: "{colors.match-tint}"
    textColor: "{colors.match-green}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  case-link-active:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.cocoa}"
    rounded: "{rounded.sm}"
    padding: "8px"
  editor:
    backgroundColor: "{colors.stage}"
    textColor: "#F3D9D4"
    typography: "{typography.code}"
  hint-step:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cocoa}"
    rounded: "{rounded.md}"
    padding: "12px"
  card-feature:
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  product-window:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.window}"
---

# Design System: Casework

## Overview

**Creative North Star: "The Wine-Lit Workbench"**

Casework presents as a modern SaaS product: a deep wine stage for moments of arrival (the hero, the closing band, the SQL editor) and a warm cream workbench for everything you read and operate. The product itself is the hero image. Interfaces are shown working, with real-looking SQL, result grids and match verdicts on synthetic data.

The system is soft and confident. One sans family set large and tight carries all display text; its mono sibling carries everything that is data. Containers are rounded rectangles with cocoa hairlines; actions are pills. Depth is mostly tonal (cream, panel, white, blush), with one large soft lift reserved for the product window. Motion is smooth expo ease-outs with no overshoot.

The user rejected a paper and rubber-stamp world as "courtroom". Nothing in this system uses paper textures, stamps, ledger rules, legal-file framing or condensed poster type.

**Key Characteristics:**
- Two grounds: wine stage for arrival and code, cream for reading and work.
- Geist for words, Geist Mono for data, SQL, counts and metadata.
- Pill actions, rounded-rectangle containers, hairline cocoa borders.
- Tonal layering first; a single big shadow on the product window.
- Five fixed cause colors that only ever encode data.
- Expo ease-out motion, scroll reveals, respects reduced motion.

## Colors

A warm, low-saturation pink-brown palette where wine is the only loud color and green only ever means "match".

### Primary
- **Action Burgundy** (wine): selected and pressed states, primary actions on light ground, case tag text, emphasis words in statements, failing verdict labels. Hover lifts to **Raised Burgundy** (wine-hi).
- **Deep Wine Stage** (stage): the dark ground for the hero, closing band, SQL editor and one feature card. Hero uses a radial gradient from #3A1019 through stage to #14050A. **Stage Raised** (stage-2) is the translucent nav pill base on dark.

### Secondary
- **Rose** (rose): the accent on wine: highlighted hero words, the Run button, the editor caret, hint level labels on dark, focus rings on dark, "solved with hints" cells, partial progress rings.

### Neutral
- **Cream** (cream): page ground, window title bar, neutral tag and level-badge fill.
- **Panel** (panel): app side panels (case list, tutor) and table headers. One step warmer than white.
- **Surface White** (surface): product window body, hint steps, meters, segmented controls, the third feature card.
- **Blush** (blush) and **Deep Blush** (blush-2): active list rows, "Core" level chips, the second feature card, progress bar track, window traffic lights.
- **Nude** (nude): empty status rings in the case list; doubles as cause-3.
- **Cocoa** (cocoa): primary text on light ground.
- **Mocha** (mocha): secondary text, metadata, column headers, locked hints.
- **Hairline** (line): every border and divider on light ground.
- **On-Stage** (on-stage) and **On-Stage Muted** (on-stage-2): primary and secondary text on wine. Borders on wine use on-stage at 12 to 28% alpha.

### Data
- **Match Green** (match-green) on **Match Tint** (match-tint): the match status pill, solved check circles, a full checker bar.
- **Cause colors** (cause-1 to cause-5): not_on_carrier_file, termed_still_covered, dependent_missing, plan_mismatch, duplicate_on_carrier, in that order. Shown as 8px swatches with a 2px radius. cause-5 is near-white and takes a 1px nude outline on light ground.

### Named Rules
**The Two Grounds Rule.** A surface is either wine stage or cream family. Wine stage is for arrival, closing and code; reading and operating happen on cream, panel and white.

**The Wine Means Act Rule.** Burgundy marks what is selected, pressed or primary. On light ground it never fills a large panel; large dark areas use stage, not wine.

**The Green Means Match Rule.** Green appears only for a passing result or a solved case. Errors and shortfalls use wine, not a red.

**The Causes Are Data Rule.** The five cause colors encode mismatch causes in fixed order, always beside their label. Never use them as decoration.

## Typography

**Display Font:** Geist (with Helvetica Neue, Arial)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (with ui-monospace, SFMono-Regular, Menlo)

**Character:** One geometric grotesque doing everything with words, set heavy and tightly tracked at size; its mono sibling makes data feel like a real tool.

### Hierarchy
- **Display** (700, clamp 42 to 86px, 0.95): hero headline only. A second line may switch to rose.
- **Display Close** (700, clamp 48 to 124px, 0.95, 12ch max): the closing band headline.
- **Headline** (700, clamp 38 to 72px, 1.0): section headings, paired with a 18px mocha lede in a 1.15/0.85 split.
- **Statement** (650, clamp 34 to 68px, 1.06, 22ch max): a single scroll-lit statement; key phrases in wine.
- **Title** (650, 24px, 1.1): feature card headings. **Title App** (650, 20px): the case brief heading in the workspace.
- **Body** (400, 17px, 1.55; 16px under 640px): marketing prose, 44 to 46ch. **Body App** (13 to 14px, 1.5): text inside the product (list rows, hints, brief copy at 68ch max).
- **Label** (600, 14 to 16px): buttons, nav links, chips.
- **Label Group** (600, 11px, 0.04em, uppercase): app sidebar group headers only.
- **Mono** (12 to 12.5px, tabular figures): case numbers, tags, table cells, counts, legend, meta and footer lines. **Code** (13px, 1.7): the SQL editor.

### Named Rules
**The Tight At Size Rule.** Tracking tightens as size grows: -0.02em at 20px, -0.03em at 24px, -0.04em at headline size, -0.045 to -0.05em at display.

**The Mono Is Data Rule.** Geist Mono is for SQL, identifiers, numbers, counts and system metadata. Headings and prose are never mono.

## Layout

Content sits in a 1280px max container with a fluid gutter (16 to 56px). Sections breathe at 80 to 150px vertical padding. A section opens with a two-column head (large heading left, short lede right, aligned to the baseline) and then one full-width product proof: the product window, a three-card grid (18px gap) or a list of case rows.

The workspace is a three-column app grid: 230px case list, flexible main column, 300px tutor. The main column stacks brief, editor and results. At 1080px the tutor drops and the list narrows to 200px; at 640px the list drops and the main column runs alone. At 900px section heads, the closing grid and the card grid go to one column, and nav links collapse leaving logo and CTA.

Case rows use a four-column grid (number, title with subline, skills in mono, level chip) that drops the skills column at 900px.

**Applying to Operate mode.** The real workspace inherits the product window's interior, not the marketing page. Ground is cream page chrome with panel side columns and a white main column; the editor is the one wine block. Keep the 230 / flexible / 300 split, 18 to 24px panel padding, hairline column dividers, and 13 to 14px app text. Marketing display sizes do not appear inside the workspace.

## Elevation & Depth

Depth is tonal first: cream page, panel side columns, white work surfaces, blush for selection. Borders are 1px hairlines. Shadows are rare and soft.

### Shadow Vocabulary
- **Window lift** (`box-shadow: 0 1px 2px rgba(47,29,24,.06), 0 40px 80px -40px rgba(74,20,32,.45)`): the product window only.
- **Nav float** (`box-shadow: 0 8px 24px -16px rgba(47,29,24,.4)`): the nav pill on light ground, with 14px backdrop blur.
- **Button rest** (`box-shadow: 0 1px 2px rgba(0,0,0,.3)`) and **button hover** (`box-shadow: 0 14px 28px -14px rgba(0,0,0,.55)` with a 2px rise): pill buttons.
- **Status glow** (`box-shadow: 0 0 0 3px` at 18 to 20% of the dot color): small live and status dots.

### Named Rules
**The One Lift Rule.** Only the product window (or, in Operate mode, a true overlay such as a dialog) gets a large shadow. Cards and panels stay flat and use tone or a hairline.

## Shapes

Actions are full pills (999px): buttons, nav, chips, status, level badges, segmented controls. Containers are rounded rectangles that scale with size: 6px tags, 7 to 9px small app buttons and progress cells, 8px list rows and URL bar, 10px hint steps and table frames, 14px meters, 18px product window, 20px feature cards, 28px top corners on the closing band. Data swatches are 8px squares at 2px radius. Locked or unreachable states use a dashed border.

## Components

### Buttons
Soft, confident pills with a small lift on hover.
- **Shape:** full pill, 52px tall (48px under 640px), 16px semibold label, optional 16px trailing arrow.
- **Primary (on wine):** on-stage fill with stage text. Hover rises 2px with a deeper soft shadow.
- **Ghost (on wine):** transparent with a 1px inset on-stage ring at 28%; hover adds an 8% fill.
- **Wine (on light):** wine fill, white text; hover to wine-hi. Used for the nav CTA on light ground and pressed segments.
- **App buttons:** Run is a 7px-radius rose button with a play glyph; quiet buttons (show next hint) are white, hairline, 9px radius, 38px tall.
- **Focus:** 2px wine outline at 3px offset; rose on wine ground.

### Chips and Tags
- **Legend chip:** pill, on-stage at 6% with a 12% border, mono 12px, cause swatch plus count in semibold.
- **Case tag:** blush with wine mono text, 6px radius. **Skill tag:** cream with mocha text and hairline.
- **Level chip:** pill. Foundations is cream with hairline, Core is blush with wine text, Advanced is wine with white text.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** one stage card, one blush card, one white card with hairline, side by side.
- **Shadow Strategy:** flat (see The One Lift Rule).
- **Internal Padding:** 24px, 18px internal gap; live demos sit at the bottom.

### Inputs / Fields
- **Segmented control:** white pill track with hairline and 4px inset; mono 13px options; pressed option is wine with white text.
- **Editor:** see the Workspace signature below. No standalone text input exists yet; Operate mode inputs should take white fill, hairline, 8px radius and the standard wine focus ring.

### Navigation
- **Style:** a floating pill pair (logo plus links, then CTA) 14px from the top. On wine it is stage-2 at 72% with blur; on light it turns cream at 86% with a hairline and nav float shadow. Links are 14px medium pills that fill on hover.
- **App navigation:** the case list. Rows are 8px-radius, 13.5px, with a mono number, title and a 16px status ring (empty nude, half rose, solved green with a white check). The active row is blush and semibold.

### Workspace (signature)
The product window: cream title bar with three blush dots and a mono URL field; then the app grid.
- **Case brief:** case tag and skill tags, Title App heading, mocha description.
- **SQL editor:** stage ground, code type, 38px line-number gutter. Syntax: keywords #F49AAA, strings #E8C4A4, functions #F7D5CC, numbers #F0B79F, comments #BC958E italic. Rose block caret.
- **Results:** match status pill left, mono runtime right, then a hairline-framed 10px-radius grid with mono tabular cells, panel header row and hairline row dividers.
- **Tutor:** panel column with a "Tutor" heading and a mono usage badge. Each hint level is a white 10px step with a wine level name and mono "level n"; locked levels are transparent and dashed with a lock icon. A quiet button reveals the next level. A full-solution level never unlocks.
- **Progress grid:** 6 by 3 grid of 9px-radius mono cells: wine solved, rose solved with hints, blush started, cream untouched.

## Do's and Don'ts

### Do:
- **Do** keep reading and operating surfaces on cream, panel and white, and reserve the wine stage for the hero, closing band, editor and at most one card per row.
- **Do** use wine for the single selected or primary thing in a group, and match green only for a passing result.
- **Do** set every SQL fragment, identifier, count and case number in Geist Mono with tabular figures.
- **Do** separate regions with 1px cocoa hairlines (rgba(47,29,24,.12)) before reaching for a shadow.
- **Do** animate with expo ease-outs (cubic-bezier(.2,.8,.2,1) for CSS), and turn motion off under prefers-reduced-motion.
- **Do** label all sample data as synthetic.

### Don't:
- **Don't** use paper textures, stamps, ledger rules, legal-file framing or condensed poster type; the user rejected that world as courtroom.
- **Don't** add overshoot or bounce easing.
- **Don't** put small uppercase labels above section headings; uppercase is limited to app sidebar group headers.
- **Don't** use cause colors outside data encoding, or show one without its label.
- **Don't** give cards or panels large drop shadows; the big lift belongs to the product window.
- **Don't** introduce a second sans family or a serif.
