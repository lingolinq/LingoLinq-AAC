# 2026-11-08: Modern org pages get the org tabs and a side menu

Request (Traci): "the organization page in modern view loses its left menu and it needs to have the
same submenu that basic view has (just styled like modern view is). So, modern view needs the
Admin/Managers/Supervisors/Communicators/Evals/Symbols top menu along with their own side menu on
the organization page."

## Cause (verified)

- Side menu: Modern's rail (`AccountRail`) is mounted only by the app shell, and
  `controllers/application.js#showGlobalChrome` excluded every `organization.*` route except a
  rooms-only supervisor's Rooms list.
- Tabs: the six tabs in `templates/organization.hbs` sat inside `{{#if this.isClassic}}`; Modern
  fell through to the two-item "< Home | <section>" strip.

## Change

- `showGlobalChrome`: every `organization.*` page is chrome in Modern (Basic still returns false
  first). The pill nav is unchanged (`showPillNav` follows `globalNavActive`).
- `globalChromeOrg` hands the org to the rail; `AccountRail` gains `orgNav` (org editors only,
  `permissions.edit`), swapping its account rows for `AccountRailOrgRows`: the same rows, order and
  gates as Basic's org rail (Admin Actions, Organizations, Reports, Telemetry, Rooms, Trainings,
  Settings, Billing Details), in Modern row markup. Non-editors keep the account rail.
- Org tabs: one copy of the markup for both views, base classes swapped
  (`orgTabsNavClass`/`orgTabClass`, as `UserPillNav` does). `showOrgTabs` (editors; in Modern only
  where the app shell drew no pill nav) and `showBackStrip` (Modern non-editors).
- `{{fit-or-select}}` and its CSS accept `.md-pillnav` as the strip as well as `.ch-tabs`.
- `.md-pillnav--org-tabs { width: fit-content }` so the bar hugs its pills inside `.ch-tabs-fit`.
- People page: Modern's in-page section pills removed (the org strip now carries them in Modern,
  as it already did in Basic).

## Verification

- Probe (scratch Puppeteer, local seed data, worktree build on :8186) at 1440/1100/900/375 on the
  org index, people (supervisors), rooms and reports: manager gets the org rail with the right row
  lit and the six tabs with the right tab lit, dropdown at 375, no horizontal scroll, no second
  pill nav. Room supervisor (not an editor): account rail plus the back strip, no tabs. Basic
  (preference flipped in memory only, not saved): `ch-` rail and tabs unchanged, no Modern rail.
- Tests: `tests/unit/controllers/organization-modern-nav-test.js`,
  `tests/unit/components/account-rail-org-mode-test.js`. With the app changes stashed, 11 of 13
  fail; the 2 that pass are guards that must hold before and after (Basic never gets the shell
  rail; a manager never gets the app pill nav). Targeted run of rail/org/fit-or-select/primary-nav
  modules: 118/118. `lint:js:ci` new=0; template lint clean.
- Process note: the code was written before the tests (not red-first); the mutation run above
  stands in for the red step.

## Left open

- `orgTabLabel` falls back to "Admin", so on Rooms/Reports/Settings (no tab active) the narrow-screen
  tabs dropdown reads "Admin" in both views. Pre-existing in Basic; not changed.
- `organization/people.js` `pick` action and the `.md-pillnav--org-sub` CSS have no caller now.
  Not removed: deleting `pick` shifts a line-anchored `.eslint-todo` row in that file.
- The Modern org index's own tools section (`org-admin-links` `basic` flag) still lists Admin
  Actions / Telemetry, which the rail now also carries.
