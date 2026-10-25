// Light motion for the workspace: a first-load entrance, content that glides in
// when you switch cases, and highlights that slide between items and tabs.
// Small and calm (about 0.4 to 0.6 s, set with Patricia on Oct 24); side tabs stay quicker.
// Everything is skipped when the visitor prefers reduced motion.

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const EASE = "cubic-bezier(.2,.75,.2,1)";
const still = () => reduced.matches;

/** Fade elements in while they rise (or slide) a few pixels, one after another. */
export function rise(els, { y = 8, x = 0, dur = 420, stagger = 60, delay = 0, max = 14 } = {}) {
  if (still()) return;
  [...els].filter(Boolean).forEach((el, i) => {
    if (el.hidden || !el.getClientRects().length) return;
    el.animate(
      [{ opacity: 0, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: "none" }],
      { duration: dur, delay: delay + Math.min(i, max) * stagger, easing: EASE, fill: "backwards" },
    );
  });
}

/** The first time the workspace appears. */
export function entrance() {
  if (still()) return;
  rise(document.querySelectorAll(".topbar > :not(.logo)"), { y: -4, dur: 420, stagger: 50 });
  rise(document.querySelectorAll("#cases-nav h2, #cases-nav .case-btn"), { x: -10, y: 0, dur: 520, stagger: 40, delay: 120, max: 18 });
  rise(document.querySelectorAll(".work > section"), { y: 14, dur: 620, stagger: 120, delay: 180 });
  rise([document.querySelector(".side")], { x: 12, y: 0, dur: 620, delay: 320 });
}

/** Content of the main column when switching between cases, drills and quizzes. */
export function switchIn() {
  rise(document.querySelectorAll(".work > section"), { y: 10, dur: 460, stagger: 80 });
}

/** A short fade for freshly drawn results. */
export function settle(el) {
  if (still() || !el || el.hidden) return;
  el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 340, easing: EASE });
}

/**
 * A highlight that glides to the selected item inside a positioned container.
 * `key` remembers where it was last time, since the list is redrawn on every change.
 */
const lastSpot = {};
export function glide(container, target, key, cls) {
  if (!container) return;
  let ind = container.querySelector(`:scope > .${cls}`);
  if (!target || !target.getClientRects().length) { if (ind) ind.hidden = true; return; }
  if (!ind) {
    ind = document.createElement("span");
    ind.className = cls;
    ind.setAttribute("aria-hidden", "true");
    container.prepend(ind);
  }
  ind.hidden = false;
  const spot = { top: target.offsetTop, left: target.offsetLeft, width: target.offsetWidth, height: target.offsetHeight };
  Object.assign(ind.style, { top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, height: `${spot.height}px` });
  const from = lastSpot[key];
  lastSpot[key] = spot;
  if (!from || still()) return;
  const dx = from.left - spot.left, dy = from.top - spot.top;
  if (!dx && !dy && from.width === spot.width) return;
  ind.animate(
    [{ transform: `translate(${dx}px, ${dy}px)`, width: `${from.width}px`, height: `${from.height}px` },
     { transform: "none", width: `${spot.width}px`, height: `${spot.height}px` }],
    { duration: 420, easing: EASE },
  );
}

/** Panels inside the side bar when switching tabs. */
export function tabIn(panel, direction) {
  rise([panel], { x: 10 * direction, y: 0, dur: 220 });
}
