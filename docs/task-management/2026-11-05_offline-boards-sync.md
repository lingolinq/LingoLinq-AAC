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

## Full fix on #1268 (2026-11-06)

Scot asked for the full fix on his PR; Traci: make every fix that can be made. Order: other-owner boards and no-internet
launch; #1209; iPad pictures; #1201; #1212, #1221, #1219; #1034, N of M, `all_reload`, #1229, #1230; #1206.
Not ours to do here: `security-scan` fails on develop too (activestorage and activesupport advisories); a Gemfile
change is shared config, so raised with Traci.

### Other-owner boards and no-internet launch (done)
`routes/user.js#_board_page_owner`, from Scot's safer design (task log 2026-11-03) minus its `OFFLINE_APP_SHELL` gate:
native apps never set it, and this runs only where the error page was the alternative. Real record first; a stand-in
only when the owner's board is on the device; replaced on the first non-board page. `one_try` on the adapter bounds the
request. Mutations red: no refresh (browser), owner check, trust check, refusal check, bound.

### #1209 (done)
Offline: `board_saved_here` before leaving the board (Modern folder tap and `app_state.jump_to_board`, so sidebar and
Basic folders); the loading page clears the board once a transition starts, so this must come first.
`afterModel` sends a board that cannot show to the boards page; a refusal keeps its error page. `route.replaceWith` does
not exist in Ember 5: the browser caught it, a stub had hidden it.

### iPad pictures (NOT done; stopped under Rule 13)

Work is in `git stash` ("wip: iPad pictures offline") in this worktree, not on the PR. What is known:
- CONFIRMED by a red browser run: with the browser cache cleared, a board picture does not show offline.
  The first version of that test passed on the browser's HTTP cache; it must clear it.
- CORRECTION: Chromium does NOT take the Safari path. `local_system.available` is true and pictures use
  `filesystem:` URLs. To test the Safari path, remove `webkitRequestFileSystem` before boot.
- The seeded picture was not saved by sync (`dataCache` miss). A hand-created `ButtonImage` has no image record
  in the board response; how sync selects pictures is not traced. Seed through the real image flow.
- With the file API removed, the test timed out before the picture check, step not identified (read the trace; a
  sync that hangs without file storage would be its own bug).
- The stashed fix has three parts: `primed` set when there is no file storage; `find_url` reads the database
  there; `load_copy_images` fills `url_cache` for one board, since Modern's grid reads it synchronously. Unproven.

Next after pictures: #1201, #1212, #1221, #1219, #1034, N of M, `all_reload`, #1229, #1230, #1206. Then the two final reviews
of everything since `3f42ae94e`, `/review-pr`, and Scot's requested review.

### Priority 1 (2026-11-06)

Traci's order after re-reading the issues: P1 pictures and sounds, #1205, #1201; P2 #1221, #1212, #1219, picture repair; P3 #1034, N of M, `all_reload`,
#1229, #1230; P4 #1206, leftovers. #736 and #1139 dropped: neither stops a saved board showing.

**Sync on a device with no file storage: was failing outright.** `capabilities.storage.list_files` ran unguarded, so with no
`webkitRequestFileSystem` (Safari) every sync rejected `not enabled` in 25 ms and saved nothing. So an iPad Home Screen web app
could not sync. Found by removing the API from Chromium; confirm on a real iPad.

**Pictures on that path: done.** Red with the browser cache cleared. `primed` set when nothing to prime; `find_url` reads the database;
`load_copy_images` fills `url_cache` for one board, in both views. `_record_for_copy` strips sideloaded `images`, which threw in `store.push`.
The sync "gap" was a test artifact: `store_url_now` refuses localhost, and other hosts go through the server proxy. Mutations red in both views.
Sounds use the same `find_url` path but are NOT tested.

**#1205: done.** `capabilities.database_unavailable` on a failed setup, plus a 30 s limit. Fixes queued calls for IndexedDB too.
A success-path test was dropped: order-dependent hang with neighbouring tests, and every browser journey runs that path.

**#1201: partial.** `capabilities.mobile` is true on an iPad. `system` stays "Mac": the iOS branch reads an iOS version the Mac agent lacks,
and `system == 'iOS'` changes file URLs and database indexes, which the simulator passed without. Needs a simulator run. Side effect:
a signed-out iPad Home Screen launch gets the iPhone's sign-in overlay.

### #1205 and #1201 follow-up (2026-11-06)

Both were reported as more done than they were. #1205 now covers a `db_settings` failure; a `db_connect` failure runs the queue, since the
database itself is open. Decision: show an error, not an IndexedDB fallback, which would hide a failed database behind boards that look saved. The text
reaches the user through `sync_status_error` (Modern's Sync failed notice); untested. The 30 s limit covers setup only, not every native call in
mobile #6. Simulator check with a forced failure not done. Two tests were dropped (success path, `db_settings` failure): after the neighbouring `capabilities`
tests they hang or receive a promise, so something there leaks state. Not traced.

#1201 readers of `capabilities.system`, what `iOS` would change on an iPad:
- Would improve: `no_linky`, native voices (`voice-output`, `tts_voices`, preferences), iOS subscription handling, `confirm-external-app`.
- Needs a simulator: `fix_url` file URLs (`capabilities.js:1537`, `:1571`), `local_url` encoding (`persistence.js:434`, `:1337`), `dbman.js:763-764` IndexedDB
  indexes (existing web databases), `app.js:144`.
- `system_version` / `ios_version`: none on an iPad (the agent says `10_15_7`), so unset; the version parse no longer throws without it.
`capabilities.mobile` uses `Capacitor.getPlatform()` in the app. `system` stays Mac until a simulator run.

### Reviews at `e7d8aaede` (2026-11-06)

Security ship, senior-dev approve with comments, adversary BLOCK on two Highs. Checked each.
- A memory copy passed the pre-check, then the parent route failed with no owner, landing on `error.hbs` with no Home or Back. `_device_owner` accepts a
  memory copy, and no owner plus no connection leaves for a safe page; the rejection carries `reserved_path`, so the error action shows nothing.
- The escape page said "You don't have any boards yet": its list needs the network. Destination changed: the home board when saved, else `offline_boards`, which is
  bundled. This replaces the boards page #1209 proposed. The e2e now asserts the board is visible, not just the URL.
- `_device_owner` gates on `local_db_is_current_user` and a trusted device, and marks real records as watched too.
- Basic: an owner from the device means no server answer, so the revocation check and pictures treat it as offline.
- Also: sync guard is `!== false` (a truthy check skipped the listing while the check ran); a timed-out read is not "not saved"; `load_copy_images` swallows failures;
  `jump_to_board` ignores a superseded tap; one board of pictures in `url_cache`; memory hits load pictures; #1209 covers no connection with `online` true.
- Browser only: a message before the first render threw `must call setup before trying to show a flash message`, which stopped the redirect. The message now follows the move.
- `reload-on-connect` test restored.

Left: Home and Back do not pre-check (they reach the same escape). Owner then board can wait 8 s each on a hung network (M10). A late setup success after 30 s is not specially
handled (reviewer found it safe: same database). Sounds untested. Check `auth_spa_transition` in production.

### Verification review at `da588782d` (2026-11-07): SHIP

Both Highs closed; no new Critical or High. Three Mediums fixed after, each test red with its fix reverted:
- `owner_stand_in` could stay set after an early-returning navigation (your own board), so Basic treated a healthy online user as offline. Cleared at the top of every
  `user` model.
- Every memory hit read pictures from the database on a no-file-storage device, online too. Now only offline.
- A shared device's pre-check let a tap through that the owner lookup then refused. `board_saved_here` now refuses someone else's board there.
Noted, older than this work: the own-page offline branch still reaches `error.hbs` if the session user cannot be read in 10 s.

### Review of Scot's areas at `4c29c4189` (2026-11-07): no Critical or High

Device trust and the Home Screen sign-in (security-reviewer); two-tab lock (adversary); deploy workflow
and e2e seed read inline. Specs: workflow, `json_api/user`, `offline_shell` 93/93 on the test database.
(An earlier red run of `json_api/user_spec.rb:974` came from running against the e2e database by mistake.)
- Medium, CONFIRMED (already found by Scot's round 3 review and listed in the PR's known limits with a manual workaround; our reviewer rediscovered it because the open-items summary it was given left it out): a Device row already trusted (older Home Screen sign-ins forced `long_token`) stays
  trusted; `device.rb:172` never lowers it, so those installs never get the question. Needs a decision
  (reset rows, or ignore stored trust for Home Screen sign-ins). Prod has no real users yet.
- Low, CONFIRMED: `lib/json_api/user.rb` keeps the nearest device's `long_token` when there is no
  device (supervisor view); the commit message's "nil until chosen" does not hold there.
- Low, CONFIRMED, FIXED: the off-setting removal in `instance-initializers/offline-shell.js` skipped the site-wide lock; it now runs through `apply_device_trust`, which takes it. Test red before the fix; kill switch e2e 2/2, launch and lifecycle 16/16. The other Lows were judged not necessary (Traci) and stay open items.
- Low, CONFIRMED: `apply_device_trust` reads the page token when the queued step starts, not with the
  trust answer, so a sign-out and shared sign-in in the same page while waiting can register for the shared user.
- Low: three lock guards survive their removal in node replicas of the unit tests; an orphan shell cache
  can survive a removal racing an install (generic content only).
- Deploy workflow: sound (`--set-env-vars` replaces the set, so deleting the variable turns the shell off;
  the value passes the comma and whitespace check). Seed: guarded to local dev/e2e databases, made-up values.

### Scot's open item 1 done (2026-11-07)

The Home Screen "Trust this Device" question is asked only where `OFFLINE_APP_SHELL` is on
(`components/login-form.js` `device_login_flags`, reading `offline_shell.setting(window)`). With it off or
unset, a Home Screen sign-in is trusted as before the PR, so the change no longer alters production sign-in
on its own and a dedicated AAC iPad is not asked. Two new unit cases red before; restoring the old
condition turns them red again. The Home Screen unit case was rewritten for the changed specification
(Scot's suggestion, Traci's approval). Units 76/76, lint gate OK, e2e launch and lifecycle 16/16 with the shell on.
Research on a code fix for the earlier trusted iPads: `2026-11-07_aac-device-trust-research.md`.

### Code fix for earlier trusted Home Screen iPads: fact sheet and proposal (2026-11-07)

Traci: build it on this PR (Scot asked for the full fix). Research: `2026-11-07_aac-device-trust-research.md`.

Facts:
- READ: trust for a sign-in is decided in `SessionController#assert_session_device` (`session_controller.rb:1301`,
  `long_token = params['long_token'] ...`) and kept by `Device#generate_token!` (`device.rb:172`: a browser row
  with `settings['long_token']` true stays long whatever the sign-in sends). CONFIRMED.
- SHAPES of `Device#settings['long_token']`: true, false, nil; nil counts as trusted in `token_timeout`
  (`device.rb:24`). CONFIRMED.
- `long_token_set` and `preferences.device.asserted` cannot mean "a person chose": `process_device`
  (`user.rb:3851-3853`) sets `long_token_set` on any save carrying `device.long_token`, and stores every device
  key including `asserted` (`user.rb:3878-3882`), which the serializer sends back and whole-record saves
  (`app-state.js:550, 1727`, `persistence.js:3562`) post again. CONFIRMED.
- The sign-in request does not send `browserless` (`services/session.js:148-159`). CONFIRMED.
- Device rows are per user and per install id (`lingolinqDeviceId`, `extras.js`), so only users who signed in
  from that Home Screen install before the PR are affected. CONFIRMED.

Candidate A (chosen for review): (1) the sign-in sends `browserless=true` from a Home Screen web app; (2) in
`assert_session_device`, when not a native app, `browserless`, `OfflineShell.enabled?`, the sign-in did not ask
for a long token, and the row is trusted (`settings['long_token']` true) without `settings['long_token_chosen']`,
set the row untrusted before `generate_token!`, so the token is short and the app asks Trust or Shared;
(3) in `process_device`, on the user's own device, set `long_token_chosen` when the save changes the row's trust
value. An echo never changes it, so it never marks; choosing Trust after (2) is a change (false to true).
Candidate B: the app re-asks when the token is long but unchosen (token JSON carries the mark). Weaker: the
session stays long until answered, and closing the app skips it.
Known interactions: the supervisor-save path (accepted item) could mark a supervisee's row by a change; a
person who ticks "keep me logged in" on the sign-in form keeps a long token but is asked again next time.

Proposal review (adversary, 2026-11-07): candidate A BLOCKED as written. No code written.
- High, CONFIRMED in code (timing PLAUSIBLE): an offline replay of a whole-record save from the old trusted
  session (`persistence.js:3616` replays the stored copy; `users_controller.rb:198` passes the own device)
  carries `long_token: true`, which the change rule reads as a choice, overturning a Shared answer.
- High, CONFIRMED: SAML-enforced sign-ins redirect before `assert_session_device` (`session_controller.rb:529-531`),
  and the SAML and Google configs carry no `browserless`, so district iPads would never be reached.
- Medium: an unanswered question leaves a short session and nothing asks again (AAC: signed out after 12 h idle).
- Medium: supervisor and act-as saves can mark a row. Lows: one extra 2FA prompt; an org timeout outlives a
  Trust answer; people who answered Trust under #1268 are asked once more.
Amended design: an explicit answer endpoint (Trust and Shared, never stored offline), process_device leaves a
chosen row alone, a pending flag with a re-ask at app start, the SAML and Google callers, own-device and
no-act-as guards. Estimate 2 to 3 days with reviews. Stopped for Traci's decision.
Decision (Traci, 2026-11-07): not in #1268, because Scot did not ask for it. Filed as issue #1285 for Scot to
decide (code fix or keep the manual workaround). A build of the amended design was started and reverted
before commit; nothing from it is in the branch.

### Basic view offline browser test (2026-11-07)

`e2e/offline-launch.spec.js` "Basic view offline": a synced folder, someone else's synced board (Crisis
Vocabulary, cold launch), a board that is not saved (own and another owner's URL: home board), and a folder
whose copy is gone (answer at once, board stays). Passed; red with `board-alt.js` afterModel's
leave_unsaved_board removed ("the home board, not the error page").

### WebKit (Safari's engine) as an iPad (2026-11-07)

iOS Simulator needs a Mac; this machine is WSL. Playwright WebKit 26.5 installed (system libraries by Traci).
`E2E_BROWSER=webkit` (or `openProfile(..., {browser: 'webkit'})`) runs a profile as a current iPad: iPad
screen and touch, Safari's Mac identity, 5 touch points, `MacIntel`.
- offline-launch and lifecycle in WebKit: 3 passed, 12 failed, all from Playwright, not the app. After
  `setOffline(true)` a navigation through the worker fails inside WebKit ("internal error"), and
  `context.route` never sees a worker-controlled page's requests (probe: a routed abort saw 0 requests;
  the request reached Rails). Before that point every case signed in, installed the worker and synced in
  WebKit; the picture cases saved the picture in the database (no file storage, as on an iPad).
- New `e2e/offline-webkit.spec.js` (project offline-webkit): goes offline by closing a pass-through proxy
  (nothing answers) with navigator.onLine false. Modern, Basic and Basic with a picture: cached app page
  from the worker, synced board, synced folder, saved picture as a data: URL. 3/3 passed.
- Chrome offline-launch and lifecycle after the helper change: 17/17.
Not iOS and no Home Screen mode: a real device is still needed.

### Storage limits and eviction, explored (2026-11-07)

Exploration script (not a test), Chromium with a Home Screen profile against local Rails with the shell on.
- Wiped (iOS eviction or "Clear website data": worker, caches, IndexedDB, localStorage, cookies): offline,
  the browser's own offline page (nothing left, unavoidable). Online, signed out; after signing in again from
  the Home Screen the first sync starts on its own (offline_shell first_sync_when_installed) and all 3 boards
  are back. Recovers.
- Full storage: `Storage.overrideQuotaForOrigin` had no effect in a persistent context (quota still 10.7 GB),
  so every IndexedDB write was made to fail (its transaction aborted). Sync reported `succeeded` with no error
  and no notice, with 0 boards stored (14 failed writes). Offline the app went to `/offline-boards` (no dead
  end), empty.
- Cause (CONFIRMED by reading): `dbman.store_internal` (`app/utils/dbman.js:456-462`) calls success on the
  put request's `onsuccess`, before the transaction commits. A real quota failure usually arrives as the
  transaction's abort (QuotaExceededError) after that, which nothing listens for, so even a genuine full
  device reports the write as saved. Whether `persistence.sync` also ignores store errors is not yet checked.
- Not yet fixed: needs an estimate and a decision (Traci).

### Fix: a device that cannot save no longer reports a sync as succeeded (2026-11-07)

Traci: fix on this PR.
- `utils/dbman.js` store_internal (IndexedDB): answers once, on the transaction's commit (saved) or its abort,
  a request error, or a thrown put (not saved; `quota` when QuotaExceededError). It used to answer saved on
  the request's success, before commit, and a thrown put never answered.
- `persistence.store` keeps its never-reject contract and counts failed writes (`utils/storage_failures.js`).
  A sync that saw a failed write since it started ends as failed with a message (out of storage, could not
  save, or the existing "restart the app" when there is no database), and keeps the sync stamps so the next
  sync saves those boards again; the last sync time moves on, so automatic syncs keep their pace.
  Single-line edits in persistence.js (line-keyed ESLint baseline).
- Strings: `device_storage_full`, `device_storage_write_failed` (en only; #1234 for the 12 locales).
- Tests: 4 store_internal cases with a stand-in database (3 red before); 4 sync cases (2 red before, 1 red
  before the timing change, 1 guard); mutants `writes_before = 0` and "always store lastSync" each turn one
  red. e2e "a device that cannot save boards is told so" (Chrome).
- Review (adversary, code): ship with conditions; Medium (repeated full syncs) and the test gaps fixed, the
  "restart the app" advice added. Known limits: writes through the Ember Data adapter's utils copy
  (`utils/persistence.js` store_eventually) are not counted and land after a sync; the SQLite path never
  sets `quota`; the reason is not kept across a relaunch.
- Runs: units (persistence, sync, dbman, capabilities, offline) 631 pass, 0 fail; Chrome offline 18/18;
  WebKit spec 3 runs, 2 passed, 1 failed on sign-in (after "Trust this Device" the page stayed on the question
  and no user save was sent). Not reproduced in 9 isolated WebKit sign-ins or 6 more in 2 spec runs. Cause
  unknown: OPEN.

### #1221 slow-down 1: which boards the offline sync takes (2026-11-07)

Traci's decision: option 2 revised. The offline sync takes the home board and its folders, the sidebar, starred
boards, and the boards the person made or copied themselves; not the starter copies made at sign-up (unless
used as home, sidebar or starred, which brings them in through those), and not public or library boards.

Facts:
- Seeds READ in `services/persistence.js` startBoardSync: home (:3059), sidebar (:3065), then with
  background prefetch on: phase2 starred, phase3 owned roots, phase4 public roots (:3074-3091) from
  `utils/board_prefetch_planner.js` buildPhasedLookups; owned roots from GET /api/v1/boards?user_id=
  (`fetchOwnedBoards`, cap 200) through `utils/board-roots.js` filterRootBoards. Lists fetched at :3494
  (`includePublic`). The fallback copy in `utils/persistence.js` (:3115, :3522) mirrors it. CONFIRMED.
- Public prefetch for browsing online is separate (`utils/board_detail_cache.js` :221, :863, :1015). CONFIRMED.
- Sign-up starter copies: `lib/user_board_provisioner.rb` copies (background) vocal-flair-84, yesno,
  inflections, quick-core-60, vocal-flair-60, crisis-vocabulary, senner-baud (Spanish: quick-core-60-es,
  vocal-flair-60-es, inflections-es) through `User#copy_board_to_library` (only caller), updater = the
  system owner. Full copies with their linked boards (`copy_board_links`, no id list). The copy records no
  copier (`app/cloners/board_cloner.rb`), so a starter copy cannot be told from one the person made. CONFIRMED.
- Flag `signup_default_library_boards` forced on (`lib/feature_flags.rb:151`). CONFIRMED.

Proposal: (1) `copy_board_to_library` marks the root copy `settings['signup_starter'] = true` when the updater
is the system owner; (2) `lib/json_api/board.rb` sends `signup_starter`; (3) collectOwnedRootLookups skips
roots marked `signup_starter` (they still come in as home, sidebar or starred); (4) the offline sync no longer
seeds phase4 public roots or fetches the public lists (service and the fallback copy). Existing accounts have
no mark, so they keep syncing their starter copies; no backfill (production has no real users).
Alternative: a client-side rule by parent board key (lingolinq/<sign-up slug>), no server change; rejected
because it also drops a library board the person later copied on purpose.

Proposal review (adversary, 2026-11-07): ship with conditions. No board a person uses is lost (sidebar seeds use
the person's resolved copies; home, starred and linked folders come in by traversal; nothing depends on public
roots being on the device). Conditions:
- Medium: the mark must lift. Copy-as-home flows reuse the starter copy (`utils/board-copy.js:93,138`,
  `User#copy_to_home_board` :3940-3950) and edits never clear settings, so a customised starter copy the person
  opens from the boards page would drop out. Clear on the first edit by anyone but the system owner, and when it
  becomes home or a sidebar entry.
- Medium: write order. `copy_board_links` reloads and relinks the root (`user.rb:4686`,
  `board_set_copier.rb:30-32,104`); marking the stale in-memory copy afterwards would undo the folder links.
  Mark between `copy_for` and `copy_board_links`, with a spec that the links survive.
- Low: `collectOwnedRootLookups` also feeds the online warm-up (`board_detail_cache.js:842-850`): make the skip an
  option only the sync passes. Low: leave the field off shallow clones. Low: spec the field on
  `boards#index?user_id=` (list summary), not `as_json`.
Estimate with the conditions: about a day with tests and a code review. Waiting on Traci.

### #1221 slow-down 1 done: the offline sync takes home, sidebar, starred and Crisis Vocabulary (2026-11-08)

Traci's final decision (replacing the tag plan above): to have a starter board or any other board offline, star
it. The offline sync starts from the home board, the sidebar, starred boards (not the system's suggestions,
unless "Make my Home Board a list of all my liked boards") and Crisis Vocabulary, always (the sidebar misses it
when the whole sidebar was replaced: `User.merge_missing_default_sidebar_boards` re-adds it only while a default
entry remains). Not owned roots or public roots; the background prefetch setting now only warms memory for
browsing online.
- `utils/offline_sync_seeds.js`, used by both sync copies (`services/persistence.js`, `utils/persistence.js`);
  the list fetch for the sync is gone, and so is the now unused planner import.
- Lint baseline updated with Traci's approval: 69 rows in the two sync files moved line numbers only (same
  1,549 rows before and after, compared ignoring line numbers; gate clean).
- Found on the way (CONFIRMED, `api/boards_controller.rb` user filter): listing another account's boards needs
  view_detailed on it, so for an ordinary user the library list (user_id=lingolinq) answers 400, which rejects
  the whole prefetch list fetch (`board_prefetch_planner.js` fetchBoardListsForPrefetch), so owned and public
  roots were not reaching an ordinary user's sync before this change. The 1,355 extra boards in #1221 most
  likely came from an account allowed to list the library (not checked).
- Tests: 7 unit cases for the rule; e2e "a sync saves the home board, starred boards and Crisis Vocabulary, and
  not an unstarred board" (new user e2e_offline_stars; star! needs User#remember_starred_board!, run directly
  as no workers run locally). Red with starred boards dropped from the rule. The "not an unstarred board" check
  could not be made red locally (see the 400 above). Four sync tests updated with Traci's approval for the new
  Crisis Vocabulary start: their fake server answers it, one count 2 to 3, two status lookups by id or key
  instead of position, one list of reloaded boards.
- Runs: units 614 pass, 0 fail; Chrome offline 19/19; WebKit 3/3; lint gate clean.
- Not done: slow-down 2 (duplicate large writes), the before/after board count on a real account, and wording
  that tells people a star saves a board offline (Traci).

### Like keeps a board offline: the wording (2026-11-08)

Traci: keep "Like" in both views, add the wording.
- Modern: "Set as Favorite" renamed "Like" (`templates/user/board-detail.hbs`, edit panel, Board Actions), tooltip
  "Like this board to keep it on this device for offline use". Basic: the same text as hover text on the header
  Like button and the small-screen menu item (`templates/application.hbs`). Same-line edits (template lint rows).
- After liking, both views (`models/board.js` star_or_unstar): "Liked. This board will be kept on this device for
  offline use after the next sync." Hover text never shows on an iPad. Unliking says nothing.
- Boards page, Liked tab selected (`dashboard-user-boards.hbs`, `boards-browser.hbs`): "Liked boards are kept on this
  device for offline use." New rule `.ub-boards-page__offline-note`, 18px.
- Sync details (`sync-details.hbs`): "Kept on this device for offline use: your home board and its folders, your
  sidebar boards, your liked boards, and Crisis Vocabulary."
- en.json: like_offline_hint, liked_kept_offline, liked_boards_offline_note, sync_offline_scope (#1234 for the 12 locales).
- Tests: 2 unit cases for the message (red with it removed); 287 component and page tests pass; ESLint gate,
  template lint clean; stylelint's one error (app.scss:74, a `//` comment) is pre-existing. Screenshot in a
  production build: the Like row and the message render.
- Found: in Modern, Like sits in Edit mode > Action Panel > Board Actions; there is no Like on the board page
  outside Edit.

### #1221 slow-down 2: the same records written twice in one sync (2026-11-08)

To do after this PR's work (Traci, 2026-11-08): run `i18n_generator.rb --generate` and `--merge`, then
`op run --env-file=.env.op.local -- bundle exec rake extras:translate_ui_locales LOCALE=all` (needs 1Password
signed in; es.json alone has 701 `***` strings waiting), likely as its own PR under #1234.

Facts:
- Measured locally (IndexedDB, Chromium, e2e_offline_modern, every IndexedDB put recorded during a manual sync):
  15 writes, 13 distinct; the user record twice (12 KB, the second from a different caller 2.9 s later) and a
  button set twice 200 ms apart, both through the eventual-store queue (`next_eventual_store`). CONFIRMED.
- The issue's 1.7 MB / 550 KB repeats were `dataCache` rows for button-set chunks: `models/buttonset.js`
  (:223, :253, :274, :301) -> `persistence.store_json` -> `store_url(url, 'json')`. The local stack has
  uploads off, so this path does not run here (NOT reproduced).
- `store_url` (`services/persistence.js:1466-1514`) queues every request; nothing merges a request for an URL
  already queued or in progress. CONFIRMED.
- `store_url_now` reuses a stored copy only when `check_for_local` (`:1556-1572`): trusted URLs, or any URL in an
  installed app (the issue's emulator), unless a manual sync re-downloads untrusted URLs. Chunks are in the
  uploads bucket, so untrusted: in a browser every request re-downloads and re-writes. CONFIRMED.
- So on the installed app a request that starts after the first finished is answered from storage; the
  emulator's repeats were most likely overlapping requests for the same chunk (PLAUSIBLE, not observed).
- The eventual-store queue (`services/persistence.js:653-663`, `utils/persistence.js:646-656`) appends a second
  entry for a store and key already waiting. CONFIRMED.

Proposal: (1) `store_url` returns the pending request for the same URL, type and keep_big instead of queueing
another (a forced re-download merges only with a forced one); (2) the eventual-store queue replaces a waiting
entry for the same store and key with the newer object instead of appending (both copies). Rejected: skipping a
write when the content hash is unchanged (an extra serialization on every write; a second tab can make it skip
a write it should not).
