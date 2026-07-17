# Accessibility Conformance Report (ACR / VPAT) - LingoLinq AAC

> **DRAFT - awaiting attestation.** This is a Phase 3 first-draft skeleton, not a published
> conformance statement. Conformance values below are seeded from the internal WCAG 2.1 AA
> working notes (`audit-reports/wcag-modernized-2026-04-11*.md`, modernized surfaces only) and
> must be re-verified against live code at a stamped SHA before this report is shared with any
> customer. Only Scot attests a published ACR. Drafted by the compliance-officer; goes through
> adversary review before reaching Scot.
>
> Format basis: ITI VPAT 2.5 (WCAG edition). Audited SHA: _to stamp at publish time._
> Draft date: 2026-06-13.

## Name and version of product

LingoLinq AAC (web application; Ember 3.28 frontend, Rails 7.2 backend). Augmentative and
Alternative Communication SaaS for US school districts, hospitals, and European clients,
including under-13 users.

## Report date

2026-06-13 (DRAFT). Last underlying technical audit: 2026-04-11 (modernized surfaces only).

## Product description

A symbol- and text-based AAC communication system: communication boards/grids, board editing,
word prediction, caseload and dashboard views for SLPs and educators. Accessibility is
product-existential here: the people who use LingoLinq to communicate frequently rely on
assistive technology, switch access, eye-gaze, and high-contrast needs.

## Evaluation methods used

Internal read-only audit (2026-04-11): four parallel passes (color contrast via the WCAG
relative-luminance formula, keyboard/focus, semantic HTML/ARIA, touch-target size) over the
modernized templates in `app/frontend/app/templates/` and the `.la-`/`.md-` SCSS rules in
`app/frontend/app/styles/app.scss`. No assistive-technology user testing yet; no automated-tool
sweep recorded. **Gap to close before publishing:** AT user testing (screen reader, switch,
eye-gaze) and a full-surface (not modernized-only) pass.

## Applicable standards / guidelines

| Standard | Included in this report |
|---|---|
| WCAG 2.1 Level A | Yes (partial - see scope limits) |
| WCAG 2.1 Level AA | Yes (partial - see scope limits) |
| Revised Section 508 (US) | Mapped via WCAG 2.1 AA (to complete) |
| EN 301 549 (EU) | Mapped via WCAG 2.1 AA (to complete; relevant to EAA exposure) |

## Terms (VPAT conformance levels)

- **Supports** - the functionality meets the criterion without known defects.
- **Partially Supports** - some functionality does not meet the criterion.
- **Does Not Support** - the majority does not meet the criterion.
- **Not Applicable** - the criterion is not relevant.
- **Not Evaluated** - not yet assessed (used here because this is a draft).

## Scope and known limitations of this draft

1. The 2026-04-11 audit covered **modernized surfaces only**: `landing-alt`, `board-detail`,
   `dashboard authenticated-view`, `board-layout`, `caseload`, the `find-button` modal, and 39
   modal templates sharing the `.la-modal-header` / `.md-modal-btn` signatures. **Legacy
   surfaces are Not Evaluated.**
2. **Dual render path gotcha:** the live communication grid renders through BOTH `index.hbs`
   (Ember template) AND `button.js` `fast_html` (server-rendered fast path). An accessibility
   fix applied in one path is NOT automatically present in the other. Every grid-surface
   criterion below must be verified in both render paths before it can be marked Supports.
3. Values are seeded from internal working notes, not from a fresh stamped-SHA verification.

## WCAG 2.1 Report

### Table 1: Level A success criteria (selected; full table to complete)

| Criterion | Conformance (DRAFT) | Remarks (evidence: working notes) |
|---|---|---|
| 1.1.1 Non-text Content | Partially Supports | Icon-only header buttons on board-detail use `title=` instead of `aria-label=`; `title` is not reliably announced. Some modal close buttons missing `aria-label`. |
| 1.3.1 Info and Relationships | Partially Supports | `<div class="md-card__title">` elements styled as headings with no semantic heading element (dashboard, caseload, multiple modals); screen readers see no document outline. |
| 2.1.1 Keyboard | Partially Supports | `<a href="#">` used as click handlers (caseload, dashboard, new-board) - broken keyboard semantics and page-jump risk. |
| 2.4.4 Link Purpose (In Context) | Not Evaluated | To assess. |
| 4.1.2 Name, Role, Value | Partially Supports | 16 FAIL / 18 RISK in the ARIA pass; missing names on icon buttons, non-semantic headings, control roles. Largest category in the audit. |

### Table 2: Level AA success criteria (selected; full table to complete)

| Criterion | Conformance (DRAFT) | Remarks (evidence: working notes) |
|---|---|---|
| 1.4.3 Contrast (Minimum) | Partially Supports | 6 contrast failures on modernized surfaces: light accent text (verdigris, dusty-denim) on light backgrounds and white text on light gradients. Worst measured 2.26:1 (`.md-download-card__btn--secondary`, app.scss:3994) vs 4.5:1 required. The Fitzgerald part-of-speech symbol color system passes cleanly (5.7:1 to 21:1). |
| 1.4.11 Non-text Contrast | Partially Supports | Translucent-background close buttons flagged for in-browser recompute (app.scss:9467, 9693). |
| 2.4.7 Focus Visible | Partially Supports | Modal close buttons and several controls missing `:focus-visible`; 8 FAIL / 4 RISK in the keyboard/focus pass. |
| 2.5.8 Target Size (Minimum, AA 2.2) | Not Applicable | 2.5.8 is WCAG 2.2; this report targets 2.1 AA. Tracked for a future 2.2 uplift. |
| 4.1.3 Status Messages | Partially Supports | Status messages ("Loading...", error states, copy-success toasts) missing `aria-live` regions across find-button, eval-status, share-board. |

### Table 3: Level AAA criteria (informational only; not required at AA)

| Criterion | Conformance (DRAFT) | Remarks (evidence: working notes) |
|---|---|---|
| 2.5.5 Target Size (Enhanced) | Informational | Modal close buttons at 34x34px in working notes. AAA only; not part of the AA conformance claim. |

> Criteria not listed are **Not Evaluated** in this draft. Completing the full Level A + AA
> tables (all ~50 criteria) is part of finishing this ACR before publication.

## Top remediation patterns (fix the pattern, not the instance)

1. Base `.la-modal-close` rule + 12 modal overrides: size, `:focus-visible`, and `aria-label`
   in one change (touches 12+ modals).
2. Replace heading-styled `<div>`s with real heading elements for a correct document outline.
3. Replace `title=` with `aria-label=` on icon-only header buttons.
4. Replace `<a href="#">` click handlers with `<button>` elements.
5. Add `aria-live` regions to status/toast surfaces.

(Remediation lives on normal feature branches, not on this compliance surface. Fix colors must
resolve to current DESIGN.md tokens; do NOT use any deprecated/banned hex. Contrast fixes will
be re-measured against the live tokens at verification time.)

## Path to a publishable ACR (close before sharing externally)

- [ ] Stamp an audited SHA and re-verify every value above against live code (both render paths).
- [ ] Complete the full Level A + AA criterion tables.
- [ ] Run AT user testing (screen reader, switch access, eye-gaze) and an automated sweep.
- [ ] Map to Section 508 and EN 301 549 columns.
- [ ] Adversary review, then Scot attestation. Only then is this a conformance statement.

_Phase 3 deliverable of the Audit/Compliance System Modernization (plan section 6). The
`wcag-modernized-2026-04-11*.md` files in `audit-reports/` are this report's working notes._

_Automated feeder: the read-only `accessibility-auditor` finder (skill `accessibility-audit`,
spawned by `/audit-run`) emits static WCAG 2.1 AA / EN 301 549 findings (`frameworks:["WCAG"]`)
into `audit-reports/FINDINGS.json` at a stamped SHA. Those register findings are the
code-anchored input to this report; they do NOT change its DRAFT/attestation state - only Scot
attests, after AT user testing and adversary review close the gaps above._
