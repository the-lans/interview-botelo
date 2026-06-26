# interview-botelo

Interview simulator platform for Botelo.

## Structure
- `backend/` — FastAPI backend (auth, resume upload, plan generation, interview simulation)
- `docs/TZ.md` — актуальное ТЗ

## Quick start

### Backend
```bash
cd backend
cp ../.env.example .env
# fill DATABASE_URL, JWT_SECRET, SESSION_SECRET, OPENCLAW_API_TOKEN

# Required for .doc parsing
sudo apt-get install -y antiword

python -m pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Checks

### Backend
```bash
cd backend
python -m pip install -e .[dev]
pytest -q
```

### Frontend

```bash
cd frontend
npm test -- --run
npm run typecheck
```

## CI / Deploy

- GitHub Actions запускает backend `pytest`, frontend `vitest` и frontend `typecheck`.
- Деплой выполняется через `deploy/deploy.sh` и падает, если `http://127.0.0.1:8000/health` или `http://127.0.0.1:3000` не поднимаются вовремя.
