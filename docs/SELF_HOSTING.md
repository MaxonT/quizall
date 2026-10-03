# Run and extend QuizAll

`main` contains the runnable public snapshot. `codex-dev` is ongoing development.
Use Node.js 22 (`nvm install 22 && nvm use 22`) for the backend native SQLite dependency.

## Start locally

From the repository root:

```bash
cp .env.example .env
openssl rand -hex 32
```

Paste the generated value into `JWT_SECRET` in `.env`. Add your own
`ANTHROPIC_API_KEY` for real AI output. Leave it blank for development mock
responses (mock output is for checking the app flow, not AI quality).
Then:

```bash
cd backend
npm ci
npm run check:config
npm start
```

In another terminal, from the repository root:

```bash
cd frontend
python3 -m http.server 4173
```

Open http://localhost:4173/index.html and register with email/password.
The frontend points to your local backend on port 8080. Google/GitHub OAuth
and Stripe are optional; the default setup does not require them.

In a third terminal, from `backend/`:

```bash
npm run health
npm test
# Check that a real AI key is configured (does not make paid calls):
npm run check:config -- --ai
```

`backend/.env` is also supported and takes precedence over the root `.env`.
Environment variables supplied by your shell or deployment platform take precedence
over both files. Configuration loads before database, auth, AI and migration modules.
Run backend commands from `backend/`; the default SQLite path is relative to it.

## What you must configure

| Setting | Required when |
|---------|---------------|
| `JWT_SECRET` | Always; generate your own random value, at least 32 characters |
| `ANTHROPIC_API_KEY` | Real learning plans, quiz generation and study notes |
| `ANTHROPIC_MODEL` | Optional model override; default `claude-sonnet-4-6` |
| `DATABASE_URL` | Using your own PostgreSQL instead of local SQLite |
| `CORS_ORIGIN`, `FRONTEND_URL` | Hosting the frontend at a different origin |
| `GOOGLE_*`, `GITHUB_*` | Enabling social login |
| `STRIPE_*` | Enabling billing with your own Stripe account |

Your own provider account pays for AI usage. The source does not include the
maintainer's provider credentials, hosted database or user data. A public API URL
is not a password and should be replaced with your own deployment URL.

## Reuse the learning pipeline

The orchestrator and source-grounding prompts are in
[`backend/src/routes/quiz.js`](../backend/src/routes/quiz.js):

1. Upload/paste material into a study project.
2. Build a topic plan (`POST /api/quiz/projects/:id/study-plan`).
3. Generate practice questions (`POST /api/quiz/generate`) and record results.
4. Generate a review note (`POST /api/quiz/projects/:id/note`).

[`anthropicClient.js`](../backend/src/lib/anthropicClient.js) handles provider calls.
[`quizTranscript.js`](../backend/src/routes/quizTranscript.js) handles saved session
transcripts. [`frontend/create/api.js`](../frontend/create/api.js) shows request bodies.
Routes expect JWT authentication and, where applicable, a project in your own database.
This is a working app to fork/adapt; the pipeline is not a standalone npm SDK.

## Deploy your own instance

Use your own database and provider keys. Keep `JWT_SECRET` and API keys on the
backend only. Configure `frontend/config.js` with your backend origin and set
`CORS_ORIGIN` to the exact frontend origin. The portable default is same-origin
in production; it never selects the maintainer's hosted backend automatically.
`render.yaml` is a starting template; supply your own names, domains and credentials.
Docker builds use Node 22 and exclude `.env`, local databases and logs.
PostgreSQL support is included, but the setup verification for this change uses SQLite.

## Troubleshooting

- Missing JWT: check `.env` location and generate the required value.
- Wrong API origin: check `window.QUIZALL_API_BASE`, port 8080 and CORS origins.
- AI unavailable: run `npm run check:config -- --ai`; check provider credit/model access.
- SQLite install fails: use Node 22; do not reuse `node_modules` from a different Node major.
- Health succeeds but no real AI output: a health check does not validate a provider key;
  development may intentionally return `meta.mock=true` without one.
