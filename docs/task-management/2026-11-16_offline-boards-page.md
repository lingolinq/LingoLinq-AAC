# Offline boards page: "You don't have any boards yet" after a sync (2026-11-16)

Report (Traci, real Android phone): Sync works; then airplane mode, open My Boards: "no boards available".

Learnings consulted: LEARNINGS-2026-01_to_2026-09.md "boards-page Mine list: cache-first paint, atomic background
refresh" (overlay gated on `my_boards.done`; never stream partial pages onto a usable list; snapshot skip within TTL)
and "list-endpoint board records omit permissions" (device rows are full board JSON, so this does not apply to them).

## Reproduced (Chrome, Pixel 7 profile, local server, develop e13291c88)

Sign in as a synthetic user, sync (5 boards on the device), remove the boards-page snapshot (what 10 minutes does),
go offline, open the user's boards page: "You don't have any boards yet", 0 tiles, `persistence.online` false.

## Fact sheet

- (a) Where is the list READ? CONFIRMED. The tiles come from `model.my_boards` (`controllers/user/index.js`
  `myBoardsRoots` :481, `board_list` :584-602; empty state `components/available-boards-section.hbs:879-894`).
  Its only writers are `generate_or_append_to_list` (`controllers/user/index.js:1179`, a server `store.query`) and the
  snapshot hydrate (`routes/user/boards.js:80-88`).
- (b) Shapes of `my_boards` offline. CONFIRMED.
  1. Unset or empty: `update_selected` returns before any load when offline (`controllers/user/index.js:1379`), and the
     snapshot is gone after 10 minutes (`utils/boards_page_list_cache.js:9`, `read` :146) or never existed on this
     device. This is the reported state.
  2. Snapshot-hydrated (within 10 minutes of an online visit): server tiles, including boards NOT on the device.
  3. An online list still on the record from earlier in the session (same: may include boards not on the device).
- (c) Cross-file claims.
  - CONFIRMED: the server's Mine list (`user_id` only) is the user's own boards plus shallow-clone roots
    (`app/controllers/api/boards_controller.rb:94-124`); both are keyed `<user_name>/...` (shallow clones
    `<user_name>/my:...`, :106).
  - CONFIRMED: device rows are `{data: {id, raw}}` from `lingoLinqExtras.storage.find_all('board')`, raw is the full
    board JSON; revoked boards carry `raw.revoked` (`utils/board_revocation.js:523`). `find_recent`
    (`services/persistence.js:485-530`) pushes them into the store the same way.
  - CONFIRMED: Basic's offline list (`components/dashboard/authenticated-view.js:424` `checkForBlankSlate`) uses
    `find_recent`, which returns only RECENTLY VIEWED boards (stash `recent_boards`), up to 12. Not this bug; noted.
  - CONFIRMED: coming back online, `persistence.online` fires `update_selected` (observer :1372), and
    `generate_or_append_to_list` SKIPS the query when the on-screen list is usable and a fresh snapshot exists (:1210).

## Proposal

A. (chosen) Offline, the Mine list is the person's own boards saved on this device. New `utils/offline_board_list.js`
   `own_device_boards(store, user_name, storage)`: every device board row, not revoked, whose key starts with
   `<user_name>/`, pushed into the store (or the existing record), returned as one completed list
   (`done`, `paint_ready`, `from_device`). `update_selected`, when offline and the Mine tab is the one shown, sets
   `model.my_boards` to it in one assignment (the overlay gate sees a finished list, never a partial one).
   Guard: the snapshot skip at :1210 does not apply to a `from_device` list, so the server list replaces it online.
B. Offline, read the snapshot ignoring its TTL. Rejected: needs an online visit to the boards page on this device,
   and lists boards that are not on the device (they cannot open offline).
C. Change the sync to write the snapshot. Rejected: same staleness, couples sync to a page cache.

Simplest alternative considered: drop the online guard in `update_selected` and let `store.query` go to the adapter
offline. Rejected: the adapter has no offline answer for a list query; it rejects with `offline_reject()`
(CONFIRMED, `utils/persistence.js:4552-4561`), and the page would show its load error.

## Risks and open questions

- Offline the list shows only boards on the device; boards not synced are not listed. Intended (they cannot open).
- Other tabs (Public, Liked, Shared) stay empty offline as today. Out of scope.
- A supervisor viewing a communicator's boards page offline sees the communicator's boards that are on this device.
- No offline wording ("Boards saved on this device") is added: copy is Traci's call.
- Basic's offline list (recently viewed only, 12) is a related gap, not fixed here.

## Test (red first) and the mutation that must fail it

`tests/controllers/user/index-test.js`: offline, Mine selected, device rows for `larry/home`, `larry/my:x`,
`other/y`, and a revoked `larry/old` → `model.my_boards` is exactly `larry/home`, `larry/my:x`, done, and no
`store.query` call. Red on develop (list never set). Mutations: drop the offline branch (red); drop the prefix filter
(red); drop the revoked filter (red). Second test: a `from_device` list plus a fresh snapshot back online still queries
the server (mutation: drop the `from_device` guard, red).

## Review (adversary, 2026-11-16) and implementation

Verdict: proceed with changes. All five conditions applied in `controllers/user/index.js` show_device_boards
(reopen at the end of the file, line-neutral above it) and `utils/offline_board_list.js`: the device database must be
the signed-in person's (unknown is no, unlike `local_db_is_current_user`); boards page only; a finished list on screen
is never replaced; a read that ends after a newer `list_id` is dropped; the cold-boot default tab (`permissions.supervise`)
counts as Mine. Existing records are found by id or key (`serializers/application.js:85-94` re-keys by-key fetches).
Falsified: each guard removed in turn turns its own test red (two mutation builds).

## The browser check caught what the unit tests could not (2026-11-16)

Built branch served on 5081, Chrome with a Pixel 7 profile: sync, airplane mode, My Boards still said "You don't have any
boards yet". In the page, every guard input was right but the read never started: the "boards page only" guard read
`router.currentRouteName`, and while `routes/user/boards.js` setupController runs `update_selected`, the router still
names the PREVIOUS route (the transition has not finished). The unit test stubbed the route name, so it could not see the
ordering. Fixed by reading the page's own flag, set in the route's `activate` (which runs before setupController):
`boardsPageListCache.isBoardsPageActive()`; the tests now set that flag as the route does. The account page
(`user.index`) is no longer covered (it has no such flag); the report was the boards page.

Lesson: a guard keyed on the current route, read from a route's setupController, sees the route being left. Use a flag
the route sets in `activate`, and confirm any route-dependent guard in a browser on a built branch.

## Part 2 (Traci, 2026-11-16): offline, the boards page becomes one "Offline Boards" view

Decision: "Offline, the boards page should transition from My Boards, Public Boards, etc to just Offline Boards and show
all of their available boards (in their same respective styles as their pages, so modern focused gets modern focused
styles, basic gentle gets basic gentle styles, etc)." Traci uses Modern.

### Facts (mapped 2026-11-16; file:line in the branch)

- What a sync saves (`utils/offline_sync_seeds.js:31-66`): the home board (`preferences.home_board`), sidebar boards
  (`preferences.sidebar_boards[].key`), liked boards (`stats.starred_board_refs`, suggested ones only with
  `sync_starred_boards`), Crisis Vocabulary (always), and each one's folders (buttons' `load_board`, followed by the
  walk). The copy `sync_offline_scope_limit` already describes this set.
- Part 1's list (`own_device_boards`) keeps only keys under `<user_name>/`: it misses Crisis Vocabulary and other
  people's liked or sidebar boards, and it lists the person's own folders as boards.
- Surfaces: Modern `/:user/boards` (`templates/user/boards.hbs` → `BoardsBrowser` → `AvailableBoardsSection`: tab row
  :679-747 with the ≤640px picker, tag-folder panel :54-535, Boards section :536-873, grid tiles
  `ub-boards-page__board-item` + `BoardIcon` :772-873, New Board in three places, Change Home Board, filter, density
  toggle). Basic: home page Boards tab (`components/dashboard/classic-view.hbs:657-787`, offline branch :659-674 lists
  `find_recent` = recently opened, up to 12, heading "Recent boards").
- Styles: only Gentle and Focused layouts; chosen by body classes (`ll-layout-focused`, `ll-view-basic/modern`), so the
  existing tile markup inside the existing wrappers gets the right style.
- Naming clash: "Offline boards" (`offline_boards_subtitle`) already names the Basic Access card that leads to
  `/offline-boards` ("Always-Available Boards", the free emergency boards).

### Proposal

1. `utils/offline_board_list.js` `available_device_boards(store, user, storage)`: from the signed-in person's device
   database, the boards to list: the seeds found on the device (home, sidebar, liked, Crisis Vocabulary) and the
   person's own boards, minus any board reached as a folder (a `load_board` target of another listed board's buttons),
   except a seed (a seed is listed even if another board links to it). Home first, then sidebar, liked, own, Crisis
   Vocabulary last. Not revoked; one entry per board.
2. Modern: an `offline_view` flag on the controller (offline AND boards page AND the device database is the signed-in
   person's). The Boards section then shows only: the heading "Offline Boards", a one-line note, and the grid of
   tiles (same markup, same `BoardIcon`, open on tap). Hidden while offline: the tab row and picker, the tag-folder
   panel, New Board (three places), Change Home Board, the filter row, remove buttons and "More". Back online,
   everything returns and the server list loads.
3. Basic: the Boards tab's offline branch uses the same list, heading "Offline Boards", same `ch-boards__cell` +
   `BoardIcon` tiles.
4. Part 1's guards stay (owner, page, newest request, finished list kept, read inside the promise chain).

### Open (for Traci)

- The heading: "Offline Boards" shares its name with the Always-Available Boards card. Keep it, or e.g. "Boards on
  This Device"?

### Tests and checks

- Unit: the list from device rows: seeds by id and key, others' liked board listed, Crisis Vocabulary listed, a folder
  of the home board not listed, a seed linked from another board still listed, revoked dropped, order.
- Render: the Modern Boards section offline shows the heading and tiles and no tab row, picker, New Board, folders
  panel; online unchanged. Basic offline branch shows the same list.
- Browser on the built branch: Modern Gentle, Modern Focused, Basic Gentle, Basic Focused, phone and wide: sync,
  airplane mode, open the boards page or Boards tab; back online.

### Review of Part 2 (adversary): proceed with changes; Traci's decisions (2026-11-16)

Decisions: heading "Boards on This Device" (the Basic Access card keeps "Offline boards"); a fix, no feature flag;
other people's boards are listed on untrusted devices too (Traci chose B; on a device not marked "Trust this Device",
tapping one offline still redirects, as the Speak Mode sidebar does today: `routes/user.js` `_device_owner`).

Revised design (closes F1-F3, F5, F6, F8-F13; F4 for Modern):
- The list has its own property, never `my_boards`/`board_list`: Modern `controller.offline_boards`, Basic
  `deviceBoards`. Read from the device each time the boards page goes offline, whatever tab or list was on screen.
- Builder `device_board_list(store, page_user, opts)` in `utils/offline_board_list.js`: the page user's sync seeds
  (`offline_sync_seeds`: home, sidebar, liked, Crisis Vocabulary) found on the device, then the page user's own boards
  that no seed reaches, as sets: a board is a folder only when reachable through a followable link (on the grid, not
  hidden, link not disabled) from a listed board; an own set with no unreached root (a cycle) is listed by its first
  board by key, so no set disappears. Another owner's liked board is listed only if the last clean sync saw it
  without an error (`sync_log`), so a board unshared since is not offered. Order: home, sidebar, liked, own (by name),
  Crisis Vocabulary. Revoked out. Part 1's `own_device_boards` is replaced.
- Modern: `templates/user/boards.hbs` passes `@offlineView` into BoardsBrowser (the account page passes nothing, so it
  keeps its normal UI); BoardsBrowser shows, instead of AvailableBoardsSection and its New Board button: the h2
  "Boards on This Device", a status line, the grid in the same tile markup (`ub-boards-page__board-item` + BoardIcon),
  tap opens the board, no remove callback, not draggable; an offline empty state on new keys. The hero New Board link is
  hidden too. Entering clears Set Home mode. Leaving the view: only when a server list arrives (hysteresis), not on
  every `online` flip.
- Basic: the Boards tab's offline branch uses `deviceBoards` (same builder, same owner guard), heading "Boards on This
  Device", the same `ch-boards__cell` tiles; `recentOfflineBoards` (the online Recent tab) untouched.

## Part 3: final review fixes and "library boards always open" (2026-11-16)

The final adversarial review of the Part 2 diff (a19b67047) passed with conditions: no Critical or High, 3 Medium.
The Medium findings were checked against the code, below. Traci's decisions (2026-11-16):
- fix all 3, plus the test gaps, in this PR;
- the boards a person starts with must always open offline, trusted device or not: **LingoLinq library boards**
  (owner = the `lingolinq` system account, `lib/system_board_sources.rb:3`; the default sidebar
  `app/models/user.rb:4496`, Vocal Flair 60, Crisis Vocabulary). They are public and hold no personal data;
- on a shared device, "Boards on This Device" hides other people's private boards (they cannot open there), so the
  list shows only what opens;
- Crisis Vocabulary follows sidebar order (already the behaviour; only the comments change);
- in #1328, not a separate PR.
develop merged first (ad1f9d6c1; the 12 locale conflicts kept both key sets).

### Fact sheet

F1, a liked board unshared since the last clean sync:
- READ: `utils/offline_board_list.js:45-56` `seen_by_last_sync` → `utils/sync_log_store.js:122-131` `last_result`,
  which skips errored and cancelled entries and ignores `entry.user_id`. CONFIRMED.
- Shapes of a log entry, by writer (all in `services/persistence.js`, the live service, `services/app-state.js:67`):
  success `:2421-2431` (statuses with `sync_progress.errors` merged in at `:2382-2394`, a refusal reads
  "...failed retrieval for syncing..."); failure/cancel `:2463-2470` (statuses = boards visited, errors NOT
  merged); early cancel `:5118` (no statuses). `user_id` is the person's user_name once their record loaded
  (`:2158`), else the id `sync` was called with; such an early failure has no statuses. CONFIRMED.
- A refused board does not fail the sync: `board_errors.push({..., board_unauthorized})` and the walk goes on
  (`:3364-3385`); `update_sync_progress` gathers them into `sync_progress.errors` (`:1972-1988`). CONFIRMED.
- `finish_sync` (revocation marks) runs only on success (`:2382`). CONFIRMED.

F2, the device list is kept all session:
- Modern READ/keep: `controllers/user/index.js:1940-1941` (returns when a from-device list for the user exists);
  written only at `:1942`, `:1948`; never cleared. Basic: `components/dashboard/classic-view.js:687-688`, same.
  CONFIRMED.
- `update_selected` observes `persistence.online` (`index.js:1372`) and calls `show_device_boards` only offline
  (`:1379`). Clearing `offline_boards` when online returns would show the empty state while the view is still up
  (the view leaves only when a server list arrives, `:1210`, `:1227`; `device-boards-grid.hbs` shows "No boards
  are saved" for a missing list). CONFIRMED.

F3, Basic can stay on "Finding..." or say "No boards are saved" wrongly:
- `classic-view.js:681` observes only `persistence.online`; `:692` drops the result when `appState.currentUser`
  is a different OBJECT (cold boot replaces the 'self' record, `services/app-state.js:477-479`, `:542-552`),
  leaving `{loading: true}`. When the owner guard refuses (`:686`), `deviceBoards` stays unset and the template
  says "No boards are saved on this device yet" (`classic-view.hbs:675`). CONFIRMED (the boot timing itself is
  not reproduced).

Library boards on a shared device:
- Gates that refuse another owner's device copy on a shared device: `routes/user.js:150` (`_device_owner`,
  `if(!trusted()) { return null; }`); `utils/board_device_copy.js:68` (`board_saved_here`);
  `routes/user/board-detail.js:778` (`_session_known_dead`) and `:789` (`_copy_refused`, dead session). The
  person's own boards on a warm session open through `routes/user.js:49-53` (currentUser) on any device; a
  supervisee's boards go through `_device_owner` and are refused on a shared device. CONFIRMED.
- The frontend's library account: `utils/board_prefetch_planner.js:15` `CATALOG_ACCOUNT = 'lingolinq'`; the
  backend's is `ENV.fetch('SYSTEM_BOARD_USER_NAME', 'lingolinq')`, set nowhere in the repo. ASSUMED for
  production (not checked in Secret Manager or Cloud Run env); a different value would only make the exception
  not apply (safe direction).
- Pre-existing, not changed: a COLD offline boot on a shared device does not open the person's own pages
  (`routes/user.js:81-89` requires trusted), so the boards page itself needs a warm session there.

### Proposal (one commit per unit, red test first)

U1 `offline_board_list.js` (pure):
- Only entries whose `user_id` is the page user's user_name count.
- Another owner's liked board is listed only if the newest clean entry saw it without an error AND no newer entry
  (errored or cancelled) lists it in `refused`.
- `opts.shared_for` (the signed-in user_name when the device is not trusted): every board whose owner (key prefix)
  is neither that person nor `CATALOG_ACCOUNT` is left out, own sets of a supervisee included (they cannot open).
  Callers pass it from `offline_shell.device_trust(appState.sessionUser)`; unknown trust (null) counts as shared.
- Comments: Crisis Vocabulary is last unless the sidebar carries it (Traci: sidebar order).
U2 `services/persistence.js` failure branch (`:2463-2470`, line-neutral): the entry gets
  `refused: refused_refs(sync_progress.errors)` (ids and keys of errors with `board_unauthorized`), read before
  `sync_progress` is cleared. A new field, so Sync Details and the drawer (which read `statuses`) are unchanged.
  The helper lives in `utils/sync_log_store.js`.
U3 lifetime: Modern keeps a list only within one offline spell (`_device_spell`, bumped by an observer in the
  `reopen` when `online` turns true; the list records the spell it was read in), so it still shows while the
  server list loads and is read again the next time the page goes offline. Basic clears `deviceBoards` when
  `online` turns true (its offline branch is not on screen then).
U4 Basic: keep the result when the current user's user_name still matches (not object identity); observe
  `appState.currentUser.user_name` too; when the owner guard refuses, a neutral line instead of "No boards are
  saved" (copy for Traci).
U5 Library boards: one helper `library_board(key)` (owner === `CATALOG_ACCOUNT`) in `board_device_copy.js`, used by
  the four gates: `_device_owner` lets a library board's stand-in through on a shared device; `board_saved_here`
  checks the device for it; `_session_known_dead` and `_copy_refused` do not refuse a library board for a dead
  session (a server refusal of it still wins, `:791-797`).
U6 one controller test that runs the real `current_device_db_user` (sets `capabilities.db_name` and the
  `auth_settings` stash, restores both exactly).

Candidates considered:
- F1: (a, chosen) a `refused` field on failed entries; (b) merge errors into a failed entry's `statuses` as the
  success branch does: rejected, it changes what Sync Details shows for a failed sync (cards would show failures,
  and the Sync Details rework is pending); (c) hide every other owner's liked board after any unfinished sync:
  rejected, going offline mid-sync is common and would empty them; (d) run `finish_sync` on failure: rejected,
  revocation from a partial walk is a wider change.
- F2: (a, chosen) offline spell; (b) clear on online: rejected (empty state while the view is up); (c) always
  re-read keeping the prior on screen: simpler, but re-parses every board row on each `update_selected` offline
  and changes the "read once while offline" tests' specification.
- U5: (a, chosen) owner === `CATALOG_ACCOUNT`; (b) any `public` board: Traci chose (a).

Risks:
- U5 widens what opens on a shared device; scope is public library boards only. A server refusal still wins
  online.
- U3 Modern: the spell observer and `update_selected` both observe `online`; the order does not matter
  (`show_device_boards` runs only offline, the bump only online).
- U1 shared filter hides a supervisee's boards on a shared device (they do not open there today).
- U1 per-person entries: CORRECTED by the final code review (2026-11-17): a supervisor's sync writes one entry PER
  supervisee, keyed by the supervisee's global id, not user name (`services/persistence.js:2153-2158` sets user_name
  only when supervisees are not ignored; `sync_supervisees` passes `supervisee.id`, `:2618`, `:2621`). The filter here
  matches user names, so those entries never count, and on a supervisee's page other owners' liked boards are listed
  only after a sync run from that page (fails safe: hidden, not wrongly shown).
Unresolved: production value of `SYSTEM_BOARD_USER_NAME` (ASSUMED unset).
Basic's line when the owner guard refuses (Traci, 2026-11-16): "Your boards can't be shown right now. Close and
reopen the app, or connect to the internet." (the device database is chosen at app start from the signed-in person,
`utils/capabilities.js` setup_database). Basic's home (`/`) has no trusted-device gate (`routes/index.js:56-69`,
`findRecord('user', 'self')`), so the hint applies on shared devices too; a cold offline start was not run in a browser.

Tests and the mutation that must fail each:
- U1: [clean OK X, errored refused X] → X out (mutant: ignore `refused`); [another person's clean entry with X OK]
  → X out for this person (mutant: no user filter); shared: therapist liked board out, `lingolinq/...` sidebar in,
  own in, supervisee page's own boards out; trusted: therapist in (mutant: filter by page user / drop filter).
- U2: `refused_refs` unit test; failure-branch entry carries `refused` (mutant: omit the field).
- U3: offline → online → offline gives 2 device reads, within one spell 1 (mutant: no spell check). Basic: online
  clears, next offline reads again.
- U4: a replaced currentUser record with the same user_name keeps the result (mutant: identity compare);
  a user_name arriving later triggers the read; guard refused shows the neutral line.
- U5: per gate, a `lingolinq/...` key opens on a shared device and a `therapist/...` key does not (mutant: drop
  the helper from that gate).

### Review of Part 3's proposal (adversary): proceed with changes; revised units

Checked: the saved log keeps a fixed field list (`utils/sync_log_store.js:44`), so a new `refused` field is lost at
restart; the usual Cancel path (`end_canceled_sync`, `services/persistence.js:5113-5118`) logs `statuses: []` after
clearing `sync_progress`. CONFIRMED. The fact sheet's ":5118 early cancel" is wrong: it is the normal Cancel path.
The review's other points (refusal shape `result.error` vs `error`, revoked liked roots skipped without an error,
the errors snapshot) all concern the sync recording what it was refused when it stops.

Traci (2026-11-16): that sync-side recording goes to the Sync Details rework PR (already planned to make the sync
record roots and errors when it stops). U2 is dropped here; U1 reads errors in any newer entry's `statuses`, so it
uses them once that PR records them. Until then the gap is on trusted devices only (shared devices hide another
owner's private board), where that board already opens from its device copy (not new).

Revised:
- U1: entries for the page user only; another owner's liked board needs the newest clean entry to have seen it
  without an error and no newer entry to show an error for it. Shared filter takes an explicit `shared` flag
  (`device_trust(sessionUser) !== 'trusted'`, so unknown is shared) and `me` (the device database's user).
- U3, both views: an offline spell counter (bumped when `online` turns true); a kept list is reused only for the same
  spell and the same `shared`; the earlier list stays on screen while it is read again (no "Finding..." or empty
  flash). Basic is not cleared on `online` (its offline branch can still be on screen, `authenticated-view.js:424-450`).
- U5: `library_board(raw)` needs the exact owner `CATALOG_ACCOUNT` (not a prefix), no `my:` segment (shallow clone of
  another owner's board, `app/models/concerns/global_id.rb:250-260`) AND `public === true` on the device copy
  (`lib/json_api/board.rb:136`), since a `lingolinq` user name is registrable where `SYSTEM_BOARD_USER_NAME` differs
  (`spec/models/concerns/processable_spec.rb:194-197`). The dead-session exception applies only offline
  (`persistence.online === false`); a library navigation still records `_dead_token`, and a server refusal still wins.
  Risks added: a library board's device copy can carry the person's own fields (`starred`, `permissions`, `copy` key
  with their user name, `lib/json_api/board.rb:186-187`, `:325-333`); a cold offline boot on a shared device now opens
  a library home board instead of /offline-boards (`routes/index.js:262-266`, check in a browser).
- Tests added per the review: null sessionUser counts as shared (both callers); `lingolinq-team/x` and `lingolinqx/x`
  are not library boards; a non-public `lingolinq/x` is not; a key-less row; dead token then a therapist board is still
  refused; the list unchanged while online with the server query pending.

### Part 3 implemented (2026-11-16/17)

Commits: e3e38f15c (U1 list rules + `library_board`), b6066b00b (U5 the four gates), d6fdaa443 (U3/U4 lifetime, Basic
read, the refused line), 3e2a207e7 (U6 real owner check; a strengthened test), 066d1dcf0 (assert.expect). develop merged
at ad1f9d6c1. Every unit red first, then green.

Mutation (each must fail a test; restored from copies after each):
- U1: no per-person filter; later errors ignored; no shared filter; shared filter by page user; `library_board` by
  prefix, without the public check, allowing `my:` keys: 7 of 7 failed.
- U5: each of the four gates without the exception; any copy accepted; offline-only dropped; an early return in
  `_copy_refused` that skips remembering the dead session: 8 of 8 failed.
- U3/U4: no spell; no trust in the kept-list key; the loading flash; a failed re-read replacing the list; unknown trust
  not shared; no spell bump; Basic identity compare; no user-name observer; no refused flag; clearing on online:
  12 of 12 failed after one test was strengthened (the identity-compare mutant first survived: see the 2026-11
  learnings archive).
- U6: owner from the sign-in only; from the database name only: both failed.

Tests: the targeted set 212/212; the wider offline/sync/board/dashboard set 1071 pass, 0 fail, 2 skipped (both
existing persistence tests). `npm run lint:js:ci`: only the known `sync-details.js:220` false positive (the lint plugin
reads the main checkout); `ember-template-lint` on the changed templates: clean.

Browser (built branch on :5081, Chrome, synthetic users; `sync_e2e_other` given a public liked board owned by
`sync_e2e_basic`, local e2e database only): trusted device, Modern Gentle/Focused wide and phone: home, Crisis
Vocabulary and the other owner's liked board, names and pictures; Basic Gentle/Focused wide: home and Crisis
Vocabulary. Shared Device sign-in: the other owner's board is not listed (Modern wide and phone, Basic wide), and an
offline tap on Crisis Vocabulary opens it (Modern board-detail, Basic board), with no "isn't saved" message. Trusted:
an offline tap on the other owner's liked board opens it. Not run in a browser: the Basic "can't be shown" line (the
SPA sign-in it guards needs a flag that is off) and a cold offline start on a shared device.

Left for other work: the sync recording what it was refused when it stops (Sync Details rework PR, Traci); SPA
sign-out leaves the offline view on the controller (behind the off `auth_spa_transition`); a reused user name opens
the old account's device database (pre-existing; needs a server-side owner id).

### Final review of the Part 3 code (adversary, 2026-11-17): ship with conditions; senior pass: approve with comments

`/review-pr` (REVIEWED=range d6b3cc859e22cca4f6776d57154948c5404166a9 ... HEAD 2c83e466f2c88c8691da634f2109a745177ebddd):
approve with comments (no Critical or High). Adversary: no Critical, High or Medium; 6 Low. Traci (2026-11-17): the
cheap fixes and the docs; the rest are follow-ups.
- Fixed: a first device read that fails was kept for the whole offline spell and shown as "No boards are saved". It is
  now not kept (the next call reads again) and both views say "Your boards can't be shown right now. Close and reopen
  the app, or connect to the internet." This corrects d6fdaa443's subject, which claimed Basic never says "none"
  wrongly.
- Pinned: a stored `lingolinq` user record is never returned as the owner on a shared device (the `!shared &&`
  guard in routes/user.js had no test).
- Corrected: d6fdaa443's line "a trust change reads again" holds when something calls the reader; Modern has no
  trigger for a trust change within one offline spell (`update_selected` observes selected, online and current_tag),
  so the list reads again at the next spell. Fails safe (unknown trust lists fewer boards).
- Corrected above: the supervisee log-entry risk line.
- Follow-ups (in the PR's "Not covered"): after a public `lingolinq` board opened on a shared device, a non-public
  `lingolinq` board reached by link, Back or an id-only folder link is not rechecked (matters only where `lingolinq`
  is a registrable name); each new offline spell reads every board row (a flapping connection repeats it; Basic reads
  on any tab); a device read in flight when the app comes back online, then a failed server list, leaves "Finding..."
  on the boards page (from Part 2); a cold offline start on a shared device needs a native build to check (in browsers
  a shared sign-in removes the offline shell worker, `utils/offline_shell.js:12-13`).

## Part 4 (2026-11-19): a picture that did not save does not hide a liked board (local commit; push needs Scot's OK)

The Sync Details branch (`traci/fix/sync-details-no-percent`, commit 27d54fb39) now tags the walk's "failed to sync
completely" error with `content: true` (the board was reached; a picture or sound did not save) and keeps the tag through
the log. `seen_by_last_sync` treats a tagged row as no refusal: in the last clean sync it counts as seen, and in a later
sync it does not hide the board. An untagged older entry still hides it (the safe side). Red first (the new test failed
on its first case); green 13/13 on `offline board list`; mutants: each of the two conditions reverted fails the new test.
Pushing this to PR #1328 is a third review round: Scot's OK, then Traci's, before any push.

### CI secret-detection on 09fd218be: 22 false positives (checked 2026-11-19)
CI's gitleaks (8.30.1, range d6b3cc859..09fd218be) reports 22 leaks. Re-run locally with the same pinned version, config and
range (`--redact`): all 22 are `generic-api-key` on test-fixture board keys, `key: 'therapist/feelings'` (21) and
`key: 'larry/home'` (1), in six unit test files (commits a73ff790a, e3e38f15c, b6066b00b, d6fdaa443). No credential.
Renaming the fixtures cannot clear it (the old commits stay in the scanned range; force-push is denied). The repo's
pattern for a literal false positive is a narrow `.gitleaks.toml` allowlist (`targetRules = ["generic-api-key"]`, a
`regexes` entry), as for `pin_placeholder_4_digit`. Traci approved it (2026-11-19); added for the two literals only. Local
scan, same version and range: no leaks. Falsified on scratch files: without the entry the fixture line is flagged; with it,
it passes; a different high-entropy `key:` value is still flagged.

### CI ember-shard-main on 09fd218be: 8 timeouts caused by this PR's test module (fixed 2026-11-19, local)
The 8 failures (board prefetch after its app is gone; six "the sentence bar hears select"; offline_shell >
follow_device_trust) pass alone and on every other branch. Reproduced locally: this PR's modules plus those three, 184
tests, the same 8 fail. Bisected to `Unit | Controller | user/index offline boards view`, then to its second half.
Cause (CONFIRMED by reading and by the fix): the two tests using `pending_store` (a server list that never answers)
leave `boardsPageListCache` "Mine list busy" on (`controllers/user/index.js:1222` sets it; only an answer clears it), and
the module's afterEach did not reset it. `utils/board_detail_cache.js` `_wait_while_mine_list_busy` (:230-243, used at
:869) then holds every later prefetch for up to 120 s, polling with runLater, so the next tests time out until the cap
(15 s x 7, then offline_shell at about 6 s). Fix: the module's afterEach also calls `setMineListBusy(false)` (teardown
only; no fixture or assertion changed). The same reproduction: 184/184. The leak check does not see module-level flags.

## Review round 3 (2026-11-19, at Traci's request; dual review)
PII pre-flight exit 0. REVIEWED=PR lingolinq/LingoLinq-AAC#1328 at a4bbd354fab8787de3b93e9d394b3e588c0ff043
(No Codex connector review was ever posted on #1328, at any head.)
- `/review-pr` (senior pass, diff only): Approve with comments. Checked here:
  - M1, Medium, CONFIRMED: a refused `show_device_boards` (`controllers/user/index.js:1938-1946`) leaves `offline_view`
    and `offline_boards` as they were, and the route's `setupController` (`routes/user/boards.js:59-91`) resets
    neither. Offline, moving from your own boards page to a person you cannot model for keeps your list on their page;
    after an SPA sign-out (behind `auth_spa_transition`, off) the previous person's board names stay. Basic already
    clears on refusal (`classic-view.js`, `deviceBoardsRefused`).
  - M2, dismissed (CONFIRMED not real): `within` turns a rejection into `null` (`utils/board_device_copy.js:154`), so
    `library_copy_here` answers false, never rejects.
  - M3, Medium, PLAUSIBLE: Basic's kept list lives on the dashboard component, so each return to the home page offline
    may re-read every board row (per visit, not per offline spell). Extends the existing follow-up.
  - Lows: fixed 30 ms `tick` waits in two test files; untested branches (the snapshot skip, the boards.hbs hidden
    hero/Getting Started, Basic's refused line); the heart's `aria-label` on a role-less span; `available_boards`
    removed from en.json only; gitleaks entries unanchored; observer coalescing of a fast offline/online/offline (fails
    safe); the log's "Entering clears Set Home mode" has no code in the diff.
- `/adversary-review` (red team, repo access): ship. No Critical/High/Medium introduced. Lows:
  - Shallow-clone rows (`larry/my:therapist:feelings`) count as own on a shared device (`opens_here` judges by the key
    prefix, `utils/offline_board_list.js:70-71`), unlike `library_board`; the own-page route already opens them, so a
    pre-existing gap in the rule, not a new leak. Policy call for Traci.
  - The cycle fallback can list a folder as its own tile and hide the set's root (`offline_board_list.js:138-140`).
  - Gitleaks entries should be anchored (`^...$`; the match target is the secret).
  - The `content` tag is pinned only by fixtures; `entry_copy` drops it until #1336 merges (fails safe). Add one
    end-to-end test once both are in develop.
  Checked and holding: deep links (the `/*key` route redirects to board-detail, so `_device_owner` runs), library-key
  look-alikes refused, a stand-in owner gets no list, unknown trust counts as shared, no SPA user switch without a
  reload except the accepted sign-in path, sync-log identity checks, the teardown fix, i18n in 13 locales.
Open: Traci to choose what to fix before merge (M1 is in the visibility area: /fix-proposal).

### M1 fix proposal (2026-11-19; Traci: fix only if real, adversarial review of the fix before making it)
Facts:
- (a) READ: the template shows `BoardsBrowser` with `this.offline_view` and `this.offline_boards`
  (`templates/user/boards.hbs:207`); the hero subtitle and Getting Started also read `offline_view` (:47, :81).
  CONFIRMED.
- (b) WRITERS of `offline_view`/`offline_boards`: `show_device_boards` (`controllers/user/index.js:1938-1960`, set true
  and the list); the online server list (`generate_or_append_to_list`, :1210 `offline_view` false; the list stays until
  replaced). The route's `setupController` (`routes/user/boards.js:59-92`) resets neither, then calls
  `update_selected`, which offline goes straight to `show_device_boards` (:1379). CONFIRMED.
- (c) The refusal returns in `show_device_boards`: no model or destroyed (:1941), boards page not active (:1941), no
  `user_name` (:1943), no device owner or someone else's page without model permission (:1945). Each leaves both values
  as they were. CONFIRMED.
Real: yes. Two red tests (larry's list, then sam's page with no model permission; and the device owner becoming null)
fail on the current code (`offline_view` stays true, larry's list stays). The 15 existing tests pass.
Candidates:
- A (recommended): on the two PERSON refusals only (no `user_name`; the owner check), set `offline_view: false` and
  `offline_boards: null` before returning. Not on "no model" or "page not active": an observer can call this while
  another page is showing (`persistence.online`), and clearing there would throw away the kept list, breaking "coming
  back to the page offline keeps the list, without reading the database again". After a refusal the page shows its
  ordinary view, as it did for that page before #1328.
- B: reset both in the route's `setupController` when the person changes. Rejected: it misses the sign-out case (same
  model, owner becomes null) and splits one rule across two files.
- C: the template shows the device view only when `offline_boards.user_name` matches the model. Rejected: hides the
  symptom, leaves stale state that other readers (:47, :81) still see.
- B2 (not now): a refused line in the device view, as Basic has (`deviceBoardsRefused`). Needs a new string and
  template; possible follow-up.
Risks: a refused page offline shows its ordinary view, which may hold that person's list from a snapshot the route
hydrated earlier online (pre-existing, `routes/user/boards.js:80-90`). A read in flight from the previous page is already
dropped by its `list_id` check (:1953). Mutants: no clear on each of the two returns separately.

### M1 fix: review of the proposal and the result (2026-11-19)
Adversary review of the proposal (at c0a14a8f2): proceed with changes. Taken:
- The `!user_name` return was not reached by either red test; a third red test added (a page whose person has no user
  name). Rare in practice (`routes/user.js` returns loaded records), but now pinned.
- The reason for NOT clearing on "page not active" was not pinned; a test added: leaving the boards page and coming back
  offline keeps the same list with one device read.
Scoped out (recorded follow-up, not M1): the ONLINE route. `show_device_boards` runs only offline (:1379); online the
device view ends only when a server list or a fresh snapshot arrives (:1210, :1227), so a previous person's device list
can stay on the next page while that page's query is slow or failing. Crosses people only under `auth_spa_transition`
(off). Fix when that flag rolls out: in `update_selected`, before the online/offline split, end the view when
`offline_boards.user_name` differs from `model.user_name` (stamp the loading placeholder with the user name too).
Accepted cost (from the review): going back to a page after a refused one re-reads the device (its list was cleared).
Change: `leave_device_view()` (`controllers/user/index.js`, sets `offline_view` false and `offline_boards` null), called on
the two person refusals in `show_device_boards`. Red before: the three refusal tests failed, the keep test passed.
Green after: 123/123 (this module, Basic's device boards, the integration test, and the modules that timed out in CI);
`npm run lint:js:ci` clean apart from the known false positive. Mutants: M1a no clear on the no-name return: killed
(1); M1b no clear on the owner check: killed (2); M1c clearing on "page not active" too: killed (1). File restored and
compared byte for byte.

### Round 3 follow-through (2026-11-19, Traci: copies of private boards accepted and recorded; cheap Lows only if real)
- Liked heart not announced (real: a named role-less span is skipped by screen readers): `role="img"` on all three
  hearts (the device grid and, pre-existing, the online page's two). ea82bc880. Red first; 28/28.
- Loop listed a folder as its own tile (real): the fallback enters a loop at its first member by key. 879afd8fd. Red
  first; 49/49.
- Gitleaks anchors: not changed (no realistic match inside a real secret).
- Basic's "can't be shown" line: the device-list block moved unchanged into `dashboard/device-boards` and rendered in
  every state (ebd572994). Red first; 75/75 with Basic's dashboard tests.
- Basic at phone width: the Boards tab is NOT hidden there; the tab strip becomes the section dropdown (<=550px,
  `_classic-home.scss`), which always offers Boards (`utils/basic_dashboard_sections.js:18`). Checked in Chromium at
  390x844 (touch) on a production build of this head, served locally (port 5081, synthetic users): the strip hidden and
  the dropdown shown; Boards reached through it; "Boards on This Device" with both device boards (names; the synthetic
  boards have no pictures, so the placeholder shows) in Gentle and Focused; on a Shared Device sign-in, an offline tap
  on Crisis Vocabulary opened it (3 buttons, no "isn't saved"); back online, Browse Boards and its tabs returned.
  Script: this session's scratchpad `offline-boards/phone.js` (adapted from the 2026-11-17 matrix.js).
- Cold offline start on a shared device: still needs a native build. CORRECTED 2026-11-19: "no emulator or adb on this
  machine" was wrong (I checked PATH only). An Android SDK is at `/home/tracid/android-tools/sdk` (adb, emulator, AVD
  `ll_trace`; used 2026-11-17 for Chrome on the emulator), and an emulator was running, apparently another session's.
  What is missing is a native build toolchain (no cordova, java or gradle), and Chrome on the emulator is a browser,
  where a shared sign-in removes the offline shell worker; so this still needs a native build.
