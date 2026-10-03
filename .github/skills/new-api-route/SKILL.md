---
name: new-api-route
description: >
  Scaffold a new Express route in QuizAll's backend.
  Use when: "add route", "new endpoint", "add API", "create route", "new handler",
  "POST /api/…", "GET /api/…". Produces a correctly structured handler with auth,
  rate limiting, error pattern, and optional credit deduction.
---

# new-api-route Skill

Every new route in QuizAll must follow these conventions. Copy the templates below and fill in the specifics.

## Route file locations

| Purpose | File |
|---------|------|
| Quiz / study features | `backend/src/routes/quiz.js` |
| Auth / user | `backend/src/routes/auth.js` |
| Billing / credits | `backend/src/routes/billing.js` |
| Analytics | `backend/src/routes/analytics.js` |
| Classroom / teacher | `backend/src/routes/classroom.js` |

---

## Standard GET route (no credits)

```js
quizRouter.get("/projects/:id/my-resource", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;

    // 1. Verify ownership
    const project = await getProjectForUser(projectId, userId);
    if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

    // 2. Business logic
    const row = await dbGet(
      "SELECT * FROM my_table WHERE project_id = ? AND user_id = ?",
      [projectId, userId]
    );

    return res.json({ ok: true, data: row || null });
  } catch (err) {
    console.error("[quizall] my-resource GET error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load resource" });
  }
});
```

---

## Standard POST route with credit deduction

```js
// Rate limit for AI endpoints — add at top of file or in server.js
const myFeatureLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, error: "Too many requests, please wait." },
});

quizRouter.post("/projects/:id/my-feature", requireAuth, myFeatureLimiter, async (req, res) => {
  try {
    const userId = req.user.sub;
    const projectId = req.params.id;

    // 1. Input validation
    const input = String(req.body?.input || "").trim();
    if (!input) return res.status(400).json({ ok: false, error: "input is required" });

    // 2. Verify project ownership
    const project = await getProjectForUser(projectId, userId);
    if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

    // 3. Deduct credits BEFORE calling AI
    const credit = await debitCredits(userId, "studyPlan"); // pick cost key from CREDIT_COSTS
    if (!credit.success) return res.status(402).json({ ok: false, error: credit.error });

    // 4. AI call
    const result = await chatJsonAnthropic(messages, { model: AI_MODEL, maxTokens: 2000 });

    // 5. Persist result
    const id = nanoid();
    await dbRun(
      "INSERT INTO my_table (id, project_id, user_id, data) VALUES (?, ?, ?, ?)",
      [id, projectId, userId, JSON.stringify(result)]
    );

    return res.json({ ok: true, id, result, creditsDebited: credit.creditsDebited });
  } catch (err) {
    console.error("[quizall] my-feature POST error:", err);
    return res.status(500).json({ ok: false, error: formatAiError(err, "Feature failed") });
  }
});
```

---

## Credit cost keys (`CREDIT_COSTS` in `subscriptionConfig.js`)

| Key | Default cost |
|-----|-------------|
| `fileUpload` | 3 |
| `studyPlan` | 12 |
| `quizTesting` | 20 |
| `trainingBatch` | 10 |
| `trainingRefill` | 8 |
| `studyNote` | 10 |

All overridable via `CREDIT_COST_*` env vars.

---

## Required imports (add to top of route file if missing)

```js
import { requireAuth } from "./auth.js";
import { dbGet, dbRun, dbAll, USE_POSTGRES, DB_TRUE } from "../lib/dbHelpers.js";
import { debitCredits } from "../lib/creditsService.js";
import { CREDIT_COSTS } from "../lib/subscriptionConfig.js";
import { chatJsonAnthropic } from "../lib/anthropicClient.js";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
```

---

## Checklist

- [ ] Route uses `requireAuth` (or `optionalAuth` if intentionally public)
- [ ] AI / billing endpoints have a `rateLimit()` middleware
- [ ] Input validated and sanitized at entry point
- [ ] Project ownership verified with `getProjectForUser(projectId, userId)`
- [ ] Credits debited **before** the AI call
- [ ] Error handler uses `console.error("[quizall] …")` and returns `{ ok: false, error: "…" }`
- [ ] Response includes `ok: true` on success
- [ ] DB queries use `dbGet/dbRun/dbAll` (never `db.prepare()`)
