# 2026-09-28: Modern -> Basic landings for Boards and Updates; Basic Focused Rooms top gap

## 1. View-switch landings (Traci)
"boards page -> basic view home page with boards active; updates page (logs) -> basic view home
page with Updates active".

Facts:
- CONFIRMED `utils/basic_landing.js` owns the map; `components/view-switcher.js#_apply_view` is
  its only caller.
- CONFIRMED the Basic home tab is `index_nav_state` or `preferences.device.last_index_nav`
  (`dashboard/authenticated-view.js` `index_nav`), and `set_index_nav` SAVES only main /
  supervisees / supervisors. Boards and Updates cannot ride on the preference.
- CONFIRMED Updates = `user.logs`/`user.log` with `?nav=home` (`utils/primary_nav.js`
  `hasHomeNavParam`); plain `user.logs` is Basic's own Logs page and stays put.
- CONFIRMED the Updates tab is hidden for modeling-only accounts, Communicators also for
  non-supporters (`classic-view.hbs` `ch-tabs`).

Change: map `user.boards` -> index/boards and the Updates arrival -> index/updates;
the tab travels by a one-shot handoff (`hand_off_index_nav` / `take_pending_index_nav`,
`appState.pending_index_nav`) taken by `dashboard/classic-view.js` in `init` (shown before first
render) and applied through `set_index_nav` on insert (click side effects: Communicators saved,
Updates marks read, Boards collapses the rail). The caseload landing now uses the same path
instead of the switcher writing the preference itself.
Spec changes at Traci's request: `user.boards` left the "stays put" list; the allowed-tab list
now names the home page's tabs. Red 4 -> green; 42/42 on the landing/classic/switcher filter;
falsified by disabling the Updates match.

## 2. Basic Focused Rooms: no top margin/padding on the workspace (Traci, screenshot)
- CONFIRMED both 40px values come from the base `.md-workspace` (`!important`, app.scss ~46822);
  the Basic org-detail rule (`_classic-home.scss` ~4561) sets neither.
- The rooms template has no root element and its content differs by branch and loading state,
  so the hook is a route class: `controllers/organization.js#roomsPageActive` ->
  `md-shell--org-rooms` on `templates/organization.hbs`.
- Rule scoped: Basic + Focused + Rooms list + >1024px ("full-sized screen"). Test red 3 -> green 3.

## Notes
- eslint-todo gate: 73 "new" findings repo-wide, none in the files changed here (direct eslint on
  them is clean). `controllers/organization.js` no-runloop was already unmatched: baseline says
  line 53, the finding sat at 222 before this edit.
- Not browser-verified: local Rails 500s (missing lib/saml_login_policy.rb).

## 3. Basic Rooms: no admin tabs for a view-only visitor (Traci, screenshot)
- CONFIRMED view-only = `permissions.view` without `edit` (supervisor, public viewer, manager
  with org_access off: app/models/organization.rb:42-48); rooms.js already reads it as `canEditOrg`.
- `controllers/organization.js#showBasicOrgTabs` = not (Rooms list and no edit). Nested INSIDE
  the Basic `{{#if isClassic}}` in templates/organization.hbs: adding it to that `#if` would fall
  through to `{{else if showSectionPillNav}}` and draw Modern's strip in Basic.
- Test red 2 -> green 5/5; found my own helper used `owner.lookup` (cached singleton), which made
  the earlier route loop pass vacuously; fixed to `factoryFor().create()`. Falsified both
  computeds (prefix match; constant true).
