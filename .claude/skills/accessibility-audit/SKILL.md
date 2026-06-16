---
name: accessibility-audit
description: WCAG 2.1 AA / EN 301 549 accessibility audit checklist for LingoLinq-AAC. Static markup/SCSS checks for non-text content, info/relationships, keyboard/focus visibility, name-role-value, language, and known low-contrast brand tokens. Preloaded by the accessibility-auditor agent; emits findings in the canonical register schema with frameworks:["WCAG"]. Read-only, static analysis only.
---

# WCAG 2.1 AA / EN 301 549 Accessibility Audit

## Purpose
Audit the LingoLinq-AAC frontend markup and styles for deterministic, statically-detectable
WCAG 2.1 AA defects. Accessibility is product-existential for an AAC tool: users who rely on
LingoLinq to communicate frequently use assistive technology, switch access, eye-gaze, and
high-contrast needs and often cannot route around a broken control. This is a read-only finder:
produce findings, never fix.

**Static analysis only.** Everything here is checkable by reading templates, components, and
SCSS. Anything requiring a running DOM, a browser, axe-core/Lighthouse, computed contrast against
rendered ancestors, live focus order, or screen-reader/switch/eye-gaze behavior is OUT OF SCOPE
and belongs to the human ACR / AT-testing pass (`docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md`
tracks that gap). Never claim to have verified runtime behavior.

## Scan scope
- `app/frontend/app/templates/**/*.hbs` and `app/frontend/app/components/**/*.{js,hbs}`: markup,
  roles, `alt`, `aria-*`, `<label for>`, heading structure, `tabindex`, `lang`.
- `app/frontend/app/utils/button.js`: the hand-built `fast_html` board-tile HTML string (alt/aria
  are concatenated here, NOT in a template - the second of the two grid render paths).
- `app/frontend/app/styles/app.scss`: interactive selectors missing `:focus-visible`/`:focus`,
  and USES of the known low-contrast brand tokens below.
- `app/frontend/app/index.html` (the Ember app shell) and any Rails-served layout (e.g.
  `app/views/boards/index.html.erb`): `<html lang>` presence and correctness.

### AAC surfaces to cover explicitly
- **Communication board grid tiles** - the core surface; renders by TWO paths (see below).
- **Sentence box / utterance bar** (`app/frontend/app/utils/utterance.js` consumers and the
  utterance template region).
- **Scanning-mode UI** (`app/frontend/app/utils/scanner.js` consumers) - switch-access users.
- **Speak-mode launch UI** and the authenticated Home dashboard
  (`templates/components/dashboard/authenticated-view.hbs`; `index/authenticated.hbs` is dead).
- Modals sharing the `.la-modal` / `.md-modal` signatures (close buttons, focus, labels).

### Dual render-path gotcha (check BOTH for every tile-level finding)
The live board grid renders through two independent paths; a fix in one is NOT automatically in
the other. Every tile-level `alt`/`aria`/`role` finding must be checked in both:
1. **Template path:** `app/frontend/app/templates/board/index.hbs`.
2. **Fast-HTML string path:** the `fast_html` builder in `app/frontend/app/utils/button.js`.

## Checklist (organized by POUR; EN 301 549 clauses noted for EU clients)

> **Register gotcha - never write a 4-part dotted EN 301 549 clause in an emitted finding.**
> The clause numbers below (e.g. `9.1.4.3`) are for YOUR reading. Do NOT copy a four-part dotted
> number into any emitted finding field (`title`, `notes`, `remediation`). The register's PII
> scrubber (`scripts/audit-merge.rb`) treats a dotted-quad like `9.1.4.3` as an IP address and
> REFUSES the entire finding (it never lands). In findings, cite the **WCAG success-criterion
> number** (e.g. `1.4.3`, at most 3 groups - always safe), and if you reference EN 301 549 use the
> **3-part parent clause** (e.g. `9.1.4`) or prose ("mapped in EN 301 549"). Verified 2026-06-15.

> EN refs below are the **3-part parent clause** (e.g. `9.1.4`), deliberately NOT the 4-part
> success-criterion form, so nothing in this checklist can be copied into a finding and refused as
> an IP (see the gotcha above). The full SC-level EN number is intentionally omitted.

### Perceivable
- [ ] **1.1.1 Non-text Content** (EN 301 549 9.1.1): every `<img>`/symbol tile has a meaningful
      `alt` (or `aria-label`/`aria-labelledby`); decorative images use `alt=""`. Check BOTH grid
      render paths.
- [ ] **1.3.1 Info and Relationships** (EN 9.1.3): heading-styled `<div>`/`<span>` (e.g.
      `.md-card__title`) replaced by real heading elements; form fields programmatically
      associated with labels; lists/tables use semantic elements.
- [ ] **1.4.3 Contrast (Minimum)** (EN 9.1.4): flag USES of the known-failing brand tokens below
      for foreground text/links on light surfaces. Reference tokens BY NAME; do NOT compute
      ratios against rendered ancestors (that is the human/runtime pass).
- [ ] **1.4.11 Non-text Contrast** (EN 9.1.4): flag only statically-obvious cases (e.g. a control
      border that resolves to a known-failing token). Translucent/computed backgrounds are
      deferred to the runtime pass.

### Operable
- [ ] **2.1.1 Keyboard** (EN 9.2.1): `<a href="#">` or `<div>`/`<span>` used as click handlers
      without `<button>` semantics or `role="button"` + key handling.
- [ ] **2.4.1 Bypass Blocks** (EN 9.2.4): landmark regions / skip mechanism present.
- [ ] **2.4.6 Headings and Labels** (EN 9.2.4): headings and labels are descriptive (and i18n'd).
- [ ] **2.4.7 Focus Visible** (EN 9.2.4): interactive selectors in `app.scss` have a
      `:focus-visible` (or `:focus`) rule. The 2026-04-11 pass found `.la-btn`,
      `.md-caseload__action*`, `.la-find-button-result`, `.la-modal-close`, `.la-find-button-cancel`
      missing one.
- [ ] **2.4.3 Focus Order** (EN 9.2.4): static red flags only - `tabindex` > 0 (positive tabindex)
      and obvious DOM-order traps. Live focus order is the runtime pass, not this.

### Understandable
- [ ] **3.1.1 Language of Page** (EN 9.3.1): `<html lang>` present and valid.
- [ ] **3.1.2 Language of Parts** (EN 9.3.1): language-switched regions carry a `lang` attribute.
- [ ] **3.3.2 Labels or Instructions** (EN 9.3.3): inputs have visible labels or instructions.

### Robust
- [ ] **4.1.2 Name, Role, Value** (EN 9.4.1): icon-only controls (e.g. `.la-modal-close`) have an
      accessible name (`aria-label`, not `title=`); custom controls expose role/state; ARIA
      attributes reference valid ids.
- [ ] **4.1.3 Status Messages** (EN 9.4.1): static red flag only - status/toast containers
      ("Loading...", error, copy-success) with NO `aria-live`/`role="status"` in the markup.

### Cross-cutting: i18n of accessible names
- [ ] `aria-label`/`alt`/`title` set to a raw user-facing string instead of the i18n helper
      (`{{t "..." key='...'}}` / `i18n.t('key', "...")`). Per repo convention user-facing strings
      use double quotes; a hard-coded accessible name is both an i18n defect and an a11y-naming
      defect. Tag `frameworks:["WCAG"]` and note the i18n cross-ref.

## Known low-contrast brand tokens (reference BY NAME - never inline hex)
The 2026-04-11 internal pass measured these brand tokens as failing WCAG 1.4.3 (4.5:1) for
foreground text on light backgrounds. Flag USES of them for text/link foregrounds; in
`remediation.options` point at the AA-safe token, never a raw or deprecated/banned hex. Both the
failing tokens and their AA-safe counterparts are DEFINED in `app/frontend/app/styles/_variables.scss`
(the authoritative definition site; resolve names there and cross-ref DESIGN.md section 14
product-UI palette). At the 2026-04-11 SHA the AA tokens carried inline contrast notes
(`$brand-verdigris-aa` and `$brand-dusty-denim-aa`, both > 4.5:1 on white):

| Token (foreground) | Issue | AA-safe remediation token |
|---|---|---|
| `$brand-verdigris`    | low-contrast as text on light bg | `$brand-verdigris-aa`    |
| `$brand-dusty-denim`  | low-contrast as text on light bg | `$brand-dusty-denim-aa`  |

Notes:
- This is a token-USAGE check, not a contrast computation. Only flag a use you can see statically
  resolves to a failing token as a text/link foreground. Do not guess ratios; the runtime
  re-measurement is the human ACR pass.
- NEVER recommend a banned/deprecated hex in remediation (the brand denylist includes `#1B365D`,
  which an older note wrongly suggested). Always name the AA-safe token.
- If a project-defined `*-aa` token does not yet exist, recommend defining one in the brand layer
  rather than inlining a hex; flag the gap in `notes`.

## Severity mapping
- **critical**: an interactive AAC control (board tile, speak/scan control) has NO accessible name
  in BOTH render paths - an AT user cannot identify or operate it. (1.1.1 / 4.1.2)
- **high**: missing accessible name on an icon-only control; `<div>`/`<a href="#">` used as a
  primary control with no keyboard semantics; missing `:focus-visible` on a primary interactive
  selector; known low-contrast token used for primary body/link text. (1.1.1, 2.1.1, 2.4.7, 1.4.3)
- **medium**: heading-order / non-semantic heading; missing landmark; missing `lang` on a
  language-switched region; status container with no `aria-live`. (1.3.1, 2.4.1, 3.1.2, 4.1.3)
- **low**: hard-coded (non-i18n) accessible name where one exists; descriptive-label polish;
  documentation gaps. Prefer `confidence:"low"` or no finding over a heuristic guess.

## Finding schema (canonical: mirrors audit-reports/FINDINGS.json)
Emit each finding as:
```json
{
  "ruleKey": "stable-kebab-rule-id",
  "title": "one line",
  "severity": "critical|high|medium|low",
  "confidence": "high|medium|low",
  "frameworks": ["WCAG"],
  "status": "open",
  "evidence": { "type": "code", "file": "app/frontend/...", "line": 123,
                "snippet": "verbatim source line at the audited SHA", "sha": "<auditedSha>" },
  "remediation": { "options": "how to fix (name AA-safe tokens, never hex)", "timeframe": "advisory SLA" },
  "notes": "WCAG criterion + EN 301 549 clause; render-path note if tile-level; i18n cross-ref if applicable"
}
```
Rules:
- `frameworks` is exactly `["WCAG"]` for accessibility findings.
- Finders emit `status: "open"` ONLY. Never `verified-closed`: only Scot closes a finding, and the
  adversary verifier confirms it first.
- The `snippet` MUST appear verbatim in the cited file at `<auditedSha>` (`scripts/citation-check.rb`
  enforces this). For the `fast_html` path, cite the line in `button.js` where the attribute string
  is built, not a rendered DOM node.
- The orchestrator computes the stable `id` (`LL-` + first 10 hex of `sha256(ruleKey + "|" + file)`),
  sets `firstSeen`/`lastSeen`/`owner`, and reconciles against the existing register so a recurring
  issue keeps its id. There is no parent/child id: each `(ruleKey, file)` is its own finding. If a
  rule recurs across N files, emit N findings (one per file).
- **No student/patient data in any field. Snippets are code only** (template/SCSS/JS source). Never
  copy real names, vocabulary, logs, or DB rows into a finding.
- **No four-part dotted EN 301 549 clause numbers in any field** (see the gotcha above the
  checklist): `9.1.4.3` reads as an IP to the merge PII scrubber and the whole finding is refused.
  Cite the WCAG SC number (`1.4.3`) and the 3-part EN 301 549 parent (`9.1.4`) at most.
- Cross-check `audit-reports/FINDINGS.json` first; if a `(ruleKey, file)` already exists, reference
  its `id` rather than duplicating. The `audit-reports/wcag-modernized-2026-04-11*.md` working notes
  are NOT register entries; surface those defects only if they still exist at the audited SHA and
  are not already registered.
