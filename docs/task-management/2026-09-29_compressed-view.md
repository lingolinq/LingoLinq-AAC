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

## Next
- Piece 2: shell/navigation (narrower rail, no duplicate Home Page row, lighter glass).
- Piece 3: Modern home page structure and density tokens.
