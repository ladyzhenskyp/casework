# Casework

SQL practice on real operations data. Casework gives you the messy requests support operations teams actually get, a database that runs in your browser, and an AI tutor that gives hints instead of answers.

Work in progress. Version 1 covers customer support operations: 15 cases on a synthetic helpdesk, CRM, survey and integration dataset.

## What's here

| Folder | Contents |
|---|---|
| `data/` | `generate.py` builds the synthetic dataset (seeded, so it is the same every run). `out/` holds the 8 tables as Parquet. |
| `cases/` | `cases.py` defines the 15 cases. `build.py` runs every reference solution, checks each case's trap, and writes `cases.json`. |
| `site/` | The landing page (`index.html`) and the workspace app (`app/`). |
| `server/` | A small FastAPI server for the site and data. The AI tutor will live here too. |
| `docs/` | Product notes, design system, and the dataset reference. |

## Run it locally

```bash
pip install -r server/requirements.txt
uvicorn server.main:app --reload
```

Open http://localhost:8000 for the landing page and http://localhost:8000/app/ for the workspace. SQL runs in your browser with DuckDB-WASM.

## Rebuild the data and answer keys

```bash
pip install -r data/requirements.txt
python data/generate.py
cd cases && python build.py
```

All names, companies and records are invented.
