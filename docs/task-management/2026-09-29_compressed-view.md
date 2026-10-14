# 2026-09-29: Compressed View (density preference), Modern home page first

Branch: `traci/feat/compressed-view`, stacked on `traci/styling/classic-view-overlay` (`34bd00866`).

Request (Traci): a "Compressed View" toggle preference in the View dropdown, shown as a switch. When
on, the app shell and pages get tighter styles AND a changed page structure, starting with the Modern
home page. Board pages (board-alt, board-detail) are never compressed and must not be touched.
Decisions (Traci, 2026-09-29): stack on the overlay branch; flag TEMPORARILY forced on (preference
defaults off); navigation changes apply everywhere the shell shows; home layout "heading + toolbar".
Design brief: the pasted review (duplicate navigation, oversized Caseload hero, tall Attention card,
Create/Edit as toolbar actions, compact Rooms, lighter glass inside the shell; first screen shows the
title, the attention list, the main actions and the start of Rooms).

## Fact sheet (piece 1: setting plumbing)

- Board pages are outside the shell: `CHROME_ROUTES` (`controllers/application.js:6-12`) has no board
  route, and every home card is scoped under `.md-grid--dashboard`, which only the home dashboard
  renders. CONFIRMED (Explore map + grep).
- The View menu is `components/view-switcher.{js,hbs}`, mounted in `app-navbar-authenticated-inner.hbs:57`
  and `application.hbs` (not on board-alt). Style radios write `sessionUser.preferences.dashboard_layout`.
- Preferences: `User::PREFERENCE_PARAMS` allowlist; `lib/json_api/user.rb` serializes every allowed key;
  a `preference_defaults` entry would be backfilled onto every user on their next save, so none is set.
- Observers must watch RAW paths (comment on `sync_view_scope`, `services/app-state.js`): an observer on
  a computed only fires once something consumes the computed.
- Font floor: `$aac-font-size-xs/sm` = 14px (`_variables.scss:403-409`); compact passes cut spacing and
  sizes of non-text elements, not text below the floors.
- ESLint gate is line-anchored. New code in `app.js` and `app-state.js` is placed below each file's
  last baseline finding (995 and 5408) so no grandfathered finding shifts. The clean HEAD of this
  branch already reports new=73 (all in overlay-branch files: `dashboard/authenticated-view.js`,
  `create-board-new.js`, `controllers/application.js`, `user-select.js`); this work adds 0.

## Piece 1: done
- Flag `compressed_view` in AVAILABLE and TEMPORARY in ENABLED (`lib/feature_flags.rb`); inventory
  updated in `spec/lib/feature_flags_spec.rb`.
- Preference `compressed_view`: allowlisted, coerced to a boolean in `sanitize_dashboard_preferences!`,
  no server default.
- `utils/compressed_view_state.js#compressedViewActive(flag, pref)`: exact `true` for both.
- `LingoLinq.set_density_scope` (`app.js`, end of file) and `sync_density_scope` (`app-state.js`, last
  property) put `body.ll-density-compressed` on the page; off with no session user.
- View menu: a "Density" group with a `menuitemcheckbox` "Compressed View" row reusing the
  `nb-toggle__switch` visual; stays open on toggle. i18n: 3 keys in all 13 locales (added by hand in
  the generator's format: `i18n_generator.rb --generate` is blocked on this branch by a pre-existing
  duplicate, `subscription` in `routes/user/subscription.js`).
- A first-frame localStorage mirror was built and then removed: the shell and home page only render
  after the user record (which carries the preference) loads.
- Capability ledger: `eu-under16-ai-block` re-pointed to `lib/feature_flags.rb:314` after the flag lines
  shifted it; register regenerated; `regenerate-register.sh --check` green.

Verification: RSpec 4 (preference) + 41 (flags) green, red first. Ember: 15 across utility, switcher
and app-state density tests; falsified (flag ignored in the util, menu closed on toggle, flag
dependency dropped from the observer, flag ignored in the observer) each red, restored.

## Pieces 2 and 3: structure and density (done)

Structure (template/JS, all driven by `app-state#compressed_view_active`):
- Rail: the Home Page row is not rendered (it duplicates the Dashboard pill).
- Home tab: a `md-compact-head` row (Dashboard title, communicator count, Open My Caseload, and
  Create a Board / Edit Dashboard as toolbar buttons) replaces the greeting hero; the Caseload,
  Create a Board and Edit Dashboard cards leave the grid through `_compressVisibility` on the
  visibility map, so the shared layout engine reflows the rest; Need Attention shows 4 rows and
  "View all communicators"; the Need Attention and Rooms illustrations are not rendered.

Styles (Rule #0.7): the ORIGINAL rules now read density tokens with today's value as the fallback
(`var(--dn-*, <old>)`, 33 lines in app.scss and _focused-view.scss, line-for-line, `!important`
kept where it was). `_compressed-view.scss` only sets the tokens: shell tokens on
`body.ll-density-compressed` (rail row gaps, pill-nav band padding), home tokens on
`.md-shell--home` only (main padding, grid gap, card padding and 18px titles, attention rows with
no nested blur and a light shadow, 32px avatars, room tiles). Governing-rule map (Gentle and
Focused, per property) from an Explore pass; every edited line was asserted before the edit.

Browser check (Puppeteer, dev `example` account switched to Modern and restored to Basic; 1440x900):
- The switch works end to end (body class, `aria-checked`, off restores everything).
- Tried and reverted after measuring: a 184px rail wrapped "Subscription" and the Home Board row
  mid-word (kept 208px); a reduced `--ll-nav-clearance` did nothing on home (it pads
  `.ll-appshell__content`, which is 0 there) and the heading row sat 16px under the fixed pill band.
  Fixed with `--dn-main-pad-top: 36px` (band ends at y=130, heading at y=142; Focused at y=176).
- NOT verified in a browser: Need Attention and Rooms (the dev account has neither).

Open question for Traci: in Focused, an ADMIN's Speak card is shown only as a pair with My
Caseload (`dashboard_sections.js:545-546`, orgPair). Compressed View removes the Caseload card, so
Speak drops too, the same as today when an admin hides My Caseload in Edit Dashboard.

Verification: Ember 115/115 on the dashboard/layout/rail/switcher/compressed filter; new
`dashboard-compressed-home-test.js` falsified (caseload-only hide, 99-row cap) red, restored.
ESLint gate new=73 (the branch's pre-existing count, unchanged); template lint clean; build OK and
the compiled `var()` fallbacks match the old values.

## Decision (Traci, 2026-09-29): no Dashboard Design in Compressed View
Edit Dashboard (heading row) and the navbar's Display Style disc and drawer item are not shown in
Compressed View, and no other entry point is added: "in compressed view, they won't need to
rearrange their home page". Compressed View has a fixed home layout by design; this is not a gap.
The DisplayStyle component stays mounted (`@triggerless`) only so its opener keeps working for
callers outside Compressed View.

## Later requests (2026-09-29), all browser-checked in Gentle and Focused
- Count chips (Need Attention, Rooms, My Organizations, every view): slim tinted chip, navy digits
  (5.65:1 on Focused's #AEB9C9 band, 10.41:1 on white); Focused near-white (~11:1).
- Need Attention card in Compressed View: Gentle takes the My Caseload card-as-button glass
  (`:root --md-caseload-glass-bg`, now also read by that card); Focused takes the caseload hero's
  oklab navy radial (`--dn-attention-bg-focused`, from the $focus-hero-* tokens). The slate mixin
  gained an optional `$bg-token` (null by default; compiled CSS diffed, other callers identical).
  First attempt gave Focused the Gentle glass; corrected at Traci's request.
- Create a Board moved from the heading row to the top of the account rail as "Create Board"
  (Compressed View only; `createBoard` in account-rail.js, purchase check then create-board-new).
- Open My Caseload: removed, then restored at Traci's request, dressed as each view's caseload
  button: Gentle glass + halo (`--md-caseload-glass-shadow`, now also read by the card), Focused
  the hero material via `ch-focused-hero-tile($focus-hero-center, $focus-hero-edge)`.
- Need Attention rows are visible in the browser only by injecting fake flagged supervisees
  client-side (never saved); no dev account has real ones.

## Reverted (2026-09-29, Traci): the Compact SLP dashboard pass (8fa8e4db1)
Reverted in full at Traci's request: no More dropdown; Create Board stays in the rail (it is there
on purpose); no communicator count on the Open My Caseload button. Kept from before that pass: the
count as plain text beside the title. New: Open My Caseload is right-aligned in the heading row
(a sibling of the title group; `.md-compact-head` is space-between). Browser-checked at 1180, 1024
and 820 wide in both styles: flush right, no horizontal scroll, rail Account / Create Board / Goals.
