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

## Round 7: red-team review (2026-11-09)

`/adversary-review` on the whole branch at `a511ed232` (second and last review round). No Critical or High. Acted on:

- **Medium 1, confirmed, fixed.** The round-5 Focused `#content` rule matched Basic's directory too (same `.md-shell--org-directory` class), moving Basic's rail from 94 to 84 (padding 26 -> 16) on /organizations in Basic Focused. The directory now counts only inside `:where(.ll-appshell)` (Modern), weight unchanged. Measured as `e2e_orgnav_basic`: rail 94 (138 at 640) on home, /organizations and an org page, identical to develop.
- **Medium 2, decided by Traci: option (a).** `HomeBoardName` no longer fetches. A fetch went through `persistence` and cached the whole board and its images offline and stashed it in recent boards, for every communicator a Modern supervisor browsed. Now it reads loaded boards only (by id, else key, over the store's live list, so a board that loads later names the row) and otherwise shows the slug. The dead `preferences.home_board.name` fallback is gone (the server never writes it). The two fetch tests were replaced by "never fetches" and "loads later" (the specification changed, on Traci's decision).
- **Medium 3, not reproduced.** `classic-rail` modules 21/21 in timing-strict mode with `probeDelay=1500`; moot now that nothing is fetched.
- **Low 4, fixed.** `globalChromeOrg` counts the org only when the router's rendered `currentRoute` has an `organization` `:id` matching the model, so the previous org's tabs and rows never show while another org loads or after it fails. Unit tests for both cases; the test router stub gained a `currentRoute` (defaulting to the model's org, so existing assertions are unchanged).
- **Low 5, fixed.** Rendering tests for the org rows' gates and order (manager, editor without management, site admin on the admin org, telemetry beta, active row). The e2e now requires the org tabs (not just any menu) in the slot, and adds a Basic Focused manager (rail height equal across home, /organizations and an org page) and an org supervisor who cannot edit (no tabs, account menu).
- Mutation checks: id match removed, live-list dependency removed plus a fetch added, Billing gate loosened: every new test went red; restored.

## Round 8: small screens, label, leftover CSS (2026-11-09)

- Removed `.md-pillnav--org-sub` (no caller left). The people controller's `pick` action is also unused, but removing it shifts the line-anchored `.eslint-todo` row for that file (296 -> 291) and the gate reports it as new; restored pending Traci's approval to move that row.
- Reported: "on small screens, the org page header is pushed way down low". At 900px and below the nav and the rail's dropdown are in the flow, yet the org pages kept the desktop clearance (Focused shell 40 + Focused workspace 52, Gentle shared 52px push): title 152px (Focused) and 112px (Gentle) under the dropdown, vs 20 + 20 on home. The directory had the same, already on develop. Fix: at <=900px the org-tabs and directory shells and their Focused workspaces take 0, and the shared Gentle 52px rule excludes them in `:where()`. After: Gentle directory title 230 at 860 (= home), org titles 60 under the dropdown in both layouts; above 900px unchanged (e2e 15/15 on the old spec), Basic unchanged.
- E2E: at 900 and 640, both titles must start within 60px of the dropdown. With the <=900 block removed they read 90-152 and fail.
- Requested: the dropdown reads "Organization Navigation". `menuName` now uses the existing `org_navigation` key (was Basic's `classic_org_rail_aria`, sentence case); the two unit assertions on the label moved to the new key at Traci's request.

## Round 9: red-team review of rounds 8 (2026-11-09), pick removal, landmark name

Traci approved moving the `.eslint-todo` row for `controllers/organization/people.js` (296 -> 291) so `pick` could go; gate new=0, the row matches eslint's output for the file exactly. Third review round, run at Traci's direct request (the rule says a third needs Scot's OK; flagged to her).

- **Medium, fixed.** Non-editor org members (no tabs, `ll-appshell--no-nav`) still got Gentle's 52px push and Focused's 52px workspace padding at <=900px. Both now zeroed for `.ll-appshell--no-nav .md-shell--org`; the shared 52px rule excludes them in `:where()`. The rooms-only supervisor's Rooms list (pill nav, no tabs) is untouched. Their first element is the "< Home | section" back strip, which a generic `@media (max-width: 640px) .md-workspace > .md-pillnav { margin-top: 48px }` rule still pushed 48px down; that rule now excludes the org back strip in the app shell (`:where()`). Measured: strip 20px under the dropdown at 900 and 640.
- **Low, fixed.** Focused Rooms label under the org tabs kept its 78px margin at <=900 (98px under the dropdown); 20px there now (_focused-view.scss, beside the 78px rule).
- **Low, fixed.** e2e small-screen checks now bound both ways (0 <= gap <= 60) and cover the Rooms page heading and the non-editor (back strip, then title under it).
- **Low, fixed.** `people.js` comment no longer describes `pick` as live (line count kept, so the baseline row stays aligned).
- **Landmark names, Traci's call: changed.** The org tabs (`OrgTabs`, both views) are named "Organization Sections" for screen readers (new key `org_sections`, added by hand to all 13 locales in the generator's format: English in en.json, `*** ` placeholder elsewhere; not `--generate`, which rebuilds en.json wholesale). The rail stays "Organization Navigation". New rendering test `tests/integration/org-tabs-test.js` (order, names differ, active tab).

## Round 10: Basic speak mode, Home (2026-11-09)

Reported: "in the basic view, when you're in speak mode and press the home button, instead of going to your home board, it exits and goes to the site home page". Reproduced on this branch AND develop as `example` (saved Basic for the test, restored after) and as a synthetic communicator: Home on the home board in speak mode -> speak off, `/example/home`.

- Cause (CONFIRMED): templates/application.hbs speak header. Inside `{{#if (and speak_mode currentBoardState.id)}}`, the `{{else if this.on_board_or_alt}}` branch (since 2026-05-23, replacing a board-picker modal) rendered the house icon but ran `openMyBoards` (aria-label "My Boards") -> `user.boards`, which in Basic lands on the dashboard. Basic boards are `user.board-alt.index`, so on every Basic board page in speak mode the header Home was My Boards; the plain `home` branch below was unreachable there. Modern's board page has its own header (`{{#unless this.on_board_detail}}`). Switch/keyboard selection (utils/raw_events.js `home_button`) already chose `home` for the house icon, so touch and switch users diverged.
- Decision (Traci): Home only; no My Boards in Basic's speak header (it stays in the account menu outside speak mode). The communicator board tour already promises "Home always brings you back to your main board".
- Fix: that branch now runs `home`, with the plain button's dimming and lock marks and the eval button's house icon. Same 23 lines, so the 38 line-anchored .lint-todo rows below it stay aligned (template lint clean). `openMyBoards` stays: Modern's board-detail and raw_events still use it.
- Test: e2e/basic-speak-home.spec.js with a synthetic Basic communicator (e2e/support/users-basic-speak.rb: home board with a folder). Red before the fix (board null after Home, both cases), green after.

## Round 11: System Settings styling (2026-11-09)

Reported (Basic, screenshot): "the system settings page needs our modern style updates -> it starts too far down on the page and the header and subheader styles don't match the other pages and the status badges need modern style updates".

- Cause: the page used the public pricing/support page's marketing hero: `la-section` (32px padding plus a 57.6px margin) around `la-hero-title` (Maitree 35px) and `la-pricing-hero-subtitle` (Lexend 24px, two lines), so the title sat at 197 and the form card at 384 (1440 wide, Basic). Status tags were Bootstrap's solid `.label` (grey "Default").
- Fix: the header is the app's `md-hero` (as templates/organizations.hbs); the section takes its own spacing (`.la-system-settings__section`) instead of `la-section`. New `.md-status-tag` (neutral, `--info`, `--warning`) after the informational-tag note in app.scss replaces the five `.label`s in emails.hbs and features.hbs. After: title at 135, card at 257, Maitree 32 / 20px subtitle like the other pages; both views checked (admin's saved view restored to Basic).
- Not changed: in Modern this page still has no app shell (no rail or pill nav); the table's small text is pre-existing.

## Round 12: System Settings, Modern menus, 14px text, modern controls (2026-11-09)

Requested: "modern -> add the menus like the other app pages. make the table text font size 14px", then "the features page checkmarks are the old bootstrap styles/colors ... update the full features page ... including the category dropdowns and select lists".

- Menus: the System Settings routes join CHROME_ROUTES (application.js; on one existing line, so the 23 line-anchored .eslint-todo rows stay aligned). No pill maps to it, so it gets the rail without the pill nav, as Goals does. The page was the public site's `la-wrapper` (fixed, full-screen, z-index 999), which covered the rail; it is now `.md-shell.md-shell--system-settings > .md-workspace`, the structure of templates/organizations.hbs. Basic: `.md-shell--system-settings` joins the directory's row/column/side rules in _classic-home.scss; the four `.la-system-settings .la-main` rules are gone. A first try split `.la-wrapper` to skip the app shell; reverted when the page stopped using it.
- Measured: Modern workspace at 116 (same as Goals, Focused 1440) with the rail; Basic rail and workspace identical to Organizations at 1440/900/700 (94/106, 94/194, 138/238).
- Text: the page's `rem` sizes were 10px (1rem = 10px here); now 14px (16px feature names, 18px variables heading).
- Controls: `.la-system-settings__body` added to the existing modern rules for `.form-control`, `select.form-control` (chevron) and checkboxes in app.scss (the preferences form's); env-locked checkboxes get a disabled look; Save/Preview/Reset are `md-btn md-btn--primary` / `md-btn--ghost`.
- Test: tests/integration/system-settings-basic-rail-test.js checked `.la-main > .ch-rail`; pointed at `.md-shell--system-settings > .ch-rail` with Traci's approval (same two assertions). 15/15.

## Round 13: System Settings dropdowns, grouped features, org list on refresh (2026-11-09)

Requested: "the select dropdown list is still the old bootstrap - update it to our modern select styles"; "sort the features into their categories on the page, so they are not just showing in some random list"; "create professional groupings".

- Dropdowns: a native <select> draws its open list itself, so CSS cannot style it. The Organization select and both Category selects are now `<ModernSelect>` (the app's own listbox, used in 14 places). Org groups become heading rows (`scopeSelectContent` in controllers/system-settings.js). Category options key on `name` (was `label`, changed in place). "All categories" is id `'all'` (was `''`, which ModernSelect shows as an italic placeholder); the filter treats `'all'` as no filter. Edits in features.js kept its line count (baseline rows at 82 and 164); the new import shares an existing line and `featureGroups` sits at the end.
- Groupings: utils/system_feature_groups.js maps the server's ~20 categories (lib/system_feature_registry.rb) into 7 sections, in order: Communication & Boards; Clinical & Reporting; Accounts & Organizations; Billing & Compliance; AI & Integrations; Interface & Accessibility; Other (also any unlisted category). Sorted by name inside. The Category filter now picks a section, matching the headings. Measured: 34/9/8/6/9/3/9 features. Unit tests (3). 8 new i18n keys in all 13 locales (en text, `*** ` placeholders elsewhere).
- Org list empty on a direct load or refresh: CONFIRMED on develop (native select: 0 options on a direct load, 7 after in-app navigation). The controller loaded the list once, at creation, from an unhydrated `app_state.currentUser`. Now the route's `setupController` loads it on every visit for the user `beforeModel` fetched. Red/green route unit test. After: 7 orgs under "Organizations" on a direct load.

## Round 14: System Settings background at narrow widths (2026-11-09)

Reported (Modern, narrow): "the main page bg doesn't extend all the way up to the menu so the page backgrounds look broken". At 860 the page's `.md-shell` painted the mesh from y=174 (below the rail's dropdown) while `#content` stayed flat `var(--md-bg)` above it. Goals avoids this with `#content:has(.md-shell--user)` (mesh on #content, fixed) plus `.md-shell.md-shell--user` transparent; `.md-shell--system-settings` joins both selector lists. After: #content carries the mesh, shell transparent, no seam.

Also checked (read-only, local DB): `lingolinq_admin` and `marcus_williams_slp` are two accounts with the same display name "Marcus Williams". `lingolinq_admin` manages the LingoLinq Admin Organization (`admin: true`), so its Organizations pages are expected; `marcus_williams_slp` is the SLP (org and room supervisor links, no manager link).

## Round 15: Preferences settings full width on small screens (2026-11-09)

Reported: "on smaller screens, the voice dropdown disappears, and the voice volume and secondary voice content should stretch to fill the full width of the card", then "all settings items share the same problem".

- Measured as marcus_williams_slp at 700: card 32-668, Voice select at x=662 and volume picker at 701 (outside the card); the content column 374px of 636.
- Two causes, one rule block (app.scss `.md-preferences__form`): `.col-sm-5, .col-sm-6 { width: 60% !important }` and `.col-sm-2/3:not(.control-label) { width: auto; min-width: 200px }` applied at every width; and content columns without `col-xs-12` do not float under 768px, so a flex row inside them (BFC) was squeezed to zero width beside the label's full-width float and overflowed right.
- Fix: the two width rules apply at min-width 768px only; below 768px every direct `col-*` child of a settings `.form-group` floats at 100%. One rule for every card (a first pass added `col-xs-12` to the Voice card's columns; reverted in favour of this). After: 1440/900/768 identical to before; at 767/700/500/375 the voice column spans the card (e.g. 624 of 636 at 700), select and volume inside it; Sidebar and Shortcuts full width.

## Round 16: red-team review of eccbf46c0 (2026-11-10)

Verdict BLOCK, on two red CI checks this branch caused, both missed locally:
- **High, CI "Lint Ember JS":** the ModernSelect swap left `setOrgId` with no caller (`lingolinq/no-orphaned-action`). The local gate said new=0 because the worktree's `node_modules` symlinks to the main checkout, so the file-dependency plugin `eslint-plugin-lingolinq` read the MAIN checkout's templates. Fixed by a real `@action` (`chooseOrg` -> `send('setOrgId', id)`; `{{mut}}` was never called by the classic component). Verified with an ESLint API run passing the worktree's plugin (scratchpad orphan-check.cjs): no new orphaned actions; removing the send line flags setOrgId at :224, as CI did.
- **rspec `spec/templates/dashboard_account_pill_spec.rb:63`** (red since the first commit): it pins one account-rail mount by finding the rail's opening tag in templates, and `AccountRailOrgRows` began with it. Renamed the component `OrgRailRows` (spec unchanged); the explanatory comment avoids the tag text too. Ran the template specs FROM THE WORKTREE (a temporary `.env` symlink, removed after; a run from the main checkout reads the main checkout's templates via Rails.root): 21/21.
- Medium, fixed: features and emails loads drop a response for a scope that is no longer selected (same-line guard; features.js baseline rows stay aligned); red/green unit test.
- Medium, fixed: ModernSelect's trigger `aria-label` replaced its text, so the selection was never announced; it is now "<label>, <value>" (`accessibleName`, appended at the end of modern-select.js). Org list `@searchable` (new key `system_settings_search_orgs`, 13 locales).
- Medium, fixed: the speak Home fix has a CI test now: spec/templates/speak_header_home_button_spec.rb (green here, red on develop's template); e2e also asserts the route.
- Low, fixed: `<main>` landmark restored on System Settings; `.md-btn:disabled` style; stale comments (`''` option, `on_board_or_alt`).
- Not changed: Preferences Cancel-first order is Traci's request (Edit Profile still puts Save first); a confirm on Cancel is a separate decision. `utils/raw_events.js` `openMyBoards` branch is dead for the speak header but harmless.

## Round 17: Basic dashboard section menu (2026-11-10)

Reported: "on basic view, our select dropdown is not styled with our modern styles" (the <=550px Actions / Communicators / Boards / Updates switcher, components/dashboard/classic-view.hbs). It was a native <select> on purpose (its comment: platform picker, keyboard and screen-reader semantics, for switch-scanning and eye-gaze users); a native select's open list cannot be styled. Traci chose the Modern pill dropdown.

- A <details> version with button options failed template lint `no-nested-interactive` (buttons inside <details>); the section options act rather than navigate (no URL or query param for them), so not LinkTo. Built as a disclosure instead: a toggle <button aria-expanded aria-controls> and a list rendered only while open (nothing hidden stays focusable or scannable), closing on a choice, on Escape (focus back to the toggle) and on focus leaving it. Styled by the shared `.md-pillnav-dropdown*` rules (`.is-open` variant). `.ch-tabselect` is now only the show-below-550px hook (75% centred, and `position: relative` as the list's anchor, which the shared rule skips for `--fit`); its select-only styling and the Focused recolour went with the select. `handleTabSelect` removed.
- Verified at 500 as lingolinq_admin (Basic): opens with 4 options, choosing Boards switches the section and closes, Escape closes with focus on the toggle, list drops under the toggle. 800px unchanged (strip shown, menu hidden). classic-view tests 29/29; template lint and lint gate clean.

## Round 18: red-team review of the section menu (8aebb4bfe), fixed before push (2026-11-10)

No Critical/High. Fixed the Mediums:
- Safari/iOS do not focus a tapped button, so a menu that closed on `focusout` stayed open after a tap away (and lost a mouse choice after a keyboard open). The menu is now its own component, components/dashboard/section-menu (Glimmer), closing on a document capture-phase click outside (as details-autoclose does), on Escape anywhere while open, and on a choice; focus returns to the toggle after a choice and after Escape.
- Accessibility: no `aria-haspopup` (a list of buttons, not an ARIA menu); `aria-controls` only while the list exists; toggle named "Dashboard sections, <current>".
- Geometry: three shared pill-dropdown rules reached it once it wore `.md-pillnav-dropdown` — <=640 `margin-top: 32px`, <=460 `width: 52%; margin: 40px auto 0`, and <=375 `display: none !important`, which left 320-375px phones with no section switcher at all. All three now exclude `.ch-tabselect` in `:where()`. Measured 320/360/400/460/500: 75% wide, no top margin, chevron inside, one line; 551 strip shown.
- Tests: tests/integration/section-menu-test.js (4): open without focus then click outside, Escape + focus, choice + focus, closed-state ARIA. Mutation: removing the outside-click listener and the focus return fails 2 of them. The menu is hidden at the test browser's 1440px, so the test shows it with a <head> style, as classic-rail-dropdown-test.js does.
- Corrected comments that claimed the options reach the in-app switch scanner / dwell (they do not: the scanner runs only in speak mode; this was untested for OS-level switch access), and stale "<select>" mentions.
