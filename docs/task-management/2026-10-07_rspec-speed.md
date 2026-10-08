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
