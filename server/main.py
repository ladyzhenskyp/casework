"""Casework server.

Serves the static site, the dataset, the public case file and the AI tutor API.
Run locally with:

    pip install -r server/requirements.txt
    uvicorn server.main:app --reload

then open http://localhost:8000 (landing page) or http://localhost:8000/app/ (workspace).
"""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server import tutor

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


@app.get("/api/tutor")
def tutor_status(request: Request):
    return {"remaining": tutor.LIMITS.remaining(visitor(request)), "sample": not tutor.os.environ.get("ANTHROPIC_API_KEY")}


@app.post("/api/tutor")
def tutor_reply(payload: dict, request: Request):
    who = visitor(request)
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
        reply, sample = tutor.answer(req)
    except tutor.TutorError as e:
        tutor.LIMITS.refund(who)  # a failed reply doesn't count against the visitor
        return JSONResponse({"error": str(e), "remaining": tutor.LIMITS.remaining(who)}, status_code=e.status)
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


app.mount("/data", StaticFiles(directory=ROOT / "data" / "arrow"), name="data")
app.mount("/", StaticFiles(directory=ROOT / "site", html=True), name="site")
