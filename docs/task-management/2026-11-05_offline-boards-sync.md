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

#### Revised proposal after the review block (2026-11-08, Traci: "fix 1 and 2 for the duplicate writes")

The first proposal was blocked: (a) "the installed app reuses stored json" was false (json rows set
`url_uncache`), so the `store_url` merge is withdrawn; (b) merging the eventual queue by key would merge
different boards, since the adapter queues every fetched record with key null (`services/persistence.js:4523-4534`).

Facts:
- SQLite write = SELECT by ref_id, then INSERT or UPDATE, as two separately queued statements
  (`utils/dbman.js:479-506`). The Capacitor shim runs statements one at a time but queues each on its own
  (`utils/capacitor_sqlite_shim.js` executeSql/enqueue), so a second write's SELECT can run between the
  first's SELECT and INSERT. The table has no unique key on ref_id (`dbman.js:830-831`). CONFIRMED by the
  red test (two rows).
- A removal racing an earlier write: SELECT (none), DELETE, INSERT leaves the row. CONFIRMED (red test).
- Reads take `rows.item(0)` with no ORDER BY (`dbman.js:242-246`); UPDATE touches every row with the ref_id,
  so duplicates hold the same data after the next write, but both rows take space and whole-table reads
  return both. CONFIRMED by reading.
- The shim's `transaction` collects statements only while `fn(tx)` runs; a `tx.executeSql` issued from a
  result callback is never run. So a SELECT-then-write transaction is not a safe fix. CONFIRMED by reading.
- Eventual queue entries are `[store, obj, key, true]`, consumed by `next_eventual_store` (shift, then
  `store.apply`) and scanned by `validate_board` for a board id. Shapes of obj: `{<model>: raw, images?,
  sounds?}` from the adapter; an image or sound record; `{id}` with key 'selfUserId'. Keys: null, 'self',
  'selfUserId'. CONFIRMED (`services/persistence.js:539-545, 652-663, 686, 705-735, 4523-4534`).
- `store()` writes a board's images and sounds as their own records; dropping an older board entry could
  skip an image only it listed. CONFIRMED (`services/persistence.js:725-735`).

Candidates:
- Fix 1 A (chosen): a per-row queue in dbman: SQLite store and remove for the same store and ref_id run one
  after another; different rows still interleave. Works on any bridge. B (rejected): SELECT and write in
  one transaction (the shim drops the nested write). C (rejected here): UNIQUE index plus INSERT OR REPLACE
  (needs a device migration that removes existing duplicates). D: serialize every SQLite write (slower, no
  more correct than A).
- Fix 2 A (chosen): a save for a waiting entry with the same store, record id (`(obj[store]||obj).id`) and
  key replaces it in place with the newer object; entries carrying images or sounds, and records with no id
  and no key, are never merged. Both copies (service and `utils/persistence.js`) via one shared util.
  B (rejected): keep the first (older data wins). C: move the newer to the end (later write for no gain).
- Not fixed: duplicate rows already on devices stay until the record is next removed.

#### Review and result (2026-11-08)

Adversary review of the revised proposal: one High and three Mediums, all acted on.
- High (CONFIRMED): the Ember Data adapter mixes in the UTILS copy's DSExtend (`adapters/application.js:2,48`), so
  its findRecord queues through the utils module's own `store_eventually`. My summary called the utils copy a
  fallback; that was wrong. Added a test that drives the utils module-local queue (window.persistence cleared so
  the Proxy returns its target).
- Medium (CONFIRMED): removals go through `dbman.remove` (find, then delete only if found), not `remove_internal`.
  The whole find-plus-delete is now queued under the row id (`store + ' ' + uniqify_key(key)`, the same key a
  write uses, since `dbman.store` uniqifies the id); the test goes through `dbman.store` and `dbman.remove`.
  A removal by board key (which resolves the id only after its lookup) is not held; no caller does that today.
- Medium: a dropped bridge callback would hold the row forever; added a 60 s watchdog (`row_write_watchdog_ms`)
  and a test. `finished()` is called after success is scheduled.
- Medium: before/after counts. Local IndexedDB recorder, production build: e2e_offline_modern 15 -> 14 writes
  (button set now once), e2e_offline_stars 15 writes / 14 distinct. The user record is still written twice: the
  second write is a direct `persistence.store` from the sync 2.9 s later with different content (12,395 vs 12,366
  bytes), not a queued duplicate, so it is left.
- Low: duplicate rows already on devices are not cleaned up (stated in the status doc).

Tests: 11 new (5 SQLite row, 6 queue), red before the fix for 4 of them (the rest guard over-merging). Mutants,
each killed: utils wiring (test 11), service wiring (6), store queue (1-3), removal queue (3), watchdog (5),
images guard (9). Related suites `/dbman|persistence|storage|offline|sync/i`: 554 run, 544 pass, 10 skip, 0 fail.
ESLint gate: no new findings.

Lessons: (1) "fallback copy" claims about utils vs service persistence must be checked against
`adapters/application.js` and the Proxy's `in` test; class statics on the service fall through to the utils copy.
(2) a test that drives an internal (`remove_internal`) can pass while the real entry point (`remove`) stays racy;
drive the public route.
- Second adversary pass on commit 3924d0c64: ship, four Lows, all acted on. The SQLite catch now reports
  `error()` instead of re-throwing into the bridge (which swallows it and left the caller waiting; red test
  added, red with the re-throw). Watchdog raised to 5 minutes: its clock includes time queued behind other
  statements, and both bridges stall the whole queue on a lost answer, so it is a last resort, not a timeout.
  Commit title and status doc reworded ("one row per record"; a second save still rewrites the record).

#### Emulator trace attempt, 1.7 MB chunk (2026-11-08)

Setup that works: Android emulator (Android 15 Pixel Tablet image, KVM, headless) with the mobile shell
(`~/lingolinq_mobile`) packaged from this branch's bundle (served by local Rails, local mode of
`bin/package_from_lingolinq` via a scratch root), `adb reverse tcp:5000`, WebView driven over raw CDP
(Playwright's connectOverCDP is refused by Android WebView: "Browser context management is not supported").
App confirmed on `sqlite_plugin`. Server: offline worktree under `op run` with `REMOTE_EXTRA_DATA=true`.
Test account `chunktrace1` (made-up email) created through `POST /api/v1/users`; 239 boards provisioned.

Observed (first automatic sync, ~15 min, not finished): 32 boards, 393 dataCache rows (pictures, largest 837
bytes), 6 button sets, no duplicate rows. The button-set files never arrived: every proxied fetch of a
`BoardDownstreamButtonSet` file on `lingolinq-dev-uploads` failed ("status 403" x12, "Bad file, 0" x12), and the
app asked the server to regenerate the same sets repeatedly (82 `POST /buttonsets/1_1/generate`, 164
`GET /buttonsets/1_1`). So the chunk path could not be traced here. Cause of the 403 not diagnosed (object missing
or not readable; the record's remote_paths are encrypted at rest; worker upload output is in the foreman
terminal). The regenerate repetition may itself matter for #1221's slowness (PLAUSIBLE, not checked against
staging or production).

#### Emulator trace, result (2026-11-08)

Cause of the earlier 403s: the uploads bucket blocks public access (`lib/uploader.rb:694-697`); production reaches
button-set files through `UPLOADS_S3_CDN` (required in production, `deploy-cloudrun.yml:187`; set on the GitHub
`production` environment, not found on `staging` or `dev`), and the search proxy fetches the raw, unsigned bucket
URL (`api/search_controller.rb`, no `signed_internal_url`). A local-only, uncommitted patch made the proxy sign
bucket URLs, and the patch is reverted. CORRECTION (same day): I first wrote that the traced run never used the
proxy because the recorder logged 0 proxy fetches. That was wrong: the app's requests go through the native
HTTP layer, which the page-level recorder does not see. The server log shows the chunks were fetched through the
proxy, so the successful trace depended on the patch (with it reverted, every chunk fetch 403s again).

Account: seeded `aiden_parker` (1,156 boards). Local caveat: 22,847 local `button_images` hold their picture as
an inline data URI with no url (seeded with uploads off; `button_image.rb:213-227`), so this account's board
rows are 0.4-1.9 MB each (`image_urls` full of data URIs). Production pictures carry links; board sizes here are
not representative.

Traced first sync (app data wiped, SQLite, recorder on every INSERT/UPDATE/DELETE and every store_url):
succeeded in about 4 minutes; 1,900 writes to 1,782 rows, 71.8 MB; 89 KB of repeats; 0 rows inserted twice;
0 duplicate ref_ids in board, dataCache or buttonset (fix 1 holds on the device database). 45 rows written more
than once, all small pictures shared across boards (one 577-byte picture 57 times): `store_url` is asked again
for each board and nothing merges requests for a URL already stored (3,794 requests, 3,166 distinct).

The chunk: 5 button-set chunk rows, each written once. The largest (button set 1_8006, 3,717 buttons) is a
4.2 MB row holding the button list twice: `json_payload` 1.73 MB and a base64 `data_uri` of the same list
2.3 MB. CONFIRMED in code: after decrypting a button-set file the app keeps the parsed list and re-encodes it
(`services/persistence.js:1647-1660`), then stores both in one dataCache row (`:1696-1703`); readers prefer
`json_payload` and fall back to `data_uri` (`:1073`, `:1141`, `:1236`). This is most likely the issue's
"1.7 MB chunk written twice" (PLAUSIBLE: the issue's own measurement method is not recorded). Not fixed here.

#### Store a decrypted button list once (2026-11-08, Traci: "proceed in this pr")

Facts:
- Re-encode site: after decrypting, `object.json_payload = res` and `object.data_uri = "data:application/json;
  base64," + btoa(...)` (`services/persistence.js:1655-1659`, `utils/persistence.js:~1694-1698`); both saved in
  one dataCache row (`services/persistence.js:1696-1703`). CONFIRMED (emulator: 4.2 MB row, 1.73 MB list).
- Readers return json_payload first: `find_url:1236`, `find_json:1073`, `store_json:1141`. CONFIRMED.
- json_payload with data_uri null is already a produced state (re-encode failure, `:1660-1662`). CONFIRMED.
- `prime_caches` registers a no-file dataCache row as url_uncache regardless of data_uri (`:1369-1371`);
  the installed-app reuse check (`:1556-1575`) does not read data_uri. CONFIRMED.
- Nothing outside the two persistence files reads a stored json row's data_uri (grep). CONFIRMED.
- Unencrypted JSON (i18n locale files) never gets json_payload and keeps data_uri. CONFIRMED (guard test).

Candidates: A (chosen) do not re-encode after decrypting (data_uri null), both copies. B (rejected) keep data_uri,
drop json_payload: every read decodes and parses megabytes. C stripping data_uri at store time: same effect, less
direct. Rows already on devices keep both fields until rewritten; readers already prefer json_payload.
Red test: `tests/unit/utils/persistence-json-stored-once-test.js` (red on "no second, encoded copy is saved").
Adversary review of the proposal: nothing blocks; four Lows. Acted on: stale comments rewritten in both copies.
Stated, not tested: the utils copy is changed for parity only; the Proxy sends store_json to the service, so
the utils json path is not reached and no test covers it. Not covered by a test: prime_caches registering a
json_payload-only row (pinned by reading `:1369-1371`, and by the emulator relaunch below). Old rows saved with
both fields keep their space until a revision replaces them.

Result: red test green; my own new test first failed in the wider run because it assigned
`window.lingoLinqExtras.ready` directly (tracked property asserts); it now uses `set()`. Related suites
`/dbman|persistence|storage|offline|sync|buttonset|i18n|json/i`: 655 run, 640 pass, 15 skip, 0 fail.
Emulator re-measure (same flow, temporary proxy patch re-applied, then reverted): largest chunk row 4.2 MB ->
1.90 MB (button set 1_8006), button set 1_5 63.6 KB -> 29.3 KB; every chunk written once; 0 double inserts.
After a relaunch (prime_caches), find_json reads the 1_8006 row back from the device: 3,717 buttons.
Side note, not pursued: right after a store in the same session, find_json missed the row ("url not in
storage") because the service's url_uncache had no entry for it; after a relaunch it is found. Not related to
data_uri; recorded for whoever looks at in-session reads next.

## #1229 retry gaps after a failed sync (2026-11-08)

Two units, each red first, then shown red again with the fix removed (restored from a copy). Stayed on
`feat/scot-offline-app-shell-7a29ac97`. No new user-facing strings. #1230, #1034 and the "N of M" count
were not touched.

### Unit 1: a new device keeps its first-sync marker

(a) Where `last_sync_at` is read. CONFIRMED `services/persistence.js:3972`: the live `check_for_needs_sync`
starts a sync when `synced > 0` and `(now - synced) > 48h`. A new device gets `last_sync_at` of 1 from
`setup()` when no `lastSync` is saved (`start_sync_state`). The copy of that method inside the comment
block at `:4069` does not run.

(b) Writers that move the clock after a failure. CONFIRMED. Two failures in a row store `last_sync = now`
(`:2445`). A storage failure is not a rejected sync: the completion path sets `last_sync_at` to now in
memory and does not store `lastSync` (`:2414-2417`). A successful sync still writes the clock.

(c) `last_sync_stamp` is the wrong "never finished" signal. CONFIRMED `services/app-state.js:4180`: login
copies the session stamp onto `last_sync_stamp` before any sync finishes, and that stamp matches the
server, so the stamp branch does not start the first sync. The signal is `last_sync_at > 1` (the mobile
boot guard already treats `synced > 1` as a real sync time).

(d) The utils copy. CONFIRMED the app does not run `utils/persistence.js`'s failure store (`:2467`). The
module proxies `sync` to the service once `window.persistence` has it. One test hides `sync` so the utils
success path runs (`persistence-sync-test.js` `utilsSyncWindow`); that case does not enter the two-failure
store. Left unchanged.

Fix: `sync_clock_advances_on_failure` (reopen block) is true only when `last_sync_at > 1`. Called from the
existing two-failure `if` and from the completion assignment, same line count, so the ESLint rows did not
move. A device that has synced still gets the 48-hour reset. Rejected: deleting the reset for every device.

Tests, red before the fix (`last_sync_at` became the current time, expected 1): "should keep a new device
on the first-sync marker after two failed syncs, then sync again once the back-off has passed"; "should not
move the first-sync marker when the device could not save its boards". Mutation (helper always returns true)
turned both red again. Still green: "should still move the last sync time after two failures once a device
has synced", and the existing storage test with `last_sync_at` of 5. The startup test "a new device still
on the first-sync marker syncs after the back-off" pins the read and was already green.

Known limit: a device that already stored a fake `lastSync` from this bug has `last_sync_at > 1`, so it
keeps waiting until 48 hours pass or someone syncs by hand.

### Unit 2: one reconnect after a dropped connection

(a) What the sync promise rejects with. CONFIRMED the root user reload used to call
`sync_reject({error: "failed to retrieve user details"})` and drop the original error (`:2109`, and the
findRecord failure beside it). `sync_user` did the same (`:3471`). The ajax layer rejects
`{fakeXHR, message, result}` (`utils/extras.js` `ajax_reject`), and `fakeXHR` leaves `status` 0 when the
browser reports none. `persistence.ajax` rejects `{offline: true, short_circuit: true}` when it already
knows there is no connection. `time_promise` rejects `{error: 'promise timed out:' + msg}` when the request
never returns. Those three are the network shapes. A 500 is not.

(b) When `online` flips. CONFIRMED `_setupOnlineListeners` (`:4188`): browser and Cordova `online`/`offline`
events, plus a 30-second poller. `on_connect` calls `check_for_needs_sync(true, 'reconnect')` 500 ms after
the device comes online. The wrapper waits out `auto_sync_backoff_until` on that trigger. The backoff
watcher starts a backoff only when the failure happens while `online` is true.

Fix: the reload and `sync_user` rejections keep the original error as `cause` (same lines, so the modal
still reads `err.error`). The root `sync` wrapper records an automatic failure's time and whether it is a
network shape. An `online` observer records when the device goes offline. One reconnect may pass the
backoff when the failure was a network shape, or its time is within 5 seconds of that offline flip. The
skip is then blocked until that backoff ends. A success clears the record. Rejected: never backing off on
status 0, which would retry on the normal tick while the device still looks online.

Tests, red before the fix (0 stamp requests, expected 1; the dropped-connection flag stayed false):
"should remember a dropped connection as a network failure"; "a reconnect retries once after a
network-shaped automatic failure, then waits the back-off out"; "a reconnect retries once when the
automatic failure landed as the device went offline". Mutation (`reconnect_may_skip_backoff` returns false)
turned the two reconnect tests red again. Still green: "should not remember a server error as a network
failure", "a reconnect still waits out the back-off after a failure that was not a dropped connection",
and the existing reconnect backoff test.

Known limit: a captive portal that never flips `online` false and then true still waits out the backoff.
Try Again and the Sync button remain the way out.

Lint: `npm run lint:js:ci` new=0 (1549 baseline, unchanged).

### Review fixes (2026-11-08)

The reconnect check was only a stamp request. For a new device that request does not start a sync:
login has copied the server stamp (`services/app-state.js:4180`), and the failure branch sets
`last_sync_event_at`, so the 48-hour branch is not syncable for about five minutes
(`services/persistence.js` `check_for_needs_sync`, `syncable`). Confirmed by reading those branches.

Fix: when the one reconnect exemption is for a device whose `last_sync_at` is not greater than 1, and
auto sync is on, call `sync` with `long_time_since_sync` and return before the stamp check. A device
that has synced still gets the stamp check. Rejected: clearing `last_sync_event_at`, which would also
let the normal tick start another sync.

The reload rejection no longer carries the xhr. It carries `network: true` or `network: false`, decided
from the xhr before the fixed string is rejected. `sync_user` does the same. The failure branch logs
that object (`console.log(err)`), so a 500 body is not in the log. The wrapper asks
`sync_failure_is_network`, which is the method that was previously unused.

Tests, red first: "a reconnect starts the first sync for a device that has never finished one" (0 syncs,
expected 1); "should not keep the server response on a failed user reload" (`cause` was the xhr).
Removing the direct call turned the first red again. Putting `cause` back turned the second red again.
Restored from a copy both times. The stamp-check reconnect tests now set `last_sync_at` to 50 so they
keep describing a device that has synced.

#### Does a repeat sync save only changes? (2026-11-08)

Yes, by CoughDrop's design: the server's board revisions (`fresh_revisions`) against the device's
`full_set_revisions` mark unchanged boards safely cached and skip them and their sub-boards
(`services/persistence.js:3121-3130`, `board_lookup :2765-2770`). No issue covers it in either repo (searched
LingoLinq-AAC and lingolinq_mobile; closest #1229 and mobile #3). Measured, second sync right after the first:

| | Android app (SQLite) | Web, Chrome (files) | iPad, WebKit (no file storage) |
|---|---|---|---|
| 2nd sync writes | 7 | 7 | 1,692 |
| 2nd sync data | 1.5 MB | 0.18 MB | 22.1 MB |
| 2nd sync time | 43 s | 13 s | 271 s (1st: 279 s) |

RETRACTED (same day): two findings from web runs that never answered the "Trust this Device / Shared Device"
question after sign-in (the page stays on `/login/device`, on the signed-out database `lingolinqStorage::__===db`,
with `local_system` unset). (1) "Sign-in does not switch to the user's database": with Trust chosen, the app
opens `lingolinqStorage::aiden_parker===db`, the sync saves there and it survives a reload. (2) "The web app
re-downloads every picture": in Chrome with Trust chosen, pictures are saved as files and skipped (table above).

CONFIRMED and real: with no file storage (iPad Safari, `local_system.available === false`), pictures are saved in
the database (1,651 rows, 0 files) and a repeat sync downloads and rewrites nearly all of them (1,683 rows, 22 MB),
so it takes as long as the first. Cause (by reading): `store_url_quick_check` (`:1458-1463`) counts a picture as
saved only through `url_cache`, which only file-backed pictures set; `find_url` does read database pictures when
`local_system.available === false` (`:1230`). Offline display of database pictures is covered by the WebKit e2e
"Basic pictures" case (passed). Also seen on every repeat sync: one unchanged board rewritten
(`vocal-flair-84-things-at-home`) and the user record written twice; cause not looked at.

#### Picture "already saved?" check: fact sheet so far, STOPPED before a proposal (2026-11-08)

Facts (CONFIRMED unless marked):
- In the service file the bare name `persistence` is the service CLASS (`var persistence = Service.extend`, :91); the
  instance is `window.persistence = this` (:124). `store_url_now` records results on the class
  (`persistence.url_cache` / `url_uncache`, :1773-1812; also :1114, :1182); the "already saved?" checks read the
  instance (`store_url_quick_check` :1461, the reuse check :1568); the sync's missing-picture check reads the class
  (:3279-3297; `_sync` is the instance there, :3047). Probe after one sync: Chrome instance maps 12/13 entries,
  class 1,663/1,669; quick check false for a saved picture. Present since the service file was created.
- `prime_caches` returns at once when there is no file storage (:1301-1306), so on an iPad nothing is registered
  at startup.
- Second sync (no force): all 102 boards logged "already been cached locally" in both browsers, yet pictures were
  still requested (Chrome 2,017, WebKit 3,699 store_url calls). Chrome wrote none only because a saved picture's link
  becomes `filesystem:http://localhost:5000/...`, which `store_url_now` returns early for (`localhost:` match,
  :1523); with a production address that early return would not apply (ASSUMED, unchecked). WebKit (pictures in
  the database) re-downloaded and rewrote 1,683.
- The real Sync buttons pass force = true (`authenticated-view.js:1636`, `classic-rail.js:252`,
  `sync-details.js:112`); the automatic and home-board syncs pass none. With force, the reuse step re-downloads every
  untrusted resource by design (:1564-1566, "if it's a manual sync, always re-download untrusted resources"), on
  every platform. Every measurement above used no force, so none shows what a person's Sync tap does.

Stopped here (Rule 13: several corrections in a row today). Open question for Traci before any proposal: should a
manual Sync keep re-downloading untrusted pictures (CoughDrop's design: it refreshes them), or reuse a saved copy?

#### Option (b) research: can a manual Sync reuse saved pictures? (2026-11-08, Traci: "check option b")

- Uploaded pictures, sounds and avatars get a permanent, unique address per record:
  `images/<id digits>/<global_id>-<sha512(global_id, created_at)>.<ext>` (`app/models/concerns/uploadable.rb:58-80`);
  avatars are saved as picture records (`services/content-grabbers.js:904`). A replaced picture is a new record
  with a new address. CONFIRMED.
- The one in-place overwrite (`replace_stored_upload_body!`, SVG sanitising, `uploadable.rb:560-623`) runs in
  `upload_success` before the record is given its address (`controllers/concerns/remote_uploader.rb:20-29`), so no
  device can hold the unsanitised copy. CONFIRMED.
- CDN invalidation (`Uploader.invalidate_cdn`) has no live callers (`lib/uploader.rb:216-217`); its commented-out
  call sites were for button-set / extra-data files, which now use checksum paths. CONFIRMED.
- Pictures linked to outside sites without being copied (`download: false`) occur only in seed data
  (`lib/beta_seed.rb:112-113, 477`). CONFIRMED.
- CoughDrop trusted its own uploads: Brian Whitmer added CoughDrop's upload CDN to the trusted list in 2017
  (`008250856`, "add cdn to trusted endpoints"); the 2025 rename (`8a6b83009`) turned `coughdrop-usercontent` into
  `lingolinq-usercontent`, which is not one of LingoLinq's buckets (`docs/INFRASTRUCTURE.md:168-169`). Production
  serves uploads from `https://d34sa6lc5jfe66.cloudfront.net` (bucket `lingolinq-prod-uploads`, GitHub
  `production` variables); neither is on the list (`services/persistence.js:1546-1548`). So a manual Sync
  re-downloading every uploaded picture is a side effect of the rename, not CoughDrop's design. CONFIRMED.
- Button-set files (`extras.../BoardDownstreamButtonSet/...`) do change between revisions and must keep
  refreshing; CoughDrop excluded them (`usercontent` + `/extras/`), but LingoLinq's paths are `extras<nonce>/`,
  which that exclusion pattern does not match. Any widening of trust must exclude them. CONFIRMED by reading.
- The client is not told the upload CDN address (nothing in controllers, views, json_api or the frontend).

Conclusion: option (b) is safe for uploaded pictures, sounds and avatars. Design to propose (fix-proposal
discipline still applies): trust LingoLinq's own upload hosts (the server sends its uploads CDN and bucket to the
client; dev and staging have only the bucket) for pictures and sounds, keep button-set files refreshing, keep the
repair path for a missing saved copy, plus the class/instance fix and database-saved pictures on iPad.

#### Unit 1: saved pictures recorded on the running service (2026-11-08)

Change: `has_local_copy(url)` on the service (in place of the old quick-check body, same line count) is the one
answer read by `store_url_quick_check`, the reuse check in `store_url_now` and the sync's linked-board check; every
`persistence.url_cache` / `url_uncache` write in the service file (find_json, store_json, store_url_now) now goes to
the running service (`_this`), the linked-board reads to `_sync`.
Adversary review of the proposal: nothing blocks. Conditions met: a test for the linked-board check (new
"should treat a linked board as cached when its pictures are saved on the running service", added before the
describe's closing line so no baseline row moves; it sets its two cache entries directly because
`primeSyncUrlCache` lets entries left by earlier tests win the merge), site-group mutations, the sync module run
before and after. Lows recorded, not acted on: a failed save now marks a picture "not cached" on the running
service even when an older copy exists (offline it shows broken until the next prime_caches); find_url's
`file_missing` branch is unreachable (old dead code); the linked check now also counts prime_caches entries that
were not file-verified on automatic syncs.
Tests: `persistence-saved-pictures-test.js` (red before: "the already-saved check sees it"; failed-save guard).
Mutations: writes back on the class -> 8 red (the new test + 7 store_url tests); linked check back on the class ->
the new sync test red. Related suites `/persistence|sync|dbman|storage|offline|buttonset|json/i`: baseline 602 run,
587 pass, 14 skip, 1 fail (the red test); after 603 run, 589 pass, 14 skip, 0 fail. ESLint gate: no new findings
(the copied test uses `window.setTimeout` and `window.$` instead of the baselined `later` and `$`).
Scope: file-stored pictures. Pictures stored in the database (iPad) are unit 2; trusting LingoLinq's upload hosts
on a manual Sync is unit 3.

#### Unit 2 (database-saved pictures): BLOCKED by review, stopped (2026-11-08)

Red tests written (uncommitted): `persistence-saved-pictures-test.js` tests 3-6; 3 and 4 red as expected.
Adversary review of the proposal: High, CONFIRMED (`services/persistence.js:770-782`): `store()` resolves even when
the write fails (it only counts the failure, `utils/storage_failures.js`), so recording `url_in_db` in the success
bookkeeping would mark a picture saved when its database write never landed. Trigger: an iPad runs out of space
during a sync, the user frees space and taps Sync in the same session; the pictures are skipped at the quick check,
nothing is written, nothing fails, the sync reports success and the pictures are missing offline until a relaunch.
Test 6 stubs `store` to reject, which the real `store()` never does, so it passes for the wrong reason.
Same flaw in unit 1's committed guard test ("a picture whose save failed does not count as saved", c6f8412b6): it
stubs a rejection the real code never produces. Unit 1's behaviour is right (a file-backed picture counts as saved
only after its file write succeeded), but that test must be rewritten to fail the real way (write_file rejecting),
before unit 1 is pushed.
Medium: database reuse would bypass the trust exclusions; `protected_image` can return a fallback picture with 200
(users_controller.rb:1165-1173), so reuse must leave out `protected_image` and `api/v1/lang` and require the row's
content type to match. Low: `has_local_copy` is called with raw URLs but saves are keyed by `normalize_url`.

Next (fresh start recommended, Rule 13): (1) rewrite unit 1's failed-save test against the real failure path;
(2) unit 2: set `url_in_db` only when the database write actually landed (compare `failed_write_count` before and
after the store), exclude protected_image / lang, require a matching content type, normalize the key in
`has_local_copy`; rewrite test 6 to keep the real `store()` and make the storage layer reject; re-review; (3) unit 3
(trust LingoLinq's upload hosts on a manual Sync); (4) measure with the real Sync button (force true) on the
emulator, Chrome and WebKit; (5) push, PR and status doc under item 1.

#### Why the picture-check work keeps going wrong (2026-11-08, Traci asked for an honest look)

Done before this: unit 1 test 2 rewritten to fail the real way (write_file rejects; it checks the write was
attempted and the call rejected); mutant "a failed file write counts as saved" turns it red; folded into unit 1,
now `810e3c5ea` (local, not pushed). Unit 2: no app code edited.

CoughDrop comparison (pre-migration utils copy at `148fc2e1e`):
- CoughDrop's persistence was ONE object: `var persistence = EmberObject.extend({...}).create(...)` (:25, :3488),
  so `persistence.url_cache` and `this.url_cache` were the same map. The 2026-01-20 service migration
  (`48a055d55`) made it `Service.extend` (the class) with the instance on `window.persistence`, without changing
  the `persistence.` writes. CONFIRMED. That is where unit 1's bug came from: a regression, not CoughDrop design.
- CoughDrop trusted its own upload CDN (`008250856`); the rename broke that. A regression (unit 3 restores it).
- CoughDrop with no file storage: the same quick check (only `url_cache`), `prime_caches` returned early, and
  `find_url` read the database only when `url_uncache[url]` was set this session (:949). So CoughDrop also
  re-downloaded database-saved pictures on every sync, and after a relaunch could not find them. CONFIRMED by
  reading. Unit 2 is NEW behaviour for a mode CoughDrop never supported well, not a restoration.
- Since the split there are two live ~4,600-line copies (services 36 commits, utils 20 since `148fc2e1e`); the
  adapter uses the utils copy's DSExtend.

Why it is hard: two live copies and a class/instance name clash (several wrong claims came from "which object
runs"); store() never rejects, so "saved" cannot be seen; the cache maps carry several meanings each
(url_uncache true = "in the database" or "save failed") and are written in ~30 places; at least four storage modes
times force times trust times installed app, and local runs misrepresent each (localhost early return, inline data
URIs, private bucket, the Trust-device prompt); #1221 holds five separate causes; the line-keyed ESLint baseline
forces line-neutral edits in a 4,900-line file.
Recommendation given: finish what restores CoughDrop behaviour (unit 1, unit 3), measure, and treat unit 2
(iPad without files) as a separate decision.

#### Unit 2 parked; unit 3 proposal: the Sync button reuses saved uploads (2026-11-08, Traci: "proceed the way you think will ultimately work best")

Unit 2 parked (new behaviour, not a CoughDrop restoration; see above). Its red tests were moved out of the repo to
`/home/tracid/offline-sync-handoff/unit2-red-tests.patch` so nothing red ships.

Facts:
- Clients see upload addresses rewritten by `Uploader.fronted_url` (`lib/uploader.rb:649-660`) at serialization
  (`lib/json_api/image.rb:38`, `uploadable.rb:51`, `json_api/button_set.rb:26`, `converters/lingo_linq.rb`):
  `UPLOADS_S3_CDN/<key>` in production, the bucket URL where no CDN is set. CONFIRMED.
- The same CDN host serves button-set files (`extras-cache<5>/button_set_cache/<id>/<hash>.json`,
  `board_downstream_button_set.rb:262, :326, :391`) and extra data (`extras<nonce>/...`, `extra_data.rb:196, :286`).
  Host-wide trust would freeze them. CONFIRMED.
- Upload key: `images|sounds/<id digits joined by />/<global_id>-<sha512 hex, 128>` + extension
  (`uploadable.rb:58-80`; `GoSecure.sha512` is `hexdigest`). Transcoded sounds and videos get a new key
  `<...sha>v<unix time>.<ext>` (`media_object.rb:87`, `transcoder.rb:52`), never an overwrite. Raster copies
  `<key>.raster.png` (`uploadable.rb:215`). The SVG sanitising overwrite runs before the address is published
  (`remote_uploader.rb:20-29`). Protected images use `/api/v1/users/.../protected_image` (`uploadable.rb:21`), a
  different shape. CONFIRMED.
- Trust is read in `store_url_now` (`services/persistence.js:1546-1572`): `trusted_not_to_change` decides
  `check_for_local` and the force rule (`:1564-1566`); it also feeds `cors_match` (`:1551`), which picks the direct
  XHR route. Reuse still requires `has_local_copy(url)` (`:1568`), the repair path. CONFIRMED.
- The utils copy has the same block (`utils/persistence.js:~1583-1610`); callers reach the service through the
  Proxy (`utils/persistence.js:4594`); the utils copy's own store_url_now runs only from inside that module.

Candidates:
- A (chosen): trust by address shape, any host, images and sounds only: a small util
  `utils/permanent_upload.js` (`is_permanent_upload_url(url)`), applied AFTER `cors_match` is computed, so the fetch
  route is unchanged. Frontend only.
- B (rejected): the server sends `UPLOADS_S3_CDN` and the bucket to the client and the client trusts those hosts.
  Needs new plumbing that must arrive before an offline launch's sync, and the CDN serves button sets, so it needs
  the same path rule anyway.
- C (rejected): hard-code production's CDN host in the list (CoughDrop's 2017 approach). Environment-specific, and
  the same button-set problem.

Risks: a saved copy that is wrong (bad bytes stored once) is no longer replaced by tapping Sync; the address
cannot change content, so only a bad download could cause it (open question). iPad (no file storage): these URLs
now do one dataCache read before downloading (has_local_copy is false there), no reuse until unit 2. An outside
URL shaped exactly like a LingoLinq upload is trusted (only its own host could change it).
Tests (red before): saved-pictures tests 3-4 (red: 2 downloads); guards 5 (button-set file refreshes), 6 (outside
address refreshes), 7 (repair). Helper unit tests for the shapes. Mutations: drop the trust line (3-4 red);
host-based trust (5 red only if the host is matched: covered by the helper test instead); accept a row without
has_local_copy (7 red).

#### Unit 3: review, correction, result (2026-11-09)

Adversary review: nothing blocks; four Mediums, two Lows, all acted on.
- CORRECTION (CONFIRMED, `services/persistence.js:2096-2099`, `:3160`, `:3191`, `:3226`): every sync re-primes
  `url_cache` before visiting boards, and the board loops skip a picture the quick check knows is saved, before
  `store_url`. So "every Sync tap re-downloads every uploaded picture" (the handoff, my proposal, and the Risks line
  above) was wrong: it came from reading the force rule's comment, never measured. What unit 3 actually changes: in a
  browser, `check_for_local` (`:1556`) was false for untrusted addresses, so the same picture queued from several
  boards before its first save landed was downloaded and written again for each copy (the 57x pattern, on the web;
  unit 1 fixes it only for the installed app). Also a forced re-request of such a duplicate.
- Guards did not catch host-wide trust: added a same-host non-upload picture (sentence preview, overwritten in place,
  `lib/sentence_pic.rb:59`). Trust moved before `cors_match` would fire real requests: the test now replaces
  XMLHttpRequest and asserts it is never used. The planned regex matched the shape inside a query, fragment, or a
  protected_image path: the helper now tests `new URL(url).pathname` against a regex anchored at the path root (at
  most one bucket segment). Test 3's empty assertion replaced by a write count.
- Not acted on: the utils copy's mirror line is not exercised by any test (callers reach the service through the
  Proxy). Pre-existing, not in scope: an upload form for a key stays valid 60 minutes (uploader.rb:7, :735-741), so
  an uploader could replace the bytes after the SVG check; sounds have no repair path; the search proxy may accept a
  truncated 200 (search_controller.rb:453-456). PLAUSIBLE / for Scot.

Commit `c079cd53a` (local). Mutants, each killed: no trust (tests 5, 6 red), host-based trust (9), trust on the
direct-request route (5). Related suites `/persistence|sync|dbman|storage|offline|buttonset|json|permanent upload/i`:
611 run, 597 pass, 14 skip, 0 fail (unit 1 baseline 603 + 8 new). ESLint gate: no new findings.

Measurement limit: the local database has 0 upload-shaped pictures (22,870 of 42,616 are inline data), the uploads
bucket is private, and only production has the CDN, so no local run can show unit 3; tests are its evidence. Unit 1
can be measured on the emulator (first sync: rows written more than once; before = 45 rows / 89 KB). Not run this
session: it needs a production build served by Traci's running server, packaging, and the local-only proxy patch.

#### Emulator before/after, units 1 and 3 (2026-11-09, Traci: "proceed with the emulator")

Method: the same driver for both builds (scratchpad `emu-measure.js`): one CDP connection held through sign-in, write
recorder (`emu-hooks.js`) installed on every page load, app data cleared, aiden_parker, Trust chosen. It records the
sync the app starts by itself after sign-in, then a forced sync (`persistence.sync('self', true)`, the Sync button).
Before = `bb941c2cf` frontend, after = `c079cd53a`; both production bundles served by the local server and packaged
into the mobile shell; SQLite with file storage. Local-only proxy patch applied for both runs, then reverted. One run
each, software rendering: times are not a claim.

| | before (`bb941c2cf`) | after (`c079cd53a`) |
|---|---|---|
| First sync: writes / rows | 1,540 / 1,440 | 1,494 / 1,494 |
| Rows written more than once | 42 (worst 48x, a picture) | 0 |
| Repeat data | 60.7 KB | 0 |
| First sync data / time | 55.0 MB / 180 s | 57.4 MB / 199 s |
| Sync button: writes / picture writes | 7 / 0 | 8 / 0 (user record twice, known) |

Reading: unit 1 removed every repeated picture write in the installed app. The Sync button wrote no pictures in either
build, which confirms the correction above (known pictures are skipped before store_url). Unit 3 is not exercised
(no upload-shaped pictures locally). Not explained: the after run saved 54 more distinct rows (2,626 vs 2,588
distinct store_url requests); not investigated, the runs fetch over a live local server.

#### Unit 2, simpler design: the database row is the proof (2026-11-09, Traci: finish item 1 within the hour)

Why the earlier design was blocked: it added session bookkeeping (`url_in_db`) that had to know whether a write
landed, on top of a `store()` that never rejects. This design adds no state.

Facts (CONFIRMED):
- With no file storage, `store_url_now` keeps the picture in its dataCache row (`object.data_uri`, `persisted: true`,
  `url: url_id`; `services/persistence.js:~1763-1767`); `find_url` reads that row when `local_system.available ===
  false` (`:1230`).
- The reuse step runs only when `check_for_local` (`:1556-1558`: trusted, or installed app). It resolves a found row
  only if `has_local_copy(url)` (`:1568`), which only file-backed pictures set. That check exists because a row in
  the installed app points to a FILE that can be missing ("needs to be repaired"); a no-file row holds the picture
  itself, so nothing can be missing.
- A resolved row has `persisted: true`, so `size_image` skips it and the no-file store branch returns it without a
  write (`:~1763-1770`). If the row exists, its write landed: no failed-write question.
- `protected_image` can answer with a fallback picture (users_controller.rb ~1165-1173); `api/v1/lang` is JSON.

Change (service only, line-neutral):
- New util `utils/database_picture.js`: `picture_kept_in_database(url, type)` (image or sound, not protected_image,
  not api/v\d+/lang) and `usable_database_copy(url, type, row)` (that, plus `row.data_uri` a `data:` string and
  `row.content_type` image/... for an image, audio/... for a sound).
- `:1558`: `no_files` = NOT the store branch's own condition (`local_system.available && allowed && auth_settings`);
  `check_for_local` also true when `no_files && picture_kept_in_database(url, type)`.
- `:1568`: resolve when `has_local_copy(url) || (no_files && usable_database_copy(url, type, data))`. The force rule
  before it is unchanged (a Sync tap still refreshes untrusted pictures; uploads and OpenSymbols are trusted).
- Utils copy not mirrored (its store_url_now is not reached through the Proxy; no test could cover it).

Not changed: the quick check still says "not saved" for database pictures, so each costs one queued request and one
database read per sync, instead of a download plus a write. Candidates rejected: the earlier `url_in_db` bookkeeping
(blocked twice, needs write confirmation); counting database pictures in the quick check (same problem).
Risks: a bad copy saved once on an iPad is reused on automatic syncs until a Sync tap (untrusted) or never (trusted),
the same rule the installed app already follows. Content types other than image/audio (e.g. octet-stream) are not
reused (safe, just not faster).
Tests: reuse with no file storage (red now); guards: row without picture data, wrong content type, protected_image,
forced refresh of an untrusted picture, installed app WITH file storage still repairs, JSON not reused.
Mutations: drop `no_files` gate (installed-app guard red), drop type/protected checks (guards red), remove the reuse
(reuse test red).

#### Unit 2 result (2026-11-09)

Adversary review: nothing blocks; one Medium, acted on. CORRECTION of the proposal's Risks line: the installed app
is NOT the same rule; it repairs a broken picture when shown (`utils/button.js:1255-1259`), which never runs for
`data:` pictures (`:1177`). So a bad copy of a TRUSTED picture saved on a no-file iPad is kept (a Sync tap does not
refresh trusted addresses). Acted on: reuse only rows not `outdated` (find, `services/persistence.js:422-430`).
Checked myself: rows the last sync listed as important (its pictures) are never marked outdated, so this caps
staleness only for pictures no longer used; the remaining risk is stated in the status doc and PR. Trigger needs a
bad download saved once (PLAUSIBLE: the proxy may accept a truncated 200). Lows acted on: tests for a trusted
address, an image row with an audio type, an outdated row, signed out. Utils copy not mirrored: its
store_url_now is reached only before the service exists or from its own sync, and falls back to downloading.

Commit `9dc8f0d44`. Mutants, each killed: no reuse (4 red), no `no_files` gate (installed-app guard red), no
outdated check (outdated test red). Related suites: 623 run, 609 pass, 14 skip, 0 fail. ESLint gate clean.

WebKit (no file storage), aiden_parker, `web-two-syncs.js`, same procedure, before = `c079cd53a`, after = `9dc8f0d44`:

| | before | after |
|---|---|---|
| First sync: writes / records written more than once | 1,897 / 56 | 1,767 / 2 |
| Second sync: writes | 1,692 | 7 |
| Second sync: data / time | 22.1 MB / 237 s | 0.54 MB / 13 s |
| Pictures saved in the database afterwards | 1,651 | 1,651 |

Item 1 rescoped (Traci, 2026-11-09, "finish within the hour"): code work done; measurements that need production or
a real device moved to a new item 10 (appended, nothing renumbered).

#### Item 1 decision 3: the proxy accepts a download that did not finish (2026-11-09, Traci: "proceed")

Decisions taken (Traci, on the recommendations): 1 accept (on the assumption no real device synced an older build of
this branch), 2 accept, 3 fix here, 4 accept and revisit after item 10, 5 a dev-bucket CDN, owned by Scot.

Facts:
- `get_url_in_chunks` (`app/controllers/api/search_controller.rb:417-461`) accepts a response when
  `response.success? || response.code == 200` (headers, :436) and raises in `on_complete` only when
  `!response.success? && response.code != 200` (:455). CONFIRMED.
- Typhoeus 1.5.0 `success?` is `(mock || return_code == :ok) && response_code && good code`
  (`typhoeus/response/status.rb:49`). CONFIRMED.
- A real truncated transfer (local server promising 100 bytes, sending 10, then closing) gives
  `code: 200, return_code: :partial_file, success?: false`, body 10 bytes. CONFIRMED (scratchpad `partial_probe.rb`).
  So the proxy returned a cut-off picture as a valid data URI. A timeout part way gives `:operation_timedout`, same path.
- Callers: the proxy loop (:235) and the button-set regenerate retry (:319). Both get the check.
- Spec fakes (`ProxyFakeRequest`) and Typhoeus mocks have no return_code (nil): treated as finished.

Candidates: A (chosen) in `on_complete`, reject when the response reports a `return_code` that is not `:ok`
("Download did not finish (<code>)"). B (rejected) compare the body to Content-Length: absent for chunked transfers,
and compressed transfers do not match. C (rejected) drop the `|| response.code == 200` fallback: its original purpose
is not recorded, and it also gates the headers check.
Risk: a server that closes without finishing its transfer properly after sending everything is now refused (the
picture is retried next sync): the safe direction.
Red specs: `spec/controllers/api/search_controller_spec.rb` "should reject a download that did not finish",
"... timed out part way" (red), "should accept a download that finished" (guard). Mutation: remove the check.
Review (adversary, real-Typhoeus probe): nothing blocks. CONFIRMED: the raise in on_complete reaches the proxy's
rescue (ethon calls complete after curl_easy_perform); full, close-delimited, chunked and gzip downloads end `:ok`;
redirects and "File too big" leave before on_complete; the regenerate retry rescues everything. CORRECTION: a
timeout cannot happen through the proxy (SafeHttp sets no timeout), so that spec now uses `:recv_error` and checks
the message. Why `|| response.code == 200` exists: at header time `success?` is always false (return_code is not yet
set), so option C would break every download. PLAUSIBLE Low: an HTTPS body delimited only by connection close from a
server skipping TLS close_notify gets `:recv_error` and is now refused (safe direction).

#### Do button sets load on dev? Checked live (2026-11-09, Traci: "don't guess, find the answer")

- dev and staging: `REMOTE_EXTRA_DATA=1`, bucket `lingolinq-dev-uploads`, no `APP_UPLOADS_S3_CDN`; production has the
  CDN (GitHub environment variables, read by API). Local default does not set REMOTE_EXTRA_DATA, so local seeded
  data sends button lists inline and never touches the bucket. CONFIRMED.
- `GET https://dev.lingolinq.com/api/v1/buttonsets/lingolinq/crisis-vocabulary` (anonymous, public board): no inline
  buttons, `root_url` = unsigned `lingolinq-dev-uploads` link. That link, fetched directly: HTTP 403 AccessDenied.
  `develop`'s proxy does not sign bucket links (search_controller.rb:232); develop deploys to nonprod. CONFIRMED.
- CORRECTION of my chat claim that Find a button breaks on dev: since #692 (2026-07-27) Find a button builds its
  set on the device from the board tree and avoids the server file (`components/find-button.js:295-345`).
- Still on the server file, so failing on dev by code (UI not opened for each): the offline sync's button-set step,
  copy board / board hierarchy, focus words, batch recording, word suggestions, inbox lookups, board intro, board
  selection tool, board details / actions background loads (`load_button_set` callers).

#### Correction: uploaded pictures DO load on dev; only button-set files are refused (2026-11-09, checked for Scot)

- Pictures: 12 of 12 `lingolinq-dev-uploads/images/...` objects (from local runs with the dev credentials, uploaded
  2026-07-02 to 2026-11-08, sampled before, after and well after the bucket went private) answer an unsigned GET with
  200 and real content (`image/svg+xml`). A missing picture key answers 403 (no listing). So the bucket lets anyone
  read picture paths. CONFIRMED. My earlier "the private setting covers the whole bucket, so pictures very likely fail"
  was wrong. Sounds: not tested (no uploaded sound found locally or on dev's 300 public boards).
- Button-set files: dev's live `root_url` for lingolinq/crisis-vocabulary answers 403. The server hands out that link
  only after `head_object` finds the file (`board_downstream_button_set.rb:218-221`, or within its 10-minute cache),
  and the 2026-11-08 trace fetched the same kind of file signed, so this is refused, not missing. CONFIRMED.
- Not established: whether the picture access comes from a bucket policy on `images/` or per-object settings
  (needs the AWS console or credentials).
- Effect: on dev and staging the CDN would fix button-set files (and other extras data), not pictures.

#### #1212 (item 2): board requests time out under load (2026-11-09, Traci: "deal with it decidedly, under an hour")

Facts (CONFIRMED):
- The network layer already retries a timed-out request: 3 tries for a GET, 8 s then 20 s then 20 s, 500 ms apart
  (`utils/extras.js:186-190, 361-375`). Board fetches go through it (adapter `$.ajax`, `adapters/application.js:45-46`).
- The sync cuts a board RELOAD off after 5 s (`services/persistence.js:2782`, `time_promise(record.reload(), "reload
  board", 5000)`), shorter than the first attempt, so the built-in retry never runs for it; the per-board lookup is cut
  at 30 s (`:3100`, time_promise default). The issue's "reload board over 5 s" counts (76 / 16 / 120) are these.
- A board whose lookup fails is pushed to board_errors as "failed retrieval for syncing" and its sub-boards are not
  visited (`:3361-3384`): one slow response removes a branch offline. "Not authorized" and "Record not found" +
  deleted are recognised there (`:3364-3378`).
- iPad detection (#1201): iPads with a Mac user agent get mobile parallelism already on this branch
  (`utils/capabilities.js:230`, `is_ipad_with_mac_agent`). Issue step 1 is done.

Change:
- A: `board_reload_ms` (60 s) and `board_sync_ms` (75 s) on the service; the reload uses the first, the per-board
  lookup the second, so neither cuts the network layer's own retries short (~49 s worst case).
- B: if the reload still fails and the device has a complete stored copy (permissions and image_urls, the same test
  the cached paths use), keep that copy and continue (its sub-boards are walked), unless the failure is "Not
  authorized" or "Record not found" (then reject as today). No stored copy (a first sync): reject as today.
Rejected: a retry loop in the sync on top of the network layer's (duplicates its ladder, multiplies server load under
the very slowness that causes it); serving every failed board from the device without exceptions (would keep a board
whose access was revoked).
Not in scope here (cannot be done from this machine within the hour): server capacity measurement and right-sizing
(issue step 3), "N of M boards saved" (item 8), the verify step on staging/production (item 10 style).
Risk: under a very slow server a sync takes longer instead of failing fast (bounded at 75 s per board, with board
lookups running 6 or 10 at a time). A kept copy may be older than the server's; the next sync refreshes it.
Tests (sync suite, "board reloads under a slow server (#1212)"): limits cover the ladder (red), keep complete copy on
failure (red), not on Not authorized / deleted (guards), no copy on a first sync (guard).

Review (adversary): BLOCKED the first plan, rightly. CONFIRMED by me: (High) real rejections are
`{fakeXHR: {status, responseJSON}, message, result}` (`utils/extras.js:422-426`), so the exclude-list check
(`err.error`) would have kept a board whose access was revoked; (High) a plain 404 for a deleted board would have been
kept too; (Medium) the adapter rejects every server request at 15 s with `{error: 'timeout'}`
(`utils/persistence.js:4357-4363`), so a 60 s reload limit did nothing past 15 s; (Medium) a kept copy was recorded
as 're-downloaded'; (Low) `button_set_needs_reload` stayed true, sending another request to the slow server.
Revised: `utils/sync_board_fallback.js`. Reload limit 20 s (above the adapter's 15 s, below the 30 s board lookup);
keep the stored copy only for passing failures (adapter or sync timeout, status 0, 429, 5xx), with status 'kept'
(sync details counts only known statuses, so it is no longer counted as re-downloaded) and the button-set reload
cleared. Refusals (400), missing or deleted (404) and unknown shapes fail as before. Tests use the real shapes.
Result: commit `f2d463670`. Mutants, each killed: every failure counted as passing (the 4 refusal guards red), no
fallback (the 5 keep tests red), limit back to 5 s (limit test red). Related suites incl. revocation: 665 run, 651
pass, 14 skip, 0 fail. ESLint gate clean. Re-review of the code: ship; Lows recorded, not acted on: the classifier
repeats `network_error_shape` (services/persistence.js:4757); tests stub `reload` with plain objects (Ember Data's
wrapping keeps `fakeXHR.status`, by reading); the "first sync" guard lacks only image_urls; Sync Details shows 'kept'
as a blank status; an invalid_token body under ApplicationCache times out and keeps the copy (session ending anyway);
the utils copy of board_lookup still has 5 s (overridden by the service, dead). Left on #1212: first-sync boards slower
than the adapter's 15 s cap (an app-wide limit; its own change), server capacity (staging/production), item 8.

#### #1212 part 1: a first sync still loses a board slower than 15 s (2026-11-09, Traci: "push and start part 1")

Facts (CONFIRMED):
- A first sync has no stored copy, so `keep_stored_board` cannot help; the adapter rejects any server request at 15 s
  (`utils/persistence.js:4357-4363`), and the board is reported "failed retrieval" with its folders never visited
  (`services/persistence.js:3364-3384`).
- A board is marked visited only after it loads (`:3132`), so it can be visited again.
- `board_lookup` caches its lookup promise per board (`lookups[id]`, `:2791`) and reuses a pending or settled one
  (`:2761-2762`); a failed one is never cleared, so a retry must delete it first.
- A thread resolves when the queue is empty (`:3388-3392`), so a retry pushed back on a timer could be lost: the retry
  must stay on its own thread.
- Measured in the issue with mobile parallelism (what iPads now get): max request 19.3 s, 20 over 8 s; desktop
  parallelism: max 92 s.

Change: in the sync's lookup-failure handler, when the failure is passing (`passing_failure`, the same allow-list) and
the board has not been retried, mark it retried, delete its cached lookup, wait (10 s; 1 ms under sync_testing via
`schedule_sync_board_step`), put it at the front of the queue and continue on the same thread. A second failure, a
refusal, a missing board or an unknown error is reported as today.
Rejected: a longer adapter limit for sync requests only (the adapter's 15 s cap is shared by every request, both
persistence copies; larger change); retrying immediately (same load that caused it); more than one retry (multiplies
load under a struggling server).
Risk: a board that fails twice costs the sync about 10 s more of one thread; under a server that never answers, every
failing board is tried twice.
Tests (real sync, queryLog fixtures answering per call): retried once and then synced (red), retried only once then
reported (red), a refusal not retried (guard).
Review (adversary): nothing blocks given one condition, acted on: (Medium, CONFIRMED) a retried flag on the queue
entry would let a board linked from two places (or synced for a supervisee) be retried per entry; the claim is now
per board for the sync (`sync_progress.retried_lookups`), with a two-parent test. (Low) the first test's no-error check
passed with no status: it now asserts the status. (Low, PLAUSIBLE, not acted on) a waiting thread is not tied to its
sync_id (pre-existing for 30 s lookups; the 10 s wait adds a window).
My own error, fixed: the first insert of the tests landed inside the previous test (one misplaced `});`).
Finding while testing: in this harness a board that loads is requested twice (a find, then a reload, status
're-downloaded'); measured with a fixture that succeeds at once. Whether production does the same for a first sync
is NOT checked; if it does, it doubles board requests under load and belongs to #1212.
Result: commit `4442bf0de`. Mutants, each killed: no retry (3 red), cached rejection kept (3 red), refusals retried
(1 red). Related suites incl. revocation: 669 run, 655 pass, 14 skip, 0 fail. ESLint gate clean.
Follow-up, checked (2026-11-09): the "every board requested twice" lead is a TEST-HARNESS artifact, not production.
The harness replaces ApplicationAdapter.findRecord (`tests/helpers/ember_helper.js:467-478`), skipping the adapter's
`retrieved` stamp (`utils/persistence.js:4375-4378`); `fresh` needs `retrieved` (`models/base.js:44-53`), so the sync
reloads it. In production a first-sync board arrives stamped, is fresh ('downloaded') and is not reloaded: one
request per board. CONFIRMED by reading; not measured on a device.

#### #1212 remaining items: STOPPED under Rule 13 (2026-11-09)

Traci asked to fix the remaining #1212 items and test on emulators. Stopped after two self-inflicted errors in this
unit: (1) a test insert placed inside the previous test (fixed earlier); (2) I wired a longer adapter limit through
`record.reload(options)` without checking that `BaseModel.reload(ignore_local)` calls `this._super()` with no
arguments (`app/frontend/app/models/base.js:32-41`), so the reload half did nothing, and my tests replaced the reload
and `findRecord` with stand-ins, so they could not see it. I also applied that wiring before its review (process slip).
Adversary review blocked it (High, CONFIRMED by me).

Saved outside the repo, worktree clean at `2874870e0` (nothing unfinished committed or pushed):
- `/home/tracid/offline-sync-handoff/1212-request-limit-BLOCKED.patch`: sync board requests ask the adapter for 45 s
  via adapterOptions (`sync_find_options`, `adapter_request_limit_ms`), reload 50 s, board lookup 60 s; util tests.
  Blocked. To finish: (a) `BaseModel.reload(ignore_local, options)` passing `options` to `_super`, call
  `record.reload(true, sync_find_options())`; (b) a test through the REAL `DSExtend.findRecord` timer (no stand-ins
  for findRecord/reload) so reverting the adapter line or the base.js change goes red; (c) the third network try ends
  at ~49 s, so 45 s still cuts it: decide 50 s+ (then reload/lookup above it) or state that only two tries fit;
  (d) Low: each call builds a new adapterOptions object, so Ember Data no longer merges same-tick fetches of one board.
- `/home/tracid/offline-sync-handoff/1212-sync-details-kept-UNREVIEWED.patch`: Sync Details counts and labels 'kept'
  boards (`la-sync-details-kept`, `la-sync-details-status-kept`, keys `n_kept_from_device`, `kept_from_device`) with
  an integration test (red then green, 2 tests). Not reviewed yet.
Not started: the emulator before/after run (design: a LOCAL-ONLY patch in boards#show sleeping 18 s for about 1 in 8
boards chosen by a hash of the id, so the same boards are slow in both runs; local puma is 1 worker x 5 threads;
compare `7608092f9` with the finished fix on the Android emulator and WebKit, counting boards lost per first sync).
Cannot be done here: server capacity (staging/production metrics), native iOS (needs a Mac).

#### #1212 sync request limit: revised proposal (2026-11-09, second session)

Fact sheet:
- (a) READ: the adapter's limit is read once, `runLater(..., 15000)` at `utils/persistence.js:4357-4363`, in the UTILS
  `DSExtend.findRecord`, which is what the adapter mixes in (`adapters/application.js:2, 48`). The services copy's
  `DSExtend.findRecord` (`services/persistence.js:4243+`) is not mixed into any adapter; only `grabRecord` is read from
  a DSExtend (`app.js:106`). CONFIRMED. The sync's limits are read at `services/persistence.js:2763` (findRecord),
  `:2782` (reload, `BOARD_RELOAD_MS`) and `:3100` (lookup, time_promise default 30 s). CONFIRMED.
- (b) SHAPES of the options on their way to the adapter: Ember Data 5.3.13 builds the snapshot from the options
  (`legacy-compat/dist/-private-Dlia0pw1.js:1068-1072`, `adapter.findRecord(store, klass, id, snapshot)`) and sets
  `snapshot.adapterOptions = options.adapterOptions` (`:311`). `Model.reload(options = {})` WRITES
  `options.isReloading` and `options.reload` (`model/dist/model-rk3atPqV.js:2707-2709`), so a frozen whole options
  object would throw; a frozen INNER adapterOptions object is only read. Same-tick fetches merge only when
  `adapterOptions` is the same object or empty (`-private-Dlia0pw1.js:942-948`), so a shared inner object keeps merging.
  `BaseModel.reload(ignore_local)` calls `this._super()` (`models/base.js:32-41`): options are dropped. CONFIRMED.
- (c) CROSS-FILE claims: the network ladder for a GET is 8 s, 500 ms, 20 s, 500 ms, 20 s, about 49 s; each retry
  recomputes its timeout because `original_options` is copied before the timeout is set (`utils/extras.js:177-190,
  361-375`). CONFIRMED. Every `reload(` caller in app/ passes at most one argument (`ignore_local`), and
  `this._super(undefined)` hits Ember Data's `options = {}` default exactly as `this._super()` does. CONFIRMED by grep.
  The pushed test `tests/utils/persistence-sync-test.js:6184-6187` asserts `BOARD_RELOAD_MS < 30000`. CONFIRMED.
- Where a board is actually LOST: only when the lookup fails with no stored copy (first sync, or a board new to the
  device); a failed reload of a stored board already keeps the copy (`keep_stored_board`, `f2d463670`). CONFIRMED.

Candidate A (smaller): only the sync's `findRecord` (`:2763`) passes `{adapterOptions: SYNC_ADAPTER_OPTIONS}` (a frozen
shared object, fresh outer wrapper per call); the adapter timer reads `adapter_request_limit_ms(snapshot)`;
`SYNC_REQUEST_MS` 55 s (the whole 49 s ladder plus margin); the lookup gets `BOARD_LOOKUP_MS` 70 s. The reload keeps
15 s (adapter) / 20 s (sync) and its keep-the-stored-copy fallback. No base.js change; the pushed test stays as is and
still holds (its "lookup is cut at 30 s" comment becomes stale; comment only).
Candidate B (the handoff plan): A, plus `BaseModel.reload(ignore_local, options)` -> `this._super(options)` and
`record.reload(true, sync_find_options())`, with `BOARD_RELOAD_MS` 60 s. Needs approval to rewrite the pushed test
at `:6184` (its spec changes). Gain over A: a stored board under load gets refreshed instead of kept stale.
Recommendation: A. It fixes the only path where a board is lost; B touches a model every screen uses for a
refresh the fallback already covers.
Rejected: 45 s (cuts the third try); only two tries (50 s would fit three anyway); a global adapter limit increase
(every screen would wait up to 55 s on a dead server).
Risks: under a server that never answers, a failing first-sync board holds a thread for up to 70 s + 10 s + 70 s
(was 30 + 10 + 30; in practice 15 + 10 + 15 because the adapter cut first). A non-sync `findRecord('board', id)`
issued while the sync's fetch of the same board is pending merges into the sync's request (gets 55 s). The extras
first try aborts at 8 s while the server keeps working on it (pre-existing load doubling).
Open questions: is there a sync-wide stop that bounds the dead-server case (not checked)? Should the services copy
of DSExtend be kept in step (dead code; left unchanged)?
Tests: (1) through the REAL adapter (`queryLog.real_lookup`, `$.realAjax` held pending, no stand-in for findRecord):
`store.findRecord('board', id, sync_find_options())` schedules a new run-loop timer at SYNC_REQUEST_MS
(`_backburner._timers`, as `tests/models/buttonset-test.js:991-995`), and a plain `findRecord` schedules 15 s and
nothing longer (guard). (2) the sync's board_lookup passes the shared options to findRecord. (3) limits nest
(lookup > request > ladder 49 s). Mutants: 15000 back in the adapter (1 red); options dropped at `:2763` (2 red);
SYNC_REQUEST_MS 45000 (3 red). For B also: base.js `_super()` back (a reload-through-the-real-adapter test red).

#### Sync Details "kept" patch: review (2026-11-09, second session)

Adversary (on `1212-sync-details-kept-UNREVIEWED.patch`, not applied): REVISE, nothing Critical/High. CONFIRMED by me:
the live component is `components/sync-details` (modal-container renders `<SyncDetails />`; `controllers/sync-details.js`
has no template, dead, left alone); "kept" and "updated" never count one row (status string filters). To act on:
(Medium) wording "kept from this device" can read as "withheld"; the app says "Kept on this device" (`en.json:753`);
Traci's call. (Low) add both keys to `en.json`. (Low) the bare comma belongs inside the translation, as
`en.json:6655-6656` do. (Low) tests miss a no-kept log (no span) and an error-only row (no kept label). (Low,
PLAUSIBLE reach) flags are only added, so a late rewrite can leave `re_downloaded` and `kept` both set: test `kept`
first in the template. Separate, from `4442bf0de` (CONFIRMED by reading `services/persistence.js:2779-2782`): a retried
board leaves the first attempt's 're-downloaded' status, so it can count twice as updated; fold into this branch.
Also noted: a sync whose only trouble is kept boards still reports "without errors" (`:2398-2410`), by design so far.

#### #1212 candidate A: review, red, wiring, and a second Rule 13 stop (2026-11-09, second session)

Traci: "only fix what needs to be fixed in order to make the syncing work and offline boards work". Scope cut to
candidate A; Sync Details "kept" label, the retried-board double count and the emulator run are PARKED.
Adversary on the proposal: REVISE then ship A, nothing Critical/High. Acted on: lookup limit raised to 85 s (a board
looked up by key is fetched AND reloaded, `services/persistence.js:2754, 2766`, CONFIRMED); tests assert the
constants exist; fresh-outer-object assert. Relabelled: "a failed lookup with no stored copy is the only loss path"
is ASSUMED, not CONFIRMED: a board already in the store before the first sync (board list, Modern tree warm-up)
goes to the reload, which keeps 15 s under A (reviewer, Medium, mechanism CONFIRMED by them, not by me).
Red run (constants exported, nothing wired): 3 of 4 new tests red for the right reason, the 15 s guard green.
After wiring: related suites 673 run, 658 pass, 14 skip, 1 fail; ESLint gate clean. The failing test is the one
through the REAL adapter: the adapter's timer is still 15 s.
Diagnosed (CONFIRMED by console logs in a test build): the live `findRecord` is the UTILS copy; it receives 4
arguments, the 4th a real Ember Data `Snapshot` with an `adapterOptions` key whose VALUE is undefined, though the
test passed `{adapterOptions: {sync_request_ms: 55000}}` to `LingoLinq.store.findRecord`. Read and found passing the
options through: `store.findRecord` (`@ember-data/store/dist/many-array-BwVo-2vv.js:5090-5133`), the legacy handler
(`legacy-compat/dist/index.js:522-575`), `fetchDataIfNeededForIdentifier` (`-private-Dlia0pw1.js:866-877`),
`createSnapshot` (`:721-722`), `Snapshot` (`:311`). So where the value is lost is NOT found. Until it is, the
change cannot be shown to do anything in the app (the sync-level tests pass only because they stub findRecord).
Stopped under Rule 13 after two botched diagnostic steps: a log appended after a `//` comment (never ran), and a
test wrapper on `store._fetchManager` before Ember Data creates it (lazy; TypeError).
Saved: `/home/tracid/offline-sync-handoff/1212-request-limit-A-ADAPTEROPTIONS-LOST.patch` (util constants, adapter
and sync wiring, 4 tests); code reverted to HEAD, worktree has only this log change.
Next: find where adapterOptions is dropped between `store.findRecord` and the Snapshot (candidates not yet read:
the RequestManager / CacheHandler path in `ember-data/store` and `@ember-data/request` in DEBUG builds, which may
copy `request.data`; `getPendingFetch` returning an earlier pending fetch). Wrap `LingoLinq.store.request` alone
first (it exists eagerly), log `req.data.options`, then go one step down. If adapterOptions cannot reach the adapter,
the alternative is a flag the adapter reads by board id (e.g. a set of ids the sync is fetching), reviewed first.

#### #1212 plan: step back to the whole picture (2026-11-09, second session)

Why step back: four units on #1212 have all tuned CLIENT TIME LIMITS (reload 5 s -> 20 s, keep stored copy, retry
once, adapter 15 s -> 55 s). None was measured against the failure the issue reports, and the issue's own evidence
points elsewhere:
- Issue run B (mobile parallelism, which iPads now get, #1201): 0 app request timeouts, max request 19.3 s, p99 6.2 s.
  Run A (desktop parallelism): p90 30.7 s, max 92 s, 469 requests over 8 s. Same server, same account. The slowness is
  LOAD the sync itself puts on the server, not a fixed property of the server.
- A first sync can fetch boards in batches of 25 (`/api/v1/users/:id/boards?ids=`, `services/persistence.js:2945-2980`)
  but only when fewer than 100 boards need fetching (`:2945`). A 306- or 1,156-board first sync skips the batch
  entirely and sends one request per board, 6 or 10 at a time (`:3400`). CONFIRMED by reading; effect NOT measured.
- In that batch loop `next_batch()` is called once per stored board (inside `list.forEach`), so one batch of 25
  could start up to 25 next batches at once. PLAUSIBLE defect, NOT checked.
- The client's 8 s first try (`utils/extras.js:186-190`) gives up on the request but the server keeps working on it,
  and the retry sends it again: under load one slow board becomes 2-3 server requests. HYPOTHESIS, to measure in
  the server log.

Phase 1: measure the real failure before changing anything (local, this machine)
1. Server-side delay that grows with load instead of a fixed 18 s sleep: LOCAL-ONLY patch in boards#show that
   sleeps in proportion to requests in flight (a counter), so more parallel requests make each slower, as staging
   showed. Save the file first, never commit.
2. One timeline per run: in the app, log per board request start, each network try, which limit fired (extras
   8/20 s, adapter 15 s, reload 20 s, lookup 30 s) and the final status; on the server, count GETs per board id.
3. Runs, first sync of aiden_parker (1,156 boards): Android emulator and WebKit (iPad), at `7608092f9` (before
   #1212 work) and at the PR head `1ffea002b`. Record boards lost, boards synced, server requests per board, time.
Exit: we know, per lost board, which limit cut it and how many server requests the sync really sent.

Phase 2: pick the fix from the data, smallest first
- If the head already loses 0 boards: no more client limit work; finish with the acceptance runs.
- If requests per board are well above 1 (duplicates): reduce duplicate load first (extras retry vs server).
- If the request count is the driver: use the existing batch endpoint for first syncs of any size (remove the
  < 100 cap, fix the batch loop), so ~1,156 requests become ~47. Server already supports it; check its own limits
  (`users_controller` boards?ids=) and permissions per board.
- Only if a board is still lost to the adapter's 15 s cut: finish the adapterOptions trace (one step at a time
  from `store.request`), or have the adapter read a "sync is fetching this board" set.
Each chosen fix: fact sheet, red test, adversary review of the proposal, then code, then mutants (/fix-proposal).

Phase 3: verify against the issue's acceptance criteria
- Repeat Phase 1 runs on the fix: 0 boards lost under load on Android and WebKit.
- Staging and production capacity runs, native iOS: cannot be done here (Scot / a Mac); say so in the PR.
Parked (not needed for boards to sync): Sync Details "kept" label, retried-board double count, N of M (#1212 step 4).

#### #1212 Phase 1, first measurement: the load is pictures through the proxy, on dev and staging only (2026-11-09)

Run: WebKit (iPad), fresh profile, first sync of aiden_parker, the build the local server was serving (before any
#1212 change: "reload board" 5 s, no keep/retry code), no added server delay. Driver
`/home/tracid/offline-sync-handoff/scripts/web-first-sync-timeline.js`, data `before-noload-webkit.json` there.
Result: succeeded, no errors, 209 s, 102 boards (1 request each, batch download not used). API requests during the
sync: 102 board, 8 button-set, 1,567 other, of which 1,391 are `/api/v1/search/proxy?url=<lingolinq-dev-uploads S3>`
(8 of them 400). Pictures outnumber board requests about 14 to 1 and each holds a server thread for an S3 fetch.
Why the proxy (CONFIRMED): `store_url_now` tries a direct CORS request for upload-bucket URLs first
(`services/persistence.js:1548-1551, 1574-1612`) and falls back to the server proxy (`:1615-1644`).
`lingolinq-dev-uploads` sends no `Access-Control-Allow-Origin` (GET 200 without it; preflight 403, curl with
`Origin: http://localhost:5000`), so in a browser or web view every picture goes through the server. Production's
upload CDN `d34sa6lc5jfe66.cloudfront.net` answers `access-control-allow-origin: *` for origins
`https://app.lingolinq.com`, `capacitor://localhost`, `https://localhost` (curl, one public production picture), so in
production pictures do NOT go through the server.
Consequence: the issue was measured on staging, which shares the dev bucket. Its request counts (1,997 to 3,946 for
306 boards, about 6 to 13 per board) fit picture proxy traffic dominating, and its slow board requests fit boards
queueing behind it. Production may not have this load at all. NOT yet measured: board latency on a capacity-limited
server with and without the proxy traffic; production first-sync behaviour.

CORRECTION (same day, CONFIRMED by curl with each Origin): `lingolinq-dev-uploads` DOES have a CORS rule, pinned to
app hostnames (docs/INFRASTRUCTURE.md, AWS section). It answers `Access-Control-Allow-Origin` for
`https://staging.lingolinq.com` and `https://dev.lingolinq.com`, and NOT for `capacitor://localhost` (iOS app),
`https://localhost` (Android app), `http://localhost:5000` (local) or `https://app.lingolinq.com`. So on the staging
and dev WEB sites pictures load directly; the proxy load hits the NATIVE apps pointed at dev or staging (and local
dev). #1212 was measured in the iOS app against staging, so it is that case. My first test used only the local origin
and wrongly concluded the bucket had no CORS rule. The ask is to ADD the two app origins to the existing rule
(put-bucket-cors replaces the whole configuration, so read it first), not to replace it with `*`.

#### #1212 after Scot's CORS change: local first sync measured again (2026-11-09, evening)

Scot added `capacitor://localhost`, `https://localhost`, `http://localhost:5000` and `http://localhost:8184` to the
`lingolinq-dev-uploads` CORS rule (CONFIRMED by curl, GET and preflight, each origin). Same run as the before
measurement: WebKit (iPad), fresh profile, aiden_parker, local server from this worktree, same bundle
(`application.debug-703db34d...`), driver `web-first-sync-timeline.js`, data `after-cors-webkit.json` in
`/home/tracid/offline-sync-handoff/scripts/`.

| | Before | After |
|---|---|---|
| `/api/v1/search/proxy` requests | 1,391 | 11 |
| of which pictures | 1,383 (1,380 from the bucket) | 3 (avatar, board icon, one flaticon.com picture; none from the bucket) |
| of which button-set `.json` files (400) | 8 | 8 (same 4 files twice; unchanged, not pictures) |
| Board requests / errors | 102 / 0 | 102 / 0 |
| Sync result, time | succeeded, 209 s | succeeded, 88 s |
| All `/api/v1/` requests | 1,677 | 275 |

Not checked: the driver records only `/api/v1/` requests, so direct S3 downloads and the saved picture count were not
counted. Button-set request p50 rose from 0.6 s to 5.3 s (cause not looked at; server had just restarted). Local is
not staging: this shows the mechanism, not staging capacity.

Staging run not done. `lingolinq` (signs in; home board set 77 boards) is no fit: on 6 sampled boards every
picture entry is empty or an inline data URI, none from the bucket. The demo password (`SEED_DEMO_PASSWORD`) is not
in 1Password, nonprod Secret Manager (only `SEED_ADMIN_PASSWORD`, `SEED_LINGOLINQ_PASSWORD`) or the
`lingolinq-migrate-staging` job YAML; only Scot has it. The e2e sign-in helper refuses non-localhost hosts
(`e2e/support/local-session.js:7-12`). A browser run on staging would not discriminate anyway: the staging website
was already allowed before Scot's change, and the before run already had 0 board errors.

CORRECTION (2026-11-09, adversarial review, CONFIRMED in the code, not on a device): bucket CORS is NOT shown to be
the cause of the iOS staging failure, which commit 10b6e838d stated (the PR description never did).
- The mobile shell enables `CapacitorHttp` (`lingolinq_mobile/capacitor.config.json:17-19`). Capacitor's
  `lingolinq_mobile/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js:588-600` (Capacitor 8.5.3) rewrites every absolute GET XHR into a native request, which has no browser CORS check.
  So in the apps the direct picture fetch in `store_url_now` should not have been blocked before the change either.
  The local runs above are the browser case only. Whether the app's blob XHR through the interceptor works was not
  checked.
- Production picture links use `d34sa6lc5jfe66.cloudfront.net` (`.github/workflows/deploy-cloudrun.yml:1374`), which
  `cors_match` does not include (`services/persistence.js:1546-1552`), so production uploaded pictures go through
  `/api/v1/search/proxy` on every platform. The earlier "production does not have this load" was wrong.
- Both runs used the 11:34 bundle, from before the #1212 client changes (f2d463670), so those changes are unmeasured.
- The app origins Scot added (`capacitor://localhost`, `https://localhost`) are probably unneeded; decide after an app
  run against staging counts proxy requests. The local origins are useful (measured above).
Next discriminating check: the iOS or Android app against staging with a large account, counting proxy requests and
board errors, compared with the issue's 246-error first sync (its runs A, B and A2 were repeat syncs).

#### Whole-branch review and merge with develop (2026-11-09, late evening)

Five read-only adversarial reviewers (sync core, offline board views, offline shell, sign-in and server, test
quality), each finding re-checked before being reported. CONFIRMED blockers:
1. CI: `ember-shard-main` fails 3 tests in `tests/unit/utils/capabilities-database-failure-test.js` (last CI run,
   cb56c1b71; leak check, `stub(stashes, ...)` without `standInGlobals`). CI had not run since 2026-11-08 because the
   PR conflicted with develop.
2. Liked boards past the 25th never sync: `User#starred_board_refs` resolves `starred_board_ids[0, 25]`
   (app/models/user.rb:2469) and the seeds read only that list (utils/offline_sync_seeds.js:36-43).
3. "Wi-Fi with no internet opens the app" is claimed fixed, but its e2e blocks only `/api/v1/**`
   (e2e/offline-launch.spec.js:467), so the page loads live and the shell is never exercised.
HIGH, code path confirmed, not reproduced: `keep_stored_board` (utils/sync_board_fallback.js:31) checks only the
in-memory record; `/tree` boards are pushed to memory without a device row (utils/board_detail_cache.js:185-191).
Open decision (Traci): are device copies read-only in Basic view too (routes/user/board-alt.js has no flag)?
Also CONFIRMED: utils/persistence.js:2787 still has the 5 s reload with no #1212 keep or retry.
RSpec for the branch's specs: 187 examples, 0 failures (run by Traci through op).

Merged origin/develop (cc940f489): `.eslint-todo` resolved as the union of both sides (gate: 0 new); the
learnings archive kept both sides' entries. Not pushed.

25-like fix: Traci chose (c), the sync pages `/api/v1/boards?user_id=..&starred=true`
(boards_controller.rb:140, `model` permission, MAX_PAGE 50) only when `stats.starred_boards` exceeds the
non-suggested refs. Option (b) was dropped: `starred_board_ids` holds ids, not keys, so a key list costs a board
lookup like (a). Red test written, NOT yet run: persistence-sync-test.js "more than 25 liked boards".

No-internet e2e: three cases written in offline-launch.spec.js (nothing answers, a 503 page, a hung page load),
NOT yet run successfully. Run 1 failed in setup for every test, the Classic control included: my `npx ember build`
(development) leaves Mirage on, so no request reached Rails (MirageError in the page). A Mirage-free build comes
from `ember serve --proxy`; my attempt on port 8186 failed ("port in use"). Stopped under Rule 13 (two
self-inflicted setup errors). Private e2e DB `lingolinq-e2e-claude` (fresh, seeded) and Rails on 5077 are running.
Next: build dist with ember serve --proxy http://localhost:5077 (a free port, and a free live-reload port), copy with
extras:assert_js, run the control first, then the three cases; then run the red sync test.

#### Fix proposal: liked boards past the 25th are never synced (2026-11-09, for adversarial review)

**Fact sheet**
- (a) READ, CONFIRMED: the sync's starting list is built once, synchronously, by `offlineSyncSeeds.seeds(user)` at
  `services/persistence.js:3060` and `utils/persistence.js:3088`; liked boards come only from
  `user.get('stats.starred_board_refs')` (`utils/offline_sync_seeds.js:36-44`).
- (b) SHAPES, CONFIRMED: `settings['starred_board_ids']` is an uncapped list of board IDS (shallow ids;
  `user.rb:2453-2460`), `settings['starred_boards']` its length, sent as `stats.starred_boards`
  (`lib/json_api/user.rb:511`). `starred_board_refs` resolves only `[0, 25]` of the ids (`user.rb:2469`) and, with
  fewer than 8 liked, appends suggested boards marked `suggested: true` (`user.rb:2486-2516`). Refs are sent only to a
  caller with `supervise` (`json_api/user.rb:512-515`). With the `shallow_clones` flag (available, not enabled by
  default) a ref's key is `<user>/my:<owner>:<board>` (`user.rb:2478-2481`).
- (c) CROSS-FILE, CONFIRMED: `GET /api/v1/boards?user_id=<id>&starred=true` filters to ALL liked ids
  (`boards_controller.rb:140-144`), needs `view_detailed` and `model` on the user (`:77`, `:129`), which every
  caller who has `supervise` also has (`user.rb:56`, `:71`), and pages with `per_page` up to 50
  (`lib/json_api/board.rb:10`, `meta.more` / `meta.next_url`). The Liked tab already calls it
  (`components/board-picker.js:383`).
- ASSUMED (not load-bearing): how often real accounts exceed 25 likes.

**Red test (written, run, fails for the cause):** `tests/utils/persistence-sync-test.js` "more than 25 liked
boards": 27 liked, profile refs hold 25; expects the liked list to be requested, boards 26 and 27 visited, 28
statuses. Today 4 of its 5 checks fail (board 25, inside the cap, passes).

**Candidates**
1. (chosen by Traci) The sync pages the liked-boards endpoint when `stats.starred_boards` is greater than the
   number of non-suggested refs, and adds a seed (depth 1, "starred board") for each liked board not already seeded.
   One new exported function in `utils/offline_sync_seeds.js` (returns a promise of extra seeds); both sync copies
   call it before the traversal starts. No server change, no cost on profile loads; cost is 1 request per 50 liked
   boards, only for accounts over 25.
2. Raise or remove the server cap in `starred_board_refs`: one line, but a board lookup for every liked board on
   every profile load, for every caller.
3. A server-side uncapped key list for the sync: the ids are not keys, so it costs the same lookup as 2.
Simplest alternative rejected: documenting a 25-board limit (the UI says "like a board to keep it offline").

**Failure handling:** if a liked-list page fails, the sync continues with the seeds it has and records one error
(`board_errors`, so the sync reports "finished with errors"), never a silent pass. A liked board the caller can no
longer view fails as any refused board does today.

**Risks seen**
- The endpoint returns full board JSON (heavier than needed); only accounts over 25 pay it.
- With `shallow_clones`, the endpoint returns the original board's key while the refs carry the `my:` key, so the
  first 25 could be seeded under one key and re-added under another. Mitigation: skip a listed board whose id (or
  shallow root id) is already among the refs; compare by id, not key.
- The trigger compares a count with a list: a liked board that was deleted keeps its id in the count, so such an
  account pages the list on every sync (wasteful, not wrong).
- The utils copy of the sync must get the same call (whether users reach it is unverified).
**Unresolved:** exact id shape the endpoint returns for a liked shallow clone; whether the index response is ordered
stably across pages (a board skipped between pages would be missed until the next sync).

**Mutation that must turn the test red:** remove the call to the new function (or return no extra seeds).

**Review outcome (2026-11-09, adversarial review; the two High points re-checked in the code): candidate 1 as
written is NOT safe to build.** Corrections to the proposal above:
- Fact (c) was WRONG. The starred list does not return all liked boards: it keeps only boards owned by the user or
  their supervisees, or public ones (`boards_controller.rb:135-139`). A liked PRIVATE board owned by someone else (a
  therapist's board shared with the child) is dropped, with no error. The first 25 refs have no such filter.
- `meta.next_url` for boards carries no `user_id` or `starred` (`lib/json_api/json.rb:57`; `JsonApi::Board` has no
  `paginate_meta`), and an index call without `user_id` becomes the public catalog (`boards_controller.rb:156`). A
  pager must re-send the query with `meta.next_offset`, never follow `next_url`.
- The "Liked tab" citation was wrong: `board-picker.js:383` is a category browse query. The Liked list is
  `controllers/user/index.js:1402`.
- Liked shallow clones come back from the list under a different id and key than the refs carry, so de-duplication
  must compare root ids (reviewer, not re-checked by me).
- The red test passes for several wrong fixes (no trigger, page 1 only, no de-duplication) and its list fixture is
  richer than the real summary response. It needs controls before it can carry a fix.
- Cost was understated: every key-only seed is reloaded on every sync, plus each liked board's folders.
Reviewer's alternative, now the leading candidate: a sync-only server call that returns the remaining liked refs
(same id and key forms as the profile refs, no visibility filter beyond the existing `supervise` gate), so the cost
is paid only when a sync asks. Needs Traci's decision (it is a small server change). Nothing built.

#### Fix proposal 2: raise the liked-list cap from 25 to 100 (2026-11-09; Traci chose this and the cap of 100)

**Diagnosis (CONFIRMED):** `User#starred_board_refs` resolves `starred_board_ids[0, 25]` (`app/models/user.rb:2469`);
the loop below it walks every id but only finds the 25 resolved (`:2473-2484`). The sync seeds read only this list
(`utils/offline_sync_seeds.js:36-44`), so like 26 onward is never saved offline.
**Candidates:** (A, chosen) one named limit of 100 replacing the literal 25: same id and key forms, no visibility
gap, no paging, one batched lookup (`global_id.rb:140`). (B) a sync-only server call for the rest: more code and
API surface for the same result under a cap of 100. (C) client paging of the starred index: rejected by review
(drops private shared boards; `next_url` loses the filter).
**Red test (run, red):** `spec/models/user_spec.rb` "starred_board_refs limit": 30 liked returns 30 in liked order
(got 25); 101 liked returns the first 100 (got 25). Mutation: put 25 back.
**Every reader of `stats.starred_board_refs` (CONFIRMED by grep, each read):**
- `utils/offline_sync_seeds.js:36` the sync (the fix). `utils/board_prefetch_planner.js:41` online warm-up: up to
  100 lookups instead of 25.
- `models/board.js:968` whether a board shows as liked: boards 26 to 100 now show correctly.
- `controllers/caseload.js:247` length only. `components/dashboard/authenticated-view.js:986` sort and heart.
- Only with "Make my Home Board a list of all my liked boards" (`preferences.sync_starred_boards`):
  `utils/obf.js:194` builds that home grid from the refs, so it grows from 25 tiles to up to 100 (smaller tiles);
  `models/user.js:941` loads a button set per ref; `services/app-state.js:1406` next-board order;
  `utils/word_suggestions.js:1439` lookups.
- Server: `boards_controller.rb:108` (shallow clone ids from refs).
**Risks:** a larger user JSON for accounts over 25 likes (about 100 to 150 bytes a ref); the liked-list home grid
changing size for people who use that preference and have more than 25 likes (Traci to decide: let it grow, or keep
that grid at 25); longer syncs for those accounts (each liked board is reloaded every sync, with its folders).
**Past 100:** when a like lands and the person already has 100 liked boards, the Like message says this one will not
be kept offline until another is unliked. Unresolved: the most reliable source for that count at like time
(`stats.starred_boards` on the signed-in user may be stale; the star response returns only `starred`, `stars`,
`user_id`).

#### Liked list: unit 1 landed; proposal 3, hide boards the person cannot view and stop dead likes using slots (2026-11-10)

**Unit 1 landed (dbf02dbc3):** `LIKED_BOARD_REFS_LIMIT = 100` bounds the lookup and the list (`user.rb:2467-2476`).
Spec "starred_board_refs limit" red before, green after, red again with 25. Regression run of user, json_api user,
boards and users controller specs: 1,174 examples, 11 failures, all `WebMock::NetConnectNotAllowedError` in
boards_controller create/update; the same 11 count and error with the change removed (my local env carries upload
settings; not from this change). Review of proposal 2: proceed with changes; its other points are tracked below.
Decisions (Traci): home grid stays at the first 25 with a "Show more" tile opening all (up to 100); deleted liked
boards are cleared so they stop using slots; a liked board the person can no longer view is not listed.

**Proposal 3 (for review). Fact sheet**
- READ, CONFIRMED: `starred_board_refs` lists a ref for every resolved liked id with no view check
  (`user.rb:2477-2488`); the profile JSON sends the list to any caller with `supervise` (`json_api/user.rb:512-515`).
- SHAPES, CONFIRMED: a liked id can be a plain board, a shallow clone id (`<board>-<user>`), a deleted board (id
  stays: `remember_starred_board!` returns early when the board is gone, `user.rb:2450-2451`), or a board made
  private or unshared after the like (unstar needs `view`, so the person cannot remove it;
  reviewer: `boards_controller.rb:1061-1062`, not re-checked).
- CROSS-FILE, CONFIRMED: `Board#allows?(user, 'view')` covers public, cached shared lists, owner grants and
  shallow clones (`board.rb:85-99`); the board_revisions sync call uses the stricter `BoardRevisionsAccess`
  because that cache can lag an unshare by minutes to hours (`app/services/board_revisions_access.rb:3-9`), at the
  cost of computing shared-board sets for the user's whole supervision chain.
**Red specs (run, red):** a liked board made private is still listed; with 102 liked, one deleted and one private,
99 are listed instead of 100; a deleted id stays in `starred_board_ids` after the next like.
**Candidates**
1. (proposed) List only boards that exist and that the liker can view by `allows?(liker, 'view')`, taking liked ids
   in order, a batch of 100 at a time, until 100 are listed or the ids run out; and prune ids with no board inside
   `remember_starred_board!` (which already rewrites the list and count). Cheap, the app's standard check; can lag
   an unshare like every other `allows?` reader. The sync already drops revoked boards through board_revisions.
2. Same, but decide another owner's private board with `BoardRevisionsAccess`: current, but adds the supervision
   chain's shared-set work to every profile load of anyone who liked such a board.
3. Prune unviewable ids from the stored list too: rejected, a board shared again would silently lose its like.
**Risks:** the view check runs for the LIKER, not the caller (a supervisor sees what the supervisee may see: same
as today for listed boards). Permission-cache cost per liked board on a hot path (users#show, update, create).
Extra batches only when many of the first 100 are hidden or deleted. The count `stats.starred_boards` stays the
stored length, so it can exceed the listed number while unviewable likes exist.
**Unresolved:** whether `allows?` on up to 100 boards is acceptable on every profile load, or needs the light
column select first; whether pruning should also run when a board is deleted (its likers are in
`starred_user_ids`).
**Mutations:** drop the view filter (spec 1 red); count hidden boards toward the limit (spec 2 red); drop the
prune (spec 3 red).

**Review of proposal 3 (2026-11-10): proceed with changes; NOT built yet.** `allows?(liker, 'view')` is correct for
every liked-id shape (public, own, shared private, supervisee's, own clone); the only gap is cache lag. Demanded
before building:
1. Prune and refs map must match an id by `global_id`, `global_id(true)` OR `shallow_id` of a returned row: a liked
   EDITED clone resolves to a replacement row with a different id (`global_id.rb:123-128`), so "lookup did not return
   this id" would erase a live like. (Refs already drop edited clones today.)
2. The three red specs pass with a wrong filter (`public || own`). Add: a private board shared with the liker stays
   listed; own private stays; a supervisee's private board stays for the supervisor's own list; a stranger's clone is
   hidden; a supervisor caller does not see a board only the caller can view.
3. Correction to my proposal: the sync does NOT already drop revoked liked boards; board_revisions includes liked
   boards only with `sync_starred_boards` (`users_controller.rb:769-771`). Track that as its own unit.
4. Cost: `allows?` runs every rule and loads `board.user`; use the tiered form (public and not a clone, or own and
   not a clone: listed; otherwise `allows?`), a light select, `:user` preloaded; gate `boards_controller.rb:108` on
   the `shallow_clones` flag.
5. Cap the scan (about 300 ids), build the map across batches, remove duplicate refs (plain and clone of one board).
6. One ordered function (stored id, board) shared with the like-time `kept_offline` answer.
State: unit 1 (dbf02dbc3) is committed. The three red specs for proposal 3 were removed from the
working tree (follow-up PR) and are saved as `/home/tracid/offline-sync-handoff/liked-list-view-filter-RED-SPECS.patch`;
the no-internet e2e cases as `no-internet-e2e-cases.patch` there. Local test DBs: `lingolinq-test-claude` (RSpec,
`DATABASE_URL=postgres:///lingolinq-test-claude` with `bundle exec dotenv -f /home/tracid/LingoLinq-AAC/.env`),
`lingolinq-e2e-claude` (e2e; Rails on 5077; build with `ember build --environment production`, never the plain
development build, which starts Mirage).

**2026-11-10: the limit is 50, not 100 (Traci).** `LIKED_BOARD_REFS_LIMIT = 50` (`app/models/user.rb:2467`); the
spec's limit example is now 51 liked, 50 listed and looked up. Green at 50, all four red with 25 put back. Earlier
entries that say 100 describe the first choice. Traci chose option 2: only the cap ships in this PR (with the home
grid held at 25, still to do); the view filter, pruning, the past-limit message and "Show more" go to a follow-up PR.

**Pre-push review (2026-11-10): OK to push.** Acted on: the `.eslint-todo` merge resolution had kept 4 stale rows
(the branch side's old line numbers for `routes/user/board-alt/index.js` 121, 136, 178 and `routes/user/board-detail.js`
587, which develop had moved); removed, so those two files now carry develop's rows; gate: findings 1549, baseline
1549, 0 new. So "union of both sides" above was not exact. Status doc: blockers listed under "Before merge", the
Wi-Fi line qualified, the two decisions marked not built. Still open from that review: pin the like order in the
spec; measure users#show with 50 likes; a liked board and its copy-by-reference can produce a duplicate ref.

**2026-11-10, Traci: no hold on the liked-list home grid.** With the limit at 50, the grid for
`preferences.sync_starred_boards` users shows every listed liked board (up to 50, was 25); the planned 25-tile hold
and the "Show more" tile are dropped. Earlier entries that plan them are superseded. Follow-up PR keeps: the
past-limit message, hiding unviewable liked boards, pruning deleted ids.

#### Three checks from the pre-push review (2026-11-10)

1. **Liked boards do not get their button set saved by the sync: CONFIRMED, a regression from develop.** The sync
   checks and loads a button set only for the home board (depth 0), sidebar boards (depth 1) and 'starred board',
   'owned root', 'public root' at depth 0 (`services/persistence.js:3109`). This branch seeds liked boards at depth 1
   (`utils/offline_sync_seeds.js:43`), so the rule never matches them; the same holds for the 'crisis vocabulary'
   seed when it is not a sidebar board. On develop (feafba6c7) liked boards were seeded at depth 0 through
   `lookupsToSyncSeeds(phased.phase2, 'starred board', 0)` whenever `background_board_prefetch` was on
   (`services/persistence.js:3074-3083` there; the flag is in ENABLED, `lib/feature_flags.rb:150`). Run against the
   e2e stack (user `e2e_offline_stars`, production build, sync started by hand): button-set requests during the sync
   went to Crisis Vocabulary (a sidebar board) only, none for the liked board (the probe recorded from after
   sign-in). Effect: features that read the stored button set (Find a Button, word suggestions) have no data for a
   liked board offline unless something else loaded it. NOT fixed; needs a fix proposal (sync scope).
2. **Spec order pinned.** "starred_board_refs limit" example 1 now likes the boards newest first. Mutation (walk the
   listed ids in creation order): that example fails, the other three pass. Restored; 4 examples, 0 failures.
3. **Profile cost, local only** (private e2e database, development mode, 50 synthetic private boards of 60 text
   buttons, median of 7): 25 likes: `starred_board_refs` 15.7 ms, whole profile JSON 20.8 ms, refs 3.1 kB; 50 likes:
   28.5 ms, 35.9 ms, 6.1 kB. About 0.5 ms a liked board, linear. Not staging or production, and real boards with
   pictures and larger settings will cost more per board.

#### Fix proposal 4: liked boards get their button set again (2026-11-10, for review)

**Fact sheet**
- READ, CONFIRMED: the sync decides per visited board with one inline condition on `next.depth` and
  `next.visit_source` (`services/persistence.js:3109`, `utils/persistence.js:3137`); when true it looks up the stored
  button set and calls `board.load_button_set` if it is missing or stale (`:3111-3118`).
- SHAPES, CONFIRMED: seeds come only from `utils/offline_sync_seeds.js`: `home board` (depth 0), `sidebar board`
  (1), `starred board` (1), `suggested board` (1, only with `sync_starred_boards` or style options), `crisis
  vocabulary` (1, only when no sidebar copy). Linked boards get depth + 1 and the parent's key as `visit_source`
  (`services/persistence.js:3251`). `lookupsToSyncSeeds` (the source of depth-0 `starred board`, `owned root`,
  `public root`) has no caller left in `app/` (grep).
- CROSS-FILE, CONFIRMED: on develop liked (and, with the liked-list home, suggested) boards were seeded at depth 0 as
  `starred board` when `background_board_prefetch` was on (feafba6c7 `services/persistence.js:3074-3083`; flag in
  ENABLED, `lib/feature_flags.rb:150`), so they matched the condition.
**Red tests (run, red):** `tests/unit/utils/offline-sync-seeds-test.js`: every seed the helper produces gets a button
set; a linked board does not (function missing today). `tests/utils/persistence-sync-test.js` "button sets for the
boards a sync starts from": a full sync with one liked board that links to another; the liked board's button set
must be looked up, the linked board's not (today the liked lookup never happens; 1 of 3 checks fails).
**Candidates**
1. (proposed) One exported function `gets_button_set(next)` in `utils/offline_sync_seeds.js`, beside the seeds it
   describes: true for the old cases (unchanged) plus depth-1 `starred board`, `suggested board` and `crisis
   vocabulary`. Both sync copies call it in place of the inline condition (same line, no baseline shift).
2. Seed liked boards at depth 0 again: also changes how deep their trees go against the depth limit of 20 and any
   other depth-0 rule; wider than needed.
3. Patch the inline condition in both copies: the same idea stated twice (Rule 0.6).
**Risks:** one button-set lookup, and a download when missing or stale, per liked board per sync (up to 50), as
develop did; `load_button_set` failures are not awaited by the sync today and stay that way (a failed download is
silent, as for the home board). The dead depth-0 `starred board`, `owned root`, `public root` cases are kept in the
function so its truth table for existing inputs is unchanged.
**Unresolved:** whether `suggested board` and the fallback `crisis vocabulary` seed should be included (develop
parity says yes for suggested under the liked-list home; crisis was normally a sidebar board).
**Mutation:** drop the depth-1 `starred board` case: the unit test and the full-sync test go red.

**Proposal 4 reviewed (proceed with changes) and built (2026-11-10).** Design changed to the reviewer's simpler
form: every seed from `offline_sync_seeds` carries `button_set: true`, and both sync copies ask
`offlineSyncSeeds.gets_button_set(next)` in place of the inline condition (`services/persistence.js:3109`,
`utils/persistence.js:3137`; the conditions were byte-identical). The depth-0 `starred board`, `owned root`,
`public root` cases had no producer left and are gone. Also: a liked or suggested board that is the home board is
no longer seeded twice (the home seed has an id, the liked seed only a key, so the sync visited it twice).
Corrections to the proposal: the utils copy's lookup is at `utils/persistence.js:3139-3146`; develop also gave
button sets to up to 200 owned and 150 public roots; the cost is per synced user, so supervisees multiply it.
**Risks, rewritten after review:** `load_button_set` failures cannot fail the board or raise a modal
(`models/board.js:1395` swallows them), but button-set files go through the same download queue as pictures
(`services/persistence.js:1466-1512`: 3 slots, 2 on mobile, 1 on Android) and their saves count toward the sync's
failed-write tally, so on a nearly full device a failed button-set save can mark the sync "out of storage", and
pictures can queue behind large files. On dev and staging, where the bucket refuses these files, each forced load
ends in a `generate` POST that schedules a Resque job. This is less than develop did and more than the branch did
an hour ago.
**Tests:** unit (`offline-sync-seeds-test.js`): every seed gets a button set; a linked board does not; home that is
also liked is one seed. Full sync (`persistence-sync-test.js` "button sets for the boards a sync starts from"), run
for the service copy and the utils copy: the liked board's button set is looked up, the linked board's is not.
Mutations: utils copy left on the old condition: the utils test fails alone; liked seeds unmarked: the unit test and
both full-sync tests fail. Whole module with `timingStrict=1`: 93 tests, 92 pass, 1 existing skip, 0 fail, no
`[queued-fetch]` or `[late-read]`. In the utils harness the sync ends with "unspecified sync error" after the boards
are done (the existing "revoked boards" utils test ends the same way, checked), so only the service run asserts the
outcome.
**NOT done from the review:** a measured e2e sync with about 10 liked boards before and after (duration, generate
POSTs, failed writes). The local e2e stack serves button sets from the database, not the refusing bucket, and its
`generate` jobs would go to the Redis the development server shares, so it would not show the staging behaviour.
To measure with the #1212 app run against staging; if it worsens #1212, move the button-set step after
`sync_boards` resolves.

#### Trusted device keeps the organization idle timeout in its first session: fixed (2026-11-10)

**Cause (CONFIRMED):** with the shell on, a Home Screen sign-in sends no `long_token`, so the key gets
`key['timeout']` from the organization (`app/models/device.rb:204-209`). The Trust answer marks the device row
(`app/models/user.rb:3856-3858`), not the key, and `clean_old_keys` read the key's timeout before the row's own
limit, so a trusted iPad was signed out after the organization's idle minutes (a timed-out browser key never
recovers). Before this branch that sign-in got a long token with no key timeout.
**Fix:** in `clean_old_keys`, a browser row with `long_token == true` that is not a valet session uses its own idle
limit (28 days) for every key, also keys that carry an organization timeout. Nothing changes for untrusted rows,
valet sessions, app and integration devices.
**Security review (proposal, before the edit): proceed with changes; applied** (valet excluded explicitly, six more
specs). Its findings, recorded as scope:
- No new access of substance: a signed-in member can already set `long_token` on their own device row (PUT
  /api/v1/users/self, `users_controller.rb:199`) and sign in again to get a token with no organization timeout. The
  fix removes the second sign-in. No organization setting enforces the timeout on trusted devices.
- Accepted reach: the timeout is lifted from every live key on that device row, not only the one that answered
  (same user only; browsers without a device id share the `default` row). A supervisor with `edit` who sets
  `long_token` on a supervisee's device now also extends that device's live sessions, not only future ones.
- A key already marked `needs_refresh` before the Trust answer stays dead (the prompt left open past the idle
  minutes): the person signs in again. Specified, not fixed.
- Shared after Trust: a key issued before the trust gets the organization timeout back; a key issued while trusted
  has none and falls to the 12-hour default. Pre-existing gap.
- Pre-existing, separate work: no AuditEvent when a device's trust setting changes; the Redis-cached token path
  skips `valid_token?`, so the organization timeout is enforced only on a cache miss or a token check.
**Specs:** `spec/models/device_spec.rb` "an organization idle timeout on a token issued before the device was
trusted" (8 examples) and `spec/controllers/api/users_controller_spec.rb` "keeps a session signed in past the
organization idle timeout once the person trusts the device" (through the real Trust request). Red before (the two
trusted cases), green after. Mutations: fix removed, 4 fail; every browser trusted or not, 3 fail; valet not
excluded, 1 fails; any device type, 1 fails. Device, session controller, users controller and organization specs:
1,051 examples, 0 failures.
**Before merge:** an authentication change needs the dual review on the PR (`/review-pr` after the PII preflight,
then `/adversary-review`).

#### A 'kept' board must be on the device: fixed; 'cached' branches still open (2026-11-10)

**Cause (CONFIRMED):** `keep_stored_board` (`utils/sync_board_fallback.js`), called only from `board_lookup`
(`services/persistence.js:2782`), kept a board whose reload failed for a passing reason when the IN-MEMORY record had
`permissions` and `image_urls`. A record pushed from a `/tree` answer (`utils/board_detail_cache.js:185-191`) has
both and no device row, so the sync could report success for a board that would not open offline after a restart.
**Fix:** before keeping, `board_lookup` reads the device row by the board's global id
(`rec.get('global_id') || rec.get('id')`: a record looked up by key is named by its key, and a key lookup scans every
board row on IndexedDB) and keeps only when `usable_copy(row)` holds, the test the offline open uses
(`utils/board_device_copy.js:18-20`). With no usable row the ORIGINAL error is returned, so the one retry still
runs; the status stays 're-downloaded' and gets the "failed retrieval" error if the retry fails too.
**Adversarial review of the proposal: proceed with changes; applied** (global id, `usable_copy`, exact status in the
test, the first-sync test given no device row). Its checks that hold: `find` reads only the device database (no
false positives); `known_missing` is cleared on every board store; a miss while a save is still queued refuses the
keep and the retry runs 10 s later; with no working database the read rejects, which is right.
**Tests** (`tests/utils/persistence-sync-test.js`, "board reloads under a slow server (#1212)", 18): new: not kept
when only in memory; not kept when the row has no buttons; the row is read by the global id when the record is named
by its key. The shared helper now states what the device answers (a usable row by default), so the five existing
"keep the device's complete copy" tests still describe a board that IS on the device; no assertion changed.
Mutations: device never asked, 3 fail; read by the record's id, 1 fails; any row counts, 1 fails; reject with the
read's error, 2 fail. Sync module with `timingStrict=1`: 96 tests, 95 pass, 1 existing skip, 0 fail.
**NOT done:** the real-database test the proposal mentioned (it would be the only one running the real `find`).
**STILL OPEN, rated High by the review (path read, not reproduced):** the 'cached' branches in `board_lookup`
(`services/persistence.js:2773-2778`: revision matches `fresh_board_revisions`; `allow_any_cached`) accept an
in-memory record with no device check and no failed reload. Modern view pushes up to 500 `/tree` boards into the
store; when the batch pre-download is skipped (100 or more missing boards, `:2945`) or a batch fails, those boards
are marked 'cached' and never written. Proposed: gate both branches on the board ids the sync already read with
`find_all('board')` (`:2904`), no extra reads. Item 2 (#1212) is not closed until this lands. After a refused keep
and a failed retry the board's folders are skipped again, which is acceptable because the parent could not open
offline anyway.

**Pre-push review of b15efb0c4..af9f2c217 (2026-11-10): OK to push; pushed by SHA.** Follow-ups from it:
- Fixed here: the home check in `offline_sync_seeds` dropped a liked board whose key equals the home board's key
  even when it carried a different id. It now compares ids when the liked entry has one, and keys only when it has
  none. Unit test added; with the correction removed that test fails alone.
- Corrections to proposal 4's fact sheet: a `suggested board` seed (style options included) exists only with
  `sync_starred_boards` (`utils/offline_sync_seeds.js`, the `ref.suggested && !sync_all` return). The proposal left
  "suggested board and the fallback Crisis Vocabulary seed" unresolved; both were included on the proposal review's
  recommendation (develop gave suggested boards a button set under the liked-list home, and the fallback seed stands
  in for the sidebar entry that got one). Traci has not been asked to confirm this.
- Open: `lookupsToSyncSeeds` (`utils/board_prefetch_planner.js:252`) has no caller in `app/`; if it is used again
  its seeds carry no `button_set` mark. Delete it or make it add the mark.
- Open, a condition for merge: measure a sync with many liked boards (see proposal 4, "NOT done").
- The reviewer verified the seed builder against the previous version over 660 input combinations: same seeds and
  order, plus the mark, minus duplicates of the home board.
**Route name (2026-11-10):** `offline-shell` added to `LingoLinq::RESERVED_ROUTES` (`config/routes.rb`), built by a
helper agent in its own worktree and re-run here: `spec/models/concerns/processable_spec.rb` and `spec/routing`, 37
examples, 0 failures; with the entry removed the reserved-names example fails (`got: "offline-shell"`). Not done:
other excluded first segments that are legal names (`wait`, `cable`, `rails`, `jobby`, `assets`, `oauth2`) need a
check of existing accounts first; whether an account named `offline-shell` already exists was not checked.

#### A board marked 'cached' must be on the device: fixed (2026-11-10)

**Cause (CONFIRMED by reading; reproduced in a test, not on a device):** `board_lookup` answered 'cached' with no
download for a record with `permissions` whose revision matched `fresh_board_revisions`, or for any such record
under `allow_any_cached` (`services/persistence.js:2773-2778`). Neither asked whether the device holds the board.
Modern view pushes the boards of a `/tree` answer into the store without saving them
(`utils/board_detail_cache.js:185-191`); the batch pre-download that would store missing boards is skipped at 100 or
more missing boards and gives up silently when a batch request fails (`:2945`, the `ajax(...boards?ids=)` error
handler). Such a board was then 'cached', its pictures and folders synced, the sync reported as succeeded, and no
row existed, with no slow server needed.
**Fix:** the sync notes the device's boards where it already reads them (`find_all('board')` at the start of
`sync_boards`), each row the batch download stores, and, on the supervisee path where revisions failed and
`allow_any_cached` is set, by reading the list there too. `known_on_device(sync_progress, record)`
(`utils/sync_board_fallback.js`) gates both 'cached' branches by global id, id or key. A board not noted goes to the
existing reload branch ('re-downloaded'), and the adapter stores what it fetches
(`utils/persistence.js:4391`, `store_eventually`). When the device list was not read (a `board_lookup` outside a
full sync, as in the older unit tests) the answer is as before. No extra reads on the normal path. The edits were
placed on existing lines so the line-anchored lint baseline rows below them do not shift (the first attempt added
lines and the gate reported a shifted `ember/no-runloop` row at 4472).
**Tests** (`persistence-sync-test.js`, "a board marked cached must be on the device (#1212)", 6): a current board in
memory but not among the device's boards is downloaded (revision-match branch, and the any-cached branch); it is
left alone when the device has it under its id or its key, and when the device was not read; and through a whole
sync with the batch download failing, the home board that was current in memory only is requested once and ends
're-downloaded'. Mutations: revision-match branch not gated, 2 fail; any-cached branch not gated, 1 fails; device
list not noted at sync start, the whole-sync test fails. Sync module with `timingStrict=1`: 103 tests, 102 pass, 1
existing skip, 0 fail, no late work.
**Limit of the tests (found by a probe):** in this harness an adapter fetch writes no board row (the device held
zero board rows after the sync, Crisis Vocabulary included; cause in the harness not diagnosed), so the tests show
the board is DOWNLOADED rather than trusted, not that the row lands. That the app stores a downloaded board is shown
by `e2e/offline-launch.spec.js` "a sync saves the home board, starred boards and Crisis Vocabulary" for a normal
sync; this exact case is to be confirmed in the Android emulator run.
**Not built as its own review step:** the design came from the adversarial review of the 'kept' proposal (its High
finding and recommended gate); the built change goes through the next pre-push review.
