# LingoLinq-AAC Accessibility (WCAG 2.1 AA / EN 301 549) Audit

**Run date:** 2026-08-12  |  **Finder:** `accessibility-auditor`  |  **Audited commit:** `d67ed76e0a16` (`scot/feat/code-hygiene-auditor`)

**Open findings in this domain:** 19  (0 CRITICAL · 2 HIGH · 13 MEDIUM · 4 LOW)

> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. Statuses are verified against live code at the audited commit. Only Scot closes a finding, downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.

## HIGH (2)

### Terms-agree modal is unreachable by switch scanning (no .modal_targets / .btn, opened without scannable)

- **ID:** `LL-104bfa61dc`  |  **ruleKey:** `terms-agree-modal-not-scannable`  |  **confidence:** high
- **Location:** `app/frontend/app/components/terms-agree.hbs`:27
- **Frameworks:** WCAG
- **First seen:** 2026-07-20  |  **Last seen:** 2026-07-20  |  **Disposition:** untriaged
- **Remediation:** Two changes, both required. (1) In terms-agree.hbs, wrap the action buttons in a .modal_targets container and give each control the .btn class so the scanner selector at app/frontend/app/utils/modal.js:255 (".modal-dialog .modal_targets .btn, .modal-dialog .modal_targets a, ...") can find them. The existing la-btn / la-btn--primary / la-btn--ghost classes match none of those selectors. (2) Pass scannable: true at all four call sites: app/frontend/app/routes/index.js:123, index.js:132, app/frontend/app/routes/bento.js:51, bento.js:55 -- every one currently calls modal.open('terms-agree') with no options object, so scanning is never enabled for this modal even if the markup is fixed. Verify with a switch-scanning walkthrough, not markup inspection alone.

### AI disclosure full-notice link uses the low-contrast verdigris token for text on the near-white modal surface

- **ID:** `LL-a9d6d5a46b`  |  **ruleKey:** `disclosure-full-notice-link-low-contrast-token`  |  **confidence:** high
- **Location:** `app/frontend/app/styles/app.scss`:38150
- **Frameworks:** WCAG
- **First seen:** 2026-07-22  |  **Last seen:** 2026-07-22  |  **Disposition:** untriaged
- **Remediation:** The .la-terms-agree-link rule (the class on the Article 50(1) disclosure modal's full-notice link, app/frontend/app/components/ai-disclosure.hbs:48) colors normal-size link text with var(--md-teal) = brand-verdigris (~3.32:1 on white per the codebase's own WCAG note at app.scss:533). The modal surface is a near-white gradient. Recolor this link text to the AA-safe brand-verdigris-aa token (>4.5:1 on white) or point a text-role variable at the AA token; do not inline a hex. The class is shared with terms-agree, so the fix benefits both. Pre-enable blocker for the 2026-08-02 Article 50 flag enable; frontend/styling owner (Traci) domain.

## MEDIUM (13)

### Sentence box (utterance bar) symbol chip images have no alt attribute

- **ID:** `LL-0c6e931f47`  |  **ruleKey:** `sentence-box-chip-img-missing-alt`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/components/button-list.hbs`:21
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed. Live utterance bar mounted at application.hbs:131; imgs at button-list.hbs:21,23 lack alt/aria-hidden. Caveats: pattern is systemic (also button.hbs:17, board/index.hbs:123, board.js:1715 fast_html dual-render); and prefer alt={{button.label}} with alt="" only when label is guaranteed non-empty (image-only buttons would otherwise lose their name).
- **Remediation:** Give each utterance-chip symbol <img> an explicit alt. Since the chip's visible {{button.label}} text is always rendered in the adjacent .text div, the image is decorative for naming purposes and should carry alt="" so AT does not announce the image src/filename; if the label can be hidden, set alt to the button label instead. Apply the same to the fallback paper.svg <img> on the same component (button-list.hbs:23).

### Loading status text has no aria-live or role=status

- **ID:** `LL-13ad11eaee`  |  **ruleKey:** `loading-status-missing-aria-live`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/bento.hbs`:14
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed (2026-06-16): the bento.hbs Loading <div> and its #index_view ancestor carry no aria-live/role=status, and there is no separate hidden live region; layout ancestors application.hbs/index.hbs have none either. board-stats.hbs:66 (<dl>) and bulk_purchase.hbs:5 (<h2>) likewise lack live-region semantics.
- **Remediation:** Wrap loading/status text in a container with role="status" (or aria-live="polite") so screen-reader users are notified when content is loading or has loaded.

### Shared-message speak target is a div with a click handler and no keyboard semantics

- **ID:** `LL-171938b2b9`  |  **ruleKey:** `div-click-target-no-keyboard-semantics`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/utterance.hbs`:31
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed the div has no role/tabindex/href and the global keyboard-activation shim's isActionable() check excludes it. Correction: the fallback button at line 91 is for viewers WITHOUT reply permission, not with -- so the population actually stranded is reply-permitted viewers, making the finding stronger than written, not weaker.
- **Remediation:** Give the vocalize target real control semantics: make it a <button type="button"> (or add role="button" plus tabindex="0") with an i18n accessible name such as {{t "Speak this sentence" key='speak_this_sentence'}}. Adding role="button" or tabindex alone is enough for the app-wide instance-initializers/keyboard-activation.js handler to supply Enter/Space activation, but a native <button> is preferable since it also supplies the role.

### Dashboard search overlay text input has no programmatic label (placeholder only)

- **ID:** `LL-35e6b7a3d6`  |  **ruleKey:** `search-overlay-input-missing-label`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/components/dashboard/authenticated-view.hbs`:588
- **Frameworks:** WCAG
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** accepted
- **Remediation:** Give the search input a programmatic accessible name: add an i18n aria-label to the input. The overlay role=dialog already carries an i18n aria-label, but the input itself needs its own name; a placeholder is not a reliable accessible name and disappears on input.

### Shared modal-dialog shell declares role=dialog aria-modal without aria-labelledby or aria-describedby

- **ID:** `LL-58130aaefe`  |  **ruleKey:** `modal-dialog-missing-aria-labelledby`  |  **confidence:** high
- **Location:** `app/frontend/app/components/modal-dialog.hbs`:6
- **Frameworks:** WCAG
- **First seen:** 2026-07-20  |  **Last seen:** 2026-07-20  |  **Disposition:** untriaged
- **Remediation:** Add optional labelledBy / describedBy arguments to the modal-dialog component and bind them as aria-labelledby / aria-describedby on the dialog element. Ember omits a bound attribute whose value is undefined, so defaulting both to undefined is a verified no-op for the roughly 140 existing callers that do not pass them -- the change is additive and carries no regression risk to current modals. Then retrofit callers in priority order (terms-agree and any consent- or compliance-bearing modal first) so each dialog has a programmatically determined accessible name. WCAG 2.1 AA 4.1.2 Name, Role, Value.

### Empty and hidden board-grid cells stay keyboard-focusable with no accessible name when the grid-placeholder preference is on

- **ID:** `LL-59bfd6f482`  |  **ruleKey:** `empty-grid-cell-focusable-no-accessible-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/models/board.js`:1747
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Traced the full path: synthetic empty-cell push, unconditional button_html call, tabindex='0' with no aria attributes, and the app.scss grid_hidden_buttons rule that re-reveals the anchor while hiding children. Bonus: app-state.js:3765-3769 makes activation a no-op in that exact mode, so it's a silent nameless tab stop, not merely an unlabeled one.
- **Remediation:** In the render_fast_html button_html builder (and the parallel builder in utils/button.js), omit tabindex and/or emit aria-hidden="true" for slots the user cannot activate (button.empty, and hidden_button outside show-all/edit), so a placeholder cell is not a nameless tab stop. Alternatively give the placeholder anchor an i18n accessible name such as an empty-cell label.

### Legacy Bootstrap close button labeled only by a times glyph, no aria-label

- **ID:** `LL-5ff3b22093`  |  **ruleKey:** `legacy-modal-close-missing-accessible-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/board-details.hbs`:3
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed (2026-06-16): no aria-label, title, or sr-only text; the SCSS rule (app.scss:11877) only sizes/positions the button and board-details.js performs no aria injection. The only name is &times; (U+00D7), announced as "times"/"multiplication" or skipped, not "Close". The modern .la-modal-close (button-set.hbs:3) carries aria-label={{t "Close"}}, confirming the inconsistent gap.
- **Remediation:** Give the legacy close button an i18n aria-label (aria-label={{t "Close" key='close'}}) the way the modern .la-modal-close buttons already do, or migrate it to the .la-modal-close pattern.

### Icon-only remove button named only by a non-i18n title attribute

- **ID:** `LL-70abe7d9a9`  |  **ruleKey:** `icon-only-control-named-by-title-attr`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/share-board.hbs`:101
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed (2026-06-16): the button child is an inline <svg> with no <title>/role/aria, and there is no aria-label/aria-labelledby/sr-only; the name derives solely from title=. Nuance: title DOES feed accname, so a strict 4.1.2 read could "pass" in AT that surfaces title -- but it is the weakest/most-inconsistent source (no keyboard/touch tooltip), so the medium framing holds. The i18n half is unambiguous: "Remove" is a raw literal, not {{t}}.
- **Remediation:** Replace title="Remove" with aria-label={{t "Remove" key='remove'}} on the icon-only button; title is not a reliable accessible name and the literal string is not internationalized.

### Speak-bar remote-modeling (#reply_icon) button has no accessible name

- **ID:** `LL-8fab55372e`  |  **ruleKey:** `speak-bar-reply-icon-button-missing-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/application.hbs`:148
- **Frameworks:** WCAG
- **First seen:** 2026-06-19  |  **Last seen:** 2026-06-19  |  **Disposition:** accepted
- **Adversary:** confirmed (#reply_icon has only glyphicons + an alt-less avatar img, no sr-only/aria-label; sibling #speak_options carries an sr-only i18n name). Pairing-gated, so MEDIUM.
- **Remediation:** Add an i18n accessible name to the pairing #reply_icon control: a <span class="sr-only">{{t "..." key='...'}}</span> child or aria-label={{t}}, mirroring the sibling #speak_options, #backspace_button, and #clear_button controls which already carry sr-only i18n names. The avatar <img> at application.hbs:155 also has no alt.

### Authenticated Home landing jumps from h1 straight to h3 with no h2

- **ID:** `LL-959d76ecfc`  |  **ruleKey:** `heading-level-skip`  |  **confidence:** high
- **Location:** `app/frontend/app/components/dashboard/authenticated-view.hbs`:187
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** uncertain -- Original citation (line 151) sits inside a disabled HBS comment block ({{!-- ... --}} spanning 142-169), so that specific anchor is inert even though it passes citation-check textually. The underlying defect is real: h1 exists, zero live <h2 anywhere in the file, first live h3 is at line 187. EVIDENCE RE-ANCHORED by the orchestrator to line 187 (a live, uncommented h3) before merge; severity/title unchanged since the page-level defect the finding describes still holds.
- **Remediation:** Either promote the dashboard card titles from h3 to h2 (they are the first level of sections under the hero h1), or introduce an h2 section heading for the card grid. Keep the existing md-card__title class so styling is unchanged; only the element level needs to change.

### Shared modal-dialog wrapper sets role=dialog/aria-modal but no accessible name

- **ID:** `LL-b06f063f85`  |  **ruleKey:** `modal-dialog-role-dialog-no-accessible-name`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/components/modal-dialog.hbs`:6
- **Frameworks:** WCAG
- **First seen:** 2026-06-19  |  **Last seen:** 2026-06-19  |  **Disposition:** accepted
- **Adversary:** confirmed (modal-dialog.hbs wrapper div carries role=dialog/aria-modal with no aria-label/aria-labelledby; ~250 call sites inherit the unnamed dialog). MEDIUM justified by breadth.
- **Remediation:** Associate the dialog with its visible title: add aria-labelledby pointing at each modal's header element (e.g. the .la-modal-header-label / .modal-title id), or accept a yielded label arg the wrapper sets as aria-label via the i18n helper. Every legacy modal rendered through this component inherits the unnamed role=dialog.

### Sentence box / utterance bar vocalize control is an anchor with no button role or accessible name

- **ID:** `LL-e08bd45a9f`  |  **ruleKey:** `sentence-box-vocalize-anchor-missing-button-role`  |  **confidence:** medium
- **Location:** `app/frontend/app/templates/application.hbs`:86
- **Frameworks:** WCAG
- **First seen:** 2026-06-18  |  **Last seen:** 2026-06-18  |  **Disposition:** accepted
- **Remediation:** Add role=button and an i18n aria-label to the #button_list anchor. href=# makes it announce as a link not the speak action, and its only name source is dynamic chip/time content (absent when the utterance is empty). The sibling icon controls (backspace, clear) already use sr-only i18n names; mirror that.

### Raw low-contrast brand token used as text foreground (board-tile language pill)

- **ID:** `LL-ed914bded3`  |  **ruleKey:** `low-contrast-brand-token-text-foreground`  |  **confidence:** medium
- **Location:** `app/frontend/app/styles/app.scss`:193
- **Frameworks:** WCAG
- **First seen:** 2026-06-16  |  **Last seen:** 2026-06-16  |  **Disposition:** accepted
- **Adversary:** confirmed (2026-06-16): all three cited lines apply raw $brand-verdigris (~3.32:1 on white) as normal-weight text on light backgrounds, below the 4.5:1 AA minimum. The cited .board-icon__lang-marker rule overrides via !important the already-AA-correct rule at app.scss:9926 (whose text is 14px/700 = NOT large-scale, so 4.5:1 governs). The only icon use of the token (.board-icon__lang-marker-icon, app.scss:9972; 3:1 where 3.32:1 passes) is correctly excluded.
- **Remediation:** Use the AA-safe token $brand-verdigris-aa (defined in _variables.scss, ~4.73:1 on white) for text/link foregrounds; never a raw or deprecated hex.

## LOW (4)

### Preferences dropdown menu references a nonexistent id via aria-labelledby (dLabel)

- **ID:** `LL-4574005612`  |  **ruleKey:** `aria-labelledby-dangling-idref`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/user/preferences.hbs`:163
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Same dangling-id fact base; route confirmed reachable via router.js:134.
- **Remediation:** Point aria-labelledby at the id of the menu's own trigger element, or remove it and supply an i18n aria-label on the role=menu container.

### Dropdown menus reference a nonexistent id via aria-labelledby (dLabel) in the app shell

- **ID:** `LL-8bc8f025a7`  |  **ruleKey:** `aria-labelledby-dangling-idref`  |  **confidence:** high
- **Location:** `app/frontend/app/templates/application.hbs`:386
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed zero elements define id=dLabel anywhere in the repo; the real trigger carries id='level_dropdown' instead.
- **Remediation:** Point aria-labelledby at the id of the actual dropdown trigger that precedes each menu (e.g. the sibling anchor's id, such as the level dropdown trigger id used one line above), or drop aria-labelledby and give the menu an i18n aria-label. Do not leave a reference to an id that no element defines.

### Authenticated navbar dropdown menu references a nonexistent id via aria-labelledby (dLabel)

- **ID:** `LL-f6be45aec6`  |  **ruleKey:** `aria-labelledby-dangling-idref`  |  **confidence:** high
- **Location:** `app/frontend/app/components/app-navbar-authenticated-inner.hbs`:126
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Same dangling-id fact base; liveness chain verified end to end through application.js's useAppNavbarInHeader computed, true on every authenticated route.
- **Remediation:** Point aria-labelledby at the id of the navbar dropdown trigger, or remove it and supply an i18n aria-label on the role=menu container.

### Saved Phrases icon-only action buttons carry hard-coded English aria-labels

- **ID:** `LL-fba16b6fd7`  |  **ruleKey:** `hardcoded-aria-label-non-i18n`  |  **confidence:** high
- **Location:** `app/frontend/app/components/phrases.hbs`:47
- **Frameworks:** WCAG
- **First seen:** 2026-08-12  |  **Last seen:** 2026-08-12  |  **Disposition:** untriaged
- **Adversary:** confirmed -- Confirmed exact lines 47/50/55 are raw English literals while lines 8 and 77 in the same file correctly use {{t}} -- an intra-file inconsistency, not a codebase-wide gap.
- **Remediation:** Replace the literal strings with the i18n helper, matching the pattern already used elsewhere in this same file (e.g. aria-label={{t "Close" key="close"}} at line 8 and aria-label={{t "New phrase" key="new_phrase"}} at line 77): aria-label={{t "Move up" key='move_up'}}, {{t "Move down" key='move_down'}}, {{t "Remove" key='remove'}}.


---
_Generated from the register at `d67ed76e0a161b594fbffa519ab428d0f9b7780b`. Regenerate with `ruby scripts/render-domain-reports.rb`. Do not edit by hand._
