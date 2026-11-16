# Android real-device sync: slow, with problems (2026-11-14)

Report (Traci): real Android device, about 10 minutes into a sync, drawer reads "Saved so far: 27 boards. 9 with a problem."

## Established

- CONFIRMED: environment is dev.lingolinq.com. The drawer wording exists only in #1268 (`utils/sync_progress.js`),
  and #1268 (eafc1d244) is on `origin/develop` but not on `origin/staging` or `origin/main` (git merge-base, 2026-11-14).
- CONFIRMED: the dev bucket's CORS rule already allows `https://dev.lingolinq.com` (working log
  `2026-11-05_offline-boards-sync.md`, curl 2026-11-09), so CORS is not the cause in a browser.
- CONFIRMED: dev answers quickly right now (heartbeat 0.3 s, `/` 0.46 s, curl from WSL).
- Not reachable from here: Cloud Run logs (Windows gcloud has no signed-in account).

## Code facts (services/persistence.js, the live copy)

1. A board counts as "a problem" when ANY of its pictures, sounds or sidebar icon fails to download, even though the
   board record itself saved (`sync_boards`, `RSVP.all_wait(visited_board_promises)` rejection, ~:3344-3359).
   Board retrieval failures are the other source (~:3364-3385).
2. On Android the picture queue has ONE worker for the whole sync (`store_url`, `max_watchers = 1` when
   `capabilities.system == 'Android'`, ~:1502-1508; from CoughDrop commit 06b2e2e95, 2016). Desktop 3, other mobile 2.
   `platform_detect.js:39` sets `system = "Android"` from the user agent, so Chrome on Android gets it too.
3. A board thread (6 on mobile) does not move on until all of its pictures settle, so picture throughput bounds the walk.
4. A picture not on a known CORS host goes to `/api/v1/search/proxy`. Client GET: 8 s, then two retries at 20 s each
   on timeout (`utils/extras.js` ~:186-190, ~:361-376), about 49 s worst case per hung picture, holding the only worker.
5. The proxy's outbound request has no time limit (`lib/safe_http.rb` `build_typhoeus_request`; only a 5 s DNS limit).
6. `size_image` on Android is a no-op for remote URLs (`services/content-grabbers.js:740`), so it adds no cost.
7. Mobile also serializes `queue_sync_action` (1 thread; linked-board device reads), ~:2816.

## Hypothesis (PLAUSIBLE, not confirmed on the device)

Real-device latency multiplied by a single picture worker makes the sync slow; dead or hung picture hosts in the synced
boards both stall that one worker (up to ~49 s each) and mark their boards as problems. The 2026-11-10 emulator runs
were against a local server (low latency), which hides (2). They also saw 3 dead-host picture errors.

## Measured 2026-11-14 (account and dev data)

- Device: Chrome, Home Screen web app (Traci). Account: `lingolinq_admin` (db/seeds.rb: site admin, `process_new`,
  no home board set by the seed; sidebar = `User.default_sidebar_boards` unless changed).
- Read-only walk of the default sidebar trees on dev, anonymous public API, sync rules mirrored
  (scratchpad `walk_sync_tree.py`): 46 boards, 0 board fetch failures, board request max 2.58 s, mean 0.77 s.
  714 unique pictures and sounds, of which 710 are inline `data:` URIs and 4 are opensymbols (all 200, about 1.3 s).
  So the sidebar part of this sync has almost no picture downloads and nothing failed: it does NOT explain the 9
  problems or the slowness. These come from the account's home board, liked boards or supervisees (private; not read).
- Board responses are 0.12 to 1.5 MB each (inline pictures) and dev sends them uncompressed (no `Rack::Deflater`,
  no `content-encoding`). Sidebar trees alone are about 30 MB of JSON. Minor factor: base64 compresses about 25%.
- The Crisis Vocabulary sidebar icon is on `cdn-icons-png.flaticon.com` (not a trusted host, so it goes through the
  proxy); a failed sidebar icon rejects that board (`next.image` branch in `sync_boards`). It downloaded fine here.
- Sync Details lists per-board error text only for a FINISHED sync ("see details"); mid-sync only the count shows.

## The 9 problems are board fetch failures (Traci, 2026-11-14)

Sync Details lines read "<board> failed retrieval for syncing": `board_lookup` rejected, NOT a picture failure. The
picture hypothesis above does not explain the problem count.

Time limits a board fetch runs under (CONFIRMED in code):
- transport GET first try 8 s, then retries at 20 s (`utils/extras.js` ~:186-190, ~:361-376); a timeout aborts the
  partial download, so a retry starts from zero;
- Ember Data `findRecord` hard limit 15 s, `error({error: 'timeout'})` (`services/persistence.js` ~:4464-4477);
- sync `time_promise` 30 s around `board_lookup`; one more try 10 s later (`claim_board_retry`,
  `utils/sync_board_fallback.js`); then "failed retrieval for syncing" and the board's folders are never reached.

Measured against dev (curl from WSL, anonymous, public library boards):
- 6 parallel big boards, fast link: ttfb about 0.7 s, total 1.6 to 3.4 s, two rounds. The server is not the bottleneck.
- Each request throttled to 85 KB/s (a 4 Mbps link shared by 6 threads): crisis-vocabulary (0.83 MB) 9.3 s,
  senner-baud-groups (1.06 MB) 11.6 s, core-60-they_8 (1.52 MB) 18.4 s. All past the 8 s first try; the last past 15 s.

Conclusion (mechanism CONFIRMED by measurement; that it is what happened on the device is PLAUSIBLE until the 9 board
names are checked against size): on a normal phone connection, boards above roughly 0.65 MB cannot arrive inside the
limits while 6 download at once, so they fail every time, each burning about 40 s of a thread. Inline `data:` pictures
make library boards large, and dev sends them uncompressed.

## Product asks (Traci, 2026-11-14)

1. Retry the failed boards specifically (not the whole sync).
2. Show one status per board the person knows (home, each sidebar board, each liked board, Crisis Vocabulary), with
   its folders rolled up, not every sub-board line by line.
3. Show retrying in a calm, standard way that keeps confidence.

## Needed to confirm

- The 9 problem lines from Sync Details on the device (picture failures vs board retrieval failures).
- Chrome / Home Screen web app vs installed app; which account (number of home, sidebar and liked boards).
- A discriminating run: same account, Chromium with an Android vs desktop user agent and added latency, picture
  throughput and board time compared.

## Age of the limits, and current practice (2026-11-14)

- Origins (git log -L): 8 s first GET (`utils/extras.js`) is in the first public commit, 2016-01-04; Android single
  picture worker 06b2e2e95, 2016-05-17. The `services/` copy dates from the 2026-01-20 service migration, which moved
  the values over unchanged.
- Already modern: `navigator.storage.persist()` is requested (`utils/capabilities.js:47-57`, `utils/offline_shell.js:251`);
  dev serves HTTP/2, so parallel requests share one connection (no 6-per-host cap).
- Current practice (web search; mostly secondary sources): stall timeouts instead of fixed total limits; capped
  exponential backoff with jitter, transient vs permanent errors told apart, retry on reconnect (as Android
  WorkManager does with a network constraint); keep partial progress; compress responses; Background Fetch on
  Chrome Android 74+ as an optional enhancement (no Safari); adaptive concurrency from measured throughput, with
  `navigator.connection` and `deviceMemory` as Chromium-only hints.
- Recommendation: targeted rewrite of the transfer layer and status layer, not of the board walk (what to sync,
  revision checks, device-copy fallback), which #1268 reworked and device-tested.

## Proposal: step 1, the download layer (for adversarial review, 2026-11-14)

### Fact sheet

(a) Where the values are READ
- CONFIRMED: the sync walk that runs is the service's: `utils/persistence.js:4569-4600` is a Proxy that forwards any
  property the service instance has; the instance has `sync`/`sync_boards` (`services/persistence.js:1996, 2863`).
  The utils walk runs only before the service exists.
- CONFIRMED: the adapter's `findRecord` (with the 15 s timer) is the UTILS copy. `adapters/application.js:48` reads
  `persistence.DSExtend` through that Proxy; the services file attaches `DSExtend` to the Service CLASS
  (`services/persistence.js:91, 4243`, a static, not on the instance), so `'DSExtend' in window.persistence` is false
  and the Proxy falls back to `utils/persistence.js:4233`. Live timer: `utils/persistence.js:4358-4364`. The services
  `DSExtend` (15 s at `:4478`) is not reached by the adapter.
- CONFIRMED: the 8 s first try is read in the `$.ajax` wrapper, `utils/extras.js:186-190`, only when the caller
  passed no `timeout`; on a timeout with status 0 and readyState 0 it retries GETs twice at 20 s
  (`utils/extras.js:361-376`). The adapter's `ajax` goes through it (`adapters/application.js:45-47`, `$.ajax` is the
  wrapper, `$.realAjax` the original, `utils/extras.js:147, 292`).
- CONFIRMED: a board answer that lands after the 15 s timer is discarded, not stored: `error.skip` is set by the
  timer and the success branch returns early (`utils/persistence.js:4361-4373`).
- CONFIRMED: the sync's outer limits: `time_promise(board_lookup, 30 s)` (`services/persistence.js:3100`, default
  ms in `time_promise`), `record.reload()` 20 s (`BOARD_RELOAD_MS`, `utils/sync_board_fallback.js:12`), one more try
  after 10 s (`claim_board_retry`, `BOARD_RETRY_DELAY_MS`, `:91-101`), then "failed retrieval for syncing"
  (`services/persistence.js:3364-3385`).

(b) Every shape a board-fetch failure can take (and its writer)
- `{error: 'timeout'}`: the adapter's 15 s timer (`utils/persistence.js:4363`).
- `{error: 'promise timed out:syncing board:<id>'}` / `'...reload board'`: `time_promise` (`services/persistence.js`
  top of file).
- `{fakeXHR: {status: 0}, result: 'timeout'|''...}`: the transport after its retries (`utils/extras.js` error_prep).
- `{fakeXHR: {status: 5xx|429}}`: server errors.
- `{error: 'Not authorized'}` (400), `{error: 'Record not found', deleted}` (404): permanent.
- local fallback: `local_processed(local_data)` resolves with the device copy for 5xx, status 0, 401
  (`utils/persistence.js:4319-4353`), so a timeout is the one transient failure that does NOT fall back.
  `passing_failure` (`utils/sync_board_fallback.js:18-25`) classifies the first four as transient.

(c) Cross-file claims checked
- CONFIRMED: no sync test exercises the 15 s timer or the 8 s transport limit: `tests/utils/persistence-sync-test.js`
  answers board requests through the harness's own `findRecord` (comment at `:6517-6519`).
- CONFIRMED: the existing tests pin "at most twice" (`persistence-sync-test.js` ~:6531 `calls == 2`,
  ~:6545 "linked from two places at most twice", ~:6560). Changing the retry count changes that specification:
  needs Traci's explicit approval to rewrite those three tests (Rule 0.14).
- CONFIRMED: dev serves HTTP/2; gzip saves 27 to 31% on the measured boards (1.52 MB to 1.04 MB, 0.83 to 0.60 MB).
- ASSUMED (not load-bearing until checked): the installed apps' native HTTP interceptor (CapacitorHttp) fires XHR
  `progress` events. If it does not, a stall timer armed on progress alone would abort healthy downloads there.

### Units (one coherent change each, in this order)

U1. Board downloads during a sync wait while data is arriving (root cause).
U2. Failed boards are retried with growing waits, not once.
U3 (deferred, measure first). Picture and board concurrency by measurement instead of device type.
U4 (separate infra PR, dual review). Response compression.

### U1 candidates

A (recommended). Stall detection for board GETs while a sync runs.
- New single-purpose util `utils/stall_watchdog.js`: watches one XHR; aborts when no progress for `stall_ms`
  (20 s) after the first byte, when no first byte in `first_byte_ms` (30 s), or when the whole request passes
  `ceiling_ms` (180 s). Progress = `progress` events OR readyState changes (covers a platform without progress
  events: it then degrades to first-byte + ceiling, never to a false stall). Limits in one exported object so tests
  can scale them.
- `utils/extras.js` wrapper: an opt-in `options.stall_watch` replaces the fixed `timeout` with the watchdog (via
  jQuery's `xhr` factory) and makes it one transport attempt (the sync owns retries, U2); an abort reports the same
  shape a timeout does today (`result: 'timeout'`, status 0), so `passing_failure` and the local-fallback rules are
  unchanged.
- `adapters/application.js` `ajax`: sets `stall_watch` only for `GET /api/v1/boards/...` while
  `persistence.get('syncing')`. `utils/persistence.js` findRecord: for that same request, the 15 s timer becomes the
  ceiling (the transport now decides), so a late answer is stored.
- Outer limits re-ordered so inner decides first: `BOARD_RELOAD_MS` > ceiling; `time_promise` for `syncing board`
  > first fetch + reload.
- Trade-off: real plumbing (XHR factory, watchdog), but a board that keeps arriving is never cut off, and a dead
  connection is still noticed in 20 to 30 s.

B. Raise the fixed limits for sync board GETs only (e.g. first try 60 s, findRecord 75 s, reload 80 s, outer 170 s).
- Simplest, no new plumbing. Trade-off: a hung request holds a sync thread 60 s or more; a board bigger than the link
  moves in 60 s still fails; it is the same design that failed, with bigger numbers.

Rejected: changing the global 8 s / 15 s for every request (ordinary page loads would wait longer on a hung server,
and the Modern view's offline fallback timing depends on them); switching the adapter to `fetch` streams (the
`$.ajax` wrapper is the only thing adding the auth header, LEARNINGS "adapter's ajax override").

### U2 candidates

A (recommended). Park and retry. A board whose lookup fails transiently is parked with a due time (10 s, 30 s, 90 s,
each +/- 20% jitter; at most 3 retries, so 4 attempts). Threads keep walking other boards; a thread that finds the
queue empty waits for the earliest parked board instead of ending while any are parked. Reported as "failed
retrieval for syncing" only after the last attempt. Permanent failures (refused, deleted, storage full) are never
retried. Replaces `claim_board_retry`'s once-per-sync claim (same per-board, whole-sync counting).

B. Keep the thread sleeping for each delay (today's shape, larger counts). Simpler, but with 6 threads and 90 s waits
the walk stalls behind failed boards.

Not in step 1: retry on reconnect and a "Try again now" that retries only the failed set (needs the failed list kept
after the sync ends; goes with the status UI, step 2).

### Risks

- Installed apps: progress events through CapacitorHttp unknown (fact (c) ASSUMED); the readyState fallback is meant
  to make this safe, and an emulator run of the installed app is required before merge.
- A hung server: a sync board fetch now gives up after 30 s (no first byte) instead of 15 s, and retries 3 times
  with waits, so a sync against a dead server takes longer to report failure.
- Board page loads during a sync also take the stall rule (same URL shape, `syncing` true): they wait while data
  arrives instead of failing at 15 s.
- Ember Data dedupes `findRecord` for a record already in flight; a parked retry must not join a request the
  watchdog has not yet ended (the claim deletes the cached lookup today, `sync_board_fallback.js:96`).
- Two copies: the change lands in the live units only (services walk, utils `DSExtend`, extras wrapper, adapter);
  the dead services `DSExtend` and the utils walk are left alone and named in the PR.

### Questions not resolved

1. The names of the 9 failed boards (to check they are the large ones).
2. The device's real throughput during the sync.
3. CapacitorHttp progress events (see risks).
4. Whether 20 s / 30 s / 180 s are right: chosen from the measurement (a 1.5 MB board at 85 KB/s is 18 s), not tuned.

### Tests and the mutation that must turn each red

U1
- `tests/unit/utils/stall-watchdog-test.js` (new, plain QUnit, injected timers, no wall clock): a request that
  reports progress every 5 s for 60 s is not aborted; one silent after its first byte for `stall_ms` is aborted with
  the timeout shape; one with no first byte by `first_byte_ms` is aborted; one with no progress events but readyState
  changes is not aborted before the ceiling. Mutations: drop the progress reset (first test red); arm the stall timer
  on progress only (fourth red).
- Adapter-level red test (written first, fails on today's code): a board GET while syncing whose fake XHR keeps
  sending past the scaled old limits is resolved AND stored (`store_eventually` called). Today: rejected
  `{error: 'timeout'}` and the late answer discarded. Mutation: restore the fixed timer for this request (red).
- A board GET while NOT syncing keeps today's limits (guards the blast radius). Mutation: drop the `syncing`
  condition (red).

U2 (rewrites three existing tests: needs approval)
- A board that fails transiently three times then loads is saved (`calls == 4`, status 're-downloaded', no error).
- A board that always fails transiently is asked for 4 times, then reported once.
- A refused board is asked for once (existing test, unchanged).
- Another board is walked while one is parked (its request happens before the parked board's second attempt).
- Mutations: cap at one retry (first red); sleep the thread instead of parking (fourth red).

## Confirmation and approvals (2026-11-14)

- Traci APPROVED rewriting the three "at most twice" tests in `tests/utils/persistence-sync-test.js` (~:6531,
  ~:6545, ~:6560) to the new retry rule (U2). The specification changed at her request ("retry specifically on those
  failures").
- Three of the 9 failed boards (Traci, from the device): `lingolinq/core-60-feel` 1.51 MB, `lingolinq/core-60-is_9`
  1.30 MB, `lingolinq/core-60-it` 2.02 MB (curl, dev, anonymous). dev answers each in 1.1 to 1.8 s on a fast link;
  throttled to 85 KB/s they take 16.3 s, 13.9 s and 22.5 s. All miss the 8 s first try (the retry restarts from zero),
  two miss even a single 15 s window. They are the largest boards measured: the diagnosis holds for these three
  (CONFIRMED); the other six are not known yet.
- Observed: the result card listing the problems "just disappeared". Item 8 of #1268 says a result with problems
  waits to be dismissed. Not investigated; belongs with step 2 (status), checked there.
- The other six failed boards (Traci, second sync): `core-60-look_9` 0.95 MB, `core-60-outdoors` 0.92 MB,
  `core-60-tell_9` 1.53 MB, `core-60-those` 1.19 MB, `core-60-use_2` 1.76 MB, `core-60-wear_9` 1.27 MB (curl, dev,
  1.0 to 2.2 s each on a fast link). All 9 failed boards are 0.92 to 2.02 MB; the smallest needs about 11 s at
  85 KB/s, past the 8 s first try, and the restarted retry cannot finish inside 15 s. No small board failed.
  Diagnosis CONFIRMED for all 9 (sizes measured; device throughput still not measured). All 9 are sub-boards of one
  Core 60 set, which is the case for rolling sub-boards up under the board the person knows (step 2).

## Step 2 requirements: grouped sync status (Traci, 2026-11-14)

- Today Sync Details lists every board and sub-board synced, line by line. Wanted: a top-level status per board the
  person knows (home, each sidebar board, each liked board, Crisis Vocabulary), with an expandable element showing its
  sub-boards. "Professional and modern."
- Sketch offered (Traci to decide): one row per top-level board (status word, page count, collapsed by default,
  disclosure button with `aria-expanded`); sub-boards one status word each; raw error text behind "Technical details";
  calm retry states, amber "Try again" only after retries run out; nothing by colour alone; the drawer shows the same
  roll-up in one line.
- Data needed: each board's TOP-LEVEL seed. Today a status row carries only its immediate parent (`visit_source`,
  `services/persistence.js` ~:3251); carry the seed down the walk (`to_visit_boards.push`) alongside U2.
- Also check here: the problem list "just disappeared" (see Confirmation section).
- "cached (no change)" (Traci: confusing). Meaning, CONFIRMED in code: the board's device copy is current, so it was
  not downloaded again; every 'cached' path requires the device to hold the row (`services/persistence.js` ~:2916-2930
  start-of-sync revision match; ~:2770-2778 `known_on_device`, added after the emulator run that listed 97 boards
  cached with none stored, `utils/sync_board_fallback.js` ~:74-77). The walk still visits its sub-boards and checks
  its pictures. Caveat: a record fetched since the device list was read counts as known (the adapter stores it); a
  failed store there surfaces as the storage failure. Step 2: 'cached', 'downloaded', 're-downloaded' (and 'kept')
  all read as one person-facing state, "Saved", with "Ready offline" on the top-level row; the distinction moves to
  Technical details ("already up to date").

## Review round 1 (adversary, 2026-11-14, SHA 6a3bfcf50): findings checked

Verdict: U1-A not sound as written; U2-A sound with changes. Checked myself:
- High, CONFIRMED: a sync board refresh runs with `force_reload` (`models/base.js:32-41`), so `start_with_local` is
  false (`utils/persistence.js:4263`); a status-0 failure then takes the local fallback (`:4322`, `:4349`) and resolves
  with the OLD device copy, reported 're-downloaded'. My "local-fallback rules unchanged" was false in effect: a
  watchdog abort shaped like a transport timeout would hide a stale board on every sync. Today the 15 s timer's
  `{error: 'timeout'}` does not fall back.
- Medium, CONFIRMED: the 15 s timer rejects but does not abort; the transport's second attempt (20 s, from about
  8.5 s) keeps running and its success is discarded (`:4361-4373`; `utils/extras.js:361-376`). On the measured sizes
  at 85 KB/s, 7 of the 9 failed boards would arrive inside that window (all but 1.76 MB and 2.02 MB). The diagnosis
  line "the restarted retry cannot finish inside 15 s" conflated the transport's window with the timer: corrected here.
- Medium, CONFIRMED (read earlier): the batch pre-download calls `next_batch` once per stored board
  (`services/persistence.js:2974-2977`), so later chunks overlap and the batch resolves while they run; the walk then
  downloads the same boards again. 25 boards of about 1 MB each cannot pass the 8/20/20 s limits on a phone.
- Medium, CONFIRMED: `{offline: true, error: 'not online'}` (`utils/persistence.js:4405/4410`) is a failure shape
  missing from fact (b); `passing_failure` treats it as permanent.
- Medium, CONFIRMED: the U2 count in this harness is 5, not 4 (a loading board costs find + reload, existing test
  expects 3 for one failure then success).
- Not re-verified by me yet (taken as PLAUSIBLE until checked when the unit is built): the iOS native-bridge
  behaviour (no bytes until the full body), Ember Data 5.3 dedupe only before flush, the supervisee-sync `syncing`
  gap, and the jQuery abort result shape.

## Revised proposal (round 2)

U1 (replaces U1-A): stop discarding and stop cutting off, with the existing knobs; no watchdog.
- U1a. Keep the late answer. When the adapter timer has already rejected a request, a later success is still stored
  on the device (`store_eventually`), with no change to what the caller was told. Then the sync's retry is served
  from the device copy instead of a second download. Smallest change; touches every late findRecord answer
  (it is stored as any answer would have been).
- U1b. One patient attempt for sync board fetches. A per-request marker decided ONCE in `board_lookup` (not the
  global `syncing` flag), read in two places: the transport gets `{timeout: N, attempt: 3}` (one attempt, existing
  knobs, `utils/extras.js:180-190, 362`) and the adapter timer is set above N. N about 60 s. Channel for the marker:
  to be chosen (DSExtend drops the snapshot, `utils/persistence.js:4369`); a map keyed by board id/key on the
  persistence service is the candidate.
- Why not the watchdog: the High finding, the iOS bridge (no progress until the whole body), and today's transport
  already delivering most boards. Revisit only if U1a + U1b measured on the device still leave failures.
- A timeout from U1b keeps today's non-fallback shape (`{error: 'timeout'}`), so `keep_stored_board` and U2 decide,
  never the stale local fallback.

U2 (U2-A with the review's changes): park and retry, one waiter per walk (other threads exit, slots released),
cancel wakes the waiter, 'not online' treated as transient and retried after reconnect, one parked map per sync
shared by every walk (supervisees), waits only through `schedule_sync_board_step`. Ships together with U1.

U5 (new, separate unit): the batch pre-download's overlapping `next_batch` (fire the next chunk once per chunk, not
once per board) and its limits. Measure batch requests on the device first.

Tests (revised): U1a through real DSExtend with `queryLog.real_lookup` (the harness replaces the adapter otherwise,
`tests/helpers/ember_helper.js:35, 457-470`): a success after the timer is stored, the caller still rejected;
mutation: restore the early return without store (red). U1b: the marker predicate as a pure module with unit tests,
plus a DSExtend test that the sync-marked request gets the longer limit and an unmarked one keeps 8/15 s; limits
exported so tests scale them (no wall clock). U2: counts per this harness (5), each mutation written as a concrete
code edit.

## Decision: no feature flag (Traci, 2026-11-14)

The grouped sync status (step 2) is part of fixing the sync for the person and for Android devices: a code fix to a
shipped feature, not a new feature. No feature flag (CLAUDE.md, Conventions: a fix restoring intended behaviour needs
none).

## Review round 2 (adversary, 2026-11-14, SHA 6a3bfcf50): result, and a stop (Rule 0.13)

- High, CONFIRMED (my reading of `utils/persistence.js:4322-4324, 4344-4350`; the reviewer reproduced it by running
  the real DSExtend body, probe in the session scratchpad): U1b set the adapter timer ABOVE the transport's single
  attempt, so the transport's status-0 timeout reaches `error()` first and a `force_reload` refresh of a board on the
  device resolves with the OLD copy. The round-1 High, reintroduced by the revision. Second self-inflicted error of
  the same kind on this design: stopped per Rule 0.13 before any code.
- High, CONFIRMED: the outer limits (`time_promise` 30 s, `BOARD_RELOAD_MS` 20 s) would still cut a 60 s attempt,
  and the retry then starts a second download of the same board (Ember Data joins only before its flush).
- U1a findings: it does nothing for sync fetches under U1b's ordering; a late write can erase a pending offline edit
  (`changed`), a revocation mark, or a newer PUT response; a late payload keeps images/sounds the serializer would
  strip (one queued row per picture); the "retry served from the device" claim needs `retrieved` stamped and a
  per-sync record of late stores.
- U2 findings: parked queue per walk (attempt counter per sync), the waiter releases its thread slot, 'not online'
  ends the walk and #1229 restarts the sync, no real-clock eligibility, parked boards counted in progress, the status
  row rewritten on failure, and the park/wait logic in a pure module tested over interleavings (the harness runs one
  thread with 1 ms delays, so cancel and handoff are invisible there).
- Round-1 PLAUSIBLE items now CONFIRMED by the reviewer: Ember Data dedupe before flush only; supervisee syncs never
  set `syncing`; jQuery 3.7.1 failure shapes.

## Final plan (the reviewer's "simpler option", with every named guard): NOT STARTED

U1 (all in DSExtend `findRecord`, utils/persistence.js):
1. The 15 s caller timer stays for every request, so a slow board always rejects with the non-fallback
   `{error: 'timeout'}` and `keep_stored_board` / U2 decide. Outer limits unchanged.
2. Board GETs: DSExtend sends the transport ONE long attempt (about 60 s) through `_this.ajax` with
   `{timeout, attempt: 3}`, so the download continues after the caller's 15 s answer.
3. The late answer of a board GET is stored, guarded: strip images/sounds as the serializer does; stamp
   `retrieved`; skip if the row is `changed`, revoked, or newer than the request; drop if the sync id or session
   token changed.
4. A per-board in-flight map: a retry or reload of a board still downloading joins that download.
Cost: board taps outside the sync also keep their download running after 15 s, and their late answers are stored.
U2: as above (round 2's named changes).
Tests: Deferred-shaped `$.realAjax` stubs with positive controls; exported, scaled and cancelled timers; a call-site
test; the U2 state machine as a pure module with an injected scheduler. Estimate: about 3 days with review.
A third plan-review round needs Scot's OK (CLAUDE.md, Before a PR); otherwise the code review at PR time checks it.

## Step 2 design choice (Traci, 2026-11-14)

Mockups: https://claude.ai/artifact/3Wf4WFw12tfxHwcTFH4Mce (private canvas). Traci chose Sync Details **Option 2
(summary first)**: overall "% ready offline" bar, one card per top-level board with its own bar. Each expansion
introduces the sub-boards: a "board -> folders" intro ("Folders inside <board>: these N boards open from <board>'s
folder buttons, each saved separately"), then "Not saved yet · N" (with Try again) and "Saved · N" groups of folder
chips; "No folders inside" for single boards. Wording: sub-boards are called "folders" (the app's term for buttons
that open a board). Colours: the app's modern dialog style (light translucent header like Find a Button, `--md-ink`
#111A2E, `--md-bg` #EEF1F6, brand teal #147F82 buttons, brand slate-blue #5A6A85 secondary text); NOT the indigo
header with honey-bronze title ("blocky"). Drawer: same shape as the copy drawer, four stages (saving, retrying, all
ready, needs attention). Brand verdigris #2A9D8F with white text fails AA (about 3.3:1); buttons use #147F82.
- Update (Traci, 2026-11-14): combine Option 3's even layout with Option 2's folders, a wider modal (about 870 px),
  and modern tabs. Built as artboard "Combined" on the canvas: summary band (88% bar + actions side by side), a
  segmented tab control (grey track, raised white selected pill, semantic count badges), one evenly gridded card per
  board (icon, name + "N folders inside", bar + count, status pill), expansion with the "Folders inside" intro and
  "Not saved yet" / "Saved" folder tiles in a 4-column grid. This is the current chosen direction.

## Implementation log (branch traci/fix/android-sync-board-downloads, worktree /home/tracid/LingoLinq-AAC-sync-downloads)

Traci said "proceed" with the final plan (2026-11-14). Branch cut from origin/develop 7860a2757 (the sync files are
identical to the #1268 branch). `app/frontend/node_modules` is a symlink to the offline worktree's install (package
files identical); run tests under Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`), serialised with
`flock /home/tracid/.cache/lingolinq-locks/ember.lock`.

- 17575da76 (prep, no behaviour change): DSExtend's 15 s timer reads `find_limits.caller_ms` from the new
  `utils/board_download.js`. Verified: `npm run lint:js:ci` no new findings. Import placed at the end of
  utils/persistence.js so no baselined row shifts.
- Dropped from the plan: cancelling that timer on settle (round 2 Low). Naming the timer moved `runLater(` and the
  two `runCancel` calls were NEW `ember/no-runloop` findings; converting runloop calls needs its own tested PR and
  re-baselining needs approval (Rule 0.14). A timer that fires after the request settled already does nothing
  (`error.skip`), and tests scale the limit.
- STOPPED here per Rule 0.13: two small self-inflicted errors close together (the lint shift above; then three
  Edits sent against a file changed by a shell append, refused, and a lint run read the old state).

### RESUME HERE (next units, in order; each: red test first, then fix, then mutation)
1. U1 tests file `tests/unit/utils/adapter-board-find-test.js` (plain QUnit, setupTest, `queryLog.real_lookup`,
   `$.realAjax` stubbed with `$.Deferred().reject({status:0, readyState:0}, 'timeout', 'timeout').promise()` shapes,
   `stubOnPersistence('find'|'store_eventually')` from tests/helpers/persistence-stub.js (it reaches the UTILS
   instance the adapter reads: in utils/persistence.js the bare `persistence` is its own instance, :4200),
   `restoreStubs()` in afterEach, `find_limits.caller_ms` scaled):
   a. a board find sends ONE long attempt (`timeout` = board transport limit, `attempt: 3`, one `$.realAjax` call
      on a timeout); a user find keeps 8000 and its retries;
   b. a board answer after the caller limit is stored (images/sounds stripped, `retrieved` stamped), the caller
      still rejected `{error: 'timeout'}`;
   c. not stored when the device row is `changed`, `revoked`, or its `updated`/`retrieved` is newer; not stored when
      the session token changed;
   d. a second find of the same board while the first download runs makes no second request;
   e. a refresh (force_reload, device row present) whose download fails after the caller limit REJECTS, never
      resolves with the old copy (guards the round 1/2 High).
2. Implement in `utils/board_download.js` (limits, `board_transport_options`, `join_download`, `store_late_board`
   with injected deps) and wire into DSExtend findRecord line-neutrally (board GETs call `_this.ajax(buildURL(...),
   'GET', board_transport_options())` instead of `_super`; RESTAdapter.findRecord with no snapshot sends exactly that,
   node_modules/@ember-data/adapter/dist/rest.js:431-437; `useFetch` is false so timeout/attempt reach $.ajax).
3. U2 (park and retry) as a pure state machine module with injected scheduler, per round 2.

### Done since RESUME HERE (2026-11-14/15)

Commits on traci/fix/android-sync-board-downloads:
- 79f95405e U1: boards via the adapter download in ONE 60 s attempt (`attempt: 3`), the caller still answered at
  15 s with the non-fallback `{error: 'timeout'}`, a late answer stored (guarded: `changed`, `revoked`, newer
  `updated`, `retrieved` since start, session token), a second request joins a running download.
- 65802eb7d: the stale-copy guard test made to fail on the stale copy (it only timed out under the mutant).
- 100fcd816 U2: parked retries, 3 more with ~10/30/90 s (+/-20%) waits, one waiter per walk with its slot given back,
  cancel wakes it, stale timer ignored, parked boards counted in progress; "not online" is a passing failure.

Red runs (previous code): adapter "one long attempt" 3 calls vs 1; "late answer stored" 0 vs 1; "joins" 2 downloads
vs 1 (after fixing my test's unhandled rejection); the three sync tests 2 calls vs 4.
Green: `/board retry|persistence-sync|board (download|find)/i` 149 tests, 148 pass, 1 pre-existing `xit`
("should delete from the server when sync is finally called 2"). lint:js:ci: no new findings at each commit.

Mutations (each test red on its own assertion, code restored from the commit after):
- M1 `attempt: 1` -> "one long attempt" (3 vs 1). M2 late store call removed -> "late answer stored".
  M3 join disabled -> adapter "joins" and unit join test (2 vs 1). M5 changed/revoked guard removed -> unit "nothing
  is stored over...". M4 caller limit removed for boards -> guard "not resolved with the device copy".
- M6 MAX_BOARD_RETRIES 1 -> unit claim test and the three sync tests. M7 slot not released -> "slot given back".
  M8 wake no-op -> "cancel wakes". M9 stale-timer guard removed -> "the first wait does not run twice".
  M11 offline not passing -> "not online is a passing failure".

Not covered by a test: the progress count including parked boards (U2); stated as untested.
Unexplained: two failing finds in ONE adapter test took 13-15 s (same on the previous code); split into two tests.

### Next: Android emulator check (Traci asked, 2026-11-14)
Chrome on the `ll_trace` emulator, throttled, against a local server with synthetic large boards (inline data:
pictures, as dev's are when the bucket refuses uploads: ButtonImage keeps `settings['data_uri']`,
app/models/button_image.rb ~:213-228), previous code vs this branch.

### Android emulator check (2026-11-15)

Setup: `ll_trace` (Android 15, Chrome 124, 2 cores, 2 GB, swiftshader), `system=Android mobile=true` as on the phone;
local Rails on the private `lingolinq-e2e-traci-offline` (uploads blank), behind a scratchpad throttle proxy (4 Mbps
shared, 100 ms each way; adb reverse bypasses the emulator's own -netspeed); synthetic user `synth_big` with a home
board of 56 folders, each 1.52 MB JSON (inline 48x48 noise PNG data: URIs), the shape of Quick Core 60 on dev.
Scripts: scratchpad `emu/` (seed_big_boards.rb, throttle-proxy.js, cdp.js, fresh-signin.sh, sync-run.js,
offline-check.js).

Results:
- Could NOT reproduce the phone's failure locally. Every sync of the previous code succeeded: at sign-in the Modern
  folder-tree warm-up (`/tree` per folder) and then, with that blocked at the proxy, the in-page board cache
  (boardDetailCache) supplied the boards, so the sync never ran its one-board-at-a-time download path (one batch
  request for 2 ids and one single board during the sync; about 10 MB over the link for 58 boards). Unloading the
  Ember store was not enough. Forcing that path would need app changes for the test: stopped there (spiral rule).
  A batch-downloaded board here is 758 KB (no sideloaded pictures list). Why the phone's warm-up did not cover the 9
  boards is NOT known (dev's /tree needs sign-in; not measured).
- Fix build (100fcd816), same steps: sync succeeded, 58 boards, no errors, 57 of 57 on the device.
- Offline (link refused): home + folders 1, 7, 23, 41, 56 opened in Modern view, 6 of 6, about 1.1 s each; 23/41/56
  showed "Showing the copy saved on this device".
- Cold start offline (trusted device, service worker active): reload straight onto unopened folder 30 with the link
  down: navigation served by the worker (transferSize 300), 40 buttons from the device copy in about 2 s.
- Side finding: a sync started right after sign-in on the slow link failed at once with "failed to retrieve user
  details" (the warm-up saturating the link; the user GET's 8 s first try). Not fixed; worth its own issue.
- Test-only change reverted: SystemFeatureSettings.clear_default! on the private e2e database.

### CORRECTION (2026-11-15, later): every emulator run labelled "fix build" ran the OLD code

The server on port 5077 was the first ("before") puma, started 11:24 from /home/tracid/LingoLinq-AAC-offline
(master pid 76539). Stopping it killed only the wrapper pid (76538); puma kept the port. Both "fix" servers then
exited at once with `Address already in use - bind(2) ... port 5077 (Errno::EADDRINUSE)` (rails-after.log,
rails-after2.log in the scratchpad), and the heartbeat check that "confirmed" them was answered by the old server.
That worktree also has a stale, ignored `app/assets/javascripts/frontend.js` (Nov 10) that Sprockets prefers over
`app/frontend/dist`. Found when the page's `resetController` lacked the sentence-bar fix
(`application.debug-ac07532...js`, the same digest every run served).

So these statements above are WRONG and are withdrawn: "Fix build (100fcd816), same steps: sync succeeded ..."; the
offline 6 of 6 and the cold start offline "with the fix"; and the "use the board during a sync" result as evidence for
the fix. They are results for the OLD code (#1268 state, Nov 10 bundle): the old code synced the synthetic account,
opened boards offline (including a cold start through the service worker), and was not cancelled while the board was
used in Speak, Edit and Basic view. The drawer checks are void too: production builds strip `data-test-*`, so the
`[data-test-sync-drawer]` selector never matched.

Not affected: the code and every automated test (they ran in this worktree's own `ember test`).
Lesson: after starting a server, verify the PROCESS on the port (`ss -ltnp`, its cwd) and that the served bundle
contains the change; a 200 from the port proves nothing about which server answered.

### STOPPED here (Rule 0.13), 2026-11-15

Committed and test-verified: 79f95405e, 65802eb7d, 100fcd816 (downloads, retries), 4eeea1384 (sentence bar, unit test
only: NOT yet seen working on the emulator), 74104dd80 (user refresh limit).
Uncommitted, NOT verified (step 2, sync status screens, in progress):
- services/persistence.js: board roots and names recorded during the walk (note_board_root, root_for_link), parked
  count in progress, roots kept in the sync log entry (line-neutral edits).
- utils/sync_rollup.js + tests/unit/utils/sync-rollup-test.js (not run yet).
- components/sync-details.js: grouped view computed properties (template, styles, drawer stages not written yet).
RESUME: run the rollup + persistence-sync tests; write the Sync Details template and styles (edit the existing
`.la-sync-details-*` selectors: max-width 720 -> about 920 px, header label size), the drawer stages, i18n keys;
then ONE emulator run with the fix truly served (check `ss -ltnp` and the bundle), covering: sentence bar on a slow
folder hop, sync while used in Speak/Edit/Basic (drawer by `.ll-copy-drawer`), folder-open timing.

### Step 2: sync status screens (2026-11-15, resumed session)

Commits:
- 3aae99899 walk bookkeeping + utils/sync_rollup.js (note_board_root, root_for_link, rollup, with_errors); log entry
  keeps `roots`; sync_progress.parked. `/sync rollup|persistence-sync/i`: 126 tests, 125 pass, 1 pre-existing xit.
- a385fbf4b Sync Details grouped view + drawer stages. Shared helpers in utils/sync_rollup.js: summary_for (running
  sync, else last log entry), current_root_name, only_parked_left. Drawer stage logic is the exported pure
  drawer_stage(). Tests: sync-details-grouped-test.js (new), sync-progress-drawer-test.js (4 tests appended, existing
  ones untouched), sync-rollup-test.js (3 appended). Run `/sync rollup|sync-progress-drawer|sync-details
  grouped|sync-notice|syncing-notice|sync-failed|persistence-sync|board (retry|download|find)|sync user reload
  limit/i`: 187 tests, 186 pass, 1 pre-existing xit, 0 fail.
- Mutations (one build, 4 mutants): only_parked_left false -> stage/Try now/waiting tests red; summary_for without
  the running branch -> summary test red; no default-open card -> grouped test 1 red; single-board detail removed ->
  "needs attention names the board" red. Restored with git checkout.
- lint:js:ci reported new=1 (toggle_technical orphaned): FALSE, the worktree trap. node_modules/eslint-plugin-lingolinq
  resolves to /home/tracid/LingoLinq-AAC/app/frontend/eslint-plugin-lingolinq, whose APP_ROOT is the MAIN checkout's
  app/. Linting the three changed JS files with this worktree's own plugin copy: no findings. Template lint clean.

Decisions and deviations to put to Traci:
- ONE summary button, not "Save the N now" + "Sync everything": persistence.sync has no "re-download everything"
  mode (sync(user_id, force, ...); force = manual), so both would do the same thing. Label is "Save the N now"
  (missing > 0) or "Sync Now".
- Buttons kept charcoal, not brand teal: .la-sync-details-primary-btn/-secondary-btn are shared with Assign Lesson
  (components/assign-lesson.hbs, app.scss .la-assign-lesson-modal-footer .la-sync-details-primary-btn:disabled);
  recolouring would change that modal too.
- Drawer Saving stage keeps the existing "Saved so far: N boards." line instead of "N boards ready": during a walk a
  board's folders are only known once it is visited, so a "ready" count would call a home board with 3 of 56
  folders done "ready".
- sync-notice `message` strings are pinned by sync-notice-test.js, so they are unchanged; the drawer shows the new
  grouped title/detail when a summary exists and falls back to `message` otherwise (failed sync, older logs).
- "The problem list just disappears" (Traci): NOT verified. Plausible cause by reading: services/sync-notice.js
  _sync_status_changed replaces a 'done' card with 'syncing' whenever ANY sync starts, including automatic ones, so a
  Needs attention card is replaced by the next auto sync. Check on the emulator before changing anything.
- Not covered by a test: that a real walk writes `roots` into the log entry (persistence integration); the emulator
  run checks it end to end.
- i18n: new keys use i18n.t defaults; i18n_generator.rb --generate + --merge still to run before the PR.

### Emulator run, step 2 build (2026-11-15, verified serving the change)

Server: puma master on 5077 with cwd /home/tracid/LingoLinq-AAC-sync-downloads; the worktree needs
`rake extras:assert_js` after `ember build` (copies dist into the ignored app/assets paths; without it every page is a
500, "couldn't find file 'vendor.js'"). Served /assets/application.debug-e870786c...js contained the new drawer code,
and the device loaded that same digest.

Run 1 (use-during-sync.js) VOID as a test of the fix: it started on the dashboard, so taps found no cells, and the
sign-in warm-up had stored every folder, so the sync ended in about 60 s. Showed only: succeeded, 58 rows, the
Saving stage, never cancelled.

Run 2 (scratchpad use-during-sync2.js): dropped the 57 stored big-folder rows, reloaded, opened big-core in Speak Mode,
then started the sync.
- Sentence bar: "I want" kept after tapping folder 9 and folder 31; folder 31 showed the loading substate
  (.ll-premium-progress), so the 4eeea1384 fix is now SEEN working on the emulator.
- Sync: succeeded in about 61 s, never cancelled through Speak taps, folder hops, Edit, Speak, Basic view, dashboard.
- Drawer: hidden at all 6 Speak Mode samples while syncing (Modern and Basic); shown in Edit and on the dashboard
  ("Saving your boards for offline use", "Saved so far: 33 boards."); after the sync "All your boards are ready
  offline" / "58 boards and folders are saved on this device."
- Log entry `roots`: 116 keys (58 boards by id and key): the walk writes it end to end.
- Folder opens during the sync: folder 9 3.4 s, folder 31 2.0 s (both opened). Whether each was already saved at
  that moment was NOT recorded. Not comparable with the phone's 30 s (different link, local server).
Sync Details on the device: 2 cards (Big Core, Home board, 56 of 56; Crisis Vocabulary labelled "Sidebar board",
since this account's sidebar reaches it before the Crisis seed). Found and fixed (commit above): dialog stuck at
600 px (Bootstrap .modal-dialog width), card title column crushed. Screenshot after the fix: width 920, layout matches
the Combined artboard. Title shows upper case ("SYNC DETAILS") from a shared header rule: not changed.

CONFIRMED (code): sync_log lives only in memory. It is set at services/persistence.js:2431, :2473, :5119 and never
written to storage or restored, so after a reload or app restart Sync Details has no rows (seen on the emulator: log 0
after reload). One mechanism for "the problem list just disappears"; the other, by reading, is an automatic sync
replacing the Needs attention card (services/sync-notice.js _sync_status_changed). Neither fixed: persisting the log
is data handling (Rule 0.12) and needs a proposal.
Not exercised on the emulator: the Waiting and Needs attention drawer stages (unit-tested only).

### Codex review of #1322 (2026-11-16): two findings, fix-proposal facts

P1 "Scope joined downloads to the authenticated session"; P2 "Capture the token actually used for the board request".
(a) Where read:
- CONFIRMED: join key is 'board_' + id_or_key only (utils/persistence.js:4369 -> utils/board_download.js:32-49
  join_download). Nothing about the session is part of it.
- CONFIRMED: the late-store token is captured as capabilities.access_token at request start (utils/persistence.js:4365)
  and compared with capabilities.access_token at arrival (late_deps token fn, :4370; board_download.js:87, :97).
- CONFIRMED: the request's real token is resolved by extras.ajax: capabilities.access_token, else
  LingoLinq.session.get('access_token'), else stashes auth_settings.access_token; then written back to capabilities
  (utils/extras.js:221-234). X-As-User-Id comes from LingoLinq.session.get('as_user_id') (extras.js:261-262).
- CONFIRMED: store_late_board adds the payload to late_seen (:85) BEFORE the token check (:87).
(b) Shapes: identity = (token or null) x (as_user_id or none). Writers: sign-in, sign-out, SPA sign-out (beta flag),
  masquerade (as_user_id), the post-login race where capabilities.access_token is empty.
(c) Claims: reachability of P1 needs a session change without a reload during a download (<= 60 s): SPA sign-out is
  flag-gated (session.js:783-789), masquerade switches as_user_id in-page (PLAUSIBLE, not traced). Fixed regardless:
  a cross-account share by construction, and cheap to close.
Fix: utils/request_identity.js, one definition of the token a request sends (used by extras.ajax, line-neutral) plus
  as_user_id; join_download(key, identity, start) keys by both; late_started and the late token check use the same
  identity; late_seen is marked only after the identity check passes. waiting_on(key) sums across identities.
