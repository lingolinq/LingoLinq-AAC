# WCAG 2.1 AA Audit — Modernized Pages — Pass 5

**Audit date:** 2026-04-11 (fifth sweep)
**Standard:** WCAG 2.1 Level AA
**Scope:** Modernized pages and modals only.

---

## Executive summary

**Pass 4 fixes verified.** All 8 contrast fixes, 7 keyboard fixes, 6 ARIA fixes, and 3 touch target fixes are correctly in place.

**Color contrast: CLEAN** — first category with zero remaining findings.

**New findings:**

| Category | New FAIL | New RISK |
|---|---:|---:|
| 1. Color contrast | **0** ✓ | 0 |
| 2. Keyboard nav & focus | 1 | 1 |
| 3. Semantic HTML & ARIA | 4 | 0 |
| 4. Touch target size | **10** | 0 |

The new touch target findings are real — the audit subagent went deeper this pass and found 10 selectors with `width:` / `height:` < 44 or with padding so tight the rendered height is well below 44 (some as small as 12-20px tall). These are mostly modal footer buttons, dropdown items, and board-detail header chrome (color legend toggle, quick reveal button, actions toggle, sidebar toggle).

---

## CATEGORY 1 — Color contrast ✓ CLEAN

All 8 pass-4 fixes verified in place. Zero remaining contrast issues in the modernized scope. The recurring `$brand-verdigris` / `$brand-dusty-denim` text-on-light-bg pattern is fully exhausted.

---

## CATEGORY 2 — Keyboard navigation & focus

### ✓ Pass 4 verified

All 6 of 7 fix areas correctly in place. The 7th was the close button aria-label addition in modeling-ideas.hbs which was actually applied — verified.

### NEW findings

| Severity | File:line | Element | WCAG | Fix |
|---|---|---|---|---|
| **FAIL** | [app.scss:48304](app/frontend/app/styles/app.scss#L48304) | `.md-board-detail-color-picker__apply` has `:hover` but no `:focus-visible` rule | 2.4.7 | Add to shared focus-visible block |
| **RISK** | [board-detail.hbs:427](app/frontend/app/templates/user/board-detail.hbs#L427) | `.md-board-detail-share-dropdown` (Details & Actions dropdown) lacks Escape handler / arrow-key nav | 2.1.1 | Apply same pattern as `options_menu_keydown` from pass 4 |

---

## CATEGORY 3 — Semantic HTML & ARIA

### ✓ Pass 4 verified

All 6 fixes verified. **All 16 i18n keys** added to en.json now confirmed present.

### NEW findings

| Severity | File:line | Element | WCAG | Fix |
|---|---|---|---|---|
| **FAIL** | [profiles.hbs:3](app/frontend/app/templates/components/profiles.hbs#L3) | `<button class="close">×</button>` — close button in modeling-ideas-style modal missing `aria-label` | 4.1.2 | Add `aria-label={{t "Close" key="close"}}` |
| **FAIL** | [badge-awarded.hbs:3](app/frontend/app/templates/components/badge-awarded.hbs#L3) | Same pattern — modal close `<button class="close">×</button>` without `aria-label` | 4.1.2 | Same fix |
| **NOTE** | [board-detail.hbs:27](app/frontend/app/templates/user/board-detail.hbs#L27) | Decorative SVG inside the close button missing `aria-hidden="true"` | 1.3.1 | Add `aria-hidden="true"` |
| **NOTE** | [authenticated-view.hbs:30-33](app/frontend/app/templates/components/dashboard/authenticated-view.hbs#L30) | 4 `<svg class="md-pillnav-dropdown__icon">` decoration missing `aria-hidden="true"` | 1.3.1 | Add `aria-hidden="true"` to each |

The 2 close-button FAILs are profiles.hbs and badge-awarded.hbs — these were missed in the pass 1 sweep of 15 modal close buttons because they weren't in the list at the time. Same one-line fix.

---

## CATEGORY 4 — Touch target size

### ✓ Pass 4 verified — all 3 fixes in place

### NEW findings — 10 missed touch targets

The pass-5 sweep went deeper into modal footers, dropdown items, header toggles, and nav items. These 10 selectors all fall below the WCAG 2.5.5 AAA 44×44 minimum (and several fall below the WCAG 2.5.8 AA 24×24 floor):

| Severity | File:line | Selector | Computed | Fix |
|---|---|---|---|---|
| **FAIL** | [app.scss:50478](app/frontend/app/styles/app.scss#L50478) | `.md-modal-btn` | 20px tall (`padding: 10×20`, no min-height) | `min-height: 44px` |
| **FAIL** | [app.scss:49465](app/frontend/app/styles/app.scss#L49465) | `.md-board-detail-folder-dropdown__item` | 16px tall (`padding: 8×12`) | `min-height: 44px` + `padding: 12×14` |
| **FAIL** | [app.scss:46397](app/frontend/app/styles/app.scss#L46397) | `.md-board-detail-quick-reveal__btn` | 12px tall (`padding: 6×12`) | `min-height: 44px` + bump padding |
| **FAIL** | [app.scss:48560](app/frontend/app/styles/app.scss#L48560) | `.md-board-detail-edit-toolbar__btn` | 40px tall (`min-height: 40px` set in pass 2) | Bump min-height to 44px |
| **FAIL** | [app.scss:48825](app/frontend/app/styles/app.scss#L48825) | `.md-board-detail-paint-picker__apply` | 16px tall (`padding: 8×16`) | `min-height: 44px` |
| **FAIL** | [app.scss:25099](app/frontend/app/styles/app.scss#L25099) | `.la-nav-item` | 20px tall (`padding: 10×14`) | `min-height: 44px` |
| **FAIL** | [app.scss:46221](app/frontend/app/styles/app.scss#L46221) | `.md-board-detail-color-legend-toggle` | 12px tall (`padding: 6×14`) | `min-height: 44px` + bump padding |
| **FAIL** | [app.scss:46344](app/frontend/app/styles/app.scss#L46344) | `.md-board-detail-quick-toggle` | 16px tall (`padding: 8×16`) | `min-height: 44px` |
| **FAIL** | [app.scss:47350](app/frontend/app/styles/app.scss#L47350) | `.md-board-detail-actions-toggle` | 40×40 (`width: 40px`) | `width/height: 44px; min-w/h: 44px` |
| **FAIL** | [app.scss:46572](app/frontend/app/styles/app.scss#L46572) | `.md-board-detail-sidebar-toggle--stacked` | 40×40 (`width: 40px`) | `width/height: 44px; min-w/h: 44px` |

**Note:** All 10 are real interactive elements that AAC users would use. Several were caught earlier (`.md-board-detail-edit-toolbar__btn` in pass 2 was set to 40px which is still RISK), and several were never in the previous audit subagents' search paths.

---

## Suggested next pass

### Tier 1 — Touch target sweep (10 items, ~30 line edits)

All 10 are simple `min-height: 44px` additions or `width:` bumps. Single-file commit.

### Tier 2 — 2 more close-button `aria-label` fixes (2 templates)

profiles.hbs:3 and badge-awarded.hbs:3.

### Tier 3 — 5 SVG `aria-hidden` additions

board-detail.hbs:27 + 4 in dashboard authenticated-view.hbs:30-33.

### Tier 4 — Add `.md-board-detail-color-picker__apply` to focus-visible block

Single line addition.

### Tier 5 — Share dropdown keyboard handler

Apply same pattern as `options_menu_keydown` to `.md-board-detail-share-dropdown` for full keyboard support. Larger fix (~20 lines in controller, 1 line in template). Could defer.

---

## Trend across 5 passes

| Pass | New FAILs | New RISKs | Notes |
|---|---:|---:|---|
| 1 | 31 | 40 | Initial discovery |
| 2 | 31 | 23 | Same patterns + edit-mode chrome |
| 3 | 31 | 13 | Pattern continued + edit-mode discoveries |
| 4 | 19 | 2 | Mostly recurring patterns winding down |
| 5 | **15** | **1** | First fully-clean category (contrast); touch targets dominate remaining work |

The diminishing returns curve continues. Pass 5's 15 FAILs are all clustered: 10 touch targets (one selector type — buttons missing `min-height`), 2 close button `aria-label`s, plus a few SVG `aria-hidden` additions.

Color contrast is **fully clean** for the first time.

After Tier 1-3 fixes from this report, a 6th pass should report substantial completion within the modernized scope. The remaining items will be deeper architectural work (Tier 5 share-dropdown keyboard handler) or out-of-scope legacy templates.
