# Adversarial review: traci/styling/classic-view-overlay (2026-09-30)

**Scope.** The whole branch against develop: merge base `85d4a2412` to HEAD `1a0b8a082` (after the
develop merge). 381 files, about 46k lines added (part images, locales and docs), 234 commits
from 2026-09-02 to 2026-09-30.

**Method.** Seven read-only adversarial reviewers ran in parallel, one per area: backend and data;
view switching and routing; Basic home and board picker; Modern dashboard and orgs; styles;
components and tours; security, privacy and accessibility. Each labelled findings CONFIRMED
(path traced, file:line for each link) or PLAUSIBLE. A reviewer's report is evidence, not a
verdict, so every High and the important Mediums were then checked by hand. Three labels below:

- **VERIFIED**: re-checked against the code (or in the browser) after the review.
- **REVIEWER-CONFIRMED**: traced by the reviewer with file:line, not re-checked here.
- **PLAUSIBLE**: reasoned, at least one link unverified.

No Critical findings. Every cross-account write the branch adds is permission-checked on the server
(`api/boards_controller.rb:668-689`, `api/users_controller.rb:197-223`), and no path was found
that shows one organisation's data to someone without rights to it.

## Summary

| Severity | Count | Of which VERIFIED |
|---|---|---|
| High | 3 | 3 |
| Medium | 25 | 8 |
| Low | about 20 | 2 |
| Refuted | 1 | 1 |

Fix first: H1, H2 (both one-file fixes with a clear cause), then M1, M3, M5, M6.

---

## High

### H1. The "change someone else's view?" modal never renders, so the switch silently fails and the modal is stuck open (VERIFIED)
- `components/modal-container.js:37` lists `confirm-view-style-change` as a converted modal, but
  `components/modal-container.hbs` has no branch for it. Siblings do (`confirm-leave-edit` :167,
  `confirm-recolor-board` :169, `confirm-blank-board` :265). No template renders
  `<ConfirmViewStyleChange>`. Added on this branch, 80eb27347 (2026-09-17).
- `utils/view_style.js:108` opens it whenever `effective_view_user` is not `currentUser`, which is
  true while a supporter models for a communicator. Callers: view-switcher, board actions,
  `controllers/board/index.js`, `controllers/user/board-detail.js`.
- Effect: a supporter modelling for a communicator changes view; nothing appears and the promise
  never settles, so the switch does nothing. `modal.open` has stopped the scanner, and
  `modal.is_open()` stays true, which disables keyboard-listen selection and scanning touch
  handling on the communicator's board (`utils/raw_events.js:556,617,635,1149`) until a reload.
- Fix: add `{{else if (is-equal this.currentTemplate "confirm-view-style-change")}}<ConfirmViewStyleChange />`
  to modal-container.hbs. Add a render test that opens it.

### H2. The standalone Supervision page ignores its route model: empty, or another user's supervision (VERIFIED)
- `templates/user/supervision.hbs:54` mounts `<SupervisionSettings @model={{this.model}} @standalone={{true}} />`.
- `components/supervision-settings.js:55-67` (non-inline branch) takes
  `modal.getSettingsFor('supervision-settings')` first. That returns `{}` when nothing is stored
  (`services/modal.js:515`); `{}` is truthy, so `this.get('model')` is never read. Settings are
  written on every open (`modal.js:103`) and never cleared.
- Effect: with no prior modal, the page is built on an empty object. After the supervision modal
  was opened for communicator A anywhere in the session (for example from A's profile,
  `controllers/user/index.js:1538`), `/<me>/supervision` shows A's supervision and its actions
  act on A (authorized, but the wrong account).
- The new Basic account rail "Supervisors" row (60b2f85a8) links to this page. Its browser check
  saw "My Supervisors: None found" and took that as correct; an empty model renders the same, so
  that check did not prove the page loads the right account.
- Fix: when `standalone` (or `inline`), use `this.get('model')` and skip the modal-settings
  lookup. Test both orders (page first; modal for A then page).

### H3. New text below the 14px AAC floor (VERIFIED on samples)
- `_view-switcher.scss` (renders on Modern pages too): "Recommended" tag 9.5px (:202), group
  headings 10px (:121), descriptions 12px (:217), legacy trigger 12px (:249), 13px at :48/:112/:185.
- `_classic-home.scss`: `.ch-tour__eyebrow` 11px (:4283), `.ch-row__sub` 12px (:4135),
  `.ch-tab__meta` 13px (:1828).
- `app.scss`: `.md-acct-rail__sublabel` 12.5px (:50635), `.nb-grid-picker__notice` 12px (:62377),
  `.md-room-card__sub` 13px.
- Fix: raise to 14px, the 9.5-11px items first.

---

## Medium

### Verified

**M1. Basic org admin tabs show for view-only users on every org page except the rooms list.**
`controllers/organization.js:58-60` `showBasicOrgTabs` hides the tabs only when
`roomsPageActive && !permissions.edit`; `templates/organization.hbs:71-90`. At the merge base the
org admin links sat behind `{{#if this.model.permissions.edit}}` (base `organization.hbs:13`). A
supervisor or public viewer in Basic sees Admin, Managers, Supervisors, Communicators, Evals and
Symbols on the org and room pages; the people endpoints need `edit`, so they fail with 400s.
Nothing leaks, but it is a regression of an access-point gate. Fix: `!!model.permissions.edit` on
every org route (the 09-28 request was scoped to the rooms list; confirm the wider gate is wanted).

**M2. A caseload deep link (`?supervisee=`) does nothing while "Needs attention" is on.**
`controllers/caseload.js:163` clears the text filter for exactly this reason but not
`attentionOnly` (:699); `listedSupervisees` (:708-711) drops non-attention rows; the controller is
a singleton, so the flag survives navigation. Fix: reset `attentionOnly` beside
`superviseeFilter`. Related (REVIEWER-CONFIRMED, Low-Medium): when the attention count reaches 0
the toggle disappears (`caseload.hbs:35-39`) but `attentionOnly` can stay true, leaving an empty
list with no control to clear it.

**M3. An offline preference save by a supporter wipes their supervisee list from the local copy.**
`serializers/user.js:64` `supervisees: { serialize: false }` (9c0b08622, 09-24). Offline,
`updateRecord` stores the serialized payload as the whole local record
(`services/persistence.js:4740` then `_this.store(...)`, :722-735). `known_supervisees` derives
from `supervisees` (`models/user.js:871`), so caseload and speak-as lists are empty after an
offline reload until the device is online. The serializer comment's "this one is not [read back by
the offline path]" is wrong. Fix: strip `supervisees` from the network payload only (adapter), or
serialize a plain copy without `current_badge`.

**M4. Two TEMPORARY forced-on flags reach every live user.** `lib/feature_flags.rb`
ENABLED_FRONTEND_FEATURES: `compressed_view` (toggle only; the preference defaults off) and
`updates_pill` (new on this branch; adds an Updates pill for every account). Staging is the live
environment, so promotion ships both. develop already carries flags forced on the same way
(`session_resume`), so this extends an existing practice. Decide before promotion.

**M5. Handoff state survives an in-app logout.** `services/app-state.js` `clear_user_state` (:2138)
clears `setup_user` but not `basic_try_home` or `pending_index_nav` / `pending_open_extras` /
`pending_open_supervisee`. Matters only with the beta `auth_spa_transition` logout (a normal
logout reloads). Then the next person on a shared device can see "Set as Home Board for <A>" on a
tried board (A's username) and a click attempts that write; a leftover `pending_index_nav` also
makes their login count as "not a login". Fix: null all four in `clear_user_state`, and clear
`basic_try_home` when leaving the tried board or re-entering the picker.

**M6. The Basic-SLP login landing turns off auto-open speak mode (introduced today, b94aa5f32).**
`routes/index.js` `_basic_supporter_lands_home` sets `pending_index_nav`; `user.home` inherits
`beforeModel`, which then recomputes `_index_login_entry` as false (:37), and `jump_to_speak` is
gated on it (:189). A Basic SLP with `auto_open_speak_mode`, or who closed the app in speak mode,
now lands on Communicators instead of speak mode. Product decision: which wins for a Basic SLP?
If speak mode should, mark the login handoff separately so it does not count as an in-app arrival.

**M7. 43 new i18n keys are missing from the 12 non-English locales; `choose_organization` is
missing from en.json too.** Spot-checked: `classic_account_rail_aria`, `classic_org_rail_aria`,
`grid_over_max_notice`, `no_supervised_rooms`, `search_communicators`, `logs_and_messages` exist
in en only; `choose_organization` (`templates/organization.hbs:155`) is in none. Users see the
English defaults. `spec/templates/i18n_key_completeness_spec.rb` scans JS only, so CI misses
template keys. Fix: run `i18n_generator.rb --generate` then `--merge`; add `choose_organization`.

**M8 (downgraded from High). Newer colour functions without a fallback on old browsers.**
Compressed+Focused Need Attention card (`_focused-view.scss:127,5824-5828`) and the Basic+Focused
hero tiles (`:4113-4131`): a custom property or background holding `color-mix()` / `in oklab`
is dropped by Safari < 16.2 / Chrome < 111, leaving near-white text on a light ground (about
1.1:1 to 2.5:1). Downgraded because the declared targets are the latest Chrome, Firefox and
Safari only (`config/targets.js`) and develop already uses `in oklab` (9 times in app.scss).
Worth a decision given how common older iPads are among AAC users. Fix: plain hex first, the
oklab version inside `@supports (color: color-mix(in oklch, red, blue))`.

### Reviewer-confirmed, not re-checked

- **Two home buttons side by side, different targets.** `templates/application.hbs:538-544` still
  shows the legacy "Set as Home" (signed-in user) when they have no home board; `<BasicTryHomeButton>`
  renders after it (:547). An SLP with no home board of their own sees both after a Try for A.
  Fix: hide the legacy button while a Try mark applies.
- **Basic "Set as Home Board" skips the picker's tail.** `basic-try-home-button.js:53-58` does no
  image preload or `persistence.sync('self', ..., 'home_board_changed')`, unlike
  `board-preview-overlay.js` `_finishPickForHome` and `controllers/board-picker.js:185-187`.
  Offline users may land on a home board whose images are not cached. Fix: share the tail.
- **Back-button trap after switching to Basic on caseload, boards or extras.**
  `components/view-switcher.js:250` uses `transitionTo` (pushes history); Back re-enters the
  Modern-only URL, which redirects again (traced through ember-source router `_updateURL`).
  Fix: `replaceWith` in the switcher and in `send_basic_viewer_to_landing`.
- **Rooms page: a manager whose org record arrives without `permissions` never loads units.**
  `routes/organization/rooms.js` reads `permissions.edit` once in `setupController`;
  `canEditOrg` is reactive, so the manager branch renders with `units` null. Fix: load when the
  permission becomes true.
- **Logs redirect, timeout and abort.** `routes/user/logs.js`: after the 1.2s session wait times
  out on a slow cold load, no redirect happens and the `type=note` load marks the newest message
  read; no `transition.isAborted` check after the wait (same in `routes/user/boards.js`), so a
  navigation started during the wait is overridden. Fix: return if aborted; on a null user, fall
  back to the stored view when the URL user is the session user. (PLAUSIBLE)
- **Create Board: +/- steppers do not set `grid_size_chosen`**, so auto-fit reshapes a grid the user
  sized (`components/create-board-new.js:2596-2605`).
- **"Save trimmed" drops labels past the end of the grid** (`utils/board_grid.js` `analyze_grid`
  reads only rows x columns).
- **Label shrink-to-fit removed from `utils/button.js` but not from `models/board.js:1872-1882`
  `render_fast_html`** (speak mode), so long labels shrink in one path only.
- **Organisation switcher accessible name hides the selected org** (`organization.hbs:155`,
  `aria-label` over the visible name; WCAG 2.5.3 / 4.1.2). Fix: `aria-labelledby`.
- **Account rail Home Board sublabel**: navy at 0.62 (about 3.9:1 or lower on the tinted row) and
  12.5px (`app.scss:50635-50642`). Fix: 0.72 and 14px.
- **Focused `.ch-rail` surface rule is dead** (`_focused-view.scss:4677` is unscoped and loses to
  `_classic-home.scss:238`, loaded later); its quoted contrast figures never render.
- **Compressed home "View all" links**: 28px tall (below the project's 44px tap floor; passes WCAG
  2.5.8) and, on the navy Focused header, the global navy focus ring is nearly invisible (add the
  card to the light-ring list, `app.scss:409-411`). (focus ring PLAUSIBLE)
- **New user-facing behaviour without a feature flag**: `<BasicTryHomeButton>` (writes another
  user's home board), the Basic landings, the Basic-SLP login landing, and new accounts defaulting
  to Focused (`app/models/user.rb`, `generate_defaults`). CLAUDE.md asks for a flag on new
  user-facing features. Decide which count as changes to shipped features.
- **Grouping-reset migration**: one long transaction through full `User#save` callbacks, swallowed
  per-user failures, no-op `down`, coupled to the live model
  (`db/migrate/20260928120000_reset_board_category_grouping.rb`, `lib/board_category_grouping_reset.rb`).
  Fix: a one-off rake task, non-zero exit on failures, or update only the one preference. (PLAUSIBLE)
- **`:has()` without fallback in two layout-critical rules**: the Basic page's
  `.main_columns:has(> .ch-page)` margin reset (horizontal scroll at phone width without it) and the
  navbar brand rule that keeps the View button off the settings gear. (PLAUSIBLE; same targets
  caveat as M8)
- **Org switcher shows on every org sub-page**, listing only orgs where the user supervises rooms
  and linking each to that org's rooms (`organization.hbs:151-171`). Gate on `roomsPageActive`.
- **Basic caseload landing** expands a card for a modeling-only communicator (Modern only
  highlights those) and does nothing if supervisees are not loaded at insert
  (`components/dashboard/classic-view.js` `_expand_supervisee_card`).

## Low (reviewer-confirmed unless noted)

- View menu ignores whose boards page you are on: on `/<communicator>/boards` the switch lands on
  your own Boards tab, while the route sends you to their account page.
- Session resume treats any redirect as failure (`routes/index.js:165-169`), so the new Basic
  redirects clear the remembered page; use `followRedirects()`.
- Communicator-card handoff still runs when its tab was dropped (`classic-view.js:82-86,140-144`).
- Standalone rail `sync_able` drifted from the dashboard rail (`classic-rail.js`, missing
  `extras.ready`).
- Basic Access rail row vs the landing map's "no Basic navigation" rationale (deliberate per the
  09-30 decision; the map's comment and the View-menu switch to search are now inconsistent).
- Compressed+Focused hides the Speak card for org managers (`dashboard_sections.js:545-546`).
- "View all" aria-labels include the arrow character (read as "right arrow"). (VERIFIED: the
  aria-labels use `view_all_rooms` / `view_all_communicators`, which end in "→")
- Basic home tour spotlights a communicator card's Reports link on the Communicators tab
  (`utils/tours/classic-home.js`); nav overview reads the Updates pill's badge and sr-only text.
- Copy flows decide the edit route from `currentUser`, create from `effective_view_user`.
- `_reports.scss:1541/1579` duplicate selector; `_board_picker.scss` duplicated
  `.ll-boards-grid--compact` block; stale comments (`_classic-home.scss:1278`,
  `lib/feature_flags.rb` "kept on this line" note).
- Spec constants defined at top level inside `describe` blocks (`spec/templates/*.rb`).
- Account page subtitle "View your account details" is wrong on someone else's account.
- Dead `roomOrgs` in `controllers/organization/rooms.js:41`.

## Refuted

- **"My Boards" from the Basic home page leaves `pending_index_nav` set** (routing reviewer, High,
  PLAUSIBLE on whether Ember re-renders when the redirect returns to the current route). Tested in
  the browser as example in Basic: from `/example/home`, `transitionTo('user.boards')` landed on
  `/example/home` with the **Boards** tab active and `pending_index_nav` null.

## Checked and clean (highlights)

- Picking or copying a board for someone else: client checks `permissions.edit ||
  permissions.supervise` (`board-picker.js:132-133`); the server re-checks on board create and user
  update. `copy_or_reuse_as_home` matches the code it replaced.
- Org data isolation: `organizations#show` requires `view`; rooms lists come from the viewer's own
  `supervised_units`; the org name in labels is behind `permissions.view`.
- Account page heading: base already showed `{{display-name this.model}}`, no new exposure.
- Need Attention: same data source as before, now 3 rows plus "View all".
- No redirect loops; signed-out visitors are not redirected; `RSVP.reject()` after a redirect is
  handled as an abort; the logs abort-then-replace adds no Back entry.
- Guided tours keep `canClickTarget: false`; tour targets exist or are skipped.
- No PII in new localStorage, console, analytics or external calls.
- Capability ledger citations resolve at HEAD; `scripts/regenerate-register.sh --check` passes.

## Side effect of the review's probes

The probes reset example's view settings after every run. One residue: the earlier Basic-SLP login
test ran `set_index_nav('supervisees')`, which saves `preferences.device.last_index_nav`, so example's
home page now opens on Communicators by default.

---

## Fix status (2026-10-01)

Each fix: red test first, proposal adversarially reviewed (P1-P5, verdicts below), implemented,
then falsified by one mutation per fix (every mutation turned its test red; files restored).
Related suites pass (CaseloadController 2, persistence 163/172 with 0 fail, view-switcher 13,
Basic view landings 9, index Basic supporter login 4, Basic logs landing 5, big-button nested
open 6, classic-view supervisee landing 3). ESLint gate new=73; template lint clean.

| Finding | Fix | Review verdict, and what it changed |
|---|---|---|
| H1 | `modal-container.hbs`: branch for `confirm-view-style-change`. Browser: the dialog renders; confirming resolves `change_view` and closes. | SHIP-WITH-CHANGES: making it visible activates `board-actions.js`, which called `send` on its own component after the confirmation had replaced (destroyed) it. Fixed: services captured before asking, applied by a module-level `apply_view_style`; the orphaned action removed. Test reproduced the exact "send on destroyed" assertion first. |
| H2 | `supervision-settings.js` init: `inline || standalone` uses the passed `@model` (one line, anchor at 101 untouched). | SHIP. Worse than reported: with stale modal settings the page also ACTED on the other user. Optional follow-up not done: moving between two users' supervision pages reuses the component instance. |
| M2 | `caseload.js` (in place, anchor 468 untouched): a deep link clears the attention filter only when its communicator is not flagged. `routes/caseload.js resetController` clears `attentionOnly`. | SHIP-WITH-CHANGES: the only deep link comes from the Need Attention card, so an unconditional clear would switch the toggle off on almost every link; the real leak was `resetController`. |
| M3 | `serializers/user.js`: `supervisees` stays off the network payload; a plain copy (live objects and cycles left out) is added only for the offline local copy, via `localCopy: true` from `convert_model_to_json` (services/ and utils/ persistence). | SHIP-WITH-CHANGES: sending the list on every online save would regress payload size and data minimisation; also noted the badge cycle is now gone at its source (`badge_snapshot`), so the copy is defence in depth. |
| M5 | `app-state.js clear_user_state`: one `setProperties` line clears the Try marker and the three handoffs (line count unchanged). | SHIP: one caller (session invalidate), runs after the token is cleared, never mid-handoff. |
| M7 | All 13 locales: the 45 missing keys added to the 12 non-English files as `"*** <English>"` (what `i18n_generator.rb --merge` writes), and `choose_organization` added to all 13. 0 keys missing afterwards. | Data only, no review needed. |

Not done yet: H3 (font floor; a visual batch needing screenshots), M1 (needs approval to change
a committed test's specification), M4 / M6 / M8 (decisions), and the reviewer-confirmed Mediums
(each needs verifying first).

### Fix status, 2026-10-01 (continued)

- **M1 (8bf6cb246):** Basic org admin tabs and the org rail's Reports / Trainings / Settings rows
  are for `permissions.edit` only, on every org page (approved spec change to the committed test).
- **H3 (4229db37b):** 17 sub-14px declarations raised; hierarchy kept (View menu options 16px,
  org tab label 16px); three redundant restatements deleted. Found during H3, not fixed: the View
  menu runs off the right edge on a phone (pre-existing on this branch).
- **M4:** decision, both flags stay forced on (Traci). **M6:** resolved as intended. SLPs cannot
  keep `auto_open_speak_mode` (User#generate_defaults deletes it for non-communicators), so a Basic
  SLP landing on Communicators at sign-in matches the rule "speak mode only if the setting is on".
- **M8 + extension:** sRGB fallbacks for every use of color-mix / oklch / `in oklab` (branch and
  develop), via `_color-fallbacks.scss` (Sass recomputes the same colours). 37 + 34 sites:
  - plain declaration before the modern one where the value has no var();
  - `@supports not (color: color-mix(...))` blocks after the declaration where it mixes a runtime
    var(). A declaration containing var() is not dropped at parse time, so a preceding fallback
    would never apply (caught by the proposal review).
  - One site deliberately left: the folder badge colour, whose unset value inherits a more legible
    colour.
  Verified: the compiled CSS diff is additions only, so modern rendering is unchanged; Chrome
  evaluates both @supports conditions as intended; the hero fallbacks match Chrome's resolved
  colours to within one sRGB unit. Not verified on a real old browser.
