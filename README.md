# QuizAll

**Turn anything into a quiz** — AI-powered study sessions: paste notes or upload files, get a study plan, mixed quiz (Training / Testing), and a review note.

## Quick start (local)

### 1. Backend

```bash
cd backend
cp ../.env.example ../.env   # set ANTHROPIC_API_KEY at minimum
npm install
npm run dev                  # http://localhost:8080
```

### 2. Frontend

```bash
cd frontend
python3 -m http.server 4173  # or any static server
```

Open `http://localhost:4173/index.html`. Set `QUIZALL_API_BASE` in `frontend/config.js` if the API is not on the same origin.

### 3. E2E (mock API, no backend required)

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

## Main pages

| Path | Purpose |
|------|---------|
| `frontend/index.html` | Landing / login |
| `frontend/create.html` | Study chat workspace (plan → quiz → note) |
| `frontend/projects.html` | Project folders |
| `frontend/subscription.html` | Plans & billing |
| `frontend/share.html` | Read-only shared session |

## Environment

See [`.env.example`](.env.example). Key flags:

- `ANTHROPIC_API_KEY` — required for real AI generation
- `SUBSCRIPTIONS_ENABLED` — set `true` + Stripe keys to enable billing
- `DATABASE_URL` — PostgreSQL in production; SQLite used locally by default

## Deploy

Render config: [`render.yaml`](render.yaml) — static frontend + Node API + Postgres.

## Architecture

- **Frontend**: static HTML/CSS/JS (`frontend/create/` modules + `create.js`)
- **Backend**: Express (`backend/src/server.js`), routes under `/api/quiz`, `/api/auth`, `/api/billing`
- **AI**: Anthropic Claude via `backend/src/lib/anthropicClient.js`
