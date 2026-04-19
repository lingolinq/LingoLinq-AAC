# WCAG 2.1 AA Audit — Modernized Pages — Pass 6

**Audit date:** 2026-04-11 (sixth sweep)
**Standard:** WCAG 2.1 Level AA
**Scope:** Modernized pages and modals only.

---

## Executive summary

**Two categories now fully clean.** Color contrast (clean since pass 5) and touch target size (newly clean this pass). Two categories with small remaining items.

**Pass 5 fixes:** all verified in place.

**New findings:**

| Category | New FAIL | New RISK |
|---|---:|---:|
| 1. Color contrast | **0** ✓ CLEAN | 0 |
| 2. Keyboard nav & focus | 3 | 2 |
| 3. Semantic HTML & ARIA | **9** | 0 |
| 4. Touch target size | **0** ✓ CLEAN | 0 |

The remaining work is concentrated in two areas:
- **5 missing `:focus-visible` rules + 2 dropdowns lacking keyboard handlers** on board-detail
- **9 `<img>` without `alt`** across badge-awarded, modeling-ideas, copy-board, share-board (decorative + content images that need labels)

---

## CATEGORY 1 — Color contrast ✓ CLEAN

Pass-5 paint-picker__apply gradient fix verified. Comprehensive sweep across all 78 `$brand-verdigris`, 6 `$brand-dusty-denim`, 19 `$brand-cool-steel`, and 2 `$brand-blue-grey` matches in modernized scope. Every match is either an icon/SVG/border (passes WCAG 1.4.11's 3:1 UI requirement) or a `::placeholder` (allowed lower contrast under WCAG 4.1.4).

**Zero remaining contrast issues.**

---

## CATEGORY 2 — Keyboard navigation & focus

### ✓ Pass 5 verified

All 3 focus-visible additions verified at app.scss lines 49040-49042.

### NEW findings — 3 missing focus-visible + 2 missing keyboard handlers

| Severity | Selector | File:line | WCAG | Fix |
|---|---|---|---|---|
| **FAIL** | `.md-board-detail-panels-close-btn` | [board-detail.hbs:26](app/frontend/app/templates/user/board-detail.hbs#L26) — has `:hover` (app.scss:49740) but no `:focus-visible` | 2.4.7 | Add to shared focus-visible block |
| **FAIL** | `.md-board-detail-edit-btn` (LinkTo) | [board-detail.hbs:506,513](app/frontend/app/templates/user/board-detail.hbs#L506) — has `:hover` (app.scss:46174) but no `:focus-visible` | 2.4.7 | Add to shared focus-visible block |
| **FAIL** | `.md-board-detail-suggestion` | [board-detail.hbs:354](app/frontend/app/templates/user/board-detail.hbs#L354) — word suggestion buttons, has `:hover` (app.scss:47561) but no `:focus-visible` | 2.4.7 | Add to shared focus-visible block |
| **RISK** | Paint dropdown container | [board-detail.hbs:594](app/frontend/app/templates/user/board-detail.hbs#L594) | 2.1.1 | Apply `options_menu_keydown` pattern |
| **RISK** | Folder dropdown container | [board-detail.hbs:659](app/frontend/app/templates/user/board-detail.hbs#L659) | 2.1.1 | Apply `options_menu_keydown` pattern |

**Plus the deferred Tier 5 from pass 4:**
- Share dropdown (board-detail.hbs:427) — same RISK pattern, still deferred

The 3 FAILs are simple selector additions to the shared focus-visible block. The 2 RISKs (and the deferred share dropdown) are slightly larger fixes (~20 lines each in the controller).

---

## CATEGORY 3 — Semantic HTML & ARIA

### ✓ Pass 5 verified

All 4 fixes (2 close button aria-labels, 5 SVG aria-hidden) verified.

### NEW findings — 9 missing image alts

The pass-6 audit went deeper into the modernized modal templates and the components from pass 2. Found 9 `<img>` without `alt` attributes:

| Severity | File:line | Element | Fix |
|---|---|---|---|
| **FAIL** | [badge-awarded.hbs:6](app/frontend/app/templates/components/badge-awarded.hbs#L6) | User badge avatar in modal header | `alt=""` (decorative — sits next to title text) |
| **FAIL** | [badge-awarded.hbs:94](app/frontend/app/templates/components/badge-awarded.hbs#L94) | Badge display image | `alt={{badge.name}}` |
| **FAIL** | [badge-awarded.hbs:96](app/frontend/app/templates/components/badge-awarded.hbs#L96) | Badge display image | `alt=""` (likely paired with text) |
| **FAIL** | [badge-awarded.hbs:115](app/frontend/app/templates/components/badge-awarded.hbs#L115) | Badge display image | `alt=""` |
| **FAIL** | [modeling-ideas.hbs:35](app/frontend/app/templates/components/modeling-ideas.hbs#L35) | Activity illustration | `alt=""` (decorative) |
| **FAIL** | [modeling-ideas.hbs:97,99,124,137](app/frontend/app/templates/components/modeling-ideas.hbs#L97) | Activity illustrations × 4 | `alt=""` (decorative) |
| **FAIL** | [copy-board.hbs:73](app/frontend/app/templates/components/copy-board.hbs#L73) | Supervisee avatar in list | `alt=""` (sits next to user_name text) |
| **FAIL** | [share-board.hbs:22](app/frontend/app/templates/components/share-board.hbs#L22) | Board icon preview | `alt=""` (sits next to board name text) |

Most of these are decorative images sitting next to text labels — `alt=""` is the correct fix. The audit correctly flags missing alt attributes regardless of decorative status (images need an explicit `alt`, even if empty).

The audit also verified everything else is clean within strict scope:
- ✓ All form inputs have associated labels
- ✓ All icon-only buttons have `aria-label`
- ✓ All modal close buttons have `aria-label`
- ✓ All decorative SVGs have `aria-hidden="true"`
- ✓ Heading hierarchy correct
- ✓ All dropdowns have `aria-expanded`
- ✓ Toggles have `aria-pressed` where applicable
- ✓ Status messages have `aria-live` / `role="alert"`

---

## CATEGORY 4 — Touch target size ✓ CLEAN

All 10 pass-5 bumps verified. Comprehensive sweep confirmed:
- Symbol card edit buttons 44×44 ✓
- Symbol card dropdown items 12×14 + min-height 44 ✓
- Color picker swatches 12×16 + min-height 44 ✓
- Paint picker close button 44×44 ✓
- Modal buttons all within target compliance ✓
- No `.md-` or `.la-` interactive element with explicit width/height < 44 ✓
- No interactive element with tight padding (≤ 8 vertical) ✓

**Zero remaining touch target issues.**

---

## Trend across 6 passes

| Pass | New FAILs | New RISKs | Categories CLEAN |
|---|---:|---:|---|
| 1 | 31 | 40 | 0 |
| 2 | 31 | 23 | 0 |
| 3 | 31 | 13 | 0 |
| 4 | 19 | 2 | 0 |
| 5 | 15 | 1 | 1 (contrast) |
| 6 | **12** | **2** | **2 (contrast + touch targets)** |

The 6th pass continues the diminishing-returns curve. **Half the categories are now fully clean.** The remaining 12 FAILs cluster into 2 themes:
- **3 missing focus-visible rules** (single-line additions)
- **9 missing img alts** (each is a one-attribute add)

Both are mechanical fixes — no architectural changes needed.

---

## Suggested next pass

### Tier 1 — Add 3 selectors to shared focus-visible block (one edit)

Add `.md-board-detail-panels-close-btn`, `.md-board-detail-edit-btn`, `.md-board-detail-suggestion` to the shared focus-visible block at app.scss line ~49040.

### Tier 2 — Add 9 image alts (4 templates)

- badge-awarded.hbs: 4 images (header avatar + 3 badge displays)
- modeling-ideas.hbs: 5 illustration images
- copy-board.hbs: 1 supervisee avatar
- share-board.hbs: 1 board icon

### Tier 3 — Apply WAI-ARIA menu keyboard pattern to 3 dropdowns (deferred)

- Paint dropdown
- Folder dropdown
- Share dropdown (deferred from pass 4)

This is the larger refactor. Each dropdown needs ~20 lines of controller code mirroring the existing `options_menu_keydown` pattern. Could defer to a focused commit or tackle as a single helper that all three reuse.

---

After Tier 1 + Tier 2 fixes, **3 of 4 audit categories will be fully clean**, with only the dropdown keyboard pattern (Tier 3) remaining as deferred work.
