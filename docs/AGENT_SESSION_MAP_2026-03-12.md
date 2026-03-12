# QuizAll Agent Session Map (2026-03-12)

## 1) Session Scope Snapshot
- Branch: `codex-dev`
- Reference range for "today's big batch": `143bcee..HEAD`
- Net change in this range: `52 files changed, +10368 / -1735`
- Major commits in order:
  - `5d4c7d8` Add study projects, exam-prep, and admin guard
  - `ff4a55e` Update create.html
  - `8f3aa60` Add Science of Learning frontend module
  - `916eb72` Add Science link, marquee rows, disable cursor FX
  - `9a69e88` UI tweaks, cursor system, and sqlite upgrade
  - `a87de1a` Update index.html
  - `583b7bf` Use '?' SQL placeholders; enforce content min
  - `25ffeec` Refactor home layout and dashboard visuals

## 2) Architecture Map (Current Reality)

### Frontend (multi-page static app)
- Entry pages:
  - `frontend/index.html`: landing + logged-in dashboard shell (same file, mode-switched).
  - `frontend/create.html`: project/exam-prep workspace (Step 1-6 flow).
  - `frontend/science/index.html`: public science article page.
  - `frontend/history.html`, `frontend/quiz.html`, `frontend/results.html`, `frontend/settings.html`.
- Global style/theme:
  - `frontend/theme.css`: semantic color tokens.
  - `frontend/style.css`: shared component styles + global visual overrides (very dense, many `!important` blocks).
- Shared runtime libs:
  - `frontend/lib/navUserBar.js`: auth-aware topbar state, theme selector, dynamic workspace label.
  - `frontend/lib/themeManager.js`: `data-theme` orchestration.
  - `frontend/lib/scienceData.js`: source science dataset structure.
  - `frontend/lib/scienceLocale.js`: science copy translation (9 locales).
  - `frontend/lib/scienceCommon.js`: modal, step grid, badge logic, dismissal persistence.

### Backend (Express API)
- Bootstrap:
  - `backend/src/server.js` mounts all route modules under `/api/*`.
- Core routes for this session:
  - `backend/src/routes/quiz.js`:
    - Project system (`/projects`, files, exam-prep, mindmap persistence, project analytics).
    - Quiz generation with RAG/source pack fallback.
    - Study streak endpoint for dashboard heatmap.
    - Quiz history CRUD.
- DB abstraction:
  - `backend/src/lib/db.js`, `backend/src/lib/db-pg.js` (cross-db compatibility concerns are critical).

## 3) Layout/Layer Ownership (Important)

### `index.html` ownership
- `#landingView`: logged-out marketing/hero + trust + auth.
- `#dashboardView`: logged-in dashboard content.
- `showView()` controls which view is visible based on `localStorage["quizall.token"]`.

### Dashboard background system (after fixes)
- Logged-in mode (`body.logged-in-home`) disables global body grid stack.
- `.dashboard-top-region` owns:
  - grid lines
  - glow gradients
  - subtle particle/star overlay
- `.dashboard-lower-region` is the non-grid continuation zone.
- Result: section boundary is content-driven, not hardcoded viewport height.

### Nav alignment ownership
- Topbar is currently restored to full-width behavior (no inner center wrapper).
- Do **not** assume nav and content share the same width axis.

## 4) Persistence / State Keys Used
- Auth token: `localStorage["quizall.token"]`
- Theme: `localStorage["theme"]`, `localStorage["quizall.theme"]` (both appear in flows)
- Science badge/session keys:
  - `quizall.science.dismissedBadges`
  - `quizall.science.projectFlags`
  - `quizall.science.pendingBadge`

## 5) Highest-Risk Pitfalls We Hit

1. **Global layer collisions**
- Multiple background stacks were competing (`body` vs page-specific overlays), causing visible splits and mode mismatch.
- Rule: if fixing dashboard background behavior, patch the dashboard owner region first, not global body first.

2. **Topbar style conflicts**
- `frontend/style.css` has many repeated topbar blocks and heavy `!important` usage.
- A localized fix can be silently overridden later in the file.
- Rule: search full file for `.topbar` before concluding any navbar bug is fixed.

3. **Landing + dashboard co-rendering side effects**
- Prior mode left landing visible and only changed flex order; this created visual/layout coupling.
- Rule: if issue is "logged-in dashboard experience", verify whether `#landingView` is actually hidden.

4. **Backend db placeholder mismatch**
- PostgreSQL path broke when `$1/$2` was used through wrapper expecting `?`.
- Rule: keep db wrapper placeholder conventions consistent across sqlite/pg adapters.

5. **Quiz generation fallback edge case**
- Topic text shorter than `CONTENT_MIN_LENGTH` can fail unless source-pack fallback is applied for short content.
- Rule: validate fallback path for both empty and short-nonempty payloads.

## 6) "Do This First" Workflow for Next Agent

1. Reproduce with explicit mode and login state.
2. Identify ownership chain before patching:
   - Which parent owns layout?
   - Which layer owns background?
   - Which file has final CSS precedence?
3. Change smallest stable owner, not downstream leaf nodes.
4. Verify both light/dark with screenshots.
5. Re-scan for duplicate competing declarations before finalizing.

## 7) Repro + Screenshot Commands

```bash
# 1) run static frontend server
cd frontend
python3 -m http.server 4173
```

```bash
# 2) save storage states (logged-in + theme)
cat >/tmp/quizall-dashboard-dark.json <<'EOF'
{
  "cookies": [],
  "origins": [{
    "origin": "http://127.0.0.1:4173",
    "localStorage": [
      { "name": "quizall.token", "value": "dev-token" },
      { "name": "quizall.theme", "value": "dark" },
      { "name": "theme", "value": "dark" }
    ]
  }]
}
EOF
```

```bash
# 3) take screenshot
cd frontend
npx --yes playwright screenshot \
  --viewport-size "1728,1117" \
  --wait-for-timeout 1500 \
  --load-storage /tmp/quizall-dashboard-dark.json \
  http://127.0.0.1:4173/index.html \
  /tmp/dashboard-dark-check.png
```

## 8) Guardrails (Do / Don't)

### Do
- Keep science citations source-of-truth in `scienceData` and do additive edits only.
- Test `index.html` in both auth states (logged in/out).
- Keep changes theme-aware (`html[data-theme="light"]` parity).

### Don't
- Don't ship visual fixes without dark+light screenshots.
- Don't introduce new global background layers in `body` without checking dashboard-specific ownership.
- Don't add another topbar patch without checking all `.topbar` blocks in `style.css`.

