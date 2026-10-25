"""Casework server.

Serves the static site, the dataset, the public case file and the AI tutor API.
Run locally with:

    pip install -r server/requirements.txt
    uvicorn server.main:app --reload

then open http://localhost:8000 (landing page) or http://localhost:8000/app/ (workspace).
"""
from pathlib import Path

import html
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server import tutor  # loads .env first
from server import accounts

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="Casework", docs_url=None, redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.get("/api/health")
def health():
    return {"ok": True}


def visitor(request: Request) -> str:
    # Railway sits behind a proxy; the first forwarded address is the visitor.
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


# ---------------------------------------------------------------- accounts
def current_user(request: Request):
    return accounts.user_for_token(request.cookies.get(accounts.COOKIE))


def same_site(request: Request) -> bool:
    """State-changing requests must come from this site (blocks cross-site form posts)."""
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return True  # non-browser clients such as curl
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return urlsplit(origin).netloc == host


def refuse(message, status):
    return JSONResponse({"error": message}, status_code=status)


def with_session(resp: JSONResponse, token: str, request: Request) -> JSONResponse:
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    resp.set_cookie(accounts.COOKIE, token, max_age=accounts.SESSION_DAYS * 86400, httponly=True,
                    secure=secure, samesite="lax", path="/")
    return resp


@app.get("/api/me")
def me(request: Request):
    user = current_user(request)
    if not user:
        return {"user": None}
    return {"user": user, "progress": accounts.get_progress(user["id"])}


@app.post("/api/signup")
def signup(payload: dict, request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    try:
        user, token = accounts.signup(payload.get("email"), payload.get("password"), payload.get("name"),
                                      payload.get("invite"), visitor(request))
    except accounts.AccountError as e:
        return refuse(str(e), e.status)
    return with_session(JSONResponse({"user": user, "progress": None}), token, request)


@app.post("/api/login")
def login(payload: dict, request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    try:
        user, token = accounts.login(payload.get("email"), payload.get("password"), visitor(request))
    except accounts.AccountError as e:
        return refuse(str(e), e.status)
    return with_session(JSONResponse({"user": user, "progress": accounts.get_progress(user["id"])}), token, request)


@app.post("/api/logout")
def logout(request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    accounts.logout(request.cookies.get(accounts.COOKIE))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(accounts.COOKIE, path="/")
    return resp


@app.put("/api/progress")
def put_progress(payload: dict, request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    user = current_user(request)
    if not user:
        return refuse("Sign in to save progress.", 401)
    try:
        accounts.save_progress(user["id"], payload.get("progress"))
    except accounts.AccountError as e:
        return refuse(str(e), e.status)
    return {"ok": True}


@app.post("/api/progress-beacon")
def beacon_progress(payload: dict, request: Request):
    # Same as PUT /api/progress, for the last save when a tab closes (browsers send it as POST).
    return put_progress(payload, request)


@app.post("/api/feedback")
def feedback(payload: dict, request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    user = current_user(request)
    if not user:
        return refuse("Sign in to send feedback.", 401)
    try:
        accounts.add_feedback(user["id"], payload.get("place"), payload.get("text"))
    except accounts.AccountError as e:
        return refuse(str(e), e.status)
    return {"ok": True}


# ---------------------------------------------------------------- tutor
@app.get("/api/tutor")
def tutor_status(request: Request):
    user = current_user(request)
    who = f"user:{user['id']}" if user else visitor(request)
    return {"remaining": tutor.LIMITS.remaining(who), "sample": not tutor.os.environ.get("ANTHROPIC_API_KEY"),
            "signedIn": bool(user)}


@app.post("/api/tutor")
def tutor_reply(payload: dict, request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    user = current_user(request)
    if not user:
        return refuse("Sign in to use hints and the tutor. During the beta they're for invited testers.", 401)
    who = f"user:{user['id']}"
    try:
        req = tutor.validate(payload)
    except tutor.TutorError as e:
        return JSONResponse({"error": str(e)}, status_code=e.status)
    blocked = tutor.LIMITS.take(who)
    if blocked == "visitor":
        return JSONResponse({"error": f"You've used today's {tutor.HINTS_PER_VISITOR_PER_DAY} tutor replies. "
                                      "They reset at midnight UTC.", "remaining": 0}, status_code=429)
    if blocked == "server":
        return JSONResponse({"error": "The tutor has reached its daily limit for everyone. Try again tomorrow.",
                             "remaining": 0}, status_code=429)
    try:
        reply, sample, off_topic = tutor.answer(req)
    except tutor.TutorError as e:
        tutor.LIMITS.refund(who)  # a failed reply doesn't count against the visitor
        return JSONResponse({"error": str(e), "remaining": tutor.LIMITS.remaining(who)}, status_code=e.status)
    if off_topic:
        tutor.LIMITS.off_topic(who)
    return {"reply": reply, "sample": sample, "level": req["level"], "remaining": tutor.LIMITS.remaining(who)}


@app.get("/cases.json")
def cases_json():
    # Only the public case file is served. cases/solutions.json stays on the server.
    return FileResponse(ROOT / "cases" / "cases.json", media_type="application/json")


@app.get("/quizzes.json")
def quizzes_json():
    return FileResponse(ROOT / "cases" / "quizzes.json", media_type="application/json")


@app.get("/drills.json")
def drills_json():
    return FileResponse(ROOT / "cases" / "drills.json", media_type="application/json")


# ---------------------------------------------------------------- admin
ADMIN_STYLE = """body{font:15px/1.5 system-ui,-apple-system,sans-serif;color:#2F1D18;background:#FBF4EF;margin:0;padding:28px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px}p.sub{color:#77584C;margin:0}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e8dcd6;border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #efe5e0;vertical-align:top;font-size:14px}
th{background:#FDF9F6;color:#77584C;font-weight:600}td.t{white-space:pre-wrap;max-width:560px}
form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#fff;border:1px solid #e8dcd6;border-radius:10px;padding:12px}
input{font:inherit;padding:7px 9px;border:1px solid #d9c2ba;border-radius:7px}button{font:inherit;font-weight:600;background:#7A1F31;color:#fff;border:0;border-radius:7px;padding:8px 12px;cursor:pointer}
#msg{color:#336B48;font-weight:600}a{color:#7A1F31}"""


@app.get("/admin", response_class=HTMLResponse)
def admin(request: Request):
    user = current_user(request)
    if not user or not user["admin"]:
        return HTMLResponse("<p style='font-family:system-ui;padding:28px'>This page is only for the site owner. "
                            "<a href='/app/'>Back to the workspace</a></p>", status_code=403)
    data = accounts.admin_overview()
    e = html.escape
    users = "".join(f"<tr><td>{e(u['name'])}</td><td>{e(u['email'])}</td><td>{u['solved']}</td><td>{u['hints']}</td>"
                    f"<td>{u['tutor_today']}</td><td>{u['tutor_week']}</td><td>{u['tutor_total']}</td><td>{u['off_topic']}</td>"
                    f"<td>{e((u['created_at'] or '')[:10])}</td><td>{e((u['last_seen'] or '')[:16].replace('T', ' '))}</td></tr>"
                    for u in data["users"])
    fb = "".join(f"<tr><td>{e((f['created_at'] or '')[:16].replace('T', ' '))}</td><td>{e(f['name'] or '')}</td>"
                 f"<td>{e(f['place'] or '')}</td><td class='t'>{e(f['text'])}</td></tr>" for f in data["feedback"])
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Casework admin</title><style>{ADMIN_STYLE}</style></head><body>
<h1>Casework beta</h1><p class="sub">Only you can see this page. <a href="/app/">Back to the workspace</a></p>
<h2>Feedback ({len(data['feedback'])})</h2>
<table><tr><th>When (UTC)</th><th>Who</th><th>Where</th><th>Note</th></tr>{fb or '<tr><td colspan=4>No feedback yet.</td></tr>'}</table>
<h2>Testers ({len(data['users'])})</h2>
<p class="sub">Tutor replies count hints, questions and walkthrough steps. Off-topic = questions the tutor declined as unrelated to SQL. Limits: {tutor.HINTS_PER_VISITOR_PER_DAY} per person and {tutor.HINTS_PER_SERVER_PER_DAY} for the site per day (UTC).</p>
<table><tr><th>Name</th><th>Email</th><th>Solved</th><th>Hints used</th><th>Tutor today</th><th>Last 7 days</th><th>All time</th><th>Off-topic</th><th>Joined</th><th>Last seen (UTC)</th></tr>{users}</table>
<h2>Reset a password</h2>
<form id="reset"><input name="email" type="email" placeholder="Their email" required>
<input name="password" type="text" placeholder="New temporary password (8+ characters)" minlength="8" required>
<button>Reset</button><span id="msg" role="status"></span></form>
<script>
document.getElementById('reset').addEventListener('submit', async (ev) => {{
  ev.preventDefault(); const f = new FormData(ev.target); const m = document.getElementById('msg');
  const r = await fetch('/api/admin/reset-password', {{method: 'POST', headers: {{'content-type': 'application/json'}},
    body: JSON.stringify({{email: f.get('email'), password: f.get('password')}})}});
  const d = await r.json(); m.style.color = r.ok ? '#336B48' : '#7A1F31';
  m.textContent = r.ok ? 'Done. Send them the new password; they can keep using it.' : d.error;
}});
</script></body></html>"""
    return HTMLResponse(page, headers={"cache-control": "no-store"})


@app.post("/api/admin/reset-password")
def admin_reset(payload: dict, request: Request):
    if not same_site(request):
        return refuse("Request blocked.", 403)
    user = current_user(request)
    if not user or not user["admin"]:
        return refuse("Only the site owner can do that.", 403)
    try:
        accounts.admin_reset_password(payload.get("email"), payload.get("password"))
    except accounts.AccountError as e:
        return refuse(str(e), e.status)
    return {"ok": True}


app.mount("/data", StaticFiles(directory=ROOT / "data" / "arrow"), name="data")
app.mount("/", StaticFiles(directory=ROOT / "site", html=True), name="site")
