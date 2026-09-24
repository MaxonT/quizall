# QuizAll

AI-powered study sessions: turn notes, files, or YouTube into a **study plan → Training/Testing quiz → review note**.

Paste text, upload PDF/DOCX, or drop a YouTube URL. QuizAll builds a structured plan, runs retrieval practice (Training) or mixed exams (Testing), then writes a study note you can share or revisit.

### Try the hosted app (no API key setup)

If you just want to use QuizAll, open the live site — no local install, no Anthropic API key required:

**https://quiz-all.com/**

The sections below are for running or developing the project yourself.

---

## Quick start (local)

### 1. Backend

```bash
cd backend
cp ../.env.example ../.env   # set JWT_SECRET + ANTHROPIC_API_KEY at minimum
npm install
npm run dev                  # http://localhost:8080 (runs migrations on start)
```

### 2. Frontend

```bash
cd frontend
python3 -m http.server 4173
```

Open `http://localhost:4173/index.html`. On localhost, `frontend/config.js` points the API at `http://localhost:8080` automatically.

### 3. E2E (mocked API — backend not required)

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

---

## What you can do

| Feature | What it does |
|---------|----------------|
| **Study Chat** | Main workspace: plan → quiz → note in one flow (`create.html`) |
| **Material ingest** | Paste text; upload PDF / DOCX / text files; fetch YouTube captions |
| **Study plan** | AI-generated topics and steps from your materials |
| **Training mode** | Short MCQ batches, often focused on weak topics |
| **Testing mode** | Mixed-question exams with type mix and exam presets (general / finals / AP) |
| **Exam map** | Topic tree with mastery coloring (rule-based, not LLM) |
| **Study note + share** | Session summary; shareable link / challenge deep-link |
| **Wrong-answer review** | Spaced-repetition style queue for missed questions |
| **Study streak** | Activity streak with timezone-aware day boundaries |
| **Credits** | Per-action usage metering with daily reset |
| **Auth** | Email/password + Google / GitHub OAuth (PKCE) |
| **Classroom** | Classes, assignments, submissions (`classroom.html`) |

Subscriptions/Stripe code exists but is **off by default** (`SUBSCRIPTIONS_ENABLED=false`).

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Static HTML / CSS / JS (no bundler) |
| Backend | Node.js ESM + Express |
| Database | SQLite locally; PostgreSQL when `DATABASE_URL` is set |
| Auth | JWT + bcrypt; Google / GitHub OAuth PKCE |
| AI | Anthropic Claude (default model `claude-sonnet-4-6`) |
| Billing | Stripe (optional / feature-flagged) |
| Deploy | Render (`render.yaml`: static frontend + Node API + Postgres) |
| E2E | Playwright (mocked API) |

---

## Architecture (short)

```
Browser (static frontend)
    │  fetch + Bearer JWT (authGuard)
    ▼
Express /api/*  (auth, oauth, quiz, classroom, billing, analytics)
    │
    ├─► dbHelpers → SQLite or PostgreSQL
    ├─► Anthropic Claude (study-plan / quiz / note)
    └─► Stripe (optional)
```

**Core learning API** lives under `/api/quiz` (generate, study-plan, note, exam-prep, share, streak, wrong-answers, etc.).  
**Product state** for the main flow is driven by `frontend/create.js` plus `frontend/create/` helpers.

For agent/contributor conventions, see [`AGENTS.md`](AGENTS.md).

---

## Main pages

| Path | Purpose |
|------|---------|
| `frontend/index.html` | Landing / login |
| `frontend/create.html` | Study chat workspace |
| `frontend/projects.html` | Project folders |
| `frontend/history.html` | Past sessions |
| `frontend/library.html` | Saved materials |
| `frontend/classroom.html` | Teacher / class flows |
| `frontend/share.html` | Shared session view |
| `frontend/subscription.html` | Plans & billing UI |
| `frontend/settings.html` | Account settings |
| `frontend/analytics-dashboard.html` | Admin analytics |

---

## Environment

Copy [`.env.example`](.env.example) → `.env`. Important variables:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing key (required; min 32 chars in production) |
| `ANTHROPIC_API_KEY` | Claude access (AI features disabled / mock without it) |
| `ANTHROPIC_MODEL` | Optional override (default `claude-sonnet-4-6`) |
| `SQLITE_PATH` | Local DB path (default `./data/app.db`) |
| `DATABASE_URL` | Enables PostgreSQL path |
| `CORS_ORIGIN` | Allowed frontend origin (must be set explicitly in prod) |
| `GOOGLE_*` / `GITHUB_*` | OAuth client credentials |
| `SUBSCRIPTIONS_ENABLED` | `true` + Stripe keys to enable billing |
| `PORT` | API port (default `8080`) |

---

## Scripts

```bash
# Backend
cd backend && npm run dev      # migrate + watch server
cd backend && npm start        # migrate + production server
cd backend && npm test         # lightweight selftest
cd backend && npm run migrate  # migrations only

# Root
npm run test:e2e               # Playwright
npm run test:e2e:ui            # Playwright UI mode
```

---

## Deploy (Render)

Blueprint: [`render.yaml`](render.yaml)

- **quizall-backend** — Node web service (`npm start`, health: `/api/health`)
- **quizall-frontend** — static site from `frontend/`
- **quizall-db** — managed Postgres (`DATABASE_URL` injected)

Set `CORS_ORIGIN`, `FRONTEND_URL`, OAuth secrets, and `ANTHROPIC_API_KEY` in the Render dashboard.

---

## Project layout

```
backend/
  src/server.js          Entry: CORS, helmet, rate limits, routers
  src/routes/            auth, oauth, quiz, classroom, billing, analytics…
  src/lib/               db, db-pg, dbHelpers, anthropicClient, credits…
  migrations/            JS migrations (auto-run on start)
frontend/
  create.html / create.js   Main study product
  create/                   api, transcript, mindmap helpers
  lib/                      authGuard, i18n, theme…
  i18n/locales/             9 languages
  config.js                 API base URL by hostname
e2e/                     Playwright specs
```

---

## License

Not specified in-repo. Treat as private unless a license file is added.
