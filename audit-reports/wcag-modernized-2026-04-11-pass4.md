# WCAG 2.1 AA Audit — Modernized Pages — Pass 4

**Audit date:** 2026-04-11 (fourth sweep)
**Standard:** WCAG 2.1 Level AA
**Scope:** Modernized pages and modals only.

---

## Executive summary

**Pass 3 fixes verified.** Most pass-3 items confirmed correctly in place. Two minor issues with the inline-sidebar fix (img alts and i18n keys, see below).

**New findings (delta from pass 3):**

| Category | New FAIL | New RISK | New NOTE |
|---|---:|---:|---:|
| 1. Color contrast | **7** | 0 | 0 |
| 2. Keyboard nav & focus | **4** | 2 | 1 |
| 3. Semantic HTML & ARIA | **6** | ~10 i18n keys | 0 |
| 4. Touch target size | **2** | 0 | 0 |

**Total new actionable items: ~19** — small enough to address in one focused commit.

---

## CATEGORY 1 — Color contrast

### ✓ Pass 3 verified

All 24+ pass-3 swaps confirmed in place.

### NEW findings — same patterns persisting

The `$brand-verdigris` and `$brand-dusty-denim` token uses keep recurring on light backgrounds in selectors I haven't reached yet. These are all the same one-line `-aa` swap.

| Severity | File:line | Selector | Pair | Ratio | Fix |
|---|---|---|---|---|---|
| **FAIL** | [app.scss:9657](app/frontend/app/styles/app.scss#L9657) | `.la-board-details-edit-btn` | `$brand-verdigris` on `rgba(verdigris, 0.06)` | 3.32:1 | `$brand-verdigris-aa` |
| **FAIL** | [app.scss:9862](app/frontend/app/styles/app.scss#L9862) | `.la-board-actions-item__arrow` | `$brand-cool-steel` on white | 2.84:1 | `$brand-slate-gray` |
| **FAIL** | [app.scss:9866](app/frontend/app/styles/app.scss#L9866) | `.la-board-actions-item:hover .la-board-actions-item__arrow` | `$brand-verdigris` on `rgba(verdigris, 0.05)` | 3.32:1 | `$brand-verdigris-aa` |
| **FAIL** | [app.scss:11288](app/frontend/app/styles/app.scss#L11288) | `.la-batch-recording-icon--ok` | `$brand-verdigris` on `rgba(verdigris, 0.12)` | 3.32:1 | `$brand-verdigris-aa` |
| **FAIL** | [app.scss:51530](app/frontend/app/styles/app.scss#L51530) | `.md-org-home-board__icon` | `$brand-dusty-denim` on `rgba(white, 0.95)` | 3.49:1 | `$brand-dusty-denim-aa` |
| **FAIL** | [app.scss:51569](app/frontend/app/styles/app.scss#L51569) | `.md-org-home-board__arrow:hover` | `$brand-dusty-denim` on `rgba(dusty-denim, 0.08)` | 3.49:1 | `$brand-dusty-denim-aa` |
| **FAIL** | [app.scss:51673](app/frontend/app/styles/app.scss#L51673) | `.md-org-user-row__org-icon` | `$brand-dusty-denim` on `rgba(dusty-denim, 0.10)` | 3.49:1 | `$brand-dusty-denim-aa` |

These are the last instances I keep finding because the audit subagents work selector-by-selector and the `.la-board-*` and `.md-org-*` blocks have many similar uses. The one-line fix is the same as before.

---

## CATEGORY 2 — Keyboard navigation & focus

### ✓ Pass 3 verified (mostly)

11 of 12 fixes verified clean. Three of the dropdown-item bumps from pass 3 lacked corresponding `:focus-visible` rules — they should have been added to the shared focus block at the same time.

### NEW findings

| Severity | File:line | Element | WCAG | Fix |
|---|---|---|---|---|
| **FAIL** | [app.scss:48631](app/frontend/app/styles/app.scss#L48631) | `.md-board-detail-edit-toolbar__stepper-btn` — has hover, no `:focus-visible` | 2.4.7 | Add to shared focus-visible block |
| **FAIL** | [app.scss:48702](app/frontend/app/styles/app.scss#L48702) | `.md-board-detail-edit-toolbar__paint-dropdown-item` — same | 2.4.7 | Add to shared focus-visible block |
| **FAIL** | [app.scss:46114](app/frontend/app/styles/app.scss#L46114) | `.md-board-detail-share-dropdown__item` — same | 2.4.7 | Add to shared focus-visible block |
| **FAIL** | [app.scss:47192](app/frontend/app/styles/app.scss#L47192) | `.md-board-detail-add-dropdown__item` — same | 2.4.7 | Add to shared focus-visible block |
| **MINOR** | [app.scss:47192](app/frontend/app/styles/app.scss#L47192) | `.md-board-detail-add-dropdown__item` missing `width: 100%` (sister class has it) | n/a | Add `width: 100%` for hit-target consistency |
| **RISK** | board-detail.hbs:197 | Options menu has no Escape key handler — close requires click outside or item selection | 2.1.1 | Add keyDown handler in controller |
| **NOTE** | caseload.hbs:83 | Bootstrap 3 dropdown — Tab/Enter open, no arrow keys, no Escape | 2.1.1 | Bootstrap-native limitation; not a strict AA fail |

---

## CATEGORY 3 — Semantic HTML & ARIA

### Pass 3 verified — but with ONE oversight

The pass-3 `<a href="#">` → `<button>` conversion in board-detail.hbs (inline sidebar at lines 1284, 1289) preserved the existing `alt=""` on the contained `<img>` elements. Those alts should NOT be empty inside an interactive button — they should describe the board.

### NEW findings — strict scope only

| Severity | File:line | Element | WCAG | Fix |
|---|---|---|---|---|
| **FAIL** | [board-detail.hbs:1285,1290](app/frontend/app/templates/user/board-detail.hbs#L1285) | `<img alt="">` inside the now-converted inline-sidebar `<button>` | 1.1.1 | `alt={{board.name}}` |
| **FAIL** | [badge-awarded.hbs:51](app/frontend/app/templates/components/badge-awarded.hbs#L51) | Badge thumbnail `<img alt="">` inside button | 1.1.1 | `alt={{goal.summary}}` |
| **FAIL** | [modeling-ideas.hbs:5](app/frontend/app/templates/components/modeling-ideas.hbs#L5) | Icon-only `<a href="#">` (info link) — both wrong type and no aria-label | 2.1.1, 4.1.2 | Convert to `<button>` + `aria-label` |
| **FAIL** | [modeling-ideas.hbs:114](app/frontend/app/templates/components/modeling-ideas.hbs#L114) | Icon-only `<a href="#">` (preview link) | 2.1.1, 4.1.2 | Same fix |
| **FAIL** | [badge-awarded.hbs:29](app/frontend/app/templates/components/badge-awarded.hbs#L29) | `<a href="#">` wrapping image with no aria-label | 2.1.1, 4.1.2, 1.1.1 | Convert to `<button>` + `aria-label` + image alt |
| **RISK** | [profiles.hbs:105](app/frontend/app/templates/components/profiles.hbs#L105) | Find-profile input has placeholder only, no `<label>` | 1.3.1, 3.3.2 | Add sr-only label |

### i18n key check — 10 keys missing from `public/locales/en.json`

These keys were added in passes 1-3 but no entry exists in the locale file yet. They will fall back to the English literal string at runtime, which is functional but not localized:

- `avatar_for_name`
- `more_options_for_name`
- `expand_named`
- `remove_word_named`
- `no_profile_data`
- `expand_sidebar`
- `preview_board`
- `search_for_buttons`
- `search_results`
- `user_name_to_add`

These are NOT WCAG failures — the English fallback meets all accessibility criteria. They are localization debt: international users will see English. Should be added when convenient.

---

## CATEGORY 4 — Touch target size

### ✓ All 12 pass-3 fixes verified in place

### NEW findings — 2 missed buttons

Both are page-level buttons that weren't in earlier audit sweeps:

| Severity | File:line | Selector | Computed | Fix |
|---|---|---|---|---|
| **FAIL** | [app.scss:47626](app/frontend/app/styles/app.scss#L47626) | `.md-board-detail-loading__cancel` | 16px tall (`padding: 8px 24px`, no min-height) | `min-height: 44px` |
| **FAIL** | [app.scss:48296](app/frontend/app/styles/app.scss#L48296) | `.md-board-detail-color-picker__apply` | 16px tall (`padding: 8px 14px`, no min-height) | `min-height: 44px` |

`.md-board-detail-loading__cancel` is the cancel button on the board-detail loading/error overlay. `.md-board-detail-color-picker__apply` is the apply button in the color picker modal. Both are below WCAG 2.5.8 AA's 24px floor.

---

## Suggested next pass

### Tier 1 — Same-pattern contrast sweep (one batch)

7 contrast FAILs, all the same `-aa` token swap pattern. ~10 line changes in app.scss.

### Tier 2 — Add 4 selectors to shared `:focus-visible` block (one edit)

Add `.md-board-detail-edit-toolbar__stepper-btn`, `.md-board-detail-edit-toolbar__paint-dropdown-item`, `.md-board-detail-share-dropdown__item`, `.md-board-detail-add-dropdown__item` to the shared block at app.scss line ~48911. Single edit.

### Tier 3 — Two touch target FAILs

Add `min-height: 44px` to `.md-board-detail-loading__cancel` and `.md-board-detail-color-picker__apply`. Two SCSS edits.

### Tier 4 — Five ARIA FAILs

- Fix `<img alt="">` in inline sidebar (board-detail.hbs:1285,1290) and badge-awarded.hbs:51
- Convert 3 hash links in modeling-ideas and badge-awarded to buttons
- Add sr-only label to profiles.hbs:105 input

### Tier 5 — Polish

- Add Escape handler for board-detail options menu
- Add `width: 100%` to `.md-board-detail-add-dropdown__item`
- Add 10 missing i18n keys to `public/locales/en.json` (non-blocking, can defer)

---

## Where this audit stands after 4 passes

After 4 passes of audit + fix, the modernized pages are very close to clean WCAG 2.1 AA compliance within the agreed scope. The remaining ~19 actionable items (split into 5 tiers above) are all small targeted fixes — none requires architectural changes.

**The trend across passes:**

| Pass | New FAILs | New RISKs | Notes |
|---|---:|---:|---|
| 1 | 31 | 40 | Initial discovery — biggest pattern findings |
| 2 (follow-up) | 31 | 23 | More instances of same patterns + edit-mode chrome |
| 3 | 31 (~14 in adjacent .md-org) | 13 | Pattern continued + edit-mode discoveries |
| 4 | **19** | **2** | Mostly same patterns winding down + 5 ARIA cleanups |

The diminishing returns curve shows the audit is reaching the bottom of the well. Most genuinely-new findings at this point are minor edge cases. After Tier 1-4 fixes from this report, a 5th pass should report a substantially clean bill of health within the strict modernized scope.
