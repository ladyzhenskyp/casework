"""Casework server.

Serves the static site, the dataset and the public case file, and (in the next
build step) the AI tutor API. Run locally with:

    pip install -r server/requirements.txt
    uvicorn server.main:app --reload

then open http://localhost:8000 (landing page) or http://localhost:8000/app/ (workspace).
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="Casework", docs_url=None, redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/cases.json")
def cases_json():
    # Only the public case file is served. cases/solutions.json stays on the server.
    return FileResponse(ROOT / "cases" / "cases.json", media_type="application/json")


app.mount("/data", StaticFiles(directory=ROOT / "data" / "arrow"), name="data")
app.mount("/", StaticFiles(directory=ROOT / "site", html=True), name="site")
