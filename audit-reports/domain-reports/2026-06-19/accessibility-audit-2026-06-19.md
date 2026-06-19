# LingoLinq-AAC Accessibility (WCAG 2.1 AA / EN 301 549) Audit

**Run date:** 2026-06-19  |  **Finder:** `accessibility-auditor`  |  **Audited commit:** `445336592dda` (`scot/security/audit-erasure-admin-reads`)

**Open findings in this domain:** 12  (0 CRITICAL · 1 HIGH · 10 MEDIUM · 1 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (1)

### Find-a-button search input has no accessible name (placeholder-only, non-i18n)

- **ID:** `LL-9b5d0f1381`  |  **ruleKey:** `find-button-search-input-missing-label`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/find-button.hbs`:8
- **Frameworks:** WCAG
- **First seen:** 2026-06-19  |  **Last seen:** 2026-06-19  |  **Disposition:** accepted
- **Adversary:** confirmed (focus-input injects no aria-label; input named by placeholder only; distinct from LL-35e6b7a3d6, the authenticated-view overlay input in a different file). HIGH leans on a find-a-button scan-reachability assumption not independently traced; the defect itself is solid.
- **Remediation:** Give the find-a-button search input a programmatic accessible name: add an i18n aria-label (aria-label={{t "Search for a button" key='...'}}). A placeholder is not a reliable accessible name and disappears on input; the sibling .la-modal-header-label span (find-button.hbs:4) is not programmatically associated. Also convert the raw placeholder to the i18n helper per the double-quote/{{t}} convention.

## MEDIUM (10)

### Sentence box (utterance bar) symbol chip images have no alt attribute

- **ID:** `LL-0c6e931f47`  |  **ruleKey:** `sentence-box-chip-img-missing-alt`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/components/button-list.hbs`:21
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed. Live utterance bar mounted at application.hbs:131; imgs at button-list.hbs:21,23 lack alt/aria-hidden. Caveats: pattern is systemic (also button.hbs:17, board/index.hbs:123, board.js:1715 fast_html dual-render); and prefer alt={{button.label}} with alt="" only when label is guaranteed non-empty (image-only buttons would otherwise lose their name).
- **Remediation:** Give each utterance-chip symbol <img> an explicit alt. Since the chip's visible {{button.label}} text is always rendered in the adjacent .text div, the image is decorative for naming purposes and should carry alt="" so AT does not announce the image src/filename; if the label can be hidden, set alt to the button label instead. Apply the same to the fallback paper.svg <img> on the same component (button-list.hbs:23).

### Loading status text has no aria-live or role=status

- **ID:** `LL-13ad11eaee`  |  **ruleKey:** `loading-status-missing-aria-live`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/bento.hbs`:14
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed (2026-06-16): the bento.hbs Loading <div> and its #index_view ancestor carry no aria-live/role=status, and there is no separate hidden live region; layout ancestors application.hbs/index.hbs have none either. board-stats.hbs:66 (<dl>) and bulk_purchase.hbs:5 (<h2>) likewise lack live-region semantics.
- **Remediation:** Wrap loading/status text in a container with role="status" (or aria-live="polite") so screen-reader users are notified when content is loading or has loaded.

### Dashboard search overlay text input has no programmatic label (placeholder only)

- **ID:** `LL-35e6b7a3d6`  |  **ruleKey:** `search-overlay-input-missing-label`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/components/dashboard/authenticated-view.hbs`:588
- **Frameworks:** WCAG
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** untriaged
- **Remediation:** Give the search input a programmatic accessible name: add an i18n aria-label to the input. The overlay role=dialog already carries an i18n aria-label, but the input itself needs its own name; a placeholder is not a reliable accessible name and disappears on input.

### Rails application layout html element has no lang attribute

- **ID:** `LL-40dd412ed6`  |  **ruleKey:** `rails-layout-missing-html-lang`  |  **confidence:** high
- **Location:** `app/views/layouts/application.html.erb`:2
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed (2026-06-16): the <html> tag has no lang in either ERB branch; no <body lang>, meta http-equiv, or JS documentElement.lang assignment exists anywhere. This is the default Rails layout (boards#index, crawler/meta pages, parental-consent meta), so it renders real user-facing/SEO content. parental_consent.html.erb sets lang; email.html.erb does not. Note: once the SPA boots it inherits no lang from this <html> either.
- **Remediation:** Add lang="en" (or the served locale) to the <html> element in the Rails application layout, matching the Ember shell (app/frontend/app/index.html sets lang="en").

### Legacy Bootstrap close button labeled only by a times glyph, no aria-label

- **ID:** `LL-5ff3b22093`  |  **ruleKey:** `legacy-modal-close-missing-accessible-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/board-details.hbs`:3
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed (2026-06-16): no aria-label, title, or sr-only text; the SCSS rule (app.scss:11877) only sizes/positions the button and board-details.js performs no aria injection. The only name is &times; (U+00D7), announced as "times"/"multiplication" or skipped, not "Close". The modern .la-modal-close (button-set.hbs:3) carries aria-label={{t "Close"}}, confirming the inconsistent gap.
- **Remediation:** Give the legacy close button an i18n aria-label (aria-label={{t "Close" key='close'}}) the way the modern .la-modal-close buttons already do, or migrate it to the .la-modal-close pattern.

### Icon-only remove button named only by a non-i18n title attribute

- **ID:** `LL-70abe7d9a9`  |  **ruleKey:** `icon-only-control-named-by-title-attr`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/share-board.hbs`:101
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed (2026-06-16): the button child is an inline <svg> with no <title>/role/aria, and there is no aria-label/aria-labelledby/sr-only; the name derives solely from title=. Nuance: title DOES feed accname, so a strict 4.1.2 read could "pass" in AT that surfaces title -- but it is the weakest/most-inconsistent source (no keyboard/touch tooltip), so the medium framing holds. The i18n half is unambiguous: "Remove" is a raw literal, not {{t}}.
- **Remediation:** Replace title="Remove" with aria-label={{t "Remove" key='remove'}} on the icon-only button; title is not a reliable accessible name and the literal string is not internationalized.

### Speak-bar remote-modeling (#reply_icon) button has no accessible name

- **ID:** `LL-8fab55372e`  |  **ruleKey:** `speak-bar-reply-icon-button-missing-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/application.hbs`:148
- **Frameworks:** WCAG
- **First seen:** 2026-06-19  |  **Last seen:** 2026-06-19  |  **Disposition:** untriaged
- **Adversary:** confirmed (#reply_icon has only glyphicons + an alt-less avatar img, no sr-only/aria-label; sibling #speak_options carries an sr-only i18n name). Pairing-gated, so MEDIUM.
- **Remediation:** Add an i18n accessible name to the pairing #reply_icon control: a <span class="sr-only">{{t "..." key='...'}}</span> child or aria-label={{t}}, mirroring the sibling #speak_options, #backspace_button, and #clear_button controls which already carry sr-only i18n names. The avatar <img> at application.hbs:155 also has no alt.

### Shared modal-dialog wrapper sets role=dialog/aria-modal but no accessible name

- **ID:** `LL-b06f063f85`  |  **ruleKey:** `modal-dialog-role-dialog-no-accessible-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/components/modal-dialog.hbs`:6
- **Frameworks:** WCAG
- **First seen:** 2026-06-19  |  **Last seen:** 2026-06-19  |  **Disposition:** untriaged
- **Adversary:** confirmed (modal-dialog.hbs wrapper div carries role=dialog/aria-modal with no aria-label/aria-labelledby; ~250 call sites inherit the unnamed dialog). MEDIUM justified by breadth.
- **Remediation:** Associate the dialog with its visible title: add aria-labelledby pointing at each modal's header element (e.g. the .la-modal-header-label / .modal-title id), or accept a yielded label arg the wrapper sets as aria-label via the i18n helper. Every legacy modal rendered through this component inherits the unnamed role=dialog.

### Sentence box / utterance bar vocalize control is an anchor with no button role or accessible name

- **ID:** `LL-e08bd45a9f`  |  **ruleKey:** `sentence-box-vocalize-anchor-missing-button-role`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/application.hbs`:86
- **Frameworks:** WCAG
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** untriaged
- **Remediation:** Add role=button and an i18n aria-label to the #button_list anchor. href=# makes it announce as a link not the speak action, and its only name source is dynamic chip/time content (absent when the utterance is empty). The sibling icon controls (backspace, clear) already use sr-only i18n names; mirror that.

### Raw low-contrast brand token used as text foreground (board-tile language pill)

- **ID:** `LL-ed914bded3`  |  **ruleKey:** `low-contrast-brand-token-text-foreground`  |  **confidence:** medium
- **Location:** `app/frontend/app/styles/app.scss`:193
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** confirmed (2026-06-16): all three cited lines apply raw $brand-verdigris (~3.32:1 on white) as normal-weight text on light backgrounds, below the 4.5:1 AA minimum. The cited .board-icon__lang-marker rule overrides via !important the already-AA-correct rule at app.scss:9926 (whose text is 14px/700 = NOT large-scale, so 4.5:1 governs). The only icon use of the token (.board-icon__lang-marker-icon, app.scss:9972; 3:1 where 3.32:1 passes) is correctly excluded.
- **Remediation:** Use the AA-safe token $brand-verdigris-aa (defined in _variables.scss, ~4.73:1 on white) for text/link foregrounds; never a raw or deprecated hex.

## LOW (1)

### Board-tile symbol image has no alt text (edit-mode board-editor path)

- **ID:** `LL-20c48e298c`  |  **ruleKey:** `board-tile-symbol-img-missing-alt`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/board/index.hbs`:123
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** untriaged
- **Adversary:** uncertain (2026-06-16): the cited line sits inside {{#if this.app_state.edit_mode}} (index.hbs:102), an EDIT-MODE-ONLY path; the live communicator grid renders via {{board.fast_html.html}} (index.hbs:100), not this markup. The missing-alt defect is real here, but this anchor is NOT the AAC-core live surface the title/notes imply -- the live case is the separate utils/button.js fast_html finding. Recommend Scot re-anchor this to the fast_html finding or downgrade its scope to edit-mode. (Verified .hide-label = display:none at app.scss:9167.)
- **Remediation:** Give the symbol <img> an alt equal to the button label (or alt="" when the visible label is present and provides the accessible name). Ensure the tile <a> always has an accessible name even when symbols/labels are toggled.


---
_Generated from the register at `445336592ddaf838689df7e578829e94e140890d`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
