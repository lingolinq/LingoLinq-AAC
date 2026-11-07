# Offline boards and sync (2026-11-05)

Branch `traci/fix/offline-boards-sync`, from `develop` at `d5966fc2b`. Goal: boards work offline
end to end, ending in one PR. Scot's offline app shell (`feat/scot-offline-app-shell-7a29ac97`) is
to be merged in once he pushes it; it is local to his machine, so work starts from `develop`.

Learnings grepped (`LEARNINGS.md`, `learnings-archive/`) for offline, board-detail,
board_detail_cache, persistence, prime_caches. Used: `findRecord` is offline-first
(LEARNINGS.md:93); `persistence.ajax` rejects `{fakeXHR, message, result}`
(archive 2026-10.md:493).

## Order of work

1. #1213 Modern board page reads the device (this section).
2. Other-owner boards: the parent `user` route fails offline. Touches `routes/user.js`, so it
   follows Scot's merge.
3. #1209 and the unsynced-folder dead end.
4. #1201, #1212, #1221 sync completeness.
5. #1034, N of M reporting, `all_reload`.
6. iPad web pictures (`prime_caches` without file storage).
7. mobile #3 and #1229 after a real-iPad test.

## Unit 1: #1213

### Fact sheet

(a) Where the board is read.
- CONFIRMED `routes/user/board-detail.js:119-127`: `model()` reads only `boardDetailCache`, an
  in-memory cache with a 5-minute TTL (`utils/board_detail_cache.js:27`). So besides cold starts, a
  board that was open online also fails offline once its entry is 5 minutes old.
- CONFIRMED `:300-322`: a miss reads `/tree?root_only=1`, then `/boards/<key>`, both network only.
- CONFIRMED `:526-542`: the grid is built from `_raw_board_data` through `_build_from_raw`, not from
  the record. `_build_from_raw` reads `raw.buttons`, `grid`, `id`, `key`, `image_urls`, `images`,
  `locale`, `translated_locales`, `translations` (`controllers/user/board-detail.js:2075-2700`).
- CONFIRMED `services/persistence.js:369-460`: `persistence.find('board', key)` resolves
  `record.raw`, which is the board JSON `sync` stored (`:2975`), the same shape
  `normalize_board_payload` produces for `handleRoot`. Device evidence: #1213 probe; `image_urls`
  is present in stored rows (bounded-reads log, 150.6 MB of it).

(b) Every shape of the rejection the route sees.
- `{offline: true, error, short_circuit: true}`: `persistence.ajax` while `online === false`
  (CONFIRMED `services/persistence.js:3942`).
- `{fakeXHR: {status: 0}, message, result}`: network failure or timeout with `online` true.
  `fakeXHR` reports 0 for a falsy `xhr.status` (CONFIRMED `utils/extras.js:148-150`, `:423`).
- `{fakeXHR: {status: 4xx|5xx, ...}, ...}`: a server answer (CONFIRMED same lines). This API
  answers a permission denial with 400 (CONFIRMED comment `routes/user.js`, `application_controller#allowed?`).
- `{stack, fakeXHR, message, result}`: an error in a 200 body (CONFIRMED `utils/extras.js:323`).
- `isDefinitive` (`:266`) reads `err.status`, which none of the three real server shapes carry
  (CONFIRMED). So today a real 404 or 400 is retried once. Harmless today, but a device fallback
  built on that check would serve a local copy after a real denial. The fallback must read
  `err.fakeXHR.status`.

(c) Cross-file claims.
- CONFIRMED `utils/board_detail_cache.js:194-200`, `:742`: prefetch and warm paths stop themselves
  when offline.
- CONFIRMED `controllers/user/board-detail.js:8730-8738`: a folder with a `/` key goes through
  `_preferred_board_detail_key` (`store.findRecord`, offline-first) to this same route, so folders
  are covered by the route fix.
- CONFIRMED `:8762`: a folder with only an id uses ajax. Not changed here; see open questions.
- CONFIRMED `routes/user/board-detail.js:639-645`: `cached_unless_revoked` is the existing offline
  revocation gate; the local read must pass through it.

### Candidates (as first proposed; see "Review outcome" for what shipped)

A (recommended). When the last fetch gives up with a shape that means "no server answer" (offline
short circuit, or `fakeXHR.status === 0`), read `persistence.find('board', board_key)`. On a hit: set
`_raw_board_data`, normalize and push to the store as `handleRoot` does, pass through
`cached_unless_revoked`, resolve. On a miss: the existing `{error, boardname}`. Do NOT write to
`boardDetailCache`, so a device copy is never served as a fresh entry after reconnecting, and do not
start the background tree warm.

B. `store.findRecord('board', key)` as the issue suggests, then rebuild raw from the record.
Rejected: `_build_from_raw` needs the raw JSON, and the record does not expose all of it.

C. Check `persistence.online` first and skip the network. Rejected alone: it misses `online` true
with no route (no-internet Wi-Fi), the case A gets for free.

D. Offline, send Modern users to the legacy board page. Rejected: a surprise UI change for AAC users.

5xx is excluded on purpose: a server error while online keeps today's error page with its retry.
Open to review.

### Risks

- A stale device copy can show while online but unreachable; it is replaced on the next successful
  load because it is never cached.
- With `online` true and a hanging connection the fallback comes after /tree, show and the retry,
  up to about 24 s (8 s GET timeouts, `utils/extras.js:186-189`).
- `persistence.find` records `known_missing` on a miss; `store` clears it (`:712`).

### Open questions

1. Can `user.board-detail.edit` now open on a device copy offline, and does saving behave?
2. Is a folder with only an id reachable? If yes, it needs the same read.
3. Does anything need `local_result` on the raw, as the adapter sets (`services/persistence.js:4395`)?

### Test

New `tests/unit/routes/board-detail-offline-test.js`, through the real route `model()` with
`lingoLinqExtras.storage` faked as in `board-view-revoked-test.js`:
- offline, not in memory, on the device: resolves the record; `_raw_board_data` has the buttons.
- `fakeXHR.status` 0 with `online` true: same.
- offline, not on the device: the error state.
- real 400 and 404 with `online` true and a device copy: the error state, device not read.
- offline, marked revoked: the error state.
- device copy never enters `boardDetailCache`.

Mutations that must fail: remove the fallback; widen the check to any failure; write to the cache.

### Review outcome (2026-11-05, `/adversary-review` agent at `d5966fc2b`)

The first proposal was blocked; candidate A survived with conditions. Each finding below was checked
in the code before it was applied.

Corrections to the fact sheet above:
- The hang risk was wrong: a timed-out GET is tried at 8, 20 and 20 s (`utils/extras.js:188-190`,
  `:362`), so three calls take about 148 s, not 24 s.
- "Same shape" was too strong: device rows have no sibling `images` or `sounds`. The grid still works
  from `image_urls`.
- `warm_images` and `prefetch_linked` have no online guard (`utils/board_detail_cache.js:618`, `:690`).
- Line cites in (a) and (b) are off; the current ones are `:121-133`, `:235`, `:274-294`.
- The revocation gate does nothing when `online` is true (`utils/board_revocation.js:637`).

Applied:
- Excluding 5xx was wrong: the adapter and Basic view already fall back on it
  (`services/persistence.js:4485-4493`), so 5xx now falls back.
- 8-second deadline when a device copy exists (`DEVICE_COPY_WAIT_MS`), so a hang does not hold a
  board back. A late answer is cached for the next visit and does not swap the board on screen.
- Failures are latched across all attempts. The decision reuses `route_refuses_local`, so Speak Mode
  and home and sidebar boards keep their copy; a 404 on any attempt is the error page.
- The revocation gate is forced to offline on this path.
- A record already in memory is kept. An expired session copy is read through the new
  `boardDetailCache.peek`, and the newest of it and the row wins.
- Device copies are read-only: `sync_changed` has no conflict check (`services/persistence.js:3608`),
  so an offline edit of an old row could overwrite newer server work. Checked in the edit route,
  the one place every entry passes.
- `reload_on_connect` replaces a device copy on reconnect, except in Speak Mode, where it refreshes on
  the next board.
- No warm or prefetch on a device copy. A row without `buttons` is a miss. A row the store cannot take
  is a miss.

Answers to the open questions: edit, see above. An id-only folder is reachable only through the API or
old data; moved to unit 3. `local_result` has no reader, so it is not set.

Line-number constraint: `.eslint-todo` keys rows by line, so `model` was renamed in place to
`_model_from_cache_or_server` with same-line-count edits, and new code sits below the last baselined
row. The baseline is unchanged.

### Verification

- Red first: 11 of 15 route tests failed on unchanged code; the other 4 are negative cases.
- Targeted run, filter `device.copy|board views and revoked|cold boot|reload.on.connect|board.detail`:
  244 of 244. `eslint-todo-gate`: 0 new findings. Full suite not run (left to CI).
- Mutations, each red: gate reads `online`; no in-memory check; memory copy unused; no deadline; edit
  check removed; 404 check removed; reconnect ignores Speak Mode. Run alone because the combined run
  was ambiguous: late-answer guard; `/tree` failure not latched.
- Two test mistakes, both fixed: stubbing the `utils/persistence` proxy (LEARNINGS.md:248), and using
  the real service, whose `online` reaction hung later modules at `settled()`.

### Not verified, carried forward

- NOT run on a device or emulator. #1213's acceptance needs: Wi-Fi off, cold start, Speak Mode opens
  the home board, buttons speak with pictures, folders work; on iOS and Android.
- A cold boot straight onto a board-detail URL still fails in the parent `user` route, own boards
  included (`routes/user.js:50-56`, `adapters/user.js:9-15`). Native starts at `/`, so it passes there;
  Scot's shell makes this reachable on the web. Unit 2 must cover own boards too.
- A device read that never settles because extras never become ready (`services/persistence.js:371`)
  would still leave the page loading.
- A late answer for a previous board can still overwrite `_raw_board_data` if the current board came
  from the server. The race is pre-existing; the deadline makes it a little more likely.
- 429 is treated as no answer. Decide if that is right (a school NAT shares one throttle bucket).
- `board_edit_needs_connection` is in `en.json` only; run `i18n_generator.rb` once at the end of the
  branch.
- Status 0 meaning "no answer" is unconfirmed on a native build.

### Code reviews at `523461eaf` (2026-11-06): BLOCKED, not ready to merge

The earlier review covered the proposal only. Two independent reviews of the committed code ran after
Traci asked; `/review-pr` has not run. Adversary verdict: block on a High.

Corrections to claims above and in commit `cf3cfeac6`:
- "Replaced on reconnect" is false. The Modern page forces Speak Mode on for everyone
  (`routes/user/board-detail.js:577-579`, `services/app-state.js:3493`), so the branch in
  `utils/reload_on_connect.js` does not run on the page; the test used a state the page never has.
- The Speak Mode exemption reads as "the communicator keeps a voice", but on Modern it covers every user
  after the first board, so denial and revocation checks hold only on first entry.
- "Opens for speaking only" is false: the share modal saves a device copy (`components/share-board.js`).
- "A record in memory is kept" protects identity only; `_build_from_raw` writes the older buttons onto it
  (`controllers/user/board-detail.js:2182-2185`).
- Online past 8 s is a regression: the device copy wins silently, read-only, when the server may answer
  moments later.

Findings to fix regardless of decisions: per-navigation token (High: an abandoned navigation can paint
one board's words under another's title); clear the flag on exit; arm the deadline whatever `online` says;
late refusal after the deadline; `local_db_is_current_user` plus a signed-in check before the device read;
timeout on the device read; `usable_copy` on server answers; 404 in a 200 body; the test gaps listed by the
review. Decisions for Traci: Speak Mode exemption, shared devices, notice for device copies, reconnect
behaviour, share and other actions on a device copy. Not verified: production value of
`auth_spa_transition`. Merging #1268 does not fix `online` true cold boots.

## Unit 1 rework (2026-11-06)

Branch now includes #1268 at `db76e89bc` by a local merge. Traci's decisions, all as recommended:
1. On Modern a real server denial or a revocation mark wins, except home and sidebar boards. Speak Mode no
   longer exempts, because Modern forces it on for everyone.
2. After the server ends a session, the device copy shows only on a trusted device
   (`offline_shell.device_trust`). CONFIRMED native is trusted: `device_login_flags` sets `long_token`
   for `installed_app` (`components/login-form.js:1400`).
3. A notice shows on a device copy.
4. No swap on reconnect; it refreshes on the next board. Edit asks the server again.
5. Actions that save the board are refused on a device copy, as Edit is.
Also: device copies stay read-only, and a 429 counts as no answer.

### Proposal
- **Per-navigation token.** `model` creates `nav` and sets `this._board_nav`. `is_settled` is also true when
  `nav` is no longer current. `handleRoot` writes `_raw_board_data` only for the current `nav` that was not
  served from the device, and skips the store push on a served `nav`, so a late answer is cached only. The
  flag read in `handleRoot` becomes `nav.served`, never route state.
- **Clear the flag** in `resetController` on exit.
- **Revert** the `reload_on_connect.js` change (decision 4).
- **Deadline armed always**, whatever `online` says (`persistence.ajax` can flip it).
- **Late refusal.** After a deadline copy, if the navigation ends in `{error}` and `server_refused`, and
  `nav` is current, set the controller's `model` to that error and clear the flag. The template branches on
  `model.error` (`templates/user/board-detail.hbs:551`).
- **Who may read a copy.** No device read unless signed in (`stashes.auth_settings`) and
  `persistence.local_db_is_current_user()`. Covers the memory copy as well.
- **Decision 1.** `route_refuses_local` and `blocks_view_route` take `{ignore_speak_mode: true}`, passed only
  by this path. Basic and the Modern cache-hit gate are unchanged.
- **Decision 2.** A failure with `session.dead_session_response(err.fakeXHR)` refuses unless
  `device_trust(sessionUser) === 'trusted'`.
- **Decision 3.** Controller `served_from_device` shows a `role="status"` line above the grid, i18n, in
  existing board-detail styling, sized for AAC.
- **Decision 4 for Edit.** Offline: the warning stands. Online: a different message, and the board refreshes
  from the server; if the server answers, the flag clears and Edit works on the next tap.
- **Decision 5.** `_blocked_on_device_copy()` guards `share_board`, `open_board_privacy` and `translate_board`,
  the board-changing actions outside edit mode (traced from the template; `other_board_actions` and
  `recolor_board` are edit-only). `switch_languages` to be checked.
- **Server answers.** `usable_copy` on the `/tree` and show paths, so a 200 block page counts as no answer
  (`lib/json_api/board.rb:24`: `buttons` is always sent).
- **Bounded read.** The device read gives up after `DEVICE_READ_WAIT_MS` (5 s).
- **404 in a 200 body:** also read `err.result.status`.
- **Memory copy survives expiry.** `get` drops an expired entry, including when `_build_from_raw` reads it, so
  `peek` was one-shot. Keep expired raws in `_expired` for `peek`, cleared by `clear()`. Comment on the kept
  record corrected: identity is kept, the grid comes from the newest copy.

Rejected: skipping the deadline copy for an `outdated` row. Any row over a week old is flagged
(`record.important` is never set, `services/persistence.js:430`), so a device a week from its last sync would
wait about 148 s on a bad network. The notice covers the honesty concern. Disagrees with the review, on purpose.

Not in this unit: `online` true cold boots and other-owner boards (unit 2, `routes/user.js`).

Tests: two overlapping navigations; flag cleared after a device copy; server wins during the device read;
`DEVICE_COPY_WAIT_MS` pinned; no warm on a device copy; edit allowed with the flag false; late answer leaves the
record alone; `_build_from_raw` on a kept record; deadline with `online` false; late refusal; signed out and
wrong database; dead session shared and trusted; Speak Mode denial now refused; home and sidebar kept; hung
device read; HTML 200; guarded actions.

### Rework outcome (2026-11-06)

The proposal above was blocked by a third review (two Highs, both from using the router as a refresh
mechanism: refresh with the same record skips setupController). What changed from it:
- One flag, on the controller, set when a navigation settles and cleared on exit.
- Edit fetches and rebuilds directly (`_refresh_device_copy`), not through the router.
- A late refusal goes back through `model()` with a latch, so Try Again works; the copy stays off until the
  server answers.
- A dead session is remembered per token, and read from a 200 body too.
- `_blocked_on_device_copy` also guards `enter_edit_mode` (covers the non-owner copy path) and `make_a_copy`;
  the Translate button in the languages modal is refused.
- A 404 counts only from the API, and a home or sidebar board keeps its copy even then. This goes past the
  letter of decision 1, in the direction of keeping the voice. Raise it with Traci.
- Signed in means `session.access_token`, because a forced logout leaves `auth_settings` as `{}`.
- The whole of `_device_copy` is bounded, not just the read.
- `get` keeps an expired entry for `peek`, instead of a separate map.

Not done, on purpose:
- The Modern cache-hit gate (`cached_unless_revoked`) still exempts Speak Mode. `board-view-revoked-test.js:308`
  pins that, so changing it needs Traci's approval (Rule 14). Effect: a marked folder opens offline inside
  the 5-minute window, and is refused after it.
  Traci decided 2026-11-06 to leave this as it is: it can only keep a board open a little longer.
- A refused Edit-tap refresh does not take the copy off screen; the next navigation does.
- The Modern route does not clear revocation marks; the next sync does.

Verification: targeted run 357 of 357 before the last test-only commit; `device.copy` filter 40 of 40 after it.
`eslint-todo-gate` 0 new; template lint clean. 25 mutants, all red: 23 + 2 in split builds, and the three that first
survived (superseded navigation, finished read, board no longer on screen) red alone after tightening those
tests. Full suite and Playwright not run. Device check not done.

### Reviews of the rework at `eab2bd342` (2026-11-06): BLOCKED again, stopped under Rule 13

Adversary and security reviews each block on a High, both verified in the code:
- A device read that outlives `within` still sets `nav.served` (`routes/user/board-detail.js:724`), so a later
  200 is dropped at `:179` and `model()` never settles.
- `set_as_home` and the trial bar's Use reach `create_copy` unguarded, so a device copy can be written to the
  server.
Also open: notice contrast about 1.95:1 (no `color` set); a device-built grid can attach to a server cache
entry; in-time denials are not latched; dead-session latch skipped when there is no row; a stale setup closure.

Correction: "25 mutants, all red" overstated coverage. The reviewer's 14 further mutants all survived a
310-test filter, including `blocks_route` ignoring the option, the edit route check, and the notice.

Most of these come from one design choice: racing a timer against live requests, so answers can arrive after
the page has moved on. Proposed next: drop the race. Bound the requests themselves, and read the device only
after they have ended, so nothing can arrive late. Waiting on Traci.

The Playwright specs in `test(offline): cover the Modern device copy` have NOT been run. Rails needs
SECURE_ENCRYPTION_KEY in this worktree; database `lingolinq-e2e-traci-offline` exists but has no schema yet.

Correction: a new browser device does not sync on its own: `lib/json_api/user.rb:137` sets `ever_synced` false,
and `models/user.js#auto_sync` then answers false. #1236's first-sync fix applies to installed apps.

## Unit 1 simplified (2026-11-06)

Traci: follow current best practice. So: network-first with a timeout, then the local copy, with everything
in order. Decided: a denial sticks until the server answers; first sync runs automatically for Home Screen
installs on a trusted device (not desktop browsers, until #1221); a deleted home or sidebar board keeps its copy.

### Proposal
- **No race.** Remove the deadline timer. `/tree` is one bounded attempt: `{timeout: 8000, attempt: 3}`
  (`utils/extras.js:186` honours a timeout; `:362` retries only while attempt <= 2). jQuery ends the request, so
  no answer can arrive late.
- **Order.** `/tree`. On no answer (offline, or status 0): device copy if there is one. Otherwise the existing
  show path with its normal timeouts and retry. A 5xx keeps the existing retry. When that gives up: device copy,
  then the error page.
- **Removed:** `nav.served` guards, late-refusal path and its `'show'/'retry'` states, `within` around a racing
  read, `_after_late_failure`. Cost: an answer after 8 s is not seen on this visit, and nothing is cached from it.
  This differs from Workbox's NetworkFirst, which lets the request finish and update the cache; given four
  blocked rounds, no background write. Rows are refreshed by sync, and Edit fetches with normal timeouts.
- **Kept:** `nav` token for superseded navigations; `_may_read_copies`; decision rules; notice; read-only guards.
- **A stuck read:** `within` wraps read and checks, and only its result is applied, so an abandoned read writes
  nothing.
- **Latches** are evaluated even when there is no row, and keyed to the token: `_refused_boards[key] = token`,
  set on any refusal, cleared on a server answer; dead session also reads `session.invalid_token`.
- **Guards added:** `set_as_home`, trial bar Use.
- **Stale setup closure:** skip `_finalize_board_display` when `_raw_board_data` is no longer that raw;
  `_refresh_device_copy` updates it.
- **Notice:** explicit colour, and no push on the grid.
- **First sync:** `models/user.js#auto_sync` true for a standalone display with the shell on, on a trusted device.

### Simplified design: outcome (2026-11-06)

Built as proposed, with the proposal review's conditions: `/tree` one bounded try; no answer and a copy goes to
the copy; no copy keeps the normal retries (`attempt: 2`); the show request is bounded only when a copy exists;
`_find_copy` writes nothing, so a read past its limit has no effect; a refused Edit fetch goes back through the
router. First sync is a one-shot `offline_shell.first_sync_when_installed`, not a change to `auto_sync`.

Found only by the real browser (each now has a test):
- A denial on a cold reload opened the copy: the rule says nothing until the session user has loaded. Fixed by
  waiting for the read already running.
- Clearing `_board_nav` on exit (a review suggestion) threw away slow boards, because the loading page exits the
  route: a blank grid online, an error for a synced folder offline. Removed.
- A refused action left the options menu open over the message.

Browser setup: use `ember build --environment production`. A development build includes Mirage, which answers
the API. Worktree has no `.env`, so a made-up key and a private database are used.

Run: QUnit filter 393 of 393; `offline-launch` 7 of 7; `offline-worker-lifecycle` 4 of 4 (before the menu change);
`offline-kill-switch` 2 of 2; PR RSpec 125 of 125. Share is not in the browser journey (a communicator-only account
has no Share menu); it is covered by the controller test.

### Final reviews (2026-11-06, at `3f42ae94e`): adversary SHIP, security SHIP

No Critical or High. All eight invariants traced. Fixed after: a 404 is not remembered before the session user
is known, and protection is read before the latch; a longer session wait after a server refusal; the notice
stays on one line.

Left, for Traci: a denial does not survive a relaunch (next sync marks the board; matches Basic); trial Use on
a folder can copy a device-copy root in a narrow state; the cache-hit path ignores a dead session on a shared
device for up to 5 minutes; trial Use and the modal's Translate say "needs a connection" even when online.

Final run: QUnit filter 396 of 396; `offline-launch` + `offline-worker-lifecycle` 11 of 11;
`offline-kill-switch` 2 of 2 (one commit earlier; that commit changed no worker code).

### Decisions and full RSpec (2026-11-06)

Traci: accept and log both. (1) A denial does not survive a relaunch: a denied folder can reopen from the device
offline until the next sync marks it; matches Basic. (2) Trial Use from a folder can copy an older tried board
in a narrow state; it only makes a new copy, and the original is untouched.

Full RSpec on this branch: 8,538 examples, 28 failures, none new; unchanged develop fails the same 28 plus 4 under the
same settings. Causes, verified: 22 are the blank upload settings used to keep tests off real storage (those
files: 778 examples, 0 failures with made-up values); 6 are `jq` missing on this machine
(`deploy_cloudrun_migrate_env_spec.rb`), so CI is the check for those.

### Senior-dev pass (2026-11-06)

`REVIEWED=range origin/feat/scot-offline-app-shell-7a29ac97 (ee9f494579bbc20e980237c2770a0755d679e188) ... traci/fix/offline-boards-sync (9d7feb84af9aa579328568c68ed2950ef2c4dda8)`.
Verdict request changes on one High, each finding checked against the code. Fixed: rejection in `_find_copy` falls
through to the normal requests; `nav.patient` flag replaces reading `options.attempt`; a timed-out read is tried again;
the row is read before refusal is judged, so a home board held by id is kept; `root_only` on the Edit fetch; opaque notice
background; tests for the grid cache and Translate. Not changed: `get` (two reviews traced every reader); `:has()`
(Safari 15.4, the worker's own floor); no fail-closed when the session user misses the 10 s wait (it would risk a home
board; matches Basic). `extras.js` does not change `options.attempt` (CONFIRMED `:178-182`, `:364`). New strings are
in `en.json` only: `i18n_generator.rb` needs a 1Password session; add them to #1234.
