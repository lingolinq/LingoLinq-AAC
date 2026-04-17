# WCAG 2.1 AA Audit — Modernized Pages — Follow-Up Sweep

**Audit date:** 2026-04-11 (follow-up to first audit on 2026-04-11)
**Standard:** WCAG 2.1 Level AA
**Scope:** Same as the first audit — modernized pages and modals only.
**Methodology:** Four parallel read-only re-audits. Each verifies the previous fixes are in place AND scans for issues missed in the first pass.

---

## Executive summary

**First-audit fix verification:** ✓ All previously-fixed items are correctly in place except 6 modal close overrides that don't exist (those modals never had explicit overrides — they cascade from the base rule, which is now 48×48, so they pass).

**New findings (delta from first audit):**

| Category | New FAIL | New RISK | New NOTE |
|---|---:|---:|---:|
| 1. Color contrast | **4** | 1 | 0 |
| 2. Keyboard nav & focus | **14** | 9 | 3 |
| 3. Semantic HTML & ARIA | **12** | 3 | 2 |
| 4. Touch target size | **1** | 10 | 4 |
| **Total actionable** | **31** | **23** | **9** |

The first audit caught the most prominent patterns. The follow-up sweep found:
- **More instances of the same patterns** that the first audit's pattern-fixes mostly addressed but didn't catch every instance (e.g. more `$brand-verdigris` text on light backgrounds in modals the first sweep didn't reach; more icon-only buttons on board-detail using `title=` only)
- **Missed touch target violations on board-detail** itself — the sentence bar tools, sidebar nav items, edit toolbar, and color picker swatches all fail AAA. The first audit focused on modal close buttons and didn't go deep on board-detail's own chrome.
- **One critical contrast failure** I missed: `.md-board-detail-color-picker__swatch` has `padding: 6px 8px` → ~21×19px target, **below WCAG 2.5.8 AA's 24×24 floor**.
- **A handful of div/action and hash-link patterns** outside the originally-flagged files (profiles, modeling-ideas, board-icon, sidebar-tease, preference-box, badge-awarded, plus more in new-board.hbs).

---

## CATEGORY 1 — Color contrast (follow-up)

### ✓ Verification of previous fixes

All 6 first-audit fixes are correctly in place and now pass WCAG AA:

| First-audit fix | Now | Ratio |
|---|---|---|
| `.la-pricing-bulk-link` | `$brand-verdigris-aa` | 4.73:1 ✓ |
| `.la-pricing-bulk-explainer a` | `$brand-verdigris-aa` | 4.73:1 ✓ |
| `.la-board-details-section__heading` | `$brand-verdigris-aa` | 4.73:1 ✓ |
| `.la-board-details-wrap .dl-horizontal a` | `$brand-verdigris-aa` | 4.73:1 ✓ |
| `.la-board-details-rename-link:hover` | `$brand-verdigris-aa` | 4.73:1 ✓ |
| `.md-download-card__btn` (primary) | `linear-gradient($la-navy → $brand-charcoal-dark)` with white | 6.5+:1 ✓ |
| `.md-download-card__btn--secondary` | `linear-gradient($brand-slate-blue → $brand-charcoal-dark)` with white | 5.0+:1 ✓ |

### NEW findings — same `$brand-verdigris` pattern, more instances

These were missed in the first audit because the first sweep focused on landing-alt and the board-details modal specifically. The same pattern recurs in other modernized modals.

| Severity | File:line | Selector | Text → Bg | Ratio | Fix |
|---|---|---|---|---|---|
| **FAIL** | [app.scss:3964](app/frontend/app/styles/app.scss#L3964) | `.md-download-card__link` | `$brand-verdigris` (#2A9D8F) → white | 3.32:1 | `$brand-verdigris-aa` |
| **FAIL** | [app.scss:11548](app/frontend/app/styles/app.scss#L11548) | `.la-board-ideas-desc a` | `$brand-verdigris` → white | 3.32:1 | `$brand-verdigris-aa` |
| **FAIL** | [app.scss:11549](app/frontend/app/styles/app.scss#L11549) | `.la-board-ideas-status` | `$brand-verdigris` → white (13px text) | 3.32:1 | `$brand-verdigris-aa` |
| **FAIL** | [app.scss:11219](app/frontend/app/styles/app.scss#L11219) | `.la-batch-recording-back-btn:hover` | `$brand-verdigris` → `$surface-200` | ~3.8:1 | `$brand-verdigris-aa` |
| **BORDERLINE** | [app.scss:10777](app/frontend/app/styles/app.scss#L10777) | `.la-eval-status-desc` | `$brand-charcoal-blue` (#46505F) → white (15px) | 4.04:1 | Either bump to `$brand-charcoal-dark` (5.6:1) or accept if rendered at ≥16px |

### Pattern recommendation

The first audit introduced `$brand-verdigris-aa` and `$brand-dusty-denim-aa` as the AA-safe tokens but only swapped 5 of the failing instances. **Every remaining `color: $brand-verdigris` rule on a light/white background fails AA.** A wholesale grep-and-replace pass would be cleaner than fixing each instance individually:

```bash
# Find all remaining offenders:
grep -nE "color: \$brand-verdigris(;| )" app/frontend/app/styles/app.scss | grep -vi "dark\|navy\|black"
```

For each match, check if the surrounding background is light. If so, swap to `$brand-verdigris-aa`. The same pattern applies to `$brand-dusty-denim` → `$brand-dusty-denim-aa`.

---

## CATEGORY 2 — Keyboard navigation & focus (follow-up)

### ✓ Verification of previous fixes

| First-audit fix | Status |
|---|---|
| Modal-dialog focus restoration in `didRender` + `willDestroy` | ✓ verified — captures `_previously_focused`, filters body/null, restores via `document.body.contains` check |
| Find-button result divs → `<button>` elements | ✓ verified |
| Find-button sr-only label + `aria-label` on input | ✓ verified |
| Find-button close + cancel + result `:focus-visible` rules | ✓ verified |
| Board-detail backdrops marked `aria-hidden="true"` | ✓ verified |
| Caseload + dashboard + new-board hash links → buttons | ✓ verified for caseload + dashboard; **PARTIAL for new-board** (3 instances missed — see new findings below) |
| Shared `:focus-visible` block covering 12 modernized classes | ✓ verified |

### NEW findings — `<div {{action}}>` patterns missed in scope expansion

The first audit's scope was modernized modals + the 6 main modernized pages. These files weren't in the initial scope list but ARE in the project's modernized work and use `<div {{action}}>` patterns. Some are also linked from the audited pages.

| Severity | File:line | Element | WCAG | Fix |
|---|---|---|---|---|
| **FAIL** | profiles.hbs:20, 65, 85 | `<div {{action "review_profile"}} class="profile_modal_circle">` ×3 | 2.1.1, 4.1.2 | Convert to `<button type="button">` |
| **FAIL** | modeling-ideas.hbs:17, 21 | `<div {{action "target_words"}} style="cursor: pointer;">` ×2 | 2.1.1, 4.1.2 | Convert to `<button>` |
| **FAIL** | board-icon.hbs:1 | `<div tabindex="0" {{action "pick_board"}}>` | 2.1.1, 4.1.2 | Convert to `<button>` (tabindex+action ≠ button semantics) |
| **FAIL** | sidebar-tease.hbs:5 | `<div {{action "toggleSidebar"}} role="button" tabindex="0">` | 2.1.2, 4.1.2 | Convert to `<button>` |
| **FAIL** | preference-box.hbs:2, 52 | `<div {{action "toggle" on="click"}}>` ×2 | 2.1.1, 2.4.7 | Convert to `<button>` |
| **FAIL** | badge-awarded.hbs:48 | `<div {{action "show_goal"}} class="cursor">` | 2.1.1, 4.1.2 | Convert to `<button>` |

### NEW findings — symbol grid card semantics

| Severity | File:line | Element | Issue | Fix |
|---|---|---|---|---|
| **FAIL** | [board-detail.hbs:1124](app/frontend/app/templates/user/board-detail.hbs#L1124) | `<div role="gridcell" {{action "select_button"}} class="button md-board-detail-symbol-card">` | Symbol board cards use `role="gridcell"` but `role="gridcell"` requires a parent grid role. They're semantically buttons. Currently divs with click handlers — not keyboard reachable, no Enter/Space activation. | Either (a) convert to `<button>` keeping `role="gridcell"`, OR (b) make the parent a `role="grid"` and add `tabindex="0"` + keyboard handler to each cell |

### NEW findings — inline `outline: none` violations

The first audit flagged 1 instance in button-settings.hbs. Follow-up found 3 more:

| Severity | File:line | Issue |
|---|---|---|
| **FAIL** | button-settings.hbs:1085 | `style='outline: none;'` (still present, not yet fixed) |
| **FAIL** | audio-recorder.hbs:40 | `style='outline: none;'` |
| **FAIL** | button-settings.hbs (legacy):1077 | `style='outline: none;'` |
| **FAIL** | button-settings-sound.hbs:81 | `style='outline: none;'` |

### NEW findings — missing `:focus-visible` for board-detail interactive elements

These board-detail buttons have `:hover` rules but no `:focus-visible` rule, so keyboard users see no focus indicator. The first audit's shared focus block didn't cover board-detail's chrome buttons:

| Severity | Selector | File:line |
|---|---|---|
| **RISK** | `.md-board-detail-info-btn` | [app.scss:45822](app/frontend/app/styles/app.scss#L45822) |
| **RISK** | `.md-board-detail-nav-btn` | [app.scss:45872](app/frontend/app/styles/app.scss#L45872) |
| **RISK** | `.md-board-detail-header__expand-link` | [app.scss:46120](app/frontend/app/styles/app.scss#L46120) |
| **RISK** | `.md-board-detail-color-legend-toggle` | [app.scss:46143](app/frontend/app/styles/app.scss#L46143) |
| **RISK** | `.md-board-detail-quick-toggle` | [app.scss:46264](app/frontend/app/styles/app.scss#L46264) |
| **RISK** | `.md-board-detail-quick-reveal__btn` | [app.scss:46314](app/frontend/app/styles/app.scss#L46314) |
| **RISK** | `.md-board-detail-filter-chip__clear` | [app.scss:46364](app/frontend/app/styles/app.scss#L46364) |
| **RISK** | `.md-board-detail-sidebar-toggle--stacked` | [app.scss:46482](app/frontend/app/styles/app.scss#L46482) |
| **RISK** | `.md-board-detail-phrase-builder__clear` | [app.scss:46604](app/frontend/app/styles/app.scss#L46604) |

**Fix:** add each to the shared focus-visible block at app.scss:48835 (the one that already covers `.md-pillnav__pill` etc.).

### NEW findings — dropdown keyboard nav still incomplete

The first audit noted these as RISK and the fix was deferred. Still outstanding:

| Component | File | What's missing |
|---|---|---|
| Pillnav dropdown | dashboard/authenticated-view.hbs:18-34 | Arrow keys, Home/End, Escape |
| Caseload extras dropdown | caseload.hbs:83-95 | Arrow keys, Escape |
| Board-detail options menu | board-detail.hbs:185+ | Arrow keys, Escape, focus return to trigger |

These are listbox-pattern features that need component-level keyboard handlers. They're not single-line CSS fixes.

---

## CATEGORY 3 — Semantic HTML & ARIA (follow-up)

### ✓ Verification of previous fixes

| First-audit fix | Status |
|---|---|
| 15 modernized modals: `class="close"` → `class="la-modal-close"` + `aria-label` | ✓ all 15 verified |
| 9 dashboard `<div class="md-card__title">` → `<h3>` + 1 caseload → `<h1>` | ✓ verified |
| 9 hash links → buttons across caseload, dashboard, new-board | ✓ caseload (4) + dashboard (4) verified; **new-board PARTIAL** — only 2 of 4 fixed |
| Find-button: result `<div>` → `<button>`, sr-only label, image alts, aria-live regions | ✓ verified |
| Eval-status: 6 form field for/id pairs, 2 error `role="alert"` | ✓ verified |
| Share-board: aria-live wrapper, role="alert", avatar alt, sr-only input label | ✓ verified |
| Board-detail: suggestions aria-live, backdrops aria-hidden, 4 icon-only `aria-label`, collapse `aria-expanded` | ✓ verified |
| Caseload: avatar alt, dropdown extras `aria-label` | ✓ verified |
| Dashboard rooms list: `<ul role="list"><li>` | ✓ verified |

### NEW findings — more icon-only buttons on board-detail using `title=` only

The first audit caught 4 icon-only buttons (collapse, home, my-boards, back) that lacked `aria-label`. Follow-up found 5 more on the same page that use the same `title=`-only pattern:

| Severity | File:line | Element | Fix |
|---|---|---|---|
| **FAIL** | [board-detail.hbs:145](app/frontend/app/templates/user/board-detail.hbs#L145) | Backspace button | Add `aria-label={{t "Backspace" key="backspace"}}` |
| **FAIL** | [board-detail.hbs:152](app/frontend/app/templates/user/board-detail.hbs#L152) | Clear button | Add `aria-label={{t "Clear" key="clear"}}` |
| **FAIL** | [board-detail.hbs:157](app/frontend/app/templates/user/board-detail.hbs#L157) | Speak options button | Add `aria-label={{t "Speak options" key="speak_options"}}` |
| **FAIL** | [board-detail.hbs:168](app/frontend/app/templates/user/board-detail.hbs#L168) | Options menu toggle | Add `aria-label={{t "Options" key="options"}}` + `aria-expanded` |
| **FAIL** | [board-detail.hbs:176](app/frontend/app/templates/user/board-detail.hbs#L176) | Sidebar toggle | Add `aria-label={{t "Toggle sidebar" key="toggle_sidebar"}}` + `aria-pressed` |
| **FAIL** | [board-detail.hbs:416](app/frontend/app/templates/user/board-detail.hbs#L416) | Details & Actions toggle | Add `aria-label` |
| **FAIL** | [board-detail.hbs:887](app/frontend/app/templates/user/board-detail.hbs#L887) | Clear filter button | Add `aria-label` |

### NEW findings — hash links missed in new-board.hbs and share-board.hbs

The first audit fixed 2 of 4 hash links in new-board (`pick_core` and `record_words`). It missed:

| Severity | File:line | Element | Fix |
|---|---|---|---|
| **FAIL** | [new-board.hbs:123](app/frontend/app/templates/components/new-board.hbs#L123) | `<a href="#" {{action "more_options"}}>more options</a>` | `<button class="md-link-btn">` |
| **FAIL** | [new-board.hbs:214](app/frontend/app/templates/components/new-board.hbs#L214) | `<a style="display: none;" href="#" {{action "import_from_pdf"}}>` | Convert (or remove if unused) |
| **FAIL** | [new-board.hbs:223](app/frontend/app/templates/components/new-board.hbs#L223) | `<a href="#" {{action "enable_word" core_word.id}}>` (in core-words loop) | Convert to button |
| **FAIL** | [new-board.hbs:241](app/frontend/app/templates/components/new-board.hbs#L241) | `<a href="#" {{action "remove_word" word.id}}>` (in speech-words loop) | Convert to button |
| **FAIL** | [share-board.hbs:123](app/frontend/app/templates/components/share-board.hbs#L123) | `<li><a href="#" {{action "set_share_user_name" ...}}>` (in dropdown) | Convert to button |

### NEW findings — toggle buttons missing `aria-pressed`

| Severity | File:line | Element |
|---|---|---|
| **RISK** | [board-detail.hbs:176](app/frontend/app/templates/user/board-detail.hbs#L176) | Sidebar toggle (toggles panel visibility) |
| **RISK** | [board-detail.hbs:280-292](app/frontend/app/templates/user/board-detail.hbs#L280) | "Release Board Lock" / "Stay on this Board" toggle |
| **RISK** | [board-detail.hbs:295-307](app/frontend/app/templates/user/board-detail.hbs#L295) | "Resume Logging" / "Pause Logging" toggle |

These buttons toggle UI state but don't expose the state via `aria-pressed`. Screen reader users hear "button" with no indication of on/off.

---

## CATEGORY 4 — Touch target size (follow-up)

### ✓ Verification of previous fixes

| First-audit fix | Status |
|---|---|
| `.la-modal-close` base rule 32→48 | ✓ verified |
| 9 explicit modal close overrides 36→48 | ✓ all 9 verified |
| `.md-pillnav__pill` 10×12→14×18 + min-height: 48px | ✓ verified |
| `.md-btn` 12×16→14×20 + min-height: 44px | ✓ verified |
| `.md-caseload__action` 7×12→12×18 + min-height: 42px | ✓ verified |
| `.md-caseload__action--extras` 7×8→44×44 fixed square | ✓ verified |
| `.md-board-layout-close` 36→48 | ✓ verified |
| `.la-find-button-cancel` 10×20→14×28 + min-height: 44px | ✓ verified |
| `.la-find-button-result` 10×12→12×14 + button conversion | ✓ verified |

The "6 missing modal close overrides" the audit reported are a false-positive — those modals don't override the base rule, so they cascade the 48×48 base. They pass.

### NEW findings — board-detail chrome was not deeply audited in first pass

The first audit's touch-target sweep focused on the modal close button epidemic and the caseload action buttons. Board-detail's own chrome (sentence bar, sidebar nav, edit toolbar, header buttons) was not deeply measured. The follow-up found multiple violations:

#### CRITICAL (below WCAG 2.5.8 AA's 24×24 floor)

| Severity | Selector | File:line | Computed | Fix |
|---|---|---|---|---|
| **FAIL** | `.md-board-detail-color-picker__swatch` | [app.scss:48086](app/frontend/app/styles/app.scss#L48086) | ~21×19 (`padding: 6px 8px`) | `padding: 12px 16px; min-height: 44px` |

#### RISK (24-43px — passes AA, fails AAA + AAC standard)

These are all on board-detail. AAC users with motor disabilities will struggle with anything below 44px.

| Severity | Selector | File:line | Computed | Fix |
|---|---|---|---|---|
| **RISK** | `.md-board-detail-sentence-bar__tool-btn` | [app.scss:45729](app/frontend/app/styles/app.scss#L45729) | 32×32 | `width/height: 44px` |
| **RISK** | `.md-board-detail-color-legend__swatch` | [app.scss:46179](app/frontend/app/styles/app.scss#L46179) | 32×32 | `width/height: 44px` |
| **RISK** | `.md-board-detail-collapse-btn` | [app.scss:45380](app/frontend/app/styles/app.scss#L45380) | 36×36 | `width/height: 44px` |
| **RISK** | `.md-board-detail-collapse-btn--sentence-row` | [app.scss:45406](app/frontend/app/styles/app.scss#L45406) | 36×36 | `width/height: 44px` |
| **RISK** | `.md-board-detail-nav-btn` | [app.scss:45858](app/frontend/app/styles/app.scss#L45858) | 36×36 | `width/height: 44px` |
| **RISK** | `.md-board-detail-sentence-nav__btn` | [app.scss:45566](app/frontend/app/styles/app.scss#L45566) | ~36×36 | `width: 44px; min-height: 44px` |
| **RISK** | `.md-board-detail-sentence-bar__icon-btn` | [app.scss:45697](app/frontend/app/styles/app.scss#L45697) | 38×38 | `width/height: 44px` |
| **RISK** | `.md-board-detail-sentence-bar__btn` | [app.scss:45675](app/frontend/app/styles/app.scss#L45675) | ~40 tall (`padding: 10px 20px`) | `padding: 12px 20px; min-height: 44px` |
| **RISK** | `.md-board-detail-edit-toolbar__btn` | [app.scss:48428](app/frontend/app/styles/app.scss#L48428) | ~28-29 tall (`padding: 6px 10px`) | `padding: 10px 14px; min-height: 40px` |
| **RISK** | `.md-board-detail-board-actions__btn` | [app.scss:45908](app/frontend/app/styles/app.scss#L45908) | ~32-37 tall (`padding: 9px 16px`) | `padding: 12px 16px; min-height: 44px` |

#### NOTE (44-47px — passes AAA, below the AAC 48px aspirational target)

| Severity | Selector | File:line | Computed | Fix |
|---|---|---|---|---|
| **NOTE** | `.md-board-detail-sidebar__item` | [app.scss:45422](app/frontend/app/styles/app.scss#L45422) | ~42 tall | `padding: 13px 14px; min-height: 44px` |
| **NOTE** | `.la-eval-status-field__input` | [app.scss:10829](app/frontend/app/styles/app.scss#L10829) | ~35-38 tall | `padding: 12px 14px; min-height: 44px` |
| **NOTE** | `.md-modal-input` | [app.scss:50589](app/frontend/app/styles/app.scss#L50589) | ~34 tall | `padding: 12px 14px; min-height: 44px` |
| **NOTE** | `.dropdown-menu > li > a` | [app.scss:9103](app/frontend/app/styles/app.scss#L9103) | ~28 tall | `padding: 10px 16px; min-height: 44px` |

#### Spacing violations

| Severity | Issue | Selector | Fix |
|---|---|---|---|
| **FAIL** | Sentence bar tools group has `gap: 4px` between 32×32 buttons → fails WCAG 2.5.5 (need 24px gap OR 44px targets) | `.md-board-detail-sentence-bar__tools` | Bump tool buttons to 44×44, then `gap: 6px` is fine |
| **FAIL** | Sentence nav has `gap: 0` between 36×36 buttons | `.md-board-detail-sentence-nav` | Same — bump buttons to 44×44 |

---

## Suggested fix prioritization (follow-up)

### Tier 1 — Critical fixes (block release)

1. **`.md-board-detail-color-picker__swatch`** — `padding: 12px 16px; min-height: 44px` ([app.scss:48086](app/frontend/app/styles/app.scss#L48086)) — only outright FAIL in this sweep
2. **All remaining `$brand-verdigris` text on light bg → `$brand-verdigris-aa`** (4 instances: download-card link, board-ideas-desc a, board-ideas-status, batch-recording back btn hover)
3. **5 board-detail icon-only buttons need `aria-label`** (lines 145, 152, 157, 168, 176, 416, 887)
4. **5 hash links in new-board.hbs + 1 in share-board.hbs** → buttons
5. **6 `<div {{action}}>` patterns** in profiles, modeling-ideas, board-icon, sidebar-tease, preference-box, badge-awarded → buttons
6. **`.md-board-detail-symbol-card` semantic fix** — convert to `<button role="gridcell">` or restructure parent grid
7. **3 `style='outline: none'`** removals in audio-recorder + button-settings variants

### Tier 2 — Pattern extension (touch targets on board-detail)

Bump the following to 44×44 (10 board-detail chrome targets):
- `.md-board-detail-sentence-bar__tool-btn` (32→44)
- `.md-board-detail-sentence-bar__icon-btn` (38→44)
- `.md-board-detail-sentence-bar__btn` (~40→44)
- `.md-board-detail-collapse-btn` + `--sentence-row` (36→44)
- `.md-board-detail-nav-btn` (36→44)
- `.md-board-detail-sentence-nav__btn` (36→44)
- `.md-board-detail-color-legend__swatch` (32→44)
- `.md-board-detail-edit-toolbar__btn` (~28→40)
- `.md-board-detail-board-actions__btn` (~32→44)

This is one focused commit on board-detail chrome.

### Tier 3 — Pattern extension (focus indicators)

Add 9 board-detail interactive classes to the existing shared `:focus-visible` block at [app.scss:48835](app/frontend/app/styles/app.scss#L48835):
```scss
.md-board-detail-info-btn:focus-visible,
.md-board-detail-nav-btn:focus-visible,
.md-board-detail-header__expand-link:focus-visible,
.md-board-detail-color-legend-toggle:focus-visible,
.md-board-detail-quick-toggle:focus-visible,
.md-board-detail-quick-reveal__btn:focus-visible,
.md-board-detail-filter-chip__clear:focus-visible,
.md-board-detail-sidebar-toggle--stacked:focus-visible,
.md-board-detail-phrase-builder__clear:focus-visible,
```

### Tier 4 — Smaller polish

- 1 borderline contrast (`.la-eval-status-desc` 4.04:1) — bump to `$brand-charcoal-dark`
- 4 NOTE-level touch targets (`.md-board-detail-sidebar__item`, `.la-eval-status-field__input`, `.md-modal-input`, `.dropdown-menu > li > a`)
- 3 toggle buttons need `aria-pressed`
- Dropdown menu arrow-key navigation (board-detail options menu, dashboard pillnav, caseload extras)

---

## What this sweep changed about the audit's scope assumption

The first audit explicitly listed 6 modernized pages and 39 modals. The follow-up found that several frequently-used components live OUTSIDE that explicit scope but ARE in the modernized work — `profiles`, `modeling-ideas`, `board-icon`, `sidebar-tease`, `preference-box`, `badge-awarded`. They're not new modals, but they're rendered inside the modernized pages and inherit none of the accessibility fixes. They should be added to the scope for future passes.

The second more important finding: **board-detail's own chrome was under-audited in the first pass**. The first audit went deep on modals and shared patterns but didn't measure the board-detail header buttons, sidebar items, sentence bar tools, edit toolbar, or color picker swatches. These are the most-used controls for AAC communicators and they all need touch-target attention.

After Tier 1 + Tier 2 fixes, the modernized pages will be substantially closer to clean WCAG 2.1 AA compliance. The remaining gaps will mostly be polish (focus indicators, toggle states, dropdown keyboard navigation patterns).
