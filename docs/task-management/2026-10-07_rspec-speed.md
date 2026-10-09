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
