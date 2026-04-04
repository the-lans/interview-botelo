# interview-botelo

Interview simulator platform for Botelo.

## Structure
- `backend/` — FastAPI backend (auth, resume upload, plan generation, interview simulation)
- `docs/TZ.md` — актуальное ТЗ

## Quick start (backend)
```bash
cd backend
cp ../.env.example .env
# fill DATABASE_URL, JWT_SECRET, SESSION_SECRET, OPENCLAW_API_TOKEN

python -m pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Tests
```bash
cd backend
python -m pip install -e .[dev]
pytest -q
```

## Status
Backend scaffolded, tests included. Frontend to be added.
