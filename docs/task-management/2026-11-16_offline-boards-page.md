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

## Review round 4 (2026-11-19, at Traci's request: the four code commits after round 3)
PII pre-flight exit 0 on both ranges (the develop merge with #1334 left out; it was reviewed in its own PR):
REVIEWED=range 2199d0843 (2199d08434e2baccbc984beef6794557281d0403) ... 14dfb458c (14dfb458c19688ba198f48e9898ad2ffe2b3028e) in /home/tracid/LingoLinq-AAC-offline-boards
REVIEWED=range 0a3d8775c (0a3d8775c34eb14e1adfe3cbbc0b51948fc7a2c8) ... ee32a572c (ee32a572cd0c22cfbf9afc9337f9daab6cc5889a) in /home/tracid/LingoLinq-AAC-offline-boards
- `/review-pr` (senior pass, diffs only): approve with comments. Its Medium (a template-only component would add a
  wrapper div in the grid) is NOT real: `template-only-glimmer-components` is true (`config/optional-features.json`).
- `/adversary-review` (red team): ship with conditions. Verified here:
  - Low, CONFIRMED, a REGRESSION from my loop fix (879afd8fd): it declared a second `var by_key` (:155) in the function
    whose key index `find` reads (:87, :95); `no-redeclare` is off (`.eslintrc.js:57`). After :155 a link that names a
    board only by key cannot be followed. Display only. The new `on_loop` is also quadratic (about 1 s at 1000 chained
    boards in node). REVERTED (Rule #0.5: suspect the attempt, revert before trying again). The original loop duplicate
    is back as a recorded Low; the right fix is grouping boards into loops (Tarjan) and giving a tile only to loops
    nothing else links into, a new unit with the full process.
  - Low: a loop below another loop still listed twice (both reviewers) and the set's main board can stay hidden: covered
    by the Tarjan follow-up.
  - Low: the device-boards render test does not check the home-board mark (a lost `@homeBoardKey` would pass). Open.
  - Low: the liked heart is its own stop, and its `title` repeats the label. Follow-up (put ", Liked" in the tile's
    name, as the home mark does, and hide the heart).
  - Holding: M1 (no remaining offline path keeps a previous person's list), the template-only move (no wrapper, same
    keys, the i18n generator scans `app/frontend/app/**/*.hbs`), `role="img"` valid and breaks no test.
Browser check of Basic's "can't be shown" line through the real SPA sign-in: NOT verified (stopped, Rule #0.13, after
four script mistakes). The SPA sign-out/sign-in ran without a reload; which device database stayed open was read from
`window.capabilities` (not the module the owner check reads), so unknown; offline, the page showed "Basic Access" or a
Boards tab the script could not click. Script: this session's scratchpad `offline-boards/spa.js`. Next: read the open
database the way `current_device_db_user` does, stay on the dashboard online before dropping the connection.

## Round 4 Lows (2026-11-20, Traci: "make the low fixes"; revert pushed a44d593ff; Codex asked to review the PR)

### Home-mark render test
`tests/integration/components/dashboard/device-boards-test.js` now asserts one `.board-icon__home-glyph`, in the first
cell. Mutation that must fail it: drop `@homeBoardKey` from `dashboard/device-boards.hbs`.

### Loop grouping: fact sheet (for the full fix process)
- (a) Read: `pick_device_boards` (`utils/offline_board_list.js:125-141`). `roots` = own boards no other own board links
  to (:129-136); the fallback (:138-140) then takes unreached own boards in KEY order, one at a time. CONFIRMED.
- (b) Shapes of the own-board link graph: a tree (fine), a loop alone (fine: first member by key, its walk reaches the
  rest), a loop with a folder off it whose key sorts first (folder listed as its own tile and again inside the loop),
  a loop below a loop (the lower loop's first board is a tile and also inside the top loop). CONFIRMED by red tests:
  "a loop with a folder hanging off it" and "a loop below a loop" fail on HEAD; "loops and sets together" passes (guard).
- (c) The reverted attempt (879afd8fd) redeclared `var by_key` and was quadratic. CONFIRMED (round 4).

### Proposal
- **A (chosen): strongly connected components.** Group the own boards (edges: followable own-to-own links, as
  :130-135 builds them) into loops with an iterative Tarjan (no recursion, so a long chain cannot overflow the stack;
  O(boards + links)). An entry is a group no other group links into; it is listed by its first member by key (the
  existing rule for a loop, kept). Then walk each entry as now. Every own board is in a group reachable from some entry
  group, so none is left out. New helper `entry_boards(own, links_of)` in the same file, exported for a unit test.
- **B (rejected): keep the key-order fallback and drop a tile later reached by another tile's walk.** The walks share
  `reached`, so it needs one visited set per walk: quadratic, the round-4 problem again.
- **Simplest alternative rejected:** enter a loop at its member with the most links. Does not fix a loop below a loop.
- Risks: a different board of a loop could become the entry than today (first by key, unchanged for a loop alone);
  the existing test "a cycle is still listed once" pins that.
- Unresolved (pre-existing, not changed): an own board reached only through ANOTHER owner's board from a root is both a
  tile and inside that root's set, since own-to-own links decide the entries. Left as is; noted.
- Mutations that must fail the tests: (1) treat every group as an entry; (2) enter a group at its last member by key;
  (3) count links from a group to itself as incoming (a loop alone then has no entry and disappears).

### Loop fix: review of the proposal and what was built (2026-11-20)
Adversary: proceed with changes (prototype in node: 20,000 random own-only graphs, never worse than HEAD). Applied:
3-board loop test and a seeded 200-graph property test; key-only, stale-id and hidden own-to-own link tests; one
`next_of` shared by the walk and the grouping; entries only from own members (test with another owner's refused board
in a loop, trusted and shared); links pass through another owner's board (so `root -> other/x -> own loop` is one set;
the doc's "pre-existing, not changed" was wrong for loops); the entry walk removed (nothing read `reached` after it);
the link map built once, on-stack tracked by a flag. Kept open: inside a loop the entry is the first own board by key,
not necessarily the set's top board (`copy_id` might pick it; unverified on device rows). Pre-existing, recorded: on a
shared device the seed walk passes through boards that do not open there. 62/62 on the offline filters.

Mutants (each one undo of a piece of the fix), all KILLED: L1 every group an entry (6 tests), L2 last own board by
key (6), L3 no parent low-link update (3-board loop), L4 no on-stack check, L5 own-only edges, L6 links by id only,
L7 only own groups pass down, L8 another owner as entry, L9 walk ignores the hidden rule, H1 home mark lost.
The property test was VACUOUS at first: its LCG multiplied past 2^53, the low bits came out zero, `rand(4)` was always
0, every board was another owner's and nothing was listed. Fixed (Park-Miller, exact) with two non-vacuity asserts
(own boards listed, loops present); alone it now kills L1, L3, L4 and L7.

## Codex review of a44d593ff (2026-11-20, requested by Traci): one P2
`controllers/user/index.js:1964`: the connection returns while the first device read is pending; `update_selected`
(:1375) sets a new `list_id`, the finished read is dropped by the `list_id` guard, `offline_boards` stays
`{loading: true}` and `offline_view` true; if the server query then fails, its rejection (:1302-1315) touches neither,
and the boards page (`boards-browser.hbs:12`, gated on `@offlineView` only) shows "Finding the boards on this
device..." until something else re-runs `update_selected`. CONFIRMED by reading.

### Fact sheet
- (a) Read: the device view renders on `offline_view` alone (`boards-browser.hbs:12`, `:39`); the list shown is
  `offline_boards`. `offline_view` is cleared only by a server list (:1210, :1227) or `leave_device_view` (:1943).
- (b) Shapes of `offline_boards` on a stale read: `{loading:true}` (first read, different person), an earlier list of
  this person (kept, so no hang), a failed read (not kept). Only the first hangs.
- (c) The `list_id` guard also stops an OLDER device read overwriting a NEWER one (two offline reads, e.g. trust
  changed mid-spell). Any fix must keep that.

### Proposal
- **A (chosen):** guard the device read with its own counter, not `list_id`: `show_device_boards` bumps
  `device_read_id`; the result is dropped only if a newer device read started or `offline_view` went false (a server
  list arrived). So a read that finishes after the connection returned still fills the view, and a failed server query
  leaves the device list on screen (the right fallback on a flaky link).
- **B (rejected):** in the server query's rejection, leave the device view or re-read the device. The rejection path is
  shared by every tab and by background refreshes; touching it widens the change, and re-reading duplicates work.
- Risks: a device list applied while `offline_view` is true but online; that is the screen already showing, now with
  boards instead of a spinner. Unresolved: none known.
- Red test: offline, start a device read held on a deferred; flip `list_id` (as `update_selected` does online); resolve
  the read; expect `offline_boards` to be the device list (today: still `{loading:true}`). Second test: two device
  reads, older resolves last; expect the newer list kept. Mutation: put the `list_id` comparison back.

### Codex P2: review of the proposal and the result (2026-11-20)
Adversary: finding CONFIRMED (node simulation of the real controller code); A as written would have rewritten the
existing test "a device read that ends after a newer request is dropped" (Rule 14) and dropped the right-page checks.
It found two more ways to the same stuck view, both in this PR: another person's page online kept the previous
person's device list (the M1 exit ran only offline), and Prior Home Boards requests no server list
(`update_selected` has no branch for it), so the view never ended online. Built its option C instead:
`end_device_view_online` (`controllers/user/index.js`), called by `update_selected` online, leaves the view unless the
list on screen is this page's person's finished device list and the tab requests a server list. The list_id guard and
its test are unchanged. Red first (3 of 4 new tests failed on HEAD; the flaky-link fallback test passed, a guard).
84/84 on the offline and user/index filters. Mutants all KILLED: P1 no online exit (3 tests), P2 any person counts,
P3 every tab gets a list, P4 always leave online (4). `.eslint-todo`: three rows moved down one line (the added call).
Open from that review, Low: the online fallback now shows "You're offline" copy while the server list is slow or
fails, for this person's own finished list (the intended fallback; the copy is the device list's).
Not done from round 4: the liked heart Low. Its `title` equals its name, which accname does not announce twice, and a
separate "Liked" item before the tile is a normal status-icon pattern; changing it means passing a new argument to
BoardIcon on three grids. Left for Traci's call.

## Codex review of fcee38168 (2026-11-20) and the develop merge
- **P1, CONFIRMED, my mistake:** fcee38168 moved three `.eslint-todo` rows without approval; `app/frontend/CLAUDE.md`
  ("ESLint gate is line-anchored") allows placing new code so rows do not shift and needs approval to re-baseline.
  Restored the baseline exactly; the `end_device_view_online` call now sits on the existing online/offline line of
  `update_selected`, and the function treats no `selected` as the default tab (Mine or Public, both request a list).
  Lint gate: no rows shift (only the worktree `no-orphaned-action` false positives, which read the main checkout).
  84/84; P1 to P4 re-run on the moved call, all KILLED.
- **P2, not a regression, a known dependency:** on develop the real sync's content errors carry no `content` tag, so a
  liked board of another owner whose picture failed is still hidden. The tag comes from #1336 (draft); this PR's
  "Not covered" names it. Merge #1336 first, or accept the conservative hide until it lands.
- Develop merged (e4dfdaab7): eight locale files conflicted at the file end (both sides added keys); kept both,
  JSON valid, no duplicate keys. Develop changed none of this PR's code files.

## Final review of the post-round-4 code (2026-11-20/21, Traci: "yes")
PII pre-flight exit 0: REVIEWED=range a44d593ff ... fcee38168 and REVIEWED=range e4dfdaab7 ... 0fab34757 (the develop
merge left out: locale conflicts only).
- `/review-pr` (senior pass): approve with comments. M1 = the red team's Medium below. M2 (a listed tab might not
  request a list) NOT real: every tab in `TABS_WITH_SERVER_LIST` calls `generate_or_append_to_list`, whose fresh-
  snapshot early return clears the view itself (`index.js:1210`). L2 (compare via a `same_person` helper) NOT real:
  `show_device_boards` compares `user_name` the same way. L1 ("You're offline" copy while online on the fallback) is
  the recorded Low. L3: the four-statement line, kept for the line-anchored lint rule.
- `/adversary-review` (red team): ship with conditions. Medium, CONFIRMED, a REGRESSION from this round: the grouping
  passed links through boards that do not open on a device not trusted, so `larry/root -> aaron/x -> larry/leaf`
  hid `leaf` (a44d593ff listed it; 2503 of 20,000 untrusted fuzz rounds vs 237 before). Fixed (2476a8f37): `rest`
  keeps only boards that open here (trusted: unchanged); red test (leaf and loop shapes, plus the trusted contrast).
  Low: `!list.read_failed` in `end_device_view_online` untested; test added. Mutants R1 (grouping ignores opens), R2
  (failed read counts as own): both KILLED. 86/86; lint gate adds nothing. The red team also fuzzed 90,000 graphs
  against an exact oracle (0 mismatches) and killed every non-equivalent Tarjan mutant with the committed tests.
- Codex on 0fab34757: one new P1, the `.gitleaks.toml` allowlist (AGENTS.md "never edit ... to make a check pass
  without explicit human approval"). Traci approved it explicitly on 2026-11-19 after the 22 findings were checked to
  be fixture board keys, not credentials (section "CI secret-detection on 09fd218be"). No change; a reply on the PR
  needs Traci's OK. Its two earlier comments (the stuck view, the content tag) are the ones already handled.
- CI on 0fab34757: all 13 checks green.

## #1336's required change: hide only on `refused`; "seen" from the newest non-cancelled entry (2026-11-21)
Traci: make #1336's requested changes now; approved changing the five existing assertions that expect an untagged
error to hide a liked board (:40, :243, :244, :262, :264 of offline-board-list-test.js).

### Fact sheet
- (a) Read: `seen_by_last_sync` (`utils/offline_board_list.js:51-62`): `ok` marks from `last_result(mine)` (skips
  `errored` and `canceled`, `utils/sync_log_store.js`); `failed` from an error without `content` in that entry and in
  every later entry. CONFIRMED.
- (b) Entry shapes on #1336 (7cad69d0f): finished clean or with issues (no `errored`); finished with a failed board
  write (`errored: true, storage_failed: true`, `services/persistence.js:2426`, rows of the whole sync); stopped by an
  error (`errored: true`, `storage_failed` if a write failed, rows only confirmed saves, :2467); cancelled
  (`canceled: true`, :5128). Rows: `refused: true` only on a real server refusal (:3373-3380); `content: true` on a
  picture or sound that did not save. CONFIRMED by reading #1336's branch.
- (c) #1336's log (Final review, red team, 2026-11-20) states the required rule: `ok` from the newest entry that is
  not cancelled and has rows, `!e.canceled && (!e.errored || e.storage_failed)`; `last_result` unchanged for Sync
  Details. CONFIRMED (docs/task-management/2026-11-16_sync-details-no-percent.md on #1336's branch).

### Proposal
- **A (chosen):** a local `last_seen_entry(mine)` with #1336's rule replaces `last_result` here; in that entry a row
  marks `failed` only when `refused`, otherwise (no error, a content error, any untagged error) `ok`; later entries mark
  `failed` only on `refused`. A bad connection, an unknown error or a picture never hides; a board the sync did not
  reach is still not `ok`.
- **B (rejected):** change `last_result` in `sync_log_store.js`. Sync Details reads it, and #1336 owns that file.
- Risks: until #1336 merges nothing is tagged `refused`, so no sync error hides a liked board (before this PR those
  boards were not listed offline at all). A stopped-with-storage-failure entry (errored and storage_failed from the
  failure branch) also qualifies under #1336's rule; its rows are only confirmed saves, so a liked board it did not
  reach is not `ok` even if an earlier clean sync saw it (hidden: the safe side). Unresolved: whether that stopped
  case should be skipped (#1336's rule includes it; kept as stated).
- Tests (red first): a clean entry from before the like, then a finished storage-failed entry that reached the board:
  listed; a later untagged error after a clean sync: listed; existing hide tests carry `refused: true`; :264 becomes
  "an untagged error no longer hides it". Mutations: back to `last_result`; hide on any error without `content`;
  ignore `refused` in later entries.

### Review of the refused-only proposal (adversary, 2026-11-21): proceed with changes; what was built
#1336 merged during the review (da911bfde); develop merged here (b94a986a7, clean). Applied:
- Medium 1, CONFIRMED: a stop entry with a failed write (errored + storage_failed + `confirmed`) qualified under the
  stated rule, and its 're-downloaded' row is logged before the reload: it could list a refused board or hide a seen
  one. `walked_whole` now also requires `!e.confirmed` (#1336 writes it on both stop paths).
- Medium 2, CONFIRMED: an untagged error row counted as "seen" could undo an older refusal. Untagged rows now decide
  nothing; such a board takes its verdict from the newest older whole sync with a deciding row (refused hides; a clean
  or content row lists), none: not seen. Within one older sync, a refusal wins over its clean row.
- Medium 4 (merge order): resolved, #1336 merged first. Contract tests added to `persistence-sync-test.js`: the real
  refusal entry hides a liked board seen before; the retries-ran-out entry leaves it listed. The import sits on the
  existing import line so the 44 baselined rows there do not shift.
- Medium 6 (tests): Cancel (no `confirmed`, as before #1336), empty-entry, stop-with-failed-write (both directions),
  fallback and same-sync-refusal assertions; `write_failed` fixture carries `issues`.
- Recorded, not changed: Medium 3, a valet device never gets `refused` (`valet_blocked` makes `real_denial` false), so
  an unshared liked board stays listed there; the fix belongs in the sync's tagging. Low 5: refusals logged before
  #1336 are untagged, so after the upgrade they stop hiding until the next sync that reaches the board re-tags it
  (liked roots are fetched every sync); revocation marks do not cover liked roots while `sync_starred_boards` is off.
Mutants: S1-S8 and S9b (one pass in row order) KILLED; S9 (`!refused_here` in the clean pass) was equivalent, removed.
743 tests on the sync and offline filters: 734 pass, 9 skipped (pre-existing), 0 fail. Lint gate adds nothing.

## Review of the refused-only code (2026-11-21): six findings verified by a second adversary, all REAL
Red team (code, 84b3fb2be): ship with conditions. A fresh adversary then tried to disprove each claim with the real
code (scratchpad verify1328/): all six REAL.
1. Medium (Risk High): a sync with no server answer for a liked board the device holds writes a row with no error,
   which `seen()` counts as seen, so a board refused in sync N is listed again after sync N+1 cannot reach it.
2. Medium (tests): every liked fixture uses `{id: '4_1'}`; the real sync logs a liked seed with the key in both
   slots (`id = next.id || next.key`, persistence.js:3092). M1 (`ok[raw.id]` only) and M2 (`!failed[raw.id]` only)
   survive every test; M1 would hide every other owner's liked board in production.
3. Low: a refusal in a stop or cancel entry between two whole syncs is never read when the later whole sync has only
   an untagged or 'kept' row.
4. Low: three test comments still state the old rule.
5. Low, NEW with this PR (not pre-existing: this file is not on develop): the seed walk passes through boards that do
   not open on a device not trusted, so an own board behind one is neither listed nor reachable.
6. Low: Modern's "You're offline." line shows while online when the device list stays up (Basic has no such line).

Why the reviews kept finding things (Traci asked, 2026-11-21): each fix added code and each review saw only the new
slice; #1328 reads the log #1336 writes, and that log changed three times while both were open; the tests used
hand-written log rows instead of what the sync writes; and for the refused-only change I enumerated who writes
errors and refusals but never who writes a CLEAN row (fix-proposal step (b), "count writers"). Plan agreed: list every
writer first, fix 1-3 with a reviewed proposal and rows in the real shape, one final full-PR review with a written
checklist and a stop rule (only Critical/High block), then freeze; later findings go to a follow-up PR.

### Finding 1: every writer of a liked board's status row (services/persistence.js on this branch)
| Writer | Row | Did the server answer for this board? |
|---|---|---|
| :2771 revision current (`safely_cached_boards`) | cached | Yes: board_revisions gives a revision only to boards the person can view (users_controller.rb:803) |
| :2774 fresh revision current, known on device | cached | Yes, same source |
| :2777 `allow_any_cached` (revisions failed for a supervisee, stamp current, :3005) | cached | NO |
| :2780 stored by this sync (late answer, #1330) | downloaded | Yes |
| :2781 then reload succeeds from the server | re-downloaded | Yes (`retrieved` set to now, utils/persistence.js:4377-4379) |
| :2781 then reload resolves from the device copy (adapter fallback on 5xx, status 0, 401, `unauthorized`: utils/persistence.js:4316-4351) | re-downloaded | NO (`retrieved` keeps the old stamp) |
| :2782 `keep_stored_board` (timeout, 429, offline, sync limit) | kept | NO |
| :2785 fresh in memory, no reload (never for a liked seed: key-only seeds always reload, `key_for_id`) | downloaded | Earlier this session (pre-existing, #1336 "Not covered") |
| :2930, :2971 batch path | cached / downloaded | Unreachable (after `return RSVP.resolve({})`, :2899) |
| :2389 merge, `with_errors`, `end_canceled_sync` | error rows (`refused`, `content`) | Yes for `refused` |
| stop paths, `confirmed_statuses` | not_saved | n/a (stops never decide) |

### Proposal
- Writer: a row whose board did not get a server answer reads 'kept' (Sync Details already treats 'kept' as saved,
  utils/sync_rollup.js:17): the reload at :2782 records the time it asked and, when it resolves with a record whose
  `retrieved` is older, marks the row 'kept' (a helper in utils/sync_board_fallback.js next to keep_stored_board,
  sharing its row lookup); :2777 writes 'kept' instead of 'cached'. Both stay on their existing lines (8 baselined
  rows below :2782).
- Reader (`seen_by_last_sync`): 'kept' decides nothing (like an untagged error). The fallback reads refusals from every
  older entry, stops and cancels included, and clean rows only from whole syncs.
- Rejected: reader-only ('kept' undecided) misses the device-copy re-downloaded rows; treating 'kept' as hidden
  brings back the over-hiding #1336 removed; checking `local_result` (not a board model attribute).
- Tests in the real row shape (`{id: key, key: key}` against raw `{id: X, key: K}`): [seen, refused, kept] hidden;
  [seen, kept] listed; [seen, cancel refused, whole kept] hidden; ordering of older syncs; harness: a liked seed's
  reload answered from the device copy logs 'kept'. Mutants must include M1 and M2.
- Unresolved: whether marking device-copy reloads 'kept' changes anything else that reads 're-downloaded'
  (`confirmed_statuses`, F1 `note_board_written`, Sync Details counts): to be checked in review.

### Findings 1-6 fixed (2026-11-21)
Review of the proposal (adversary): proceed with changes. It showed my reader rule would hide liked boards on slow
links (a timeout often still gets a late server answer, `board_download.js`; the single `force_reload` slot makes
healthy reloads come from the device copy), and that putting a flag on status rows would change about a dozen existing
exact-row assertions. Adopted its alternative: an entry-level `answered` list and the weak-row rule.
- 54c37431a (findings 1-5): `note_answered`/`answered_refs` (utils/sync_board_fallback.js); services/persistence.js
  writes the list into the finished entry on existing lines only (:2377, :2426, :2780, :2782, the import line);
  `entry_copy` keeps it; `seen_by_last_sync` rewritten: newest deciding row per board (a refusal in any entry hides;
  a really answered row in a whole sync lists); otherwise a row with no answer behind it lists only when no refusal is
  in the log; an untagged error alone does not. The walk and grouping read links through `next_of`, which skips boards
  that do not open here (finding 5). Two comments reworded (finding 4).
- Then (finding 6, Traci approved the wording): Modern's status line reads "These boards are saved on this device."
  while online (`device_boards_note_online`, generated into the 12 other locales; en.json hand-edited to add only
  this key, since the generator also re-ordered keys and added two missing keys from other PRs). Two test titles
  renamed to the refused-only rule (Traci approved).
Mutants A1-A13: 12 KILLED; A2 ('kept' may count as answered) SURVIVED, harmless: a kept row's board is in `answered`
only if another lookup of the same board got a real answer that sync, when listing is right. The online-wording test
was red before the change. 751 tests on the sync and offline filters: 742 pass, 9 skipped (pre-existing), 0 fail.
Lint gate adds nothing; baseline untouched.
Recorded, not changed (Lows from the proposal review): a late refusal after the adapter's 15 s limit is dropped, so it
cannot hide until a later sync gets it; Sync Details has no 'kept' label (pre-existing); the `force_reload` race
(pre-existing) makes more rows weak, which now lists rather than hides.
