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
- Round 1 added `.md-pillnav--org-tabs { width: fit-content }` so the bar hugged its pills inside
  `.ch-tabs-fit`; round 2 removed it again when the tabs moved into `.ll-appshell__navbar`, whose
  own `.md-pillnav` rule already sets `width: fit-content`. It is not in the final diff.
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

## Round 3: org tabs still lower than the home pill nav (Focused, 900px and below)

Reported: "the md-pill-nav for the org tabs is still positioned down from where it should be ... should be fixed in modern gentle and modern focused views".

- Measured as `lingolinq_admin` and `cedarvalleytherapy_manager_1`, direct load and click-through, at 1536/1440/1280/1100/1024/901/900/640/375. Above 900px both layouts already matched (86px). Gentle matched at every width.
- Focused at 900px and below: home pill nav 86, org tabs 116 (dropdown at 640 and below: 126 vs 156). Cause (CDP matched rules on `#content`): the nav slot is in the flow there, so `#content`'s top padding places it. The Focused home page gets `var(--topbar-height)` (16px) from `#within_ember:has(.page-footer) #content.index.with_user:has(.md-shell--layout-focused)`; org pages get the base `#within_ember #content` `calc(var(--topbar-height) + 3rem)` (46px).
- Fix (app.scss, beside the org-tabs clearance rules): Focused `#content:has(.ll-appshell--org-tabs)` takes `var(--topbar-height)`, and the Focused org-tabs shell padding goes 10 -> 40 so the title stays where it was.
- After: org tabs at 86 (or the dropdown at 126) in both layouts at every width, same as the home page. Titles unchanged (156 desktop; 342 at Focused 900; 376 at Focused 640 and 375).
- Not changed: the Organizations directory pill nav is still 30px lower than home in Focused at 900px and below (same cause, pre-existing, not asked).

## Round 4: pre-PR review (2026-11-09)

Rebased on develop (084552a6b); one conflict, both sides appending to `learnings-archive/2026-11.md`, kept both. One `/review-pr` pass (normal-PR tier after #1289), run on the preflight's `DIFF_FILE` (`REVIEWED=range origin/develop (084552a6b...) ... HEAD (c43adf870...)`).

- **High, confirmed and fixed.** The Gentle zeroing rule's added `:not()` exclusions made it two classes heavier, so page rules that give clearance back on top of it lost. Measured against develop (8187) with the manager account, 9 pages x 4 widths per layout: Goals and Recordings shell padding 30px -> 0 at 1440/1024, Stats 52px -> 0 at 900/640. Fix: exclusions in `:where()` (no weight), also on the two `_focused-view.scss` org rules. After: all 36 rows identical to develop in Gentle and in Focused; org tabs and titles unchanged at every width.
- **Medium, fixed.** `homeBoardName` cached the name beside the record, so a rename while the rail was up did not reach the row. Now `homeBoardRecord` plus a name read through it. Red test first (rename), plus two tests on the fetch (once per key; a failure leaves the slug and is not retried); both mutation-checked red (guard removed, arrival tick removed).
- **Medium, checked and not changed.** People-page pills for non-editors: the page body is gated on `permissions.edit` (people.hbs:1), and `showSectionPillNav` is false only on a route mapped to a primary pill (the Rooms list), so editors always get the tabs there. `showOrgNav` in Basic: read only inside `{{#if this.showGlobalChrome}}` (application.hbs:1607), which Basic never passes.
- **Low, fixed.** Stale comments on the org-tabs clearance rules; the task log and learnings claimed a `width: fit-content` rule that round 2 removed.
- **Not done.** Template rendering tests for the rail rows and `OrgTabs`; full board fetch for a name (the home board is normally already in the store); distinct landmark names for the rail and the tabs (Basic has the same pair).

## Round 5: Organizations directory, Focused at 900px and below (2026-11-09)

Requested: "fix the organizations focused at 900px to match the home page menu position". Same cause as round 3 (`#content` base `+ 3rem` vs the Focused home page's `var(--topbar-height)`). The directory joins the org-tabs `#content` rule (`:has(.ll-appshell--org-tabs, .md-shell--org-directory)`, weight unchanged) and its Focused shell clearance takes the 30px (50 -> 80). Measured: directory nav 86 at 900 (was 116), dropdown 126 at 640/375 (was 156); title unchanged (156 desktop, 382 at 900, 416 at 640/375); Gentle unchanged.

## Round 6: Basic home board name, and position tests (2026-11-09)

- Basic's left menu showed the full key (`username/slug`). Two copies of the row: `dashboard/classic-view.hbs` (the Basic home page draws its own menu) and `dashboard/classic-rail.hbs` (Organizations, board picker, system settings). The name lookup moved from `account-rail.js` into `components/home-board-name.js`, used by all three. Verified as `lingolinq_admin` in Basic: "Vocal Flair 84" on the home page and on /organizations; Modern unchanged. Rail tests moved with the logic unchanged; two rendering tests added.
- Position tests: `e2e/menu-positions.spec.js` (Playwright, local only, as the repo's e2e rule says) with synthetic users from `e2e/support/users-org-nav.rb`. 12 tests: the menu on the Organizations page and org pages at the home page's height, titles below it, at 1440/900/640 in both layouts; Goals/Recordings/Stats content-area tops pinned (those pages have no top menu). Results: branch 12/12; develop 6 failed (exactly the menu bugs this branch fixes) and 6 passed (the pins); the review's regression re-applied on the branch failed the 3 Gentle pins (goals 76 -> 46, stats 206 -> 154 and 250 -> 198).
