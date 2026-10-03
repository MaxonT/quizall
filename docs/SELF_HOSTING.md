# Run and extend QuizAll

`main` contains the runnable public snapshot. `codex-dev` is ongoing development.
Use Node.js 22 (`nvm install 22 && nvm use 22`) for the backend native SQLite dependency.

## Start locally

From the repository root, generate a fresh local configuration:

```bash
node scripts/setup-local.mjs
```

This creates `.env` with a random 32-byte `JWT_SECRET` and owner-only file permissions.
It never overwrites an existing file and never prints secrets. Add your own
`ANTHROPIC_API_KEY` for real AI output. Leave it blank for development mock responses;
mock output checks the flow, not AI quality.

**Docker route:** with Docker and its Compose plugin installed:

```bash
docker compose up --build
```

Open http://localhost:4173/index.html. Containers start the backend, wait for health,
and serve the frontend through a same-origin API proxy. The local container's `config.js`
points to your own backend; the checked-in hosted frontend config is not changed.
The only exposed port is bound to localhost. This is a local setup, not a production
HTTPS/domain configuration. Backend containers run as an unprivileged user.

The named `app-data` volume keeps your SQLite data across container restarts.
`docker compose down` stops/removes containers and keeps that volume.
`docker compose down -v` deletes this local data. You can use `WEB_PORT=4174 docker compose up --build`
if 4173 is occupied. In the Docker setup, local database/payment/CORS defaults are fixed by
`compose.yaml`; provider credentials still come from your `.env`.

No local Node? Use `docker run --rm -v "$PWD:/workspace" -w /workspace node:22-alpine node scripts/setup-local.mjs`.

**Native Node route:** use Node 22, then:

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

For the native setup, from `backend/`:

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
`CORS_ORIGIN` to the exact frontend origin. On `main`, the portable default is same-origin in production. The maintained
`codex-dev` frontend intentionally retains the existing hosted API selection; replace
that selection when deploying a fork. The local Docker proxy serves its own config instead.
`render.yaml` is a starting template; supply your own names, domains and credentials.
Docker builds use Node 22 and exclude `.env`, local databases and logs.
The maintained PostgreSQL backend passed Render startup/health acceptance. Fresh local
setup uses SQLite; PostgreSQL route compatibility still needs separate verification.

## Troubleshooting

- Missing JWT: check `.env` location and generate the required value.
- Wrong API origin: check `window.QUIZALL_API_BASE`, port 8080 and CORS origins.
- AI unavailable: run `npm run check:config -- --ai`; check provider credit/model access.
- SQLite install fails: use Node 22; do not reuse `node_modules` from a different Node major.
- Health succeeds but no real AI output: a health check does not validate a provider key;
  development may intentionally return `meta.mock=true` without one.

## Admin sync and coupons

Admin write endpoints are disabled unless you configure your own `SYNC_TOKEN`; callers must send it as a Bearer token. Do not expose it in frontend code. Public sample subscription coupons are no longer automatically issued, and previous sample codes are disabled on startup. Existing redeemed subscriptions are retained. Create any new private promotion codes administratively in your own database.

## What “package” and Docker mean here

`package.json` lists the Node dependencies and command shortcuts; `npm ci` installs
exactly what `package-lock.json` records. Both app packages are private and are not
published as npm libraries. Fork the repository to inherit the working application.

A Docker image contains the runtime, dependencies and app source. Compose starts
that backend together with the static frontend and a separate persistent database
volume. `.env`, API keys, local databases and logs are excluded from the images.
No image registry upload or cloud resource provisioning happens in this local workflow.

## 中文上手

从仓库根目录运行 `node scripts/setup-local.mjs`，再运行 `docker compose up --build`，
打开 http://localhost:4173。脚本只在配置文件不存在时生成新的登录密钥，已有配置会保留。
真实 AI 输出需要在 `.env` 填自己的 Anthropic API key；留空可看开发模拟流程。
Docker 包含运行环境、依赖和代码，数据库另存在本地卷；密钥和数据库不会打进镜像。
源码可复用，但 AI 额度、用户数据和部署账号由使用者自己提供。
