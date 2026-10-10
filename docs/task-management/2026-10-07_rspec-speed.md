# RSpec suite speed (CI `rspec` job)

Goal: cut the wall time of the `rspec` CI job without weakening any spec (CLAUDE.md Rule 14).

## Baseline (CONFIRMED)

- CI run 37726660653 attempt 1, commit 7360e58ea: `bundle exec rspec` took 22 min 54 s for
  7,792 examples (0 failures, 53 pending); files loaded in 5.57 s. Job setup before RSpec
  (checkout, Ruby, assets, schema load, guard scripts) about 1.7 min.
- `.github/workflows/ci.yml` `rspec` job: one runner, `bundle exec rspec`, `--order defined`
  (`.rspec`). Its comment still says "~16 min", so the suite has slowed since then.

## Learnings consulted

- learnings-archive/2026-09.md: a red local run is usually the environment (dirty test DB,
  evening TZ); local profiling runs use `TZ=UTC` and the documented DB prefix.

## Investigation

- Local full run with per-example JSON timings (profile), static review of spec setup.

## Findings (local profile, `TZ=UTC`, per-example JSON)

- Local full run: 15 min 35 s, 7,792 examples, 0 failures; sum of example times 934 s.
- CONFIRMED: `spec/lib/beta_seed_spec.rb` takes 575 s of the 934 s (61%), in 4 examples
  (`:5`, `:27`, `:44`, `:153`, 135 to 157 s each). They call `BetaSeed.ensure_baseline!`
  (directly or via `rebuild_content_boards!`), which runs `SystemBoardSources.ensure_senner_baud!`
  (`lib/beta_seed.rb` `ensure_system_content!`). With no existing board it downloads the ~12 MB
  Senner-Baud OBZ from public S3 (`fetch_senner_baud_obz`, `SafeHttp.get`, 300 s timeout) and imports
  it with `Converters::LingoLinq.from_obz`. Seen live: the rspec process held HTTPS connections to
  S3 addresses while those examples ran.
- The examples stub `ensure_crisis_vocabulary!` but not Senner-Baud, and none asserts on Senner-Baud
  (`verify_beta_seed` lists it among signup boards, but the example checking that list uses
  `include` on three other slugs). If S3 is unreachable the import is skipped and they still pass:
  the download is an unasserted external dependency. Senner-Baud itself is covered, with the fetch
  stubbed, in `spec/lib/system_board_sources_spec.rb:49-125`.
- Everything else: no other example over 5 s; next files 26 s (board_spec), 24 s (relinking_spec).
- Static review (subagent, to verify where acted on): no parallel tooling; `KEYS` scans in the global
  `before(:each)` (`spec/spec_helper.rb:84-85`) over a Redis that is never flushed; PBKDF2 100k iterations
  unmodified in test; no network guard (no WebMock); SimpleCov on every run.

## Step 1: beta_seed examples stop downloading from S3 (branch traci/perf/rspec-speed)

- History: the spec dates from #343 (2026-06-04), before seeding downloaded anything. The S3
  download reached develop in #625 (2026-07-17), which also added the crisis stub to these examples
  but no Senner-Baud stub. Nothing blocks real network in specs, so it went unnoticed.
- Change: `stub_senner_baud_sources` in `spec/lib/beta_seed_spec.rb` fakes the two outside sources
  (`fetch_senner_baud_obz`, `local_senner_baud_obz_path` -> nil) in the 4 seeding examples, so the
  real `ensure_senner_baud!` takes its "not available" path (log: "senner-baud not found" x4). No
  assertion changed. Faking the local path too keeps a developer's local OBZ from bringing the slow
  import back.
- Result (local): the 4 examples 4 to 7 s each (were 135 to 157 s); beta_seed_spec +
  system_board_sources_spec 28 examples, 0 failures, 18.9 s.
- Lost: the incidental check that the real S3 file imports (it never caught a missing file, since a
  failed fetch is skipped). A dedicated, opt-in real-file check can replace it if wanted.

## Step 2 (uncommitted, stopped to report): network guard

- WebMock 3.26.4 (`require: false`, dev/test group) + `WebMock.disable_net_connect!(allow_localhost: true)`
  in spec_helper; bundle-audit clean. Full local run: 5 min 12 s, 7,792 examples, **110 failures**,
  every one a blocked real request (each was reaching the internet before):
  - OpenSymbols, 72 requests: `POST /api/v2/token` x54, `/api/v1/symbols/search` and v2 search
    (`lib/open_symbols.rb:335`, `app/models/board.rb:1662`); boards, relinking, converters, BDBS,
    library and seed specs.
  - Requests to the shared DEV bucket (`lingolinq-dev-uploads`, POST/GET/HEAD) and one AWS Bedrock
    model call (`Api::WordSuggestionsController POST create returns empty words when no API key is
    configured`).
- CORRECTION (an earlier note here said "real writes" and "local-only"): ROOT CAUSE CONFIRMED.
  `spec/spec_helper.rb` loads `.env.op.template` FIRST (#625, 9aa0007c0, 2026-07-17; before it,
  `Dotenv.load` read only `.env`). The template is committed and its secrets are unresolved 1Password
  references (`AWS_SECRET=op://...`, `BEDROCK_AWS_SECRET`, `OPENSYMBOLS_SECRET`, `IPLOCATE_API_KEY`),
  and Dotenv does not override a var already set, so those placeholders win over a developer's real
  `.env` values, locally AND in CI. Every "configured?" check passes with a non-credential: the
  requests go out (OpenSymbols token with body `secret=op://...`) and are presumably rejected
  (responses not checked). It also defeats the spec_helper fallback that stubs
  `Uploader.remote_upload_params` only when `AWS_SECRET` is blank. So no real bucket writes, but the
  outside calls happen on every run, CI included.
  - Fake hosts expected to fail (`www.example.com/*.png`, `http://qwer/`), `s3.amazonaws.com/
    coughdrop-usercontent`, `iplocate.io`, `example.com/api`.
- Staged commit: WebMock loaded with `WebMock.allow_net_connect!` (no behaviour change; lets fixes use
  `stub_request`). Full local run: 7,792 examples, 0 failures, 7 min 37 s (15 min 35 s before step 1).
  The switch to `disable_net_connect!` comes last, after each group is fixed.
- Group 1 (env placeholders) review: `config/application.rb:27-37` ALSO loads the same four files
  in test, already fixed to most-specific-first with a comment on the bug; spec_helper runs first
  with the old template-first order, so the template still wins in specs. Fixing it touches shared
  boot config (and boot-time reads: secret_token.rb, environment.rb DEFAULT_EMAIL_FROM /
  SYSTEM_ERROR_EMAIL checks), so it goes to Traci as a proposal first.

## Group 1: unresolved op:// placeholders (committed)

- Change (Traci approved Option 1; edit approved once in manual mode): `config/application.rb`, test
  env only, deletes every ENV value starting with `op://` and gives DEFAULT_EMAIL_FROM,
  SYSTEM_ERROR_EMAIL, SECURE_NONCE_KEY test stand-ins only when nothing real is set (CI's real values
  win). spec_helper's own loader is left as is, so a developer's real `.env` keys still cannot reach
  specs (they lose to the template, which is then scrubbed). Production never enters the block.
- Red first: `spec/config/test_environment_spec.rb` failed before the change (18 op:// keys
  including ANTHROPIC_API_KEY from .env.op.local), passes after; external_nonce_spec green.
- Full run with the guard ON (temporary, not committed): blocked examples 110 -> 61, 0 failures of
  any other kind. Gone: Bedrock, iplocate, 51 of 54 OpenSymbols token requests.
- Left: OpenSymbols searches (22 GET, 3 POST), S3 (POST lingolinq-test-uploads x7, dev-uploads
  GET/HEAD x6, s3.amazonaws.com/coughdrop-usercontent x3), fake image URLs and hosts (~20).
- Follow-up (separate, team decision for Scot): adopt dotenv's conventions for tests (one loader,
  committed `.env.test`, personal `.env.test.local`, no `.env.local` or template in tests; dotenv
  3.1.8 `lib/dotenv/rails.rb` skips `.env.local` when `env.test?`).

## Group 2 (OpenSymbols) + repair of a Group 1 regression (committed); STOPPED here (Rule 13)

- Group 1 (428c358ea, pushed) broke 3 examples in normal order: board_spec `swap_images`
  (5701/5724/5749). With OPENSYMBOLS_SECRET gone, `Uploader.default_images` takes its v1 fallback
  and made a REAL request; the real OpenSymbols answer found the images, so the expected
  `find_images` call never happened. Those examples depended on the internet. It also made
  board_spec 626/642/659 (generate_download) fail when the file runs alone: `aws_access_key`
  returns `''`, which is truthy, so `presigned_url_for_uploads`' "configured?" check passes and the
  SDK raises MissingCredentialsError; in full order a cached `@remote_upload_config` from an earlier
  spec hid it. My Group 1 verification was one full run with the guard on; it did not run the suite
  guard-off or touched files alone. Lesson: verify the state being committed (guard off), and run
  changed-behaviour files on their own too.
- Fixes (no assertion changed):
  - `spec/support/outside_services.rb`: default WebMock answer for `Board#check_image_url`'s v1
    symbol search ("no results"); a spec testing that call declares its own.
  - `spec/lib/open_symbols_spec.rb`: its fake responses move from `Typhoeus.stub` to WebMock
    `stub_request` (WebMock sees the request first, so with the guard on a Typhoeus.stub answer is
    never reached: these two were false positives, not real calls).
  - board_spec swap_images x3: fake OpenSymbols defaults response ("none found").
  - board_spec generate_download x3: `presigned_url_for_uploads` -> nil (not in the uploads bucket).
- Verified: full suite guard OFF, normal order: 7,794 examples, 0 failures (9 min 12 s); board_spec
  alone 297/0; open_symbols_spec alone 28/0; targeted guard-ON run: no OpenSymbols requests left in
  the affected files.
- Own errors this session (Rule 13 stop): progress "failure" counts read from capital F's in log
  text twice (reported 0 blocked / 8 failures, both wrong); Group 1 pushed with the regression above.
  Report failures only from RSpec's final summary.

### Remaining (not started)
1. S3 requests: uploads (`lingolinq-test-uploads` POST x7), dev-uploads GET/HEAD, old
   `s3.amazonaws.com/coughdrop-usercontent` GET x3.
2. Fake image URLs and hosts relying on failure (`www.example.com/*.png`, `http://qwer/`,
   `example.com/api`).
3. Latent app defect (report, not fixed): `Uploader.aws_access_key`/`aws_secret_key` return `''`
   when unset, so `config[:access_key] && config[:secret]` (uploader.rb:438, :549) never detects
   missing credentials and `MissingCredentialsError` is not rescued.
4. Test isolation: `Uploader.@remote_upload_config` is memoized for the whole run; the first spec
   to call it fixes the S3 settings for every later spec.
5. Switch the guard on (`disable_net_connect!`), last.
6. Follow-up for Scot: dotenv conventions for tests.

## Groups 3 and 4: S3 and placeholder hosts (committed); STOPPED again (Rule 13)

- Fake answers mirror the real hosts, measured once from the shell 2026-10-08: `example.com` /
  `www.example.com` 404 (405 for POST, which is what spec_helper's upload fallback has always got);
  S3 hosts 403 AccessDenied (unsigned GETs measured; the upload POST's real answer was not measurable
  with the fake in place: 403 is PLAUSIBLE). `http://qwer/` (board_downstream_button_set_spec
  placeholder extra-data URL) does not resolve: answered with a timeout.
- Verified: full suite with the guard ON: 7,794 examples, 0 failures (no spec reaches the internet).
  Changed files alone, guard off: board_downstream_button_set 78/0, board 297/0, beta_seed 12/0,
  system_sidebar_boards 8/0, converters/lingo_linq 64/0, api_json_bundle 19/0, extra_data 50/0,
  json_api/image 20/0, library_cache 34/0.
- Full suite guard OFF did not come back clean, for two environmental reasons (neither involves an
  HTTP path):
  1. 8 masquerade/admin audit failures 11 min after the guard-on run: `record_masquerade_audit!`
     dedupes via Redis `masq_audit/<op>/<target>` for 30 min (application_controller.rb:529-540), the
     test Redis namespace `lingolinq-stash-test` is never flushed, and IDs can repeat between runs
     (spec/lib/tasks/phase4_sequences_spec.rb runs db:setval_all_sequences; sequences survive
     rollback). PLAUSIBLE mechanism; keys confirmed present (23) with live TTLs.
  2. 13 audit-count failures in the rerun: CONFIRMED self-inflicted. My diagnostic `rails runner`
     calls in RAILS_ENV=test each wrote an AuditEvent (`type: rails/runner`, attributed to the
     local user) that is not rolled back, so exact-count specs fail. Lesson: never use
     `rails runner` against the test DB for diagnostics; it writes audit rows.
- Own errors so far (Rule 13 stop): pushed Group 1 regression; progress counts from log text (x2);
  test DB polluted by my runner audit rows.

### Remaining (next session / after Traci's go-ahead)
1. Clean the test environment, then one full guard-off run: `bin/rails db:test:prepare` (as in the
   2026-09 learnings entry) and clear the `lingolinq-stash-test` Redis namespace's `masq_audit/*`
   keys (or wait 30 min).
2. #3 Uploader credential checks (fix B, reviewed: 9 guards -> `remote_credentials?`), red test first.
3. #4 reset `Uploader.@remote_upload_config` before each example.
4. Test-isolation follow-ups found here: flush the test Redis namespace per run (or per example for
   dedupe keys); AuditEvent orphans.
5. Switch the guard on; then PR (needs /review-pr and /adversary-review, which only Traci can run).
6. Dotenv-conventions proposal for Scot.

## Session notes after the stop (Traci said continue)

- Test DB cleanup (Traci approved removing only my rows): the 5 `rails/runner` AuditEvents (ids 766,
  767, 1462-1464, identified by id and timestamp; `data` is encrypted so not readable in SQL) were
  deleted with `psql -d lingolinq-test` over the local socket, which writes no audit row. Table: 0.
- Masquerade dedupe keys had expired by the next check (`redis-cli --scan --pattern
  'lingolinq-stash-test:masq_audit/*'` -> 0).
- Local speed finding (not acted on): test and dev share Redis db0, 191,786 keys. spec_helper's
  per-example `Resque.redis.keys('sizeof/*')` / `keys('*_queue_size')` (spec_helper ~:84-85) are
  O(all keys), which plausibly explains local full runs slowing from ~7.5 to ~15 min. CI starts with
  an empty Redis. Candidate fix: SCAN with a match, or a separate Redis db for tests.

## #3 Uploader credential checks (committed)

- Fix B (reviewed by a subagent before editing: 9 guards, alternative A rejected because
  `Aws::S3::PresignedPost` does `'AWS4' + k_secret`, which raises on nil but not on ''):
  `Uploader.remote_credentials?(config)` (`.present?` on key and secret) replaces the 9
  `config[:access_key] && config[:secret]` guards in lib/uploader.rb. Helpers still return ''.
- Red first: uploader_spec "with no AWS credentials" (presigned_url_for_uploads -> nil,
  check_existing_upload -> {found: false}, no S3 client built) failed before (client built with
  access_key_id "") and passes after.
- Found on the way, from Group 1: uploader_spec `remote_upload_params` examples (:260, :280) failed
  when the file runs alone, also on the committed uploader.rb. spec_helper stubs
  `Uploader.remote_upload_params` whenever AWS_SECRET is blank (now always, CI and local), so these
  examples were not testing the real method; they passed in full order only because an earlier spec
  leaves AWS_SECRET set. Their `before` now uses `and_call_original`.
- Verified: uploader_spec alone 137/0; full suite guard off 7,796 examples, 0 failures; test DB 0
  audit rows after.
- Not changed (follow-up): `remote_upload_params` itself has no credentials check.

## #4 Uploader settings cache reset per example (committed)

- spec_helper's before(:each) resets `Uploader.@remote_upload_config`, so every example builds the
  S3 settings from its own ENV (transcoder_spec's temporary UPLOADS_S3_BUCKET used to leak into
  later uploads through the cache). Full suite guard off: 7,796 examples, 0 failures; no spec relied
  on a leaked cache.
- Local run times keep rising (19:45, 22:58): the Redis backlog below.

## Redis backlog (diagnosed; fix next)

- Measured: one `KEYS lingolinq-test:sizeof/*` takes ~52 ms server-side with 267,692 keys in db0;
  spec_helper runs two KEYS per example x ~7,800 examples ~= 13.5 min of a ~20 min local run.
- Sample of 100k keys: 97.5% `lingolinq-test:scheduled*` (job markers, ~4 h TTL) left by test runs;
  db0 is shared with development (namespaces from config/initializers/resque.rb:110-116:
  `lingolinq<sfx>`, `lingolinq-stash<sfx>`, `lingolinq-permissions<sfx>`, sfx `-test` in test).
- CI starts with an empty Redis, so the cross-run backlog is local only; within one run keys still
  build up (estimate ~1 min of a CI run, not measured).

## Redis backlog fix: clear the test namespaces once per run (committed)

- spec_helper `before(:suite)` deletes keys under the three test namespaces only (exact prefixes
  `lingolinq-test:`, `lingolinq-stash-test:`, `lingolinq-permissions-test:`; SCAN + UNLINK in
  batches). Refuses to run unless every namespace matches `lingolinq…-test`. (A first version used
  the glob `lingolinq*-test:*`; replaced because a glob `*` also matches ':' and could reach a
  development key containing '-test:'.)
- Full local run: 5 min 9 s (previous runs 19:45, 22:58). Non-test keys (40, development) identical
  before and after. ~32k test keys build up within one run (the CI-equivalent state).
- Tried first, NOT kept: clearing before EVERY example (4 min 43 s) exposed two hidden dependencies
  on Redis state earlier examples leave: worker_spec:10 (Worker.flush_queues clears `sizeof/<q>`
  only for queues already in Resque's registry, so with an empty registry the stale size survives)
  and board_caching_spec:118 (not diagnosed). Both pass with the committed spec_helper and fail with
  empty namespaces. Follow-up: fix those, then per-example clearing.
- Pre-existing flake (NOT caused by this branch): boards_controller_spec:502 (and :532) fail
  intermittently when the file runs: develop fabcd91cb 2/3 runs, this branch without the cleanup
  2/3, with it 1/2; usually passes in full order. Root cause not found (not the >500-board deferral;
  `all_shared_board_ids_for` compares `Time.now.to_i` with `boards_updated_at.round(2)`, a real
  precision mismatch but unlikely to explain ~50%). Needs its own investigation.

## Redis-state dependencies fixed; per-example Redis clearing (committed)

- worker_spec:10 (deterministic from an empty Redis): `Worker.flush_queues` only cleared
  `sizeof/<queue>` for queues in Resque's registry. It now also clears the app's known queues
  (`Worker::KNOWN_QUEUES = priority default slow whenever`). flush_queues has no non-spec callers.
- board_caching_spec:118 turned out NOT to be a Redis-state dependency: intermittent with and without
  per-example clearing (1/4 without). Same family as boards_controller_spec:502/:532 (develop 2/3).
  ROOT CAUSE (app/models/concerns/sharing.rb): the cached shared-board list is stamped with
  `boards_updated_at.to_f.round(2)` and served while stamp >= `boards_updated_at.to_f.round(2)`. A
  sharing change within the same ~10 ms as the list was built compared equal, so the stale list was
  served (in tests, Worker.process_queues runs jobs ms apart; in production rare, but it can keep a
  just-unshared board visible or hide a just-shared one until the next change). Experiment with
  round(6): 8/8 clean runs of the two files. Fix (Traci approved; independent review recommended the
  integer form): `Board.boards_updated_stamp(user)` = integer microseconds (to_i * 1e6 + usec),
  matching Postgres/Rails truncation; old float stamps compare lower and are rebuilt once.
  Red test (deterministic, list built with Time.now pinned at .120 s, change at .124 s): 4/4 red
  before, green after; positive control (cache hit when nothing changed) green both ways.
  Review also found a separate race (PLAUSIBLE, not fixed): sharing.rb (`user.boards_updated_at = Time.now` in all_shared_board_ids_for) stamps the list with this
  process's Time.now after reading links, so a share committing in between gets a too-new stamp.
- Per-example clearing (spec_helper before(:each) -> clear_test_redis_keys), keeping before(:suite).
- Verification: 4 full runs with all three changes: 0, 0, 1, 0 failures. The one failure is a
  pre-existing time-boundary flake, user_spec:4596 (2FA replay: `ts > 30.seconds.ago.to_i` fails
  when a 30 s TOTP window boundary passes mid-example). The four formerly intermittent specs did not
  fail once. Test DB 0 audit rows after each run; development Redis keys 40/40 untouched.
- Run times this morning (~16 min) are NOT comparable with last night's 4:43-5:09: the WSL disk is
  slow (iostat w_await 50-109 ms, a committed statement 162 ms); board_spec takes ~80 s with or
  without these changes vs 25 s last night.

## 2FA time-boundary flake (committed)

- user_spec valid_2fa? "should return false for a replayed code" (and, same weakness, "should return
  true for a valid code"): valid_2fa? accepts a code from the previous 30 s window for up to 15 s
  (`drift_behind: 15`, app/models/concerns/passwords.rb:125) and returns that window's start, so a
  window ending between making the code and checking it failed `ts > 30.seconds.ago.to_i`.
  Reproduced deterministically in a scratch spec (code at ...029.5 s, check 1 s later:
  "expected > 1800000000, got 1800000000"), then deleted.
- Fix: those two examples run inside `travel_to(mid_window)` (ActiveSupport TimeHelpers, a fixed
  instant mid-window); no assertion changed. valid_2fa? block 3/3 green, user_spec 426/0, full suite
  7,798 examples, 0 failures.

## Guard switched on (committed b990d73d3); stand-in adversarial review of the whole branch

- Guard on (`WebMock.disable_net_connect!(allow_localhost: true)`): full suite 7,798 examples,
  0 failures, 0 blocked requests.
- Review: four independent subagent reviewers in parallel (test env/config, application code, spec
  changes, production/security/claims). NOT the official /review-pr or /adversary-review, which are
  not available to this session.
- HIGH (two reviewers independently): the sharing cache's integer-microsecond stamp was written into
  the existing 'timestamp' key. Old code compares 'timestamp' with boards_updated_at.to_f.round(2),
  so every new entry looked fresh forever to old code: on staging (shares a database with dev) or
  after a production rollback, unshares would not be honoured. FIXED: the stamp lives under
  'stamp_us'; 'timestamp' is still written in the old float format; an entry without 'stamp_us' is
  rebuilt. Red tests (both directions) failed on the previous code, pass now.
- MEDIUM: with credentials missing, remote_remove / remote_remove_upload_path skipped deletes of user
  data silently. FIXED: error-level log (no path in the message), checked before remote_remove's
  checksum lookup (which otherwise answers "not found" and returns early). Tests added, plus one
  pinning signed_internal_url's pass-through without credentials.
- Found while verifying: uploadable_spec upload_to_remote examples failed alone (also on the
  committed code): spec_helper's remote_upload_params fallback replaces the method they test
  whenever AWS_SECRET is blank. Same fix as uploader_spec: `and_call_original` for that block.
- MEDIUM: stale spec_helper comment (said once per run, named two specs as still dependent). FIXED.
- MEDIUM (plausible): per-example Redis clearing walked the db three times. FIXED: one SCAN pass
  (`lingolinq*`) with an exact test-prefix check in Ruby; a decoy development key containing
  '-test:' survived; 40/40 development keys untouched.
- LOW fixed: KNOWN_QUEUES placed between flush_queues and its doc comment; dead
  Typhoeus::Expectation.clear hook; a wrong line reference in this log.
- Not changed, recorded: real keys can still reach local specs under `op run` (WebMock blocks the
  calls; local and CI diverge); fork PRs get empty CI secrets; a developer whose
  SECURE_ENCRYPTION_KEY is an op:// reference now fails loudly at boot; the sharing race at the
  `boards_updated_at = Time.now` stamp (pre-existing); `remote_upload_params` has no credentials
  check. Reviewers disagreed on whether test_environment_spec guards CI: it does (the template is
  committed, so CI loads op:// values).

## Official dual review (2026-10-09) and its follow-ups

- `/review-pr` (REVIEWED=range origin/develop 2096a9ca7 ... traci/perf/rspec-speed 78c0f1646, PII
  preflight exit 0) and `/adversary-review` (same SHAs). The senior pass's High (the new S3
  credentials check could switch S3 off where the SDK's default chain was in use) was REFUTED:
  `Uploader.s3_client` always passes explicit credentials (lib/uploader.rb:41-48) and every
  deployed service mounts AWS_KEY/AWS_SECRET (.github/workflows/deploy-cloudrun.yml:385).
- N1 (adversary, Medium): removing the `op://` placeholders changed which code CI runs. MEASURED
  instead of assumed: two full runs at 78c0f1646 with SimpleCov, A as committed (7,803 examples,
  0 failures, 17:54) and B with every scrubbed secret set to a fake value, mimicking develop's
  CI env with the guard on (70 failures, all NetConnectNotAllowedError). Lines covered only by B:
  16, none in lib/uploader.rb (the real remote_upload_params and S3 guards still run through
  uploader_spec/uploadable_spec). The 16 lines: AiWordPredictor#call_anthropic/#system_prompt,
  SessionController#google_link_complete's session_expired branch with GoogleOAuth
  .client_secret/.fetch_link, OpenSymbols token-request exception, Board's GOOGLE_TTS_TOKEN worker
  branch in enqueue_suggested_sounds_if_deferred, User#track_boards stale-ts skip.
- Fix (best practice, no placeholder values restored): 11 explicit examples with fake values and
  doubles; 9 went red against a temporary mutation of the line each guards (the 2 others are
  positive controls); mutations reverted.
- `.claude/rules/testing.md` added (was cited by spec comments but missing), mirrored in
  CLAUDE.md, AGENTS.md, .github/copilot-instructions.md.
- Not fixed here, recorded: N2 shared-board cache race (see PR body), N3 skipped remote delete
  no longer lands in Resque's failed list, N4 dotenv's Rails hook can re-add `op://` values from
  `.env` after the scrub (only in a test boot outside rspec: spec_helper requires dotenv before
  Rails, and dotenv 3.1.8 installs its Rails hook only when Rails is already loaded), N5 SafeHttp DNS lookups are not covered by WebMock.

## N2: shared-board cache race (unit 1 committed; unit 2 open)

- REAL, proven by deterministic tests in sharing_spec "an unshare that commits while the list is
  being rebuilt" (the unshare is run inside the rebuild, after links_for, via
  Organization.attached_orgs). Before the fix: stale list served as fresh after the unshare (red);
  a stale caller's rebuild stamped old links with a new time (red); when the unshare's jobs finish
  before the rebuild saves, the stale list survives the jobs (red); jobs running after the save
  heal it (green).
- Fact sheet: freshness read at sharing.rb:225-227; boards_updated_at writers user_link.rb:21,
  user.rb:2338 (update_all), sharing.rb:297 (Time.now, saved at :306), board_caching.rb:107;
  cache-entry writer sharing.rb:299 only. Root cause: the list was stamped with the save time
  (taken after the links were read) and that time was written to boards_updated_at, hiding any
  change that committed during the walk.
- Proposal reviewed by the adversary agent before editing. Its corrections, each verified in code:
  stamp with the caller's own boards_updated_at, not a fresh DB read (links_for keys its 24 h
  Redis cache on the caller's loaded updated_at, user_link.rb:97, so a fresh read could stamp old
  links with a new time); the existing microsecond test stopped guarding (verified: it passed with
  the stamp rounded to hundredths), so a new example pins the column instead.
- Unit 1 (committed): the `user.boards_updated_at = Time.now` assignment is removed; the stamp is
  the loaded value. Falsified: reverting it turns the 3 race examples red; rounding the stamp turns
  the new precision example red. sharing, board_caching, user_link, boards_controller specs: 334
  examples, 1 failure (the unit 2 example below, held out of the commit).
- Unit 2 (OPEN, High, already in production): the rebuild ends with `user.save(touch: false)` on
  the caller's in-memory user, and go_secure writes the whole `settings` column from that copy
  (persist_secure_object). A rebuild on a stale user therefore reverts any settings change made
  since it was loaded: the unshare job's new `available_private_board_ids` (restoring access to the
  unshared board; the job's RemoteAction rows are already gone), and potentially consent fields
  written concurrently. Red test kept uncommitted: "is dropped when the unshare's jobs finish
  before the rebuild saves" fails at `private_viewable_board_ids`. Candidate fix: persist only the
  cache entry onto a freshly locked row (`User.lock.find` in a transaction), or move the cache to
  Redis. Needs its own proposal review.
- Own errors this stretch (Rule 13 stop before unit 2): AGENTS.md edit aimed at text that lives in
  the Copilot file; testing.md suffix example used a digit the guard refuses; testing.md claimed
  the Redis suffix isolates parallel runs (the test DB is still shared: 4 spurious User.create
  failures beside a full run); a verification grep matched "examples," and missed "1 example".
  All caught before commit.

## Second adversarial review (commits c31c54f5c, 059d1f521) and its follow-ups

- Verdict: do not block. The sharing.rb change strictly reduces stale serving and rebuilds.
- Medium, fixed (Traci approved removal): the old clock-pinned microsecond example would have
  failed every run from 2027-01-15 08:00 UTC (`date -u -d @1800000000`): since unit 1 its first
  stamp comes from the real share time, not the pinned clock. Removed; the column-pinned example
  ("rebuilds after a sharing change in the same hundredth of a second") covers the same precision.
- Low, fixed: the stale-caller example now asserts the stale rebuild ran (its stored stamp_us is the
  stale caller's); testing.md says `travel_to` needs `include ActiveSupport::Testing::TimeHelpers`
  and warns against fixed instants racing the real clock; the new OpenSymbols example uses env_wrap.
- Low, recorded, not fixed (separate unit): `UserLink.links_for` caches 24 h under
  `updated_at.to_f.round(3)` (user_link.rb:97) and `touch_connections` never invalidates it, so a
  sharing change within the same millisecond as the user's previous updated_at write can be read
  from the old links. Same family as the precision bug, one layer down.
- Low, not changed: CLAUDE.md says it is kept under 200 lines; it is 232 on develop, 233 here.
  Pre-existing; trimming it is a governance edit for Scot.

### Unit 2 red example (kept here so it cannot be lost; uncommitted in sharing_spec)

Inside `describe "an unshare that commits while the list is being rebuilt"`:

```ruby
      it "is dropped when the unshare's jobs finish before the rebuild saves" do
        b, u2 = shared_board_setup
        unshare_mid_rebuild(b, u2, run_jobs: true)

        Board.all_shared_board_ids_for(User.find(u2.id), false)

        expect(@unshared_mid_rebuild).to eq(true)
        expect(Board.all_shared_board_ids_for(User.find(u2.id))).to eq([])
        expect(u2.reload.private_viewable_board_ids).not_to include(b.global_id)
      end
```

At 059d1f521 it fails on the last line: the rebuild's save restores the unshared board in
`available_private_board_ids`. Since unit 1 the `?shared` list heals on the next read, so that list
is no longer a symptom; the access list still is.

## Unit 2: the rebuild no longer saves the caller's whole settings copy (uncommitted until run D)

- Option B (move the cache to Redis) REJECTED after reading history: 680c09e47 (2019, "move share
  cache from redis to db") moved it out of Redis the same day as 117de85de ("prevent storing large
  data blocks in redis cache"); lists reach 10,000 ids. Reversing it risks Redis memory pressure.
- Red first (all CONFIRMED red on 059d1f521): the unshare's job removes the board from
  `available_private_board_ids` and the rebuild's save restores it; a preference saved by another
  process mid-rebuild is wiped; the rebuild writes into the caller's in-memory settings.
- Proposal A reviewed by the adversary agent before editing: no caller regressions (every caller
  checked; the rebuild's save was never another caller's only save), same callbacks, no
  transaction wraps a caller, single-row lock so no ordering deadlock.
- Fix: the cache check reads with `dig` (no mutation); the entry is stored by
  `Board.store_shared_board_ids_entry` onto `User.lock.find_by` inside a transaction, only the
  entry changed, `save(touch: false)`. The caller's object is never changed or saved.
- Falsified: reverting the fix turns exactly the 4 unit-2 examples red; removing only `.lock` turns
  only the lock example red (it asserts `SELECT ... FOR UPDATE` on users precedes the UPDATE).
  sharing_spec 62/0.
- Review findings not acted on (Low): a stale caller still stores an entry that is already stale
  (one extra row lock and settings re-encrypt; never serves stale); the row lock is held through
  generate_defaults (Redis DEL, billing queries) with no lock_timeout (ms in normal operation).
- NEW, reported by the review, NOT fixed, separate investigation (High, PLAUSIBLE, pre-existing
  since 2019): org membership links (org_user/org_manager/org_supervisor) bump only updated_at in
  `UserLink#touch_connections` (user_link.rb:19-23), not boards_updated_at, but the viewing list
  includes private org home boards (sharing.rb:236-241). After a student is detached from an org,
  the cached list (and the available_private_board_ids built from it, board_caching.rb:60) can keep
  the former district's private home boards: cross-district access. Needs its own red test.
- Run D (full suite with unit 2, guard on): 7,821 examples, 1 failure, 51 pending (17 min 6 s).
  The failure, json_api/board_version_spec.rb:234 "should include button labels" (version [2]
  action "updated", expected "modified buttons"), is NOT caused by unit 2: a tracer prepended to
  Board recorded zero calls to all_shared_board_ids_for / store_shared_board_ids_entry across that
  file, and the file passed 3/3 alone with unit 2 and 3/3 alone without it. Versions are ordered by
  id (secure_serialize.rb user_versions), so not a timestamp tie. Earlier full runs on this branch
  passed it. Intermittent in full order only; root cause not diagnosed (follow-up).

## Board history labels: the run D failure, diagnosed and fixed (uncommitted until run E)

- json_api/board_version_spec.rb:234 failed in run D only. CONFIRMED mechanism with a controlled
  reproduction (travel_to gaps): edits 0.2 s apart label the admin edit "modified buttons", 2 s
  apart "updated". Board#generate_defaults dropped an edit's own @edit_description whenever the
  previously stored description was more than 1 s older (board.rb ~877-880). A real production
  bug: in version history roughly every other ordinary edit showed "updated".
- My first diagnosis (the check guards stale @buttons_changed-derived descriptions) was WRONG,
  caught by the proposal review: the 1 s check is in the first public commit (869c59c2f, 2016);
  the derived block came in 541e5c77b (2021). The check's purpose is undocumented, and it gives an
  explicit description no protection (an older explicit timestamp makes it less likely to fire).
- Fix: an @edit_description set for this save (process_params, update_privacy) is always kept;
  the derived-from-@buttons_changed description keeps the old 1 s comparison unchanged. The
  review's High: update_privacy stored notes as a String ('batch set to public') and build_json
  calls .join on notes, so the history endpoint raised NoMethodError for that version; keeping the
  description always would have made that certain. Fixed both ends: update_privacy stores an Array;
  build_json uses Array(notes) for versions already stored with a String.
- Red first, then falsified per piece: "keeps the description of an edit made seconds after the
  previous described edit" (board_spec), "lists a version saved by the batch privacy change" and
  "labels a version whose stored notes are a single String" (board_version_spec). The 2 s timing
  reproduction now labels "modified buttons". board_spec + board_version_spec 310/0.
- Follow-ups recorded, not fixed: derived labels (rollback, translated, swapped images,
  suggested sounds) can still be dropped by the 1 s comparison; update_privacy's note says
  "public" for private and unlisted too; inline suggested sounds reload the board inside
  before_save (PLAUSIBLE loss of the outer save's settings).
- Own errors this stretch: the stale-caller assertion that could not distinguish old from new
  code (compared against an object the old code mutates); the wrong staleness diagnosis above.

## Run E: 7,824 examples, 1 failure (a test bug, pre-existing)

- sharing_spec.rb:814 expected `[b, b3, b4]` ids in creation order but compared them with a
  `.sort`ed actual list; global ids are strings, so `["1_997","1_999","1_1000"].sort` is
  `["1_1000","1_997","1_999"]`. It fails only when the example's ids straddle a digit boundary,
  which depends on how many records earlier specs created (new specs moved it into range).
  Fixed (Traci approved, this example only) with `contain_exactly`.
- NOT fixed, recorded (Traci: no grand sweep): ~30 other assertions sort actual ids and compare
  with an unsorted multi-id list (grep `\.sort)\.to eq(\[[a-z0-9_]+\.global_id`): sharing_spec
  729/751/773/792/870, boards_controller_spec 304/529/766/821/936/999/1026, user_spec
  2479/2501/2546, organization_spec 539/3320, subscription_spec 2167, lesson_spec 451,
  word_data_spec 1022, organization_unit_spec 263, renaming_spec 331, sharing_spec 1107/1118.
  Each can fail the same way when its ids cross 999/1000 or 9999/10000. Fix one at a time if seen.
