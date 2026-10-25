"""Entry point for hosting. Railway's Python builder (Railpack) runs
`uvicorn main:app` for FastAPI apps, so this file points it at the real app."""
from server.main import app  # noqa: F401
