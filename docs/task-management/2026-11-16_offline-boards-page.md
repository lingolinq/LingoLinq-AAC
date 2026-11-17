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
