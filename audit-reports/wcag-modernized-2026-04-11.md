# WCAG 2.1 AA Audit — Modernized Pages

**Audit date:** 2026-04-11
**Standard:** WCAG 2.1 Level AA
**Scope:** Modernized pages and modals only — `landing-alt`, `board-detail`, `dashboard authenticated-view`, `board-layout`, `caseload`, `find-button` modal, plus 39 modal templates that share the modernized class signatures (`la-modal-header` / `md-modal-btn`)
**Methodology:** Four parallel read-only audits (color contrast, keyboard/focus, semantic HTML/ARIA, touch target size) against the templates in `app/frontend/app/templates/` and the SCSS rules in `app/frontend/app/styles/app.scss` (only selectors prefixed `.la-` or `.md-`). All contrast ratios computed using the WCAG relative-luminance formula. No code modified.

---

## Executive summary

| Category | FAIL | RISK | NOTE |
|---|---:|---:|---:|
| 1. Color contrast | **6** | 0 | 4 |
| 2. Keyboard nav & focus | **8** | 4 | 2 |
| 3. Semantic HTML & ARIA | **16** | 18 | 4 |
| 4. Touch target size | **1** | 18 | 3 |
| **Total actionable** | **31** | **40** | **13** |

**Top recurring problems** (each appears across many files — fix the pattern, not the instance):

1. **Modal close buttons (12+ modals)** — `34×34px` size + missing `:focus-visible` + half are missing `aria-label`. Fix the base `.la-modal-close` rule and the 12 specific overrides at once.
2. **`<div class="md-card__title">` styled as headings** (dashboard, caseload, several modals) — divs styled like h2/h3 with no semantic heading element. Screen readers see no document outline.
3. **Icon-only header buttons on board-detail** — use `title=` instead of `aria-label=`. `title` is not reliably announced.
4. **Hash links `<a href="#">`** as click handlers in caseload, dashboard, new-board — broken keyboard semantics, page-jump risk.
5. **Status messages** ("Loading…", error states, copy-success toasts) — missing `aria-live` regions across find-button, eval-status, share-board.

---

## CATEGORY 1 — Color contrast (WCAG 1.4.3, 1.4.11)

6 failures, 4 notes. All failures are light accent colors (verdigris, dusty-denim) on light backgrounds, plus white text on light gradients. The Fitzgerald part-of-speech color system on board-detail symbol cards passes cleanly across all 13 categories (5.7:1 to 21:1 ratios).

### landing-alt

| Severity | File:line | Selector | Text → Bg | Ratio | Required | Fix |
|---|---|---|---|---|---|---|
| **FAIL** | [app.scss:243](app/frontend/app/styles/app.scss#L243) | `.la-pricing-bulk-link`, `.la-pricing-bulk-explainer a` | `#2A9D8F` (verdigris) → `#FFF` | 3.32:1 | 4.5:1 | Use `#1A7B7A` (4.73:1) or `#136B68` (5.48:1) |

### board-detail

#### Board details modal — three failures from light accent text on the modal header

| Severity | File:line | Selector | Text → Bg | Ratio | Required | Fix |
|---|---|---|---|---|---|---|
| **FAIL** | [app.scss:9507](app/frontend/app/styles/app.scss#L9507) | `.la-board-details-section__heading` | `#2A9D8F` → `#F8F9FA` | 3.15:1 | 4.5:1 | Use `#1A7B7A` or `$brand-charcoal-dark` (#374151, 10.31:1) |
| **FAIL** | [app.scss:9541](app/frontend/app/styles/app.scss#L9541) | `.la-board-details-wrap .dl-horizontal a` | `#2A9D8F` → `#F8F9FA` | 3.15:1 | 4.5:1 | Use `#1A7B7A` or `$brand-charcoal-blue` (#46505F, 7.52:1) |
| **FAIL** | [app.scss:9572](app/frontend/app/styles/app.scss#L9572) | `.la-board-details-rename-link` | `#4C86D8` (dusty-denim) → `#F8F9FA` | 3.49:1 | 4.5:1 | Use `#2860C9` (4.65:1) or `#1F4BA3` (5.73:1) |

### dashboard authenticated-view — Download cards

| Severity | File:line | Selector | Text → Bg | Ratio | Required | Fix |
|---|---|---|---|---|---|---|
| **FAIL** | [app.scss:3974](app/frontend/app/styles/app.scss#L3974) | `.md-download-card__btn` | `#FFF` → gradient `#7693B9 → #46505F` (lightest stop fails) | 3.16:1 | 4.5:1 | Switch text to `#1B365D` (5.31:1+), or darken gradient stops by 15% |
| **FAIL** | [app.scss:3994](app/frontend/app/styles/app.scss#L3994) | `.md-download-card__btn--secondary` | `#FFF` → gradient `#a0aec0 → #718096` | **2.26:1** | 4.5:1 | **Worst in audit.** Switch to dark text (`#1B365D` = 6.53:1) or convert to outline-style button |

### Notes (translucent backgrounds — verify in browser)

- [app.scss:9467](app/frontend/app/styles/app.scss#L9467) — board-details modal close button: `#6B7280` text on `rgba(255,255,255,0.7)` over a colored gradient. Recompute against actual rendered parent.
- [app.scss:9693](app/frontend/app/styles/app.scss#L9693) — board-actions modal close button: same pattern.
- [app.scss:9725](app/frontend/app/styles/app.scss#L9725) — board-actions notice: `#374151` on `rgba($brand-dusty-denim, 0.06)` ≈ #DCE5F5 → ~7.1:1, likely passes.
- [app.scss:4073](app/frontend/app/styles/app.scss#L4073) — home boards picker category button: `rgba(75,78,92,0.9)` text on `rgba(255,255,255,0.7)` background. Complex compositing — visually verify.

**Pages with no contrast violations found:** board-layout, caseload, find-button modal.

### Recommended brand color additions to `_variables.scss`

```scss
// AA-compliant darker variants of accent colors
$brand-verdigris-aa:    #1A7B7A;  // 4.73:1 on white
$brand-dusty-denim-aa:  #2860C9;  // 4.65:1 on white
```

---

## CATEGORY 2 — Keyboard navigation & focus (WCAG 2.1.1, 2.4.3, 2.4.7)

8 fails, 4 risks. Most failures are click-only `<div {{action}}>` patterns and missing `:focus-visible` rules on modernized button classes.

### landing-alt

✓ **PASS** — has skip link at line 6 (`<a href="#la-main" class="la-skip-link">`). All CTAs use `LinkTo` or proper `<button>` elements.

⚠ **RISK** — `.la-btn` (the landing-alt button class) has **no `:focus-visible` rule** found in app.scss. Browser default outline applies. WCAG 2.4.7 conformance is technically met by the browser default, but inconsistent with the rest of the modernized work.

**Fix:**
```scss
.la-btn:focus-visible {
  outline: 2px solid $brand-verdigris;
  outline-offset: 4px;
  box-shadow: 0 0 0 4px rgba($brand-verdigris, 0.15);
}
```

### board-detail

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** | [board-detail.hbs:22](app/frontend/app/templates/user/board-detail.hbs#L22) | `<div class="md-board-detail-overlay-backdrop" {{action "toggle_panels"}}>` | 2.1.1 | Click-only handler on a div. No keyboard support. | Add `role="button" tabindex="0"` AND a keydown handler that fires on Enter/Space, or convert to a `<button>` with absolute positioning |
| **FAIL** | [board-detail.hbs:184](app/frontend/app/templates/user/board-detail.hbs#L184) | `<div class="md-board-detail-actions-backdrop" {{action "toggle_options_menu"}}>` | 2.1.1 | Same — click-only. | Same fix |
| **RISK** | [board-detail.hbs:405-475](app/frontend/app/templates/user/board-detail.hbs#L405-L475) | Details & Actions dropdown | 2.1.1 | Items are `<button>` (good), but no arrow-key navigation between items, no `aria-expanded` sync on the trigger | Implement keydown handler: ArrowDown/Up move between items, Home/End jump to first/last, Escape closes |
| **NOTE** | [board-detail.hbs:7](app/frontend/app/templates/user/board-detail.hbs#L7) | `<button onclick="window.location.reload()">` | 2.4.7 | Inline `onclick` is functional but inconsistent — no Ember action wiring | Replace with `{{action "reloadPage"}}` for consistency |

✓ Symbol grid cards and sidebar items both have `:focus-visible` rules at [app.scss:48707](app/frontend/app/styles/app.scss#L48707).

### dashboard authenticated-view

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** | dashboard/authenticated-view.hbs:178 | `<div class="ll-company-sidebar__backdrop" {{action ...}} role="button" tabindex="0">` | 2.1.1 | Has tabindex but no keydown handler. Tab focuses, but Enter/Space do nothing. | Add `{{on "keydown" (fn this.handleBackdropKey)}}` |
| **RISK** | dashboard/authenticated-view.hbs:18-35 | `.md-pillnav-dropdown` | 2.1.1 | Options have `role="option"` (good) but no arrow-key navigation | Implement listbox keyboard pattern |

✓ Pill nav, hero, and bento card buttons all use proper `<button>` / `LinkTo` semantics. Skip-link present.

### board-layout

✓ **PASS** — close button has `aria-label` and is a real `<button>`.

### caseload

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** | [caseload.hbs:40](app/frontend/app/templates/caseload.hbs#L40) | `<a href="#" {{action "set_goal"}}>set a goal</a>` | 2.1.1, 3.2.5 | Hash link causes page jump. Should be a button. | Convert to `<button type="button">` |
| **FAIL** | [caseload.hbs:88-95](app/frontend/app/templates/caseload.hbs#L88-L95) | Dropdown menu items use `<a href="#" {{action ...}}>` | 2.1.1 | Mix of `LinkTo` (correct) and hash links (broken). No arrow-key nav. | Convert hash links to `<button>` and implement listbox pattern |
| **FAIL** | All `.md-caseload__action*` | Action buttons | 2.4.7 | No `:focus-visible` rule found in app.scss | Add focus-visible block |

### find-button modal

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** | [find-button.hbs:13](app/frontend/app/templates/components/find-button.hbs#L13) | `<div {{action "pick_result" result}} class="la-find-button-result">` | 2.1.1 | Result rows are divs. Not focusable, not in tab order, no Enter/Space handler. **Find-a-button is unusable by keyboard.** | Convert to `<button type="button" class="la-find-button-result">` |
| **FAIL** | [find-button.hbs:13 + app.scss:10605](app/frontend/app/templates/components/find-button.hbs#L13) | `.la-find-button-result` | 2.4.7 | No `:focus-visible` rule | Add focus block |
| **FAIL** | [find-button.hbs:5 + app.scss:10524](app/frontend/app/templates/components/find-button.hbs#L5) | `.la-find-button-wrap .la-modal-close` | 2.4.7 | No `:focus-visible` rule | Add focus block |
| **FAIL** | [find-button.hbs:93 + app.scss:10623](app/frontend/app/templates/components/find-button.hbs#L93) | `.la-find-button-cancel` | 2.4.7 | No `:focus-visible` rule | Add focus block |

✓ Modal-dialog component implements full Tab trapping with Shift+Tab/Tab wrap and Escape (verified at [modal-dialog.js:57-88](app/frontend/app/components/modal-dialog.js#L57-L88)).

⚠ **RISK** — modal-dialog doesn't restore focus to the trigger element on close. Best practice for WCAG 2.1.2. Recommend storing the previously-focused element on open and refocusing it on close.

### General — missing `:focus-visible` rules

The following modernized classes are interactive but have no `:focus-visible` rule in app.scss. Add a consistent block to each:

| Class | Used by | Page |
|---|---|---|
| `.md-pillnav__pill` | Primary nav | dashboard, caseload |
| `.md-caseload__action`, `.md-caseload__action--extras` | Action buttons | caseload |
| `.la-find-button-result` | Search results | find-button |
| `.la-modal-close` (default) | Generic modal close | All modernized modals |
| `.la-find-button-cancel` | Cancel button | find-button |
| `.la-btn`, `.la-btn--primary`, `.la-btn--ghost` | Landing CTAs | landing-alt |
| Dropdown menu items (`.dropdown-menu > li > a`, `<button>` items) | Various dropdowns | caseload, board-detail, dashboard |

**Recommended shared rule** to add to app.scss:

```scss
.la-btn:focus-visible,
.md-pillnav__pill:focus-visible,
.md-caseload__action:focus-visible,
.md-caseload__action--extras:focus-visible,
.la-find-button-result:focus-visible,
.la-find-button-wrap .la-modal-close:focus-visible,
.la-find-button-cancel:focus-visible,
.la-modal-close:focus-visible {
  outline: 2px solid $brand-verdigris;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba($brand-verdigris, 0.15);
}
```

### Inline `outline: none` violations

| Severity | File:line | Issue | Fix |
|---|---|---|---|
| **FAIL** | button-settings.hbs:1085 | `<button id="recording_status" style='outline: none;'>` removes focus indicator with no replacement | Remove inline style; add `:focus-visible` rule |

---

## CATEGORY 3 — Semantic HTML & ARIA (WCAG 1.1.1, 1.3.1, 4.1.2, 4.1.3)

16 fails, 18 risks. The two biggest themes: (1) `<div>`s styled as headings across the dashboard cards and caseload, and (2) icon-only buttons without `aria-label`.

### landing-alt

✓ **MOSTLY PASS** — well-structured. Skip link present, all CTAs are real anchors/links, decorative emoji are properly `aria-hidden="true"`, footer external links have descriptive `aria-label`s ending in "(opens in new tab)".

### board-detail

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **RISK** | [board-detail.hbs:73-83](app/frontend/app/templates/user/board-detail.hbs#L73) | Toggle board collapsed button | 4.1.2 | Uses `title=` only. Title is not reliably announced by AT. | Add `aria-label={{...same value as title...}}` |
| **RISK** | [board-detail.hbs:85-101](app/frontend/app/templates/user/board-detail.hbs#L85) | Three icon-only sentence-nav buttons (Home Board, My Boards) | 4.1.2 | Same — `title=` only | Add `aria-label` to each |
| **RISK** | [board-detail.hbs:365](app/frontend/app/templates/user/board-detail.hbs#L365) | Back button | 4.1.2 | `title=` only | Add `aria-label` |
| **RISK** | [board-detail.hbs:337](app/frontend/app/templates/user/board-detail.hbs#L337) | `.md-board-detail-suggestions` region | 4.1.3 | `role="region"` present but no `aria-live` — when word suggestions update, screen readers don't announce | Add `aria-live="polite"` |
| **NOTE** | [board-detail.hbs:484](app/frontend/app/templates/user/board-detail.hbs#L484) | Color key toggle uses `title` + visible text + emoji icon | 4.1.2 | Inconsistent — both `title` AND visible label set | Pick one pattern; remove duplicate |

✓ Sentence bar (line 104-105) correctly uses `role="region"` + `aria-live="polite"`. Sidebar uses `<aside aria-label="Board navigation">`. Symbol cards have visible labels. Board title is `<h1>`.

### dashboard authenticated-view

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** ×6 | dashboard/authenticated-view.hbs:55-299 | `<div class="md-card__title">` repeated across Getting Started, Caseload, Organizations, Speak Mode, Extras, Boards, Supervisees cards | 1.3.1 | Divs styled as headings instead of `<h2>`/`<h3>`. Document outline is broken — screen readers report no headings inside cards. | Convert each `md-card__title` div to `<h3>` (or `<h2>` if it's the top of a `<section>`) |
| **RISK** | dashboard/authenticated-view.hbs:244-253 | `<a href="#" {{action ...}}>` for "Speak Mode (modeling)" etc. | 4.1.2, 2.1.1 | Hash links | Convert to `<button>` |
| **RISK** | dashboard/authenticated-view.hbs:284-297 | Rooms list — `<span>` items without `<ul>` wrapper | 1.3.1 | Spans don't form a list. Screen readers don't announce as a list. | Wrap in `<ul role="list">`, change spans to `<li>` |

✓ Primary navigation has `aria-label="Primary Navigation"`. Mobile dropdown nav has proper `role="listbox"` + `role="option"` + `aria-expanded`. Hero section has `<h1>`. Progress bar has correct `role="progressbar"` + `aria-valuenow/min/max` + `<span class="sr-only">`.

### board-layout

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **NOTE** | [board-layout.hbs:2](app/frontend/app/templates/board-layout.hbs#L2) | Layout wrapper is `<div>` not `<main>` | 1.3.1 | Has an inner `<article>` so the impact is minor | Convert outer wrapper to `<main>` for clearer landmarks |

✓ Close button has proper `aria-label`. Modal heading is semantic.

### caseload

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** | [caseload.hbs:15-16](app/frontend/app/templates/caseload.hbs#L15) | `<div class="md-card__title">My Caseload</div>` | 1.3.1 | Page title is a div, not `<h1>` | Convert to `<h1>`; subtitle to `<p>` |
| **FAIL** | [caseload.hbs:27](app/frontend/app/templates/caseload.hbs#L27) | `<img src={{supervisee.avatar_url}} alt="">` | 1.1.1 | Empty alt on user avatar in a meaningful link context | Set `alt="Avatar for {{supervisee.user_name}}"` |
| **FAIL** | [caseload.hbs:83](app/frontend/app/templates/caseload.hbs#L83) | `<button class="md-caseload__action--extras"><svg.../></button>` | 4.1.2 | Icon-only button. `data-toggle="dropdown"` is not an accessible name. | Add `aria-label="More options for {{supervisee.user_name}}"` |
| **RISK** | caseload.hbs (each card) | Supervisee cards have no heading element | 1.3.1 | Cards are wrappers with no `<h2>`/`<h3>` for the user's name | Wrap each user_name `LinkTo` in or replace with an `<h3>` |
| **NOTE** | [caseload.hbs:29](app/frontend/app/templates/caseload.hbs#L29) | Online status `<span>` with `title=` only | 1.3.1 | If meaningful, needs `aria-label`. If decorative, needs `aria-hidden="true"` | Pick one |

### find-button modal

| Severity | File:line | Element | WCAG | Issue | Fix |
|---|---|---|---|---|---|
| **FAIL** | [find-button.hbs:8](app/frontend/app/templates/components/find-button.hbs#L8) | `{{focus-input ... placeholder="Word or phrase you're looking for"}}` | 3.3.2 | Placeholder used as label substitute | Add `<label class="sr-only" for="button_search_string">Search for buttons</label>` or `aria-label` |
| **FAIL** | [find-button.hbs:13](app/frontend/app/templates/components/find-button.hbs#L13) | Result divs | 4.1.2 | Not buttons (also a keyboard fail above) | Convert to `<button>` |
| **FAIL** | [find-button.hbs:17,45](app/frontend/app/templates/components/find-button.hbs#L17) | `<img src={{step.button.image}}>` | 1.1.1 | No `alt` attribute on result thumbnails | Add `alt="{{step.button.label}}"` (or `alt=""` if the visible label below is enough) |
| **RISK** | [find-button.hbs:10](app/frontend/app/templates/components/find-button.hbs#L10) | Results container | 4.1.3 | No `aria-live` — new search results don't announce | Add `aria-live="polite"` to `.la-find-button-results` |
| **RISK** | [find-button.hbs:69-87](app/frontend/app/templates/components/find-button.hbs#L69) | "Loading…" and error states | 4.1.3 | Empty state container has no `aria-live` | Add `aria-live="polite"` to `.la-find-button-empty` |
| **RISK** | [find-button.hbs:22-41](app/frontend/app/templates/components/find-button.hbs#L22) | Breadcrumb path | 1.3.1 | A row of `<span>`s with `→` separators isn't a semantic list | Convert to `<ol class="la-find-button-result__path-list" aria-label="Path to button">` with `<li>` items |

✓ Modal close button has `aria-label`. Cancel button has visible text. Modal-dialog component provides `role="dialog"` + `aria-modal="true"` per the shared component.

### Modal close button pattern (12+ modals)

The legacy `class="close"` pattern (Bootstrap) is used in **dozens of modals** with NO `aria-label` and only an SVG icon. Each is a 4.1.2 FAIL.

**Examples:**
- [add-app.hbs:3](app/frontend/app/templates/components/add-app.hbs#L3)
- [share-board.hbs:3](app/frontend/app/templates/components/share-board.hbs#L3)
- [premium-voices.hbs:3](app/frontend/app/templates/components/premium-voices.hbs#L3)
- (and ~36 more — every modal in `/tmp/wcag_scope_modals.txt` that uses `class="close"` instead of `class="la-modal-close"`)

**Modals that DO have `aria-label`** (the modernized `.la-modal-close` pattern): find-button, eval-status, modify-core-words, generate-board, dashboard-supervisors-modal, tag-board, new-board.

**Recommended fix** — convert every legacy `class="close"` to `class="la-modal-close"` AND add `aria-label={{t "Close" key="close"}}`. The styling and behavior become consistent at the same time.

### Other modals — selected findings

| Severity | File | Issue |
|---|---|---|
| **FAIL** | share-board.hbs:22 | Board icon image with no `alt` |
| **FAIL** | share-board.hbs:112 | Username input — placeholder-only, no label |
| **FAIL** | premium-voices.hbs:36 | Voice list is `<div>`s not `<ul>`/`<li>` |
| **FAIL** | modify-core-words.hbs:25 | Textarea — placeholder-only, no label |
| **FAIL** | new-board.hbs:71,85 | Plus/minus buttons (`+`/`-`) — no `aria-label` |
| **FAIL** | new-board.hbs:209,212 | Hash links used as button actions |
| **RISK** | eval-status.hbs:19,23,31,37 | Form inputs use `<label>` but no `for/id` association |
| **RISK** | eval-status.hbs:25,61 | Error messages with no `aria-live="assertive"` |
| **RISK** | share-board.hbs:29-37 | Copy success/failure status with no `aria-live` |
| **RISK** | share-board.hbs:83 | User avatar in modal — no `alt` attribute |
| **NOTE** | dashboard-supervisors-modal.hbs:2 | `role="document"` is incorrect on a modal — modal-dialog already provides `role="dialog"` |

### Cross-cutting recommendations

1. **Adopt the `.la-modal-close` + `aria-label` pattern globally.** Stop using Bootstrap's `class="close"`.
2. **Replace every `<div class="md-card__title">` with `<h3>`.** Style the new heading element to match the existing visual.
3. **Add `aria-live="polite"` to every loading/result/status container.** A reusable helper class (e.g. `.md-aria-live` { aria-live attribute set in template }) would help enforce this.
4. **Convert every `<a href="#" {{action ...}}>` to `<button type="button">`.** Hash links are a frequent pattern across older code; the modernized work should not perpetuate them.
5. **Stop using `title=` on icon-only buttons as the only label.** `title` is not reliably announced. Always pair with `aria-label` (or replace).

---

## CATEGORY 4 — Touch target size & spacing (WCAG 2.5.5 AAA, 2.5.8 AA, AAC standard)

**1 outright fail. 18 risks.** AAC project standard is 56×56 minimum (30% larger than typical web defaults); AA WCAG 2.5.8 minimum is 24×24; AAA WCAG 2.5.5 minimum is 44×44. Almost all targets pass AA but fail the AAC standard. The most concerning area is the bank of 12+ modal close buttons sized at 34×34, which AAC users with motor disabilities will struggle to hit reliably.

### landing-alt

✓ **PASS** — `.la-btn--primary` and `.la-btn--ghost` (hero and footer CTAs) are sized `min-height: 56px` with `padding: 14px 26px`. Meets the AAC standard.

### board-detail

The symbol grid buttons themselves are large (the AAC vocabulary tiles); they're properly sized via the SCSS grid layout. The issues are in the surrounding chrome:

| Severity | File:line | Element | Size | Criterion | Fix |
|---|---|---|---|---|---|
| **NOTE** | various | Symbol board buttons | (computed at runtime; large) | OK | None — these are dynamically sized and meet AAC needs |

The detail-page header buttons (mic, scanner, options menu) and sentence-row close button were not flagged with explicit constraints — the auditor noted these would need on-device measurement to flag confidently.

### board-layout

| Severity | File:line | Element | Size | Criterion | Fix |
|---|---|---|---|---|---|
| **RISK** | [app.scss:5366](app/frontend/app/styles/app.scss#L5366) | `.md-board-layout-close` | 36×36 | Fails 2.5.5 AAA + AAC | Bump to `min-width: 48px; min-height: 48px;` (ideally 56×56) |

### caseload

| Severity | File:line | Element | Computed size | Criterion | Fix |
|---|---|---|---|---|---|
| **FAIL** | [app.scss:51114](app/frontend/app/styles/app.scss#L51114) | `.md-caseload__action` (Model For, Speak As, Stats, etc.) | ≈20×21 (`padding: 7px 12px; font-size: 13px`) | Below 24px AA | `padding: 14px 28px` for ~42×42 minimum, ideally `16px 32px` |
| **FAIL-adj** | [app.scss:51152](app/frontend/app/styles/app.scss#L51152) | `.md-caseload__action--extras` (three-dot) | ≈18×17 | Below 24px AA | Set `width: 40px; height: 40px; padding: 12px;` |
| **RISK** | [app.scss:9094](app/frontend/app/styles/app.scss#L9094) | Dropdown menu items `.dropdown-menu > li > a` | ≈22 tall | Borderline AA | `padding: 10px 14px` minimum |

### find-button modal

| Severity | File:line | Element | Computed size | Criterion | Fix |
|---|---|---|---|---|---|
| **FAIL** | [app.scss:10623](app/frontend/app/styles/app.scss#L10623) | `.la-find-button-cancel` | ≈34×32 (`padding: 10px 20px; font-size: 14px`) | Below AAC standard, borderline AAA | `padding: 16px 32px;` for ~46×48 |
| **RISK** | [app.scss:10524](app/frontend/app/styles/app.scss#L10524) | `.la-find-button-wrap .la-modal-close` | 36×36 | Fails 2.5.5 AAA + AAC | `48×48` minimum |
| **RISK** | [app.scss:10605](app/frontend/app/styles/app.scss#L10605) | `.la-find-button-result` | tight padding `10px 12px` | Adjacency risk if rows touch | `padding: 12px 14px;` minimum, ensure 8px+ gap |

### dashboard authenticated-view

| Severity | File:line | Element | Computed size | Criterion | Fix |
|---|---|---|---|---|---|
| **RISK** | [app.scss:33841](app/frontend/app/styles/app.scss#L33841) | `.md-pillnav__pill` | ≈34×40 (`padding: 10px 12px`) | Borderline AA, fails AAC | `padding: 14px 18px;` for ~48×48 |
| **NOTE** | [app.scss:38181](app/frontend/app/styles/app.scss#L38181) | `.md-btn` (Manage buttons on cards) | ≈36×38 (`padding: 12px 16px`) | Passes AA, fails AAC | `padding: 16px 20px;` for ~44×44+ |

### Modal system — the close button epidemic

This is the single biggest issue in this category. **Twelve+ modals** all override `.la-modal-close` with `34×34`:

| File:line | Selector |
|---|---|
| [app.scss:29151](app/frontend/app/styles/app.scss#L29151) | `.la-features-modal-wrap .la-modal-close` |
| [app.scss:9693](app/frontend/app/styles/app.scss#L9693) | `.la-board-actions-wrap > .modal-header .close` |
| [app.scss:9913](app/frontend/app/styles/app.scss#L9913) | `.la-confirm-edit-wrap > .modal-header .close` |
| [app.scss:10036](app/frontend/app/styles/app.scss#L10036) | `.la-rename-board-wrap > .modal-header .close` |
| [app.scss:10214](app/frontend/app/styles/app.scss#L10214) | `.la-swap-images-wrap > .modal-header .close` |
| [app.scss:10979](app/frontend/app/styles/app.scss#L10979) | `.la-translate-board-wrap > .modal-header .close` |
| [app.scss:11166](app/frontend/app/styles/app.scss#L11166) | `.la-batch-recording-wrap > .modal-header .close` |
| [app.scss:11254](app/frontend/app/styles/app.scss#L11254) | `.la-delete-board-wrap > .modal-header .close` |
| [app.scss:11324](app/frontend/app/styles/app.scss#L11324) | `.la-board-privacy-wrap > .modal-header .close` |
| [app.scss:11381](app/frontend/app/styles/app.scss#L11381) | `.la-edit-board-details-wrap > .modal-header .close` |
| [app.scss:11507](app/frontend/app/styles/app.scss#L11507) | `.la-board-ideas-wrap > .modal-header .close` |
| [app.scss:11601](app/frontend/app/styles/app.scss#L11601) | `.la-button-stash-wrap > .modal-header .close` |

Plus the base `.la-modal-close` rule at [app.scss:29055](app/frontend/app/styles/app.scss#L29055) (32×32) and the board-details modal close at [app.scss:9467](app/frontend/app/styles/app.scss#L9467) (34×34).

**Severity:** RISK ×14 — passes WCAG 2.5.8 AA (24×24) but fails 2.5.5 AAA (44×44) and the AAC project standard (56×56). For an AAC application, this is a serious motor accessibility concern.

**Fix:** Update the base `.la-modal-close` rule to `48×48` minimum, and remove all 12 specific overrides so they inherit. One rule change, app-wide effect.

### Modal footer buttons (Bootstrap default)

| Severity | Element | Computed size | Criterion | Fix |
|---|---|---|---|---|
| **RISK** | `.modal-footer .btn.btn-default` (legacy Bootstrap default `padding: 6px 12px`) | ≈28×34 | Borderline AA, fails AAC | Add a global `.la-modal-footer .btn { padding: 12px 20px; min-height: 40px; }` rule |

---

## Suggested fix prioritization

Given the breadth of findings, fix in this order — each tier delivers the most impact per line of code changed.

### Tier 1 — One-line wins, biggest blast radius

1. **Bump base `.la-modal-close` to 48×48 and delete the 12 overrides** ([app.scss:29055](app/frontend/app/styles/app.scss#L29055)) — single change cascades to every modernized modal close button. Touch targets fixed everywhere.
2. **Convert every `class="close"` modal close button to `class="la-modal-close"` + add `aria-label={{t "Close" key="close"}}`** — fixes ~36 ARIA failures and visually unifies the close button. Search/replace job.
3. **Fix the `.md-download-card__btn--secondary` 2.26:1 contrast** at [app.scss:3994](app/frontend/app/styles/app.scss#L3994) — worst contrast in the audit.
4. **Add the shared `:focus-visible` rule** in the keyboard category section. One block, fixes ~8 missing-focus-indicator issues at once.

### Tier 2 — Pattern fixes (one search-and-replace each)

5. **Convert every `<div class="md-card__title">` to `<h3>`** — restores the document outline across the dashboard.
6. **Convert every `<a href="#" {{action ...}}>` to `<button type="button">`** — fixes hash link issues in caseload, dashboard, new-board.
7. **Add `aria-live="polite"` to every "Loading…", error, and result container** — find-button, eval-status, share-board.

### Tier 3 — Specific fixes

8. The five remaining color contrast failures in the board-details modal and download cards.
9. Convert the two `<div>{{action}}>` backdrops on board-detail to keyboard-accessible buttons (or inert overlay + a real focus-trap close button).
10. Convert the find-button result `<div>`s to `<button>`s.
11. Add `aria-label`s to the icon-only sentence-nav buttons on board-detail.
12. Caseload — add the missing avatar alt text, dropdown extras `aria-label`, hash-link conversions, and convert the `md-card__title` div to `<h1>`.

### Tier 4 — Polish

13. Modal focus restoration on close (best-practice 2.1.2).
14. Arrow-key navigation in dropdown menus (board-detail options menu, dashboard pillnav-dropdown, caseload extras).
15. The `.md-pillnav__pill` and `.md-btn` padding bumps for AAC standard touch targets.
16. Stop using `title=` as a substitute for `aria-label` on icon-only buttons.

---

## What was NOT audited

- **Legacy bootstrap pages** (the pre-modernized routes — preferences, settings, organization, user-stats, user-goals, etc.) — out of scope per user request.
- **Skill / audit-system files** in `skills/`, `subagents/`, `audit-reports/` — meta files, not user-facing.
- **Server-side Rails templates** — out of scope; all WCAG findings on this branch are frontend.
- **Live browser-rendered DOM** — all findings are from static template/SCSS analysis. Some translucent backgrounds and computed sizes were marked NOTE because they require visual verification.
- **Screen reader actual-output testing** — no NVDA / VoiceOver / JAWS runs were performed; this audit is a code-level audit.

For a full release-ready WCAG sign-off, complement this report with: (a) live browser testing with axe DevTools or WAVE, (b) screen reader walkthroughs of the critical user flows, (c) keyboard-only walkthroughs of board-detail and find-button.
