# 2026-09-28: Categories (board_category_grouping) IN PROGRESS, off for everyone

Request (Traci): keep the Categorize button on the board-detail edit page, but show a Coming Soon
marketing page instead of the controls; the feature must be off for everyone with no way to
turn it on (nothing in preferences, etc.). Label it IN PROGRESS, not retired.

## Fact sheet
- CONFIRMED every enable route is intersected with AVAILABLE_FRONTEND_FEATURES: default Setting,
  canary (defaults to ALL available), beta opt-in (defaults to ALL available), org features
  (`lib/system_feature_settings.rb`). So removal from BOTH lists is the only complete off switch.
- CONFIRMED the frontend flag comes only from the server (`lib/json_api/user.rb:94`,
  `services/app-state.js:2943`).
- CONFIRMED every grouping path checks the flag first (`board-detail-grid.js:108`,
  `controllers/user/board-detail.js:4400-4401`); a saved `preferences.board_category_grouping.enabled`
  is inert without it. No grouping control in `templates/user/preferences.hbs`.
- CONFIRMED the category panel's only opener is the edit-rail Categorize row.
- The header "Categories" quick toggle (`board-detail.hbs` ~1796) is `{{#unless edit_mode}}`
  and is a symbol-category filter, not this feature: untouched.

## Change
- `lib/feature_flags.rb`: flag out of AVAILABLE and ENABLED, IN PROGRESS notes in both.
- `spec/lib/feature_flags_spec.rb`: removed from the TEMPORARY inventory; the two tripwires now
  assert absence (spec changed at Traci's request), plus a new example: a stored default
  Setting that still lists the flag resolves OFF. Red 4 -> green 58.
- `templates/user/board-detail.hbs`: Categorize row un-gated; panel shows the real controls only
  with the flag, else `<BoardCategorizeComingSoon>`. Controls kept, not deleted.
- `components/board-categorize-coming-soon.hbs` + `.md-categorize-soon` styles in app.scss.
  Every pitch claim maps to wiring in the held-back panel (see the template's header note).
- Tests: `tests/integration/board-categorize-coming-soon-test.js` red 3 -> green 3; falsified
  by removing the button's click handler. `--filter categor` 108/108.

## Not done
- i18n keys (`categorize_soon_*`) merged into all 13 locales on 2026-09-28 (see
  `2026-09-28_reset-category-grouping.md`).
- Not rendered in a browser: the local Rails server 500s (missing `lib/saml_login_policy.rb`).
