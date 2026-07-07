---
applyTo: "frontend/create.js,frontend/create.css,frontend/create.html"
---

# Frontend IIFE Modification Rules

`frontend/create.js` is a **~3 000-line IIFE** — the entire study-chat application lives in one self-contained function. These rules prevent accidental breakage.

## Core constraints

- **Never add top-level variables or functions outside the IIFE.** All new code must go inside the `(() => { … })()` wrapper.
- **Never use `import` statements** — the file is loaded as a plain `<script>`, not a module.
- **Read before editing.** Always read at least 30 lines of context around the insertion point before making a change.

## `state` object — read the existing shape first

The `state` singleton drives the entire page. Before adding a new property, check the declaration near the top of the IIFE (`const state = { … }`). To add a new field:

```js
// Inside the state object declaration:
myNewField: null,   // or appropriate default
```

Reset new fields in `resetNewChat()` and in `setResumedSession(false)` paths if they should not persist across sessions.

## Appending a new feature

1. **Find the right section** — the file is divided by comment banners (`// ── Section Name ──`). Place new functions near related logic.
2. **Use `appendMessage(role, html)` for chat output** — never write to `els.chatInner` directly.
3. **Always sanitize AI HTML** before inserting:
   ```js
   const safe = DOMPurify.sanitize(html, { ALLOWED_TAGS: [...], ALLOWED_ATTR: [...] });
   appendMessage("ai", safe);
   ```
4. **Use `api(path, options)` for all fetch calls** — not raw `fetch`. It handles `authGuard`, base URL, and error normalisation.
5. **Guard AI-triggered flows with `state.isProcessing`**:
   ```js
   if (state.isProcessing) return;
   setProcessing(true);
   try { … } finally { setProcessing(false); }
   ```

## Adding a new button / interactive element

- Bind event listeners **after** `appendMessage()` returns the wrapper element:
  ```js
  const msg = appendMessage("ai", `<button class="my-btn">Click</button>`);
  msg.querySelector(".my-btn").addEventListener("click", handler);
  ```
- When restoring from transcript (`rebindTranscriptInteractive`), re-bind interactive elements inside that function so they work after page reload.

## CSS (`create.css`)

- All chat-bubble overrides go in the `.msg.*` block section.
- All quiz card overrides go in the `.quiz-card` section.
- Never use `!important` unless overriding a third-party style.
- Prefer CSS custom properties (`var(--c-text)`, `var(--c-border)`, etc.) over hardcoded colours.

## Date formatting

Always pass `'en-US'` as the first argument to locale-sensitive date methods:

```js
// ✓
new Date(ts).toLocaleDateString('en-US', { ... })
// ✗ — outputs Chinese in zh-CN browser locale
new Date(ts).toLocaleDateString(undefined, { ... })
```

## Key helpers available inside the IIFE

| Helper | Purpose |
|--------|---------|
| `api(path, opts)` | Authenticated fetch to `API_BASE` |
| `appendMessage(role, html, type?)` | Add a chat bubble, returns wrapper element |
| `appendTyping(label?)` | Show typing indicator, returns element |
| `removeTyping(el)` | Remove typing indicator |
| `setProcessing(bool)` | Toggle `state.isProcessing` + UI lock |
| `icon(name)` | Return SVG icon HTML string |
| `escapeHtml(str)` | XSS-safe text escaping |
| `scrollToBottom()` | Scroll chat to latest message |
| `scheduleChatSave()` | Debounced transcript save |
| `loadHistorySidebar()` | Refresh left sidebar |
