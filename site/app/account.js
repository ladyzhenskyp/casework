// Beta accounts in the workspace: sign in / create an account (invite code),
// progress saved to the server and merged with this browser's, and a feedback
// button for testers. The session lives in an HttpOnly cookie the page can't read.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RANK = { new: 0, started: 1, solved: 2 };

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (HTTP ${res.status}).`), { status: res.status });
  return data;
}

/** Combine this browser's progress with the account's, keeping the furthest state of everything. */
export function mergeProgress(local, server) {
  if (!server) return structuredClone(local);
  const out = structuredClone(server);
  out.cases ||= {};
  for (const [id, l] of Object.entries(local.cases || {})) {
    const s = out.cases[id];
    if (!s) { out.cases[id] = l; continue; }
    const pick = (RANK[l.status] || 0) > (RANK[s.status] || 0) ? { ...l } : { ...s };
    pick.hints = Math.max(l.hints || 0, s.hints || 0);
    pick.level = Math.max(l.level || 0, s.level || 0);
    pick.runs = Math.max(l.runs || 0, s.runs || 0);
    pick.walkthrough = Boolean(l.walkthrough || s.walkthrough);
    if ((l.thread || []).length > (s.thread || []).length) pick.thread = l.thread;
    pick.query = pick.query ?? l.query ?? s.query ?? null;
    out.cases[id] = pick;
  }
  out.quizzes ||= {};
  for (const [id, l] of Object.entries(local.quizzes || {})) {
    const s = out.quizzes[id];
    out.quizzes[id] = !s ? l : { ...s, best: Math.max(l.best ?? 0, s.best ?? 0), attempts: Math.max(l.attempts || 0, s.attempts || 0) };
  }
  out.settings = { ...(local.settings || {}), ...(server.settings || {}) };
  out.last = local.last || server.last || null;
  return out;
}

export function createAccount({ getProgress, setProgress, clearLocal, getPlace, onChange }) {
  let user = null;
  let saveTimer = null;

  function renderButton() {
    const box = $("acct");
    if (!user) {
      box.innerHTML = '<button type="button" class="acct-btn" id="acct-signin">Sign in</button>';
      $("acct-signin").addEventListener("click", () => openAuth("signin"));
      return;
    }
    const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
    box.innerHTML = `
      <button type="button" class="acct-fb" id="acct-feedback">Feedback</button>
      <div class="acct-menu">
        <button type="button" class="acct-me" id="acct-me" aria-haspopup="true" aria-expanded="false" aria-label="Account: ${esc(user.name)}">
          <span class="avatar" aria-hidden="true">${esc(initial)}</span><span class="nm">${esc(user.name)}</span></button>
        <div class="acct-pop" id="acct-pop" hidden>
          <p class="who">${esc(user.email)}</p>
          <p class="saved">Progress is saved to your account.</p>
          <button type="button" class="pop-link" id="acct-fb2">Send feedback</button>
          ${user.admin ? '<a href="/admin" class="pop-link">Beta admin page</a>' : ""}
          <button type="button" class="pop-link" id="acct-out">Sign out</button>
        </div>
      </div>`;
    $("acct-feedback").addEventListener("click", openFeedback);
    const me = $("acct-me"), pop = $("acct-pop");
    me.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; me.setAttribute("aria-expanded", String(!pop.hidden)); });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) { pop.hidden = true; me.setAttribute("aria-expanded", "false"); } });
    $("acct-out").addEventListener("click", signOut);
    $("acct-fb2").addEventListener("click", () => { pop.hidden = true; openFeedback(); });
  }

  /* ---------- sign in / create account ---------- */
  function openAuth(which = "signin") {
    const dlg = $("auth-dialog");
    setAuthMode(which);
    $("auth-error").textContent = "";
    dlg.showModal();
    (which === "signup" ? $("auth-name") : $("auth-email")).focus();
  }
  function setAuthMode(which) {
    const up = which === "signup";
    $("auth-dialog").dataset.mode = which;
    $("auth-title").textContent = up ? "Create your account" : "Sign in";
    $("auth-sub").textContent = up
      ? "Casework is in beta. You'll need the invite code Patricia gave you."
      : "Sign in to use hints and the tutor, and to keep your progress on any device.";
    for (const id of ["auth-name-row", "auth-invite-row", "auth-privacy"]) $(id).hidden = !up;
    $("auth-invite").required = up;
    $("auth-password").autocomplete = up ? "new-password" : "current-password";
    $("auth-submit").textContent = up ? "Create account" : "Sign in";
    $("auth-switch").innerHTML = up
      ? 'Already have an account? <button type="button" data-to="signin">Sign in</button>'
      : 'New here with an invite code? <button type="button" data-to="signup">Create an account</button>';
    $("auth-switch").querySelector("button").addEventListener("click", (e) => { setAuthMode(e.target.dataset.to); $("auth-error").textContent = ""; });
  }

  async function submitAuth(e) {
    e.preventDefault();
    const up = $("auth-dialog").dataset.mode === "signup";
    const btn = $("auth-submit");
    btn.disabled = true; $("auth-error").textContent = "";
    try {
      const body = { email: $("auth-email").value, password: $("auth-password").value };
      if (up) Object.assign(body, { name: $("auth-name").value, invite: $("auth-invite").value });
      const data = await api(up ? "/api/signup" : "/api/login", "POST", body);
      user = data.user;
      const merged = mergeProgress(getProgress(), data.progress);
      await api("/api/progress", "PUT", { progress: merged });
      setProgress(merged);
      location.reload(); // simplest way to redraw everything with the merged progress
    } catch (err) {
      $("auth-error").textContent = err.message;
      btn.disabled = false;
    }
  }

  async function signOut() {
    try { await flush(); await api("/api/logout", "POST", {}); } catch { /* signing out locally anyway */ }
    clearLocal(); // this browser forgets the account's progress
    location.reload();
  }

  /* ---------- feedback ---------- */
  function openFeedback() {
    $("fb-place").textContent = getPlace();
    $("fb-text").value = "";
    $("fb-status").textContent = "";
    $("fb-dialog").showModal();
    $("fb-text").focus();
  }
  async function submitFeedback(e) {
    e.preventDefault();
    const text = $("fb-text").value.trim();
    if (!text) return;
    $("fb-send").disabled = true;
    try {
      await api("/api/feedback", "POST", { place: getPlace(), text });
      $("fb-status").textContent = "Sent. Thank you!";
      $("fb-status").classList.remove("error");
      setTimeout(() => $("fb-dialog").close(), 900);
    } catch (err) {
      $("fb-status").textContent = err.message;
      $("fb-status").classList.add("error");
    } finally {
      $("fb-send").disabled = false;
    }
  }

  /* ---------- saving progress ---------- */
  async function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (user) await api("/api/progress", "PUT", { progress: getProgress() });
  }
  function queueSave() {
    if (!user) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { flush().catch(() => { /* next save will retry */ }); }, 1200);
  }
  addEventListener("pagehide", () => {
    if (user && saveTimer) navigator.sendBeacon?.("/api/progress-beacon", new Blob([JSON.stringify({ progress: getProgress() })], { type: "application/json" }));
  });

  /** On load: find out who's signed in and merge the account's progress into this browser. */
  async function start() {
    $("auth-form").addEventListener("submit", submitAuth);
    $("fb-form").addEventListener("submit", submitFeedback);
    for (const id of ["auth-close", "fb-close"]) $(id).addEventListener("click", (e) => e.target.closest("dialog").close());
    try {
      const data = await api("/api/me");
      user = data.user;
      if (user) {
        const merged = mergeProgress(getProgress(), data.progress);
        setProgress(merged);
        if (JSON.stringify(merged) !== JSON.stringify(data.progress)) queueSave();
      }
    } catch { /* offline or server without accounts: work as a guest */ }
    renderButton();
    onChange?.();
  }

  return {
    start,
    queueSave,
    openAuth,
    get user() { return user; },
  };
}
