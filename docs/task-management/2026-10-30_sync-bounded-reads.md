# Sync whole-table reads crash Android; iOS stays offline after reconnect (2026-10-30)

Tracking issue: lingolinq/lingolinq_mobile#3 (the reconnect problem, with the crash and the
offline-picture test plan added to it on 2026-10-30). Branch: `traci/fix/sync-bounded-reads`
(LingoLinq-AAC, from `develop` at `e4be8b26a`). The reconnect fix lives in the mobile shell repo.

Learnings grepped (`LEARNINGS.md`, `learnings-archive/`) for sqlite, find_all, dbman, data_uri,
board_revocation: nothing relevant beyond the 2026-07-08 sqlite3 worktree build note.

## Problem A: the Android app is killed on every launch after a large sync

### Evidence (device log and database copy, `ll_api35_phone`, staging, synthetic account)
- Every launch: `FATAL EXCEPTION: CapacitorPlugins`, `OutOfMemoryError: Failed to allocate a
  37748744 byte allocation with 22989888 free bytes`, in `CapacitorSQLitePlugin.query` ->
  `RetHandler.retValues` -> `PluginResult.toString`. Heap growth limit 192 MB.
- The query in flight: `SELECT * FROM board` (logged 10:05:21.646), issued 54 ms after the
  `board_revisions?include_revoked=1` request started. The full `SELECT * FROM dataCache`
  (18 MB) ran twice before it and succeeded.
- Every row's `persisted` time is 2026-10-29 05:20:27 to 05:27:24 UTC: one first sync. The board
  table was empty when that sync started, so its whole-table reads returned nothing. Today's
  launch is the first since, and the first whole-table board read against 183 rows (153.7 MB).
- 150.6 MB of the 153.7 MB is base64 `data:` pictures in `image_urls`; 148 MB of it in 176
  `lingolinq/...` library boards. Staging serves `lingolinq/core-60-math` as 2,343,318 bytes with
  36 `data:image/svg+xml;base64` URLs; production serves it as 23,023 bytes with 36 `https` URLs.

### Fact sheet
- (a) **Where the value is read.** The failing call is one native `query` whose whole result the
  plugin serialises as one string. It is issued by `dbman.find_all_internal`, sqlite branch
  (CONFIRMED `app/frontend/app/utils/dbman.js:308-365`): one `SELECT * FROM <store>` with an
  optional `WHERE ref_id IN (...)` / `key_id IN (...)`, and the whole result handed to
  `handle_rows`. The shell's `www/sqlite_bridge.js` executes it (it loads before `app.js`;
  `utils/capacitor_sqlite_shim.js:1-5` says it is the fallback only).
- (b) **All shapes.** Callers of `storage.find_all` on a large table (CONFIRMED by `git grep` at
  `e4be8b26a`): `utils/board_revocation.js:106` (every sync, whole `board`);
  `services/persistence.js:2905` and `utils/persistence.js:2934` (every sync, whole `board`);
  `services/persistence.js:1333` / `utils/persistence.js:1372` (launch, whole `dataCache`);
  `:3017`/`:3034` (whole `image`, `sound`); `models/user.js:1092`,
  `components/push-to-cloud.js:53`, `controllers/modals/push_to_cloud.js:29` (whole `board`);
  `services/persistence.js:319`/`:497` (by id list). Row size: a board row is the stored JSON
  of the board, so it scales with the board's `image_urls`. A single row was 2.35 MB here; the
  largest `dataCache` row 3.52 MB.
- (c) **Cross-file claims.** The sync board read needs FULL rows, not metadata: unchanged boards
  are pushed into the store from the local copy (CONFIRMED
  `services/persistence.js:2919-2930`). `board_revocation.local_boards` needs only id, key,
  revoked and revision (CONFIRMED `utils/board_revocation.js:103-118`). Every store table is
  `id INTEGER PRIMARY KEY ASC, ref_id TEXT, data TEXT` (CONFIRMED `dbman.js:53`, plus `key_id`
  on `board`).

### Candidate fixes
1. **Bound each native call in `dbman.find_all_internal` (recommended).** In the sqlite branch,
   run the same query as `SELECT id, length(data) AS len ...` first, group the ids into batches
   whose summed length stays under a budget (4 MB; a single larger row is its own batch), then
   fetch `SELECT * FROM <store> WHERE id IN (...)` batch by batch and hand the concatenated rows
   to the existing `handle_rows`. Covers every caller in (b) with no caller change; IndexedDB
   untouched.
2. **Rewrite whole-table SELECTs in the shell bridge.** Same batching inside
   `www/sqlite_bridge.js`. Rejected: it has to parse SQL, the Ember fallback shim would need the
   same change, and it hides schema knowledge in the shell.
3. **`android:largeHeap="true"`.** Raises the limit (576 MB on this emulator) without bounding
   anything; the next larger account fails the same way. Rejected as the fix.
4. **Metadata-only read for `board_revocation.local_boards`.** Correct for that caller, but the
   sync board read at `persistence.js:2905` needs full rows (c), so this alone does not stop the
   crash. Possible follow-up once 1 lands.

### Risks and open questions
- Memory moves, it does not vanish: the WebView still holds every row (the sync pushes them into
  the store by design). The renderer's limit is far higher than the Java heap, but a 150 MB
  table of strings plus parsed objects has not been measured there. Not verified; the server fix
  (Problem C) is what makes the tables small.
- `length(data)` on TEXT counts characters, not bytes; base64 and JSON are ASCII, so the
  difference is small but the budget is approximate.
- Rows inserted between the size query and the batch reads are not returned (same as a read that
  started a moment earlier); a row deleted in between is simply absent.
- One extra query per call; for small tables one batch, so two queries instead of one.

### Red test (before the fix)
`app/frontend/tests/utils/dbman-test.js`: drive the real `dbman` with `db_type =
'sqlite_plugin'` and a fake `db.executeSql` that records each statement and returns rows of a
given `data` length. With three 3 MB rows and one 1 MB row, assert that every `SELECT *` call's
rows sum to at most the budget unless the call returns exactly one row, and that `find_all`
returns all four records. Fails today (one call returns 10 MB). Mutation that must make it fail:
budget set to `Infinity`.

## Problem B: iOS stays offline after the connection returns (mobile issue #3)

### Evidence
- iOS Simulator (iPad Air 11-inch M4, iOS 27.0), 2026-10-30 11:56 to 11:59 MDT, shell build
  installed on the simulator: Wi-Fi off at 11:56:23, on at 11:56:49. The Mac reached staging
  (HTTP 200) every 20 s from 11:57:09; the app had `navigator.onLine === false` and
  `persistence.online === false` at every check through 11:59:33 (160 s). A `fetch` of
  `/api/v1/status` from inside the web view at 11:59:4x returned HTTP 200.
- Android 15 tablet emulator, same day: `svc wifi/data disable` then `enable`; `navigator.onLine`
  and `persistence.online` were back to `true` within 6 s. Android recovers without help.
- Real iPhone or iPad: not tested.

### Fact sheet
- (a) **Where read.** `persistence.online` is set from `window`/`document` `online`/`offline`
  events and a 30 s poller reading `navigator.online_override || navigator.onLine` (CONFIRMED
  `services/persistence.js:4247-4294`). `ajax()` short-circuits every request while
  `online === false` unless `navigator.online_override` (if set) or `navigator.onLine` says
  online (CONFIRMED `:3897-3906`, reject at `:3942`). `check_token` returns
  `{success: false}` when offline (CONFIRMED `services/session.js:384-389`), so the poller's
  token probe cannot recover either.
- (b) **Shapes of `navigator.online_override`:** undefined (today, always), `true`, `false`.
  The poller treats `false` like undefined (`||`); `ajax()` treats `false` as offline. Writers
  today: none in the shell (CONFIRMED grep of `www/` minus `app.js`).
- (c) **Cross-file.** `@capacitor/network` 8 is installed and registered natively but unused by
  any shell script (CONFIRMED). Its API: `getStatus()` -> `{connected, connectionType}`,
  `addListener('networkStatusChange', fn)` (CONFIRMED
  `node_modules/@capacitor/network/dist/esm/definitions.d.ts:8-41`).

### Candidate fixes
1. **Shell `www/network_bridge.js` (recommended).** Loaded before `app.js`; native only. On
   `getStatus()` and every `networkStatusChange`: set `navigator.online_override = true` when
   connected, delete it when not, and dispatch `document` `online`/`offline`. The app already
   listens for both (no Ember change).
2. **Change the app to probe the server instead of trusting `navigator.onLine`.** Rejected for
   now: shared code the web and desktop builds run, a larger behaviour change, and the shell fix
   addresses the observed cause.

### Risks and open questions
- Connected to a network with no internet (captive portal): the app would try requests and fail
  them, which is what happens today when `navigator.onLine` is true in the same situation.
- The first status can arrive before Ember registers its listeners; the override still feeds the
  30 s poller, so it converges within 30 s.
- Whether a real iOS device also gets stuck is unverified; on Android the bridge only confirms
  what the web view already reports.

### Red test
`test/network_bridge.test.js` (Node, like `test/sqlite_bridge.test.js`): load the bridge against
a fake `window`/`document`/`navigator` and a fake `Network` plugin; fire a `connected: true`
change while `navigator.onLine` is `false`; assert `navigator.online_override === true` and one
`online` event on `document`. Fails today (no bridge). Mutation: dispatch on `window` instead of
`document`.

## Review round 1 (2026-10-30), two independent adversarial reviews

### Problem A: ship with conditions (accepted, each checked)
- **A single row is still unbounded.** A row over the budget becomes its own native call, so one
  large enough row crashes the same way. Accepted: rows over the budget are read in `substr`
  chunks and joined. CONFIRMED by reading `dbman.js:308-365` (the proposal had no row cap).
- **Parse each batch as it arrives** instead of concatenating raw rows, so raw strings and parsed
  objects are not both alive at the peak. Accepted.
- **The red test as described would exercise `fake_dbman`** (`tests/utils/dbman-test.js:15-17`
  stubs `capabilities.dbman`). Accepted: drive the imported module, stub and restore `db_type`
  and `db`, and use a fake `executeSql` that answers the size query and filters `id IN`. Add the
  by-id, empty, error-mid-batch and oversized-row cases; mutations: budget `Infinity`, size query
  without the WHERE.
- **Cap ids per batch** (500) so a table of tiny rows never builds a huge IN list. Accepted.
- **Fact-sheet corrections:** schema is `dbman.js:742` (with `key_id` at `:745-748`); the
  `utils/persistence.js` image and sound reads are `:3045`/`:3062`; missing callers are
  `storage_find_changed` (`capabilities.js:2205-2238`, every sync, index `changed`), `dbman.find`
  on non-primary indexes (`dbman.js:66-90`) and `preference_save.js:67`. All route through
  `find_all_internal`, so the fix still covers them.
- Noted, not changed: reads are no longer one snapshot (a concurrent store may land between
  batches; degrades rather than corrupts); `length(data)` reads every byte (time only).

### Problem B: blocked, and the premise is now refuted
- The reviewer's High finding: nothing showed `@capacitor/network` reports `connected` while
  WebKit is stuck. Checked on the iOS Simulator, 2026-10-30 12:19 to 12:22 MDT, same Wi-Fi off/on:
  the plugin's event fired `connected:false, none` on the way down, then `getStatus()` returned
  `connected:false, none` at every check for 100 s after Wi-Fi returned, alongside
  `navigator.onLine === false`. The plugin uses `SCNetworkReachability`
  (`@capacitor/network/ios/Sources/NetworkPlugin/Network.swift:17-28`), the same kind of OS
  reachability signal, and the Simulator never updated it.
- So the proposed shell bridge would not have helped in the only reproduction there is. The
  stuck state is likely a Simulator artefact (both OS-level signals stale while real requests
  succeed), but that is unverified on hardware.
- Also from the review (would apply to any bridge): Android's plugin reports `connected` only
  for VALIDATED networks, so a bridge dispatching `offline` would cause flaps on Android; the
  override is authoritative and sticky; the proposed red test could not fail for the right
  reason.
- Decision: no code for Problem B until it reproduces on a real iPhone or iPad. If it does, the
  fix is the app-side probe (the only signal that was right in the Simulator was a real request).

## Problem C: staging serves library pictures as embedded data (diagnosed)

Read-only queries through `lingolinq-migrate-staging` with `USER_KEY`, inside a READ ONLY
transaction that was rolled back (executions `lingolinq-migrate-staging-hskw2`, `-kg4k9`).
Approved by Traci 2026-10-30.
- 35,693 of 36,578 `button_images` have `url` NULL with the picture in `data`; 35,689 of them
  were created 2026-09-10 and 2026-09-11, all owned by user id 2 (`lingolinq`, created
  2026-09-10 19:20:55 UTC). Sample settings: `pending`, `pending_url`, `data_uri`.
- Those dates match `lingolinq-migrate-staging` executions: `-wndkf` 2026-09-10 19:15 to 20:20
  UTC ran `rake db:seed`; `-wcdmv` and `-h5cgc` on 2026-09-11 01:07 and 01:21 ran
  `rake lingolinq:import_curated_vocabularies`.
- `lingolinq-migrate-staging` and `lingolinq-migrate-dev` have no `REDIS_NAMESPACE_SUFFIX`;
  `lingolinq-scheduler-staging`, `lingolinq-web-staging` and the `lingolinq-worker-staging` pool
  set `-dev` (CONFIRMED from the deployed configs). `config/initializers/resque.rb:102-112` names
  the namespace `lingolinq#{suffix}`.
- So every job those runs queued went to namespace `lingolinq`, which no worker reads: 497,336 jobs
  in `default` (the sampled 2,000 are all `Worker ButtonImage upload_to_remote`) and 1,369 in
  `slow` (`SlowWorker BoardDownstreamButtonSet flush_caches`), 0 workers, 0 failures. The
  `lingolinq-dev` queues are empty.
- Same class of defect as `2026-10-23_migrate-job-cache-token.md` (the migrate job missing an
  environment variable the other roles have).
- Production not checked (not in scope of the approval). The same board on production is served
  with links.

### Problem C, further facts (2026-10-30, read-only executions `-6rt84`, `-vjsn8`)
- The 35,693 stuck images have four shapes (`url` NULL, all with `settings['data_uri']` and `data`):
  21,545 PNG + 87 JPEG with `pending: true` and no `pending_url`; 14,023 SVG with `pending: false`;
  38 more of either kind with `errored_pending_url`.
- `check_for_pending` schedules a server upload only for a `pending_url` or an SVG data URI when
  no client will upload (CONFIRMED `app/models/concerns/uploadable.rb:96-116`). So the 21,632 PNG
  and JPEG images never got a job at all; the 14,087 SVG ids did (56,258 stranded
  `ButtonImage upload_to_remote` jobs, about 4 per id).
- The stranded `lingolinq:queue:default` held 503,976 jobs at 19:16 UTC (497,336 at 18:05):
  467,786 scheduled 2026-09-10, 28,145 on 09-11, a handful later, and **6,640 on 2026-10-30**;
  `lingolinq:queue:slow` 28,883, of which **14,045 on 2026-10-30** (`WeeklyStatsSummary
  update_for_board`, `LogSession update_board_connections`, 13,468 each). Today's come from
  `rails runner` work through `lingolinq-migrate-dev` (executions `-9tpbk` 18:36, `-fc6f4` 18:48
  `DemoDistrict.create_district!`, `-9hbg7` 19:08). The migrate jobs are the documented route for
  one-off work (`docs/INFRASTRUCTURE.md:226-229`), so every such run strands its jobs.

## Proposal C (for review): stop stranding nonprod jobs; repair the stuck uploads

### C1. The migrate Jobs get the namespace suffix (`.github/workflows/deploy-cloudrun.yml`)
- (a) Read at: `config/initializers/resque.rb:102-112` (`lingolinq#{ENV['REDIS_NAMESPACE_SUFFIX']}`
  when set). The migrate Job's env is set only by `--set-env-vars
  "RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false"` (CONFIRMED
  `:808-822`); `gcloud run jobs deploy` replaces the Job's env on every deploy.
- (b) Shapes: production `APP_REDIS_NAMESPACE_SUFFIX` blank -> unset everywhere (namespace
  `lingolinq`, which the production worker reads); staging and dev `-dev` (CONFIRMED live:
  web-staging, worker-staging, scheduler-staging have `-dev`; both migrate Jobs have none).
- (c) The assemble step (`:622`, `V_REDIS_NAMESPACE_SUFFIX` at `:645`, appended to `APP_ENV_VARS`
  only when non-empty at `:724`) runs before the migrate step (`:781`) in the same job.
- Change: the assemble step also writes `MIGRATE_ENV_VARS` (the three static vars plus
  `REDIS_NAMESPACE_SUFFIX` only when non-empty) to `$GITHUB_ENV`; the migrate deploy uses it.
  Production's value is byte-identical to today.
- Alternative rejected: give the migrate Job all of `APP_ENV_VARS` (adds bucket and integration
  settings the comment at `:357-360` deliberately keeps off the migrate Job).
- Test: a shell test under `scripts/tests/` that extracts the migrate deploy block and asserts it
  passes `REDIS_NAMESPACE_SUFFIX` when the variable is set and omits it when blank. Mutation:
  revert to the literal env string.

### C2. A reviewed rake task to finish stuck uploads (`lib/tasks/`)
- `images:requeue_stuck_uploads`: `ButtonImage` with `url` NULL, a `data:image/` value in
  `settings['data_uri']` (or `data`), created more than 1 hour ago; for each, one
  `schedule(:upload_to_remote, Uploadable::UPLOAD_FROM_STORED_DATA_URI)` (the same call
  `check_for_pending` makes for SVGs, resolved by `resolve_upload_source` at `uploadable.rb:499-505`
  for any data URI). Dry run by default (`APPLY=1` to queue); prints the Resque namespace it will
  write to and the counts by shape; batches with `find_each`; idempotent in effect (a second run
  re-queues only what is still stuck, and `upload_to_remote` on an image that already has a URL
  re-uploads it, see open question).
- Test: RSpec under `spec/lib/tasks/` with images in each shape: dry run queues nothing; `APPLY=1`
  queues exactly one job per stuck image and none for images with a URL, without a data URI, or
  newer than the cutoff. Mutation: drop the age filter; drop the `url` NULL condition.
- Run once on nonprod after C1 is deployed (staging and dev share the database, so once covers
  both). Production: dry run only, and only with separate approval.

### C3. Not code: the stranded queues (nonprod only)
- After C1, decide per job class whether to move the stranded jobs to `lingolinq-dev` or drop
  them. Never in code that can reach production, whose live namespace is `lingolinq`.

### Questions for the review
1. Does `upload_to_remote` with `UPLOAD_FROM_STORED_DATA_URI` succeed for PNG and JPEG data URIs
   (sanitising applies only to SVG), and what happens on S3 failure (`:335-350` stores the data URI
   back, so a failing bucket leaves the image as it is)?
2. Should `check_for_pending` itself schedule a server upload for non-SVG data URIs when no client
   will upload (the gap that left 21,632 images with no job)? That is a behaviour change on the
   live upload path and is NOT proposed here; is it needed for the repair to stay repaired?
3. Can a stuck image legitimately be waiting on a client upload (the `remote_upload_possible`
   flow) such that a server upload would race it, and is the 1-hour cutoff enough?
4. Anything in the workflow change that could alter production or the staging and dev deploy
   order.

## Problem A: implemented (2026-10-30)
- `app/frontend/app/utils/dbman.js`: `find_all_internal`'s sqlite branch now calls the new
  `dbman.read_sqlite_rows`, which runs `SELECT id, length(data) AS len` with the same WHERE and
  arguments, then reads `WHERE id IN (...)` batches of at most `read_budget` (4,000,000) characters
  and `ids_per_batch` (500) ids, and reads any longer row in `substr(data, ?, ?)` pieces. Rows are
  parsed per batch into one list (the review's condition 2).
- Red test first: `app/frontend/tests/utils/dbman-sqlite-batches-test.js` drives the real module
  with a fake database that answers the SQL it is sent. Against the old code: 3 fail (a call over
  the budget; no size query; no batches), 3 pass (empty table, non-id index filter, id cap on a
  table that fits one call), each failure on its intended assertion. A first draft gave rows
  unprefixed ids, so reads by id matched nothing even on the old code and two tests timed out;
  stored records keep the `<store>::` prefix (`dbman.uniqify_key`, `dbman.js:95-110`).
- With the change: `npx ember test --filter dbman` 16/16 (10 existing, 6 new).
- Falsified: budget forced to `Infinity` fails tests 1 and 6; the size query without its WHERE
  fails test 3. File restored from a copy and compared byte for byte.
- `npx eslint` on both files: clean.
- Device check (2026-10-30 13:26 MDT): branch built (`ember build --environment=production`,
  `assets:precompile`), packaged into the shell with `package_from_lingolinq` (staging), debug APK
  installed with `adb install -r` over the crashing `ll_api35_phone` app, database (172 MB) kept.
  The app ran 90 s+ with nothing in the crash buffer (it died at about 15 s on every launch
  before). Whole-table reads went out as size queries plus batches (board: 51 batches in one
  read). `board_revisions?include_revoked=1` ran, so the read that used to crash ran. Java heap
  19.7 MB. The board rendered (60 buttons).
- **Not fixed by this: sync still fails on this data.** One whole-board read took 107 s
  (13:26:38 to 13:28:25, 51 batches, about 2 s per 4 MB batch on the emulator), and each sync
  step has a 30 s limit (`time_promise`, `services/persistence.js:28-45`):
  `sync promise took too long:syncing changed`. With production-sized boards (the same board is
  23 KB on production) this account's 183 boards are about 4 MB, one batch. So Problem C (the
  data) is required, not optional; this change turns a crash loop into a slow, failing sync.

## Proposal C review (2026-10-30): ship C1 with conditions; block C2 APPLY and C3

Checked by me:
- **PNG cause corrected (finding 2), CONFIRMED in code:** the importer uploads inline,
  `record.upload_to_remote(item['ref_url'])` (`lib/converters/lingo_linq.rb:417-418`), inside the
  migrate Job, which has no `UPLOADS_S3_BUCKET` or AWS keys (its deployed env, read 2026-10-30;
  `deploy-cloudrun.yml:357-360`). The S3 POST fails and the fallback stores the data URI
  (`uploadable.rb:335-352`). That matches every PNG row's shape. The September execution logs
  that would show `S3 upload failed` are gone (30-day retention; only 13 entries remain in that
  window), so occurrence is inferred, not observed. Consequence: C1 alone does not stop it; the
  next seed or import through the migrate Job recreates stuck PNGs.
- Not yet checked by me (open): the SVG self-reschedule loop on failure (finding 1); already
  synced devices keeping the embedded copy while `current_revision` is unchanged (finding 5);
  `settings` is encrypted so C2 cannot filter on it in SQL (finding 7); the dedupe utility job
  has the same env gap (finding 3); C3 tooling able to reach production's live `lingolinq`
  namespace (finding 6).

## Production check (2026-10-30, approved by Traci)
Read-only audited `rails runner` through `lingolinq-migrate` in `lingolinq-prod`, `USER_KEY` set,
READ ONLY transaction rolled back, counts only (execution `lingolinq-migrate-kznt2`). Traci: the
production database holds only LingoLinq's own library, no real user data yet. An earlier
execution, `lingolinq-migrate-kttvv`, ran an EMPTY script on production by mistake (the script
file had not been written, so `eval(Base64.decode64(''))` ran); it did nothing but is in the
audit trail.
- 946 of 78,159 `button_images` have no URL and an embedded data URI (705 PNG, 233 SVG, 8 JPEG);
  973 have no URL at all. Created 2026-06-29 (822), 2026-09-11 (150), 2026-10-18 (1). Owners:
  `lingolinq` 972, `scotw` 1.
- Production's migrate Job: no `REDIS_NAMESPACE_SUFFIX` (matches its worker; namespace
  `lingolinq`), and no `UPLOADS_S3_BUCKET` or AWS keys. Queues empty, 1 worker, 500 failed
  (the failure list's cap).
- So production has the same embedded-picture problem at about 1/37 of staging's scale, from the
  S3-less upload path, not from stranded jobs. Which boards use these 946 images, and how large
  those boards are, is not yet measured.

## Proposal D1 (for review): every nonprod one-off Job reads and writes the workers' namespace

Replaces C1, with the review's conditions folded in.

### Fact sheet
- (a) Read at `config/initializers/resque.rb:102-116`: `lingolinq#{suffix}` for Resque, and
  `lingolinq-stash#{suffix}` / `lingolinq-permissions#{suffix}` for the caches, only when
  `REDIS_NAMESPACE_SUFFIX` is SET (an empty string is set and gives `lingolinq`).
- (b) Shapes, CONFIRMED live 2026-10-30: production web/worker/migrate/scheduler: unset
  (namespace `lingolinq`, matching). Nonprod web-staging, worker-staging, scheduler-staging:
  `-dev`. Nonprod `lingolinq-migrate-staging`, `lingolinq-migrate-dev`: unset.
  `lingolinq-utility-dedupe-dryrun` (deployed by `scripts/gcp/dedupe-utility-boards-dryrun.sh:113`
  with the literal three-variable env, copying only secret refs from web at `:73-76`): unset.
- (c) Writers of the migrate Job's env: only `deploy-cloudrun.yml:808-822` (`gcloud run jobs
  deploy` replaces it each deploy). The assemble step (`:622-735`, `V_REDIS_NAMESPACE_SUFFIX` at
  `:645`, appended only when non-empty at `:724`) runs earlier in the same job. Execution-scoped
  `--update-env-vars` overrides merge with, not replace, the Job's env
  (`docs/ops/staging-translate-library-job.md:33-36`).

### Change
1. The assemble step also writes `MIGRATE_ENV_VARS` to `$GITHUB_ENV`: the three static vars plus
   `REDIS_NAMESPACE_SUFFIX` only when non-empty (never `REDIS_NAMESPACE_SUFFIX=`). The migrate
   deploy uses it. Production's value is byte-identical to today's literal.
2. A readback after the migrate deploy, in the style of the scheduler's (`:1217-1236`): the
   Job's `REDIS_NAMESPACE_SUFFIX` must equal `V_REDIS_NAMESPACE_SUFFIX` (both absent in
   production), else `::error::` and exit 1. Placed BEFORE `jobs execute`, so a mismatched Job
   never runs.
3. `scripts/gcp/dedupe-utility-boards-dryrun.sh`: copy the web service's
   `REDIS_NAMESPACE_SUFFIX` (plain env) into the Job's env when present.
4. Docs: `docs/INFRASTRUCTURE.md` "Console and one-off work" says one-off work through the migrate
   Job shares the workers' queue only from this change on.

### Tests
- `scripts/tests/deploy-migrate-env-test.sh` executes the assemble snippet (extracted from the
  workflow, not grepped) with the suffix set and unset; asserts `MIGRATE_ENV_VARS` contains
  `REDIS_NAMESPACE_SUFFIX=-dev` when set and has no `REDIS_NAMESPACE_SUFFIX` key at all when
  blank; and that the migrate deploy step reads `$MIGRATE_ENV_VARS`. Wired into `ci.yml` next to
  the other `scripts/tests/` entries (`:91-113`). Mutations: emit `REDIS_NAMESPACE_SUFFIX=` when
  blank; revert the deploy step to the literal.

### Risks
- From the next deploy on, migrations that enqueue jobs in nonprod go to the drained queue and
  run on the worker (no current migration enqueues; review C finding 3).
- Cache invalidations from nonprod one-off runners start reaching the web service (correct, but a
  behaviour change).
- It takes effect per Job only after that Job's next deploy.

## Proposal D2 (for review): server-side uploads refuse to run without S3 in deployed environments

### Fact sheet
- (a) Where the value is read: `Uploadable#upload_to_remote` (`uploadable.rb:238-355`) builds
  the S3 POST from `remote_upload_params` -> `Uploader.remote_upload_config` (`lib/uploader.rb:692-699`)
  with whatever env exists, posts it, and on any failure falls back to storing the data URI
  (`:335-352`; the comment says it lets images work without S3 configuration). With no bucket or
  keys the POST cannot succeed, so every upload takes the fallback. The importer uploads inline
  (`lib/converters/lingo_linq.rb:417-418`).
- (b) Shapes of "S3 configured": `Uploader.client_uploads_configured?` (`lib/uploader.rb:678-681`)
  is true only with access key, secret and bucket. Deployed web, worker and scheduler: configured.
  Deployed migrate Jobs (production and nonprod) and the dedupe utility Job: not configured, by
  design (`deploy-cloudrun.yml:357-360`). Local development and test: usually not configured.
- (c) Server-side callers of `upload_to_remote`: the importer (`lingo_linq.rb:418`), sound
  uploads (`board.rb:1574`, `button_sound.rb:285`), `uploadable.rb:647`, and scheduled jobs
  (`uploadable.rb:163`, `:196`), which run on the worker (configured).
- Evidence it happened: 35,689 staging and 150 production images created on the dates of
  library imports through the migrate Job, all in the fallback's shape. Logs from September have
  expired, so the fallback firing is inferred from the data shape plus the code path.

### Change (by construction, at the one choke point)
- At the top of `upload_to_remote`, when `Rails.env.production?` (true on every Cloud Run
  surface, staging and dev included) and `!Uploader.client_uploads_configured?`, raise
  `Uploader::RemoteCredentialsMissing` (the existing class used for the same condition at
  `lib/uploader.rb:683-685`). Development and test keep today's fallback.
- Effect: an import through the migrate Job stops at its first picture with a clear error,
  instead of finishing with thousands of embedded pictures.

### Alternatives considered
- Guard each import task (`db:seed`, `lingolinq:import_curated_vocabularies`, BetaSeed, ...):
  rejected as instance-by-instance; a new import path would be unguarded.
- Give the migrate Job S3 credentials: rejected; the workflow keeps non-boot secrets off it on
  purpose (`:357-360`). Imports belong on the scheduler Job, which has them
  (`docs/ops/staging-translate-library-job.md:29-36`).

### Tests
- `spec/models/concerns/uploadable_spec.rb`: with `Rails.env` production and no S3 config,
  `upload_to_remote` raises `RemoteCredentialsMissing`, posts nothing and leaves the record
  unchanged; with production and S3 configured, unchanged behaviour; in test env without
  config, the existing fallback specs still pass. Mutations: drop the env condition (fallback
  specs must fail); drop the config check (the new spec must fail).

### Risks and open questions
- A record created just before the raise (the importer creates the record, then uploads) is left
  in the stuck shape; the import is aborted at the first picture, so at most one per run.
- Any deployed surface that today relies on the fallback without S3 would now raise. Known
  surfaces without S3 are the migrate and dedupe Jobs only; is any migration or runner path
  calling `upload_to_remote` there on purpose?
- Does any job path catch `RemoteCredentialsMissing` and retry forever?

### D1 review (2026-10-30): ship with conditions, all accepted
Checked by me:
- Develop-only job methods reaching the staging-image worker: CONFIRMED that
  `clean_up_destroyed` exists on `origin/develop:app/models/organization.rb` and not on
  `origin/staging`. But `lingolinq-web-dev` already runs the develop image with `-dev` (read live
  2026-10-30, image `...ae66d2ef03a8`), so dev web traffic already feeds develop-only jobs to the
  staging worker; D1 extends that existing path to one-off runs. Document it (INFRASTRUCTURE.md,
  the workflow's OPERATIONAL RULE comment, demo-district.md) and prefer migrate-staging for
  one-offs whose code is on staging.
- The migrate step has no `set -euo pipefail` (CONFIRMED `deploy-cloudrun.yml:807-808`). Add it,
  plus `: "${MIGRATE_ENV_VARS:?}"`.
- Nonprod Jobs enumerated live: `lingolinq-migrate-dev`, `lingolinq-migrate-staging`,
  `lingolinq-scheduler-staging`, `lingolinq-utility-dedupe-dryrun`. Only the scheduler has `-dev`.
Accepted changes to D1:
1. The readback compares the Job's suffix with the draining worker pool's live value
   (`lingolinq-worker-staging` in nonprod, `lingolinq-worker` in production), read with
   `.value // empty`; `V_REDIS_NAMESPACE_SUFFIX` re-declared in the step; it also asserts
   `RAILS_ENV=production`; its error says the Job is deployed but not executed.
2. Test as an RSpec spec next to `spec/config/deploy_cloudrun_secrets_spec.rb`: run the assemble
   step's text in bash with a stub `gcloud`, and assert the exact production string
   `RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false` when blank and
   `...,REDIS_NAMESPACE_SUFFIX=-dev` when set. No ci.yml change needed.
3. Dedupe script: copy only a plain (non-secret) `REDIS_NAMESPACE_SUFFIX` from the web service,
   append only when non-empty; docs recommend `--web lingolinq-web-staging` for APPLY.
4. Risks section: the fix reaches migrate-staging only when staging's copy of the workflow is
   promoted; a failed readback leaves a deployed-but-not-executed Job (as a failed execute does
   today).

### D2 review (2026-10-30): ship with conditions; three High findings, all CONFIRMED by me
1. The production clean-DB runbook seeds with `rake db:seed` on `lingolinq-migrate-cleandb` with
   `--set-secrets "$BOOT_SECRETS,SEED_..."` only, no S3 (`scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md:214-219`).
   `db:seed` runs `BetaSeed.ensure_baseline!` (`db/seeds.rb:24`), which imports system content
   (`lib/beta_seed.rb:29`, `:81`) through the importer. D2 as written would stop the seed after
   users and the admin org, before system content and the word imports. PLAUSIBLE that production's
   822 stuck images dated 2026-06-29 are that runbook's seed run.
2. `from_external_nested` creates every board in a set (`Board.process_new`) before importing any
   image (`lib/converters/lingo_linq.rb:625-650`), with no transaction; an abort at the first
   picture leaves the whole set as empty boards, and a re-run duplicates them.
3. `spec/spec_helper.rb:128-136` stubs `Uploader.client_uploads_configured?` to true whenever
   `AWS_SECRET` is blank (CI), so the proposed mutations would survive. New examples must stub it
   explicitly both ways and stub `Rails.env` as `spec/lib/demo_district_spec.rb:454` does.
Also (Medium, not yet checked by me): the POST-failure fallback still embeds silently and SVGs
reschedule without limit on S3 failure; Demo District's suggested-sound path swallows the raise.

Revised D2 (proposed, pending Traci's decision on the runbook):
- Preflight at the importer's entry (`Converters::LingoLinq` from_obz / from_obf / from_external),
  before any board is created: in production-env without S3, raise; nothing is created.
- Keep the raise in `upload_to_remote` as the backstop.
- Seeding and imports run where S3 exists: change the Phase 5 runbook (and any recipe that runs
  imports through a migrate-style Job) to the scheduler Job pattern, which has the full secret
  set. Not proposed: a "skip library imports" mode, which would leave an environment with no
  library and no error.
- Specs stub `client_uploads_configured?` and `Rails.env` explicitly in both directions; test
  env without S3 keeps the fallback (kills the always-raise mutant); production without S3
  raises with `Board.count` and `ButtonImage.count` unchanged and no `Typhoeus.post`.

### Decision (2026-10-30, Traci asked for best practice; decided)
Seeds and imports run as one-off processes in the same environment as the app (Twelve-Factor
"admin processes"): on the scheduler Job pattern, which has the full secret set and the workers'
namespace. The migrate Job stays migrations-only with boot secrets. Revised D2 as above, plus the
Phase 5 runbook change. Re-run safety of an interrupted import is noted on mobile issue #3, not
built here.
