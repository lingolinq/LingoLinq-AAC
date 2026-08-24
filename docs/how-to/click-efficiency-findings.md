# Click-efficiency findings

How the user how-to guide was grounded in real browser paths, and what
Playwright measured for each task.

**Related**

- User-facing steps: [`user-guide.md`](user-guide.md)
- Shortest paths (with deep links, for developers/QA):
  [`../task-management/efficient-navigation-guide.md`](../task-management/efficient-navigation-guide.md)
- Automated suite: `tests/click-efficiency.spec.ts`
- Helpers: `tests/helpers/click-efficiency.ts`

**Run (local stack must be up)**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:8184 npx playwright test tests/click-efficiency.spec.ts
```

---

## Method

For each high-value task we scripted two paths in Playwright:

1. **Typical** — start from the Home screen (how a real user usually navigates).
2. **Shortest** — land as close as possible to the action (deep link / bookmark),
   then finish with the fewest counted interactions.

An `ActionCounter` wraps real `locator.click` / `locator.fill` calls.
`page.goto` (opening a URL) and `loginAs` are **not** counted — they model
sign-in or a bookmark, not a user click on screen.

The suite runs **serial**. Paths were executed against a live local app
(`lingolinq` seed user) and only kept when the end state actually matched.

The published how-to always starts from the **Home** screen, even when the
shortest path is shorter, so end users never need URLs.

---

## Confirmed click counts (2026-08)

| Task | Typical (from Home) | Shortest | End state |
|------|---------------------|----------|-----------|
| Speak a short message | **2** clicks | **2** clicks | **Yes** in sentence bar; spoken |
| Create a blank board | **3** clicks + **1** fill = **4** | **2** clicks + **1** fill = **3** | New blank board on board-detail |
| Toggle a preference (Start in Speak Mode) | **3** clicks | **2** clicks | Pref saved; leave Settings |
| Add one symbol to a board | — skipped — | — skipped — | Blocked on app bug (see below) |

**Notes**

- Speak typical and shortest both landed at 2 in this environment: Home
  **Continue Speaking** often opens a non-yesno board, so the typical path
  still needs **Yes** + **Speak sentence** once on the yesno board (same as
  the shortest path after landing).
- Create-board shortest skips the Home **Create a Board** card
  (`/create-board-new`).
- Toggle-preference shortest skips the navbar **Settings** link
  (`/{user}/preferences`).
- Preference how-tos beyond Start in Speak Mode (PIN, High Contrast,
  language, Auto-Capitalize, notification frequency) were verified against
  the Settings UI labels and section placement; they follow the same Home →
  **Settings** → section → control → **Save Preferences** pattern. Full
  typical/shortest Playwright pairs were not added for every preference yet.

---

## How-to coverage

Published in [`user-guide.md`](user-guide.md) (plain English, Home start,
exact on-screen labels):

1. Speak a short message  
2. Create a board  
3. Start in Speak Mode preference  
4. Require a PIN when exiting Speak Mode  
5. High Contrast mode  
6. App language / locale  
7. Auto-Capitalize  
8. Notification email frequency  

**Blocked (not published as a working how-to):** add a symbol/label to an
empty board cell.

---

## Blocked: empty-cell symbol save

Labeling a blank cell in board-detail edit, then **Done Editing** → **Save**,
still lands on “This board hasn't been set up yet…”. Same result for a human
doing those steps.

**Cause (verified)**

- Empty cells use placeholder ids like `fake_0_0`, not rows in `board.buttons`.
- `editManager.change_button` only patches existing `board.buttons` entries;
  it never inserts a new button for a placeholder id.
- `process_for_saving` only assigns a numeric id when `id < 0` or `!id`.
  The string `'fake_0_0'` is neither, so the label never persists.

Tests for add-symbol are `test.skip` in `click-efficiency.spec.ts` with a
comment pointing here — not deleted. Re-enable when the app bug is fixed.

---

## Next steps (optional)

- Fix empty-cell save (`change_button` / `process_for_saving` + board-detail
  rebuild), then re-enable add-symbol tests and publish that how-to.
- Optionally add Playwright typical/shortest pairs for the extra preference
  how-tos if we want measured counts for each.
- Turn [`user-guide.md`](user-guide.md) into an in-app or help-center page
  when product is ready.
