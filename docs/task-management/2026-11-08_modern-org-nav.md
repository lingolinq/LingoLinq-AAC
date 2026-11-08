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

## Round 2 (same day): positions, rail order, home board name

Requests: the Organizations directory title was under the nav in Modern Gentle; the org tabs must
sit where the home pill nav sits in Gentle and Focused; the org rail alphabetized; the Home Board
row shows the board's name, not its key.

- Directory title (pre-existing on develop, measured on :8184): the gentle zeroing rule
  (`#content:has(.ll-appshell):not(:has(.md-main--updates-arrival)) .ll-appshell .md-shell`, 1,5,1)
  outweighed the directory's own 70px rule (1,4,1), so the shell had 0 padding and the title sat
  at 114 under a nav ending at 128. The zeroing rule now skips the directory; the directory value
  was stale (worked out when gentle `#content` padded 26px) and is now 42, landing the title at
  156, the same as Focused.
- Org tabs: extracted to `components/org-tabs.hbs`. Basic mounts it in the org page; Modern mounts
  it in the app shell's `.ll-appshell__navbar` slot (`showOrgNav`/`showNavbar`), where every rule
  that positions the home pill nav applies. It wears the `--primary` hooks in Modern, so it
  collapses at 640px to the same dropdown position; the 12px navbar rule now matches the dropdown
  at any depth. The Focused org rules (`#content` 26px, shell 0, written for org pages with no
  nav) skip pages under the tabs (`ll-appshell--org-tabs`), and a rule beside the directory's gives
  those pages their clearance (Gentle 30px, Focused 10px: title at 156).
- Measured (1440/1100/900/641/640/600/460/375, both layouts): the org tabs or their dropdown sit at
  exactly the directory's pill-nav position at every width, and the home page's at every width
  except Focused <=900, where the home page alone is 30px higher (an existing home-only rule).
  The org title is at 156 at desktop, the directory's value.
- Rail: org rows alphabetical (Home Page stays first). Home Board row: `homeBoardName` reads the
  board record (peek by id, then key; fetched once), falling back to the key's slug. Verified:
  "Vocal Flair 84", "Crisis Vocabulary".
- Tests: 4 new (all red with this round's app changes stashed). Targeted run 122/122;
  `lint:js:ci` new=0; template lint clean.
- Process note: probes initially read the layout before the user record hydrated (a Gentle
  reading on a Focused account); measurements since set the layout in memory first. Loading `/`
  resumes the last org page (develop too), so `/<user>/home` is the home baseline.
