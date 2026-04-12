# WCAG 2.1 AA Audit — Modernized Pages — Pass 7 Delta

**Date:** 2026-04-11
**Scope:** Strict — modernized `.md-*` / `.la-*` components and templates only. Legacy bootstrap pages excluded.
**Conformance target:** WCAG 2.1 Level AA
**Method:** 4 parallel verification subagents (color contrast, keyboard nav & focus, semantic HTML & ARIA, touch target size)

---

## TL;DR

**3 of 4 categories CLEAN. Zero new FAILs across all categories.**

| Category | Pass 6 status | Pass 7 status |
|---|---|---|
| 1.4.3 / 1.4.11 Color contrast | CLEAN | **CLEAN** |
| 2.1.1 / 2.4.7 Keyboard & focus | 3 deferred RISKs | **3 deferred RISKs** (unchanged) |
| 1.1.1 / 1.3.1 / 4.1.2 Semantic & ARIA | CLEAN | **CLEAN** |
| 2.5.5 Touch target size | CLEAN | **CLEAN** |

The modernized scope is now functionally at WCAG 2.1 AA conformance, pending the 3 deferred dropdown keyboard refactors (Tier 3).

---

## Category 1 — Color Contrast (1.4.3, 1.4.11)

**Status: CLEAN**

Verification confirms all `$brand-verdigris`, `$brand-dusty-denim`, `$brand-cool-steel`, and `$brand-blue-grey` references inside `.md-*` / `.la-*` rules are one of:

- Icons / borders / SVG strokes / placeholders / decorative elements (only need 3:1 per 1.4.11, which they meet)
- Already converted to the AA-compliant `-aa` token variants (`$brand-verdigris-aa #1A7B7A`, `$brand-dusty-denim-aa #2860C9`)

No remaining text-on-light-bg contrast violations within scope. All pass 1–6 fixes verified in place at [app.scss](app/frontend/app/styles/app.scss).

---

## Category 2 — Keyboard Navigation & Focus (2.1.1, 2.1.2, 2.4.3, 2.4.7)

**Status: CLEAN within strict scope, 3 deferred RISKs**

### Verified clean
- All pass-6 selectors present in shared `:focus-visible` block at [app.scss:49044-49046](app/frontend/app/styles/app.scss#L49044-L49046):
  - `.md-board-detail-panels-close-btn:focus-visible`
  - `.md-board-detail-edit-btn:focus-visible`
  - `.md-board-detail-suggestion:focus-visible`
- No `<div {{action}}>` interactive elements in modernized templates
- No `<a href="#">` hash-link anti-patterns in modernized templates
- No inline `outline: none` without a matching focus indicator
- All `:hover` rules in `.md-*` / `.la-*` scope have matching `:focus-visible` styling
- Modal focus restoration via `_previously_focused` working in [modal-dialog.js](app/frontend/app/components/modal-dialog.js)
- WAI-ARIA menu keyboard pattern implemented for `options_menu_keydown` (board-detail) and `extras_dropdown_keydown` (caseload)

### Deferred RISKs (Tier 3 — unchanged from pass 6)
Three dropdowns still rely on Bootstrap 3 dropdown behavior and lack the full WAI-ARIA menu keyboard pattern (ArrowUp/Down cycling, Home/End, Escape-restores-focus):

| Selector | Template | Line |
|---|---|---|
| `.md-board-detail-paint-picker` | board-detail.hbs | 615 |
| `.md-board-detail-folder-dropdown` | board-detail.hbs | 660 |
| `.md-board-detail-share-dropdown` | board-detail.hbs | 427 |

Each requires ~20 lines of controller code mirroring the existing `options_menu_keydown` pattern.

---

## Category 3 — Semantic HTML & ARIA (1.1.1, 1.3.1, 2.4.6, 4.1.2, 4.1.3)

**Status: CLEAN**

All 9 image-alt fixes from pass 6 verified:

| File | Line | Alt value |
|---|---|---|
| [share-board.hbs](app/frontend/app/templates/components/share-board.hbs#L22) | 22 | `alt=""` (decorative — adjacent to visible board name link) |
| [copy-board.hbs](app/frontend/app/templates/components/copy-board.hbs#L73) | 73 | `alt=""` (decorative — adjacent to visible username) |
| [modeling-ideas.hbs](app/frontend/app/templates/components/modeling-ideas.hbs#L35) | 35 | `alt=""` |
| [modeling-ideas.hbs](app/frontend/app/templates/components/modeling-ideas.hbs#L97) | 97 | `alt=""` |
| [modeling-ideas.hbs](app/frontend/app/templates/components/modeling-ideas.hbs#L99) | 99 | `alt=""` |
| [modeling-ideas.hbs](app/frontend/app/templates/components/modeling-ideas.hbs#L124) | 124 | `alt={{this.current_activity.title}}` (meaningful — topic-starter image) |
| [modeling-ideas.hbs](app/frontend/app/templates/components/modeling-ideas.hbs#L137) | 137 | `alt=""` |
| [badge-awarded.hbs](app/frontend/app/templates/components/badge-awarded.hbs#L94) | 94/96/115 | `alt=""` (decorative badge displays — name shown adjacent) |
| [badge-awarded.hbs](app/frontend/app/templates/components/badge-awarded.hbs#L6) | 6 | `alt=""` (header avatar — title text adjacent) |

Verification across full strict scope confirms:
- All form inputs have associated `<label>` (visible or sr-only)
- All icon-only buttons have `aria-label` (i18n keys)
- All decorative SVGs marked `aria-hidden="true"`
- Heading hierarchy is correct (no level skips) within modernized cards
- All dropdown triggers have `aria-expanded` + `aria-haspopup`
- All toggle buttons have `aria-pressed`
- All live regions have `aria-live` + appropriate `aria-atomic`
- All backdrops marked `aria-hidden="true"`

---

## Category 4 — Touch Target Size (2.5.5, 2.5.8)

**Status: CLEAN**

All pass-5 touch target bumps verified:
- `.la-modal-close` base rule at 48×48 (with min-width/height)
- 9 modal-specific close button overrides at 48×48
- `.md-board-detail-edit-toolbar__btn` at 44×44 (corrected from pass-2's 40px in pass 5)
- All `.md-modal-btn`, `.md-card__action`, `.md-pillnav-*` interactive surfaces ≥44px

No new touch target violations found within strict scope.

---

## Net change vs. Pass 6

| Metric | Pass 6 | Pass 7 |
|---|---|---|
| New FAILs found | 9 (image alts) | **0** |
| FAILs fixed | 9 | 0 (none to fix) |
| Deferred RISKs | 3 | 3 (unchanged) |
| Categories CLEAN | 3 of 4 | **3 of 4** |

Pass 7 confirms a stable, clean state. The modernized scope has reached the point where iterative audit passes are returning no new findings.

---

## Remaining work

**Tier 3 — Deferred dropdown keyboard refactor** (only outstanding item within strict scope):

Add WAI-ARIA menu keyboard pattern to the 3 Bootstrap dropdowns listed under Category 2. Pattern to mirror: `options_menu_keydown` in [user/board-detail.js](app/frontend/app/controllers/user/board-detail.js).

Each dropdown needs:
1. Controller action `<name>_keydown` (~20 lines): ArrowDown/Up cycling with wrap, Home/End jumps, Escape closes + restores focus to trigger
2. Template: `{{action "<name>_keydown" on="keyDown"}}` on the wrapping `.btn-group`
3. Template: `role="menu"` on the `.dropdown-menu` and `role="menuitem"` on each `<li>` child

Estimated total: ~60 lines of controller code + 9 template attribute additions across 3 dropdowns.
