# QuizAll — Agent Instructions

See [README.md](README.md) for project overview and quick-start commands.

---

## Build / Test Commands

```bash
# Backend dev (auto-runs migrations on start)
cd backend && npm run dev          # node --watch src/server.js on :8080

# Backend one-shot test
cd backend && npm test             # scripts/selftest.js

# Frontend (no build step — pure static files)
cd frontend && python3 -m http.server 4173

# E2E (Playwright, mocked API — no backend required)
npm run test:e2e
npx playwright test --ui           # interactive mode
```

---

## Architecture

```
backend/            Node.js ESM ("type":"module"), Express
  src/server.js     Entry point — CORS, helmet, rate-limiters, all routers
  src/routes/       quiz.js · auth.js · billing.js · analytics.js · classroom.js
  src/lib/          db.js · db-pg.js · dbHelpers.js · creditsService.js · anthropicClient.js
  src/middleware/   csp.js · (rate-limit helpers)
  migrations/       000–005 JS migration files
  scripts/          run_migrations.js (auto-runs on npm start/dev)

frontend/           No bundler — plain HTML/CSS/JS loaded via <script src>
  create.js         ~3 000-line IIFE — entire study-chat app logic
  lib/              authGuard.js · purify.min.js · i18next.min.js · themeManager.js
  create/           create-page sub-modules: api.js · transcript.js · mindmap.js
  i18n/             i18next setup; locales/ has 9 JSON files (en, zh-CN, es, fr, ja, ko, ar, pt, hi)
  config.js         Sets window.QUIZALL_API_BASE by hostname
```

**Frontend ↔ Backend:** `fetch` + REST (`/api/*`). `authGuard.fetchWithAuth()` auto-attaches `Authorization: Bearer <token>`.

**DB:** SQLite in dev, PostgreSQL in production (`DATABASE_URL` triggers PG path automatically).

---

## Key Conventions

### Database Helpers — always use these, never `db.prepare()`

```js
import { dbGet, dbRun, dbAll, USE_POSTGRES, DB_TRUE, dbBool } from "../lib/dbHelpers.js";

const row   = await dbGet("SELECT * FROM t WHERE id = ?", [id]);
const rows  = await dbAll("SELECT * FROM t WHERE user_id = ?", [uid]);
await dbRun("INSERT INTO t (id, val) VALUES (?, ?)", [id, val]);
```

`DB_TRUE` / `DB_FALSE` / `dbBool(v)` exist because SQLite stores booleans as `0`/`1` while PG uses `true`/`false`. `PG db.run()` always returns `{ changes: 0 }` — never rely on `changes` count in shared code.

### Adding a New Table

1. **SQLite** — add `CREATE TABLE IF NOT EXISTS …` inside the `sqliteDb.exec()` block in `backend/src/lib/db.js`
2. **PostgreSQL** — add the same statement inside `initializeSchema()` in `backend/src/lib/db-pg.js`, AND add an idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` after the existing migration block for any new columns on pre-existing deployments
3. New column only — use `ensureColumn(table, col, def)` (SQLite) / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (PG)

### Auth

```js
import { requireAuth } from "./auth.js";
quizRouter.post("/some-route", requireAuth, async (req, res) => {
  const userId = req.user.sub;   // JWT payload
  // ...
});
```

`optionalAuth` is available for public endpoints that also accept logged-in users.

### Route Error Pattern

```js
try {
  // business logic
  return res.json({ ok: true, result });
} catch (err) {
  console.error("[quizall] context error:", err);
  return res.status(500).json({ ok: false, error: "Human-readable message" });
}
```

All responses include `ok: boolean`. Frontend checks `data.ok` before using results.

### Credit System

```js
import { debitCredits } from "../lib/creditsService.js";
import { CREDIT_COSTS } from "../lib/subscriptionConfig.js";

// Inside a route handler:
const result = await debitCredits(userId, "quizTesting");
if (!result.success) return res.status(402).json({ ok: false, error: result.error });
```

Default costs (`CREDIT_COSTS`): `fileUpload=3`, `studyPlan=12`, `quizTesting=20`, `trainingBatch=10`, `trainingRefill=8`, `studyNote=10`. All overridable via `CREDIT_COST_*` env vars.

### AI (Anthropic)

```js
import { chatJsonAnthropic } from "../lib/anthropicClient.js";
// Returns parsed JSON; throws AnthropicDisabledError if ANTHROPIC_API_KEY is not set.
const data = await chatJsonAnthropic(messages, { model: AI_MODEL, maxTokens: 2000 });
```

Default model: `claude-sonnet-4-6` (set via `ANTHROPIC_MODEL` env). Wrap all AI calls with `formatAiError(err)` for user-friendly messages.

---

## Frontend Conventions

- **No bundler** — scripts load in order via `<script src>`. Never use `import` in non-module scripts.
- **Global state** — `create.js` is an IIFE. Shared globals: `window.authGuard`, `window.i18n`, `window.QUIZALL_API_BASE`, `window.themeManager`.
- **Frontend `state` object** (in create.js):
  ```js
  { projectId, projectName, analysis, studyPlan, pendingFiles, roundIndex,
    roundResults, isProcessing, resumedSession, materialPreview, training,
    mindmap, activeTopicHint, examPreset, appSettings, … }
  ```
- **XSS** — AI-generated HTML must be sanitized with `DOMPurify.sanitize(html, { ALLOWED_TAGS: […], ALLOWED_ATTR: […] })` before insertion.
- **Date formatting** — always pass `'en-US'` locale explicitly to `toLocaleDateString()` / `toLocaleTimeString()` to prevent locale-dependent output.
- **i18n** — use `data-i18n="key"` attributes in HTML; `window.i18n.t("key")` in JS.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| PG `db.prepare()` doesn't exist | Use `dbGet/dbRun/dbAll` from `dbHelpers.js` |
| `CORS_ORIGIN` not set in production | Always set explicitly; `*` is rejected in prod |
| `JWT_SECRET` missing | Server throws `FATAL` and refuses to start |
| Anthropic model retired | Default is `claude-sonnet-4-6`; old `claude-sonnet-4-20250514` was retired 2026-06-15 |
| Booleans differ by DB | Use `DB_TRUE` / `dbBool()` helpers |
| Migration failures are non-fatal | `run_migrations.js` catches and continues — check logs |
| `toLocaleDateString()` shows Chinese | Pass `'en-US'` as first argument |

---

## Security Requirements

- **All new routes** must use `requireAuth` unless intentionally public
- **Rate-limit sensitive routes** — quiz generation already has 5 req/min; add `rateLimit()` middleware to new AI or billing endpoints
- **Never trust client-provided HTML** — sanitize with DOMPurify before DOM insertion
- **Stripe webhooks** — validated with `stripe.webhooks.constructEvent()` in `billing.js`; use `stripeWebhookRouter` (raw body) not the regular JSON router

---

## Environment Variables

Required for local dev (copy `.env.example` to `.env`):

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing key (min 32 chars) |
| `ANTHROPIC_API_KEY` | Claude access (AI features disabled without it) |
| `SQLITE_PATH` | SQLite DB path (default `./data/app.db`) |
| `PORT` | Server port (default `8080`) |

Production adds: `DATABASE_URL`, `CORS_ORIGIN`, `STRIPE_*`, `ANTHROPIC_MODEL`, `SUBSCRIPTIONS_ENABLED`.

---

## Deployment (Render)

See [`render.yaml`](render.yaml). Backend auto-runs `npm start` (which runs migrations). Postgres `DATABASE_URL` is injected automatically from the managed DB service.
