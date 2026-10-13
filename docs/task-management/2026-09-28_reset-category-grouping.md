# 2026-09-28: Turn Categories grouping off for every account, and keep it off

Branch: `traci/fix/reset-category-grouping` (from develop `b5cfb2c55`). Carries the Categories
"Coming Soon" work moved from `traci/styling/classic-view-overlay` (see
`2026-09-28_categories-coming-soon.md`) so the flag-off, the page, the reset and the guard land together.

Request (Traci): a script that runs on deploy, finds every user in the database it runs against,
and turns `board_category_grouping` off. There are no real users yet. Remove it once the feature is
built and turned on. Chosen options: reset AND a write guard; new branch from develop.

LEARNINGS consulted: learnings-archive/2026-09.md:430 (a stray account-wide `true` that the switch
could not clear), :454 (order resolved in two places). Neither changes the plan; :430 is why the
guard sits on the server rather than trusting the client.

## Fact sheet

**(a) Where is `enabled` READ?**
- `components/board-detail-grid.js:82-95` `groupingEnabled`: flag first, then
  `referenced_user.preferences.board_category_grouping.enabled === true`. CONFIRMED.
- `controllers/user/board-detail.js:6973-6978` `categorize_enabled`: `=== true`. CONFIRMED.
- Server: only the tripwire `User#log_board_category_grouping_enable!` (`user.rb:3281`). CONFIRMED.
- So only the TOP-LEVEL `enabled`, and only the exact value `true`, turns grouping on. Per-board
  `boards[x].enabled` is never read (dropped by the sanitizer, `user.rb` `include_enabled` false).

**(b) All shapes of `settings['preferences']['board_category_grouping']` and their writers**
- absent: user never saved preferences since the key existed. Backfilled by `generate_defaults`
  (`user.rb:1973`, the loop at `:2064-2066`) to `{'enabled'=>false,...}` only when nil.
- Hash with `enabled` true / false: `process_params` PREFERENCE_PARAMS loop (`user.rb:2778-2795`)
  stores verbatim, then `sanitize_board_category_grouping!` (`user.rb:2820`) rebuilds it with a
  boolean `enabled`. CONFIRMED.
- Hash with `enabled` as the string "true"/"false": stored before the sanitizer existed (its header
  comment, `user.rb:3166-3172`). Frontend reads a string as off. Reachable in old rows only.
- Non-hash: the sanitizer deletes it; frontend reads `.enabled` of it as undefined (off).
- `rake lingolinq:seed_board_category_grouping` (`lib/tasks/lingolinq.rake:107-163`) never sets
  `enabled` true: it normalises `grouping['enabled'] == true`. CONFIRMED.
- Writers of `true` today: only `process_params` from a client. The client sends the whole
  `preferences` hash on every user save (tripwire comment `user.rb:3290-3300`), so a stale or
  offline client can re-send `true` after a reset. That is what the guard is for.

**(c) Cross-file claims**
- The flag is out of AVAILABLE and ENABLED on this branch (`lib/feature_flags.rb:47`, `:142`), and
  `FeatureFlags.frontend_flags_for` only iterates AVAILABLE (`lib/feature_flags.rb:189`), so
  `feature_enabled_for?('board_category_grouping', u)` is false for everyone. CONFIRMED, and pinned
  by `spec/lib/feature_flags_spec.rb` "resolves OFF ... stored default Setting".
- Deploy runs `rake db:migrate` in a Cloud Run Job before the web revision takes traffic
  (`.github/workflows/deploy-cloudrun.yml:800-817`, `.claude/rules/deploy.md`). The Job gets
  `BOOT_SECRETS` including `SECURE_ENCRYPTION_KEY` and `REDIS_URL` (`deploy-cloudrun.yml:351`), so it
  can load and save a `secure_serialize`'d User. CONFIRMED.
- dev and staging share one database (`.claude/rules/deploy.md`), so this runs there on the develop
  deploy, and on production on the main deploy.
- CI builds the test DB with `db:schema:load` (`.github/workflows/ci.yml:83`), so the migration body
  never runs in CI; its logic must be unit-tested through the class it calls.
- `User#save` side effects: `generate_defaults` (backfill, same as any login), `track_boards`
  no-ops without `@do_track_boards` (`user.rb:2184-2187`), `notify_of_changes` acts only on password
  and similar flags. CONFIRMED. CORRECTED after review: PaperTrail records a version only when a
  whodunnit is set and does not start with "job" (`user.rb:44-45`), and a migrate Job sets none, so
  the reset sets its own whodunnit.

## Proposal

**Reset.** `lib/board_category_grouping_reset.rb`, one module method `run` that walks
`User.find_each`, and for each user whose top-level `enabled` is present and not exactly `false`,
sets it to `false`, keeps every other sub-key, and saves. Returns counts. A migration
`db/migrate/20260928120000_reset_board_category_grouping.rb` calls it in `up`; `down` is a no-op
(the prior per-user value is not worth restoring and cannot be, since grouping is unreachable).
A per-user failure is rescued and counted so one bad row cannot fail the deploy; the migration
prints counts and failed global_ids only, never names or settings.

**Guard.** In `sanitize_board_category_grouping!`, before the tripwire, force `enabled` to false
unless `FeatureFlags.feature_enabled_for?('board_category_grouping', self)`. The flag check runs only
when the incoming value is true, so ordinary saves pay nothing. While the flag is out of every list
this blocks everyone; once it is re-registered for beta opt-in, it lets exactly the flagged users
through, so it does not need to be removed first to test the feature.

Alternatives considered:
- One-time reset only: rejected by Traci; a stale client re-enables it (fact (b)).
- A rake task run by hand: needs someone to run it on each environment, and `rake` is not audited
  (CLAUDE.md, finding LL-7f7372e3eb). The migration runs itself on every environment once.
- `update_column` instead of `save`: skips callbacks and PaperTrail; `save` is the path every other
  preference change takes (see review M1 and M2 below for what it does and does not do).
- Guard in the frontend: the server is the only place every writer passes through.

Risks:
- The migration uses the live `User` model. If `User` changes later, a fresh environment replaying
  migrations could break; mitigated because new environments use `db:schema:load`, and the file is
  to be deleted when the feature ships.
- `updated_at` bumps for every reset user; `sync_stamp` does not (review M2).
- Guard adds a flag lookup on the rare save that sends `enabled: true`.

Unresolved: none blocking. Whether production has any rows with `enabled` true is unknown and does
not matter: the reset is idempotent and a no-op when there are none.

Tests (red first):
- `spec/lib/board_category_grouping_reset_spec.rb`: true -> false with sub-keys kept; "true" string
  -> false; false untouched and not re-saved; absent and non-hash untouched; counts; idempotent.
  Mutation: make `run` skip the save -> red.
- `spec/models/user_spec.rb`: `process` with `enabled: true` stores false while the flag is off;
  stores true when `feature_enabled_for?` is stubbed on. Mutation: remove the guard -> first red.

## Proposal review (one adversarial agent; each finding checked by me)
- H1 CONFIRMED: `user_spec.rb` "preserves both sub-preferences through a save" asserts `enabled`
  stays true, which the guard changes by design (Traci chose the guard). Its assertions are kept
  unchanged; that describe block now runs as a user who has the flag (a `before` stub), which is the
  only user who may still store it on. The guard's own block covers users without the flag.
- H2 CONFIRMED mechanism: the old revision serves during the migrate Job and has no guard, so a
  save there can re-store `true` until cutover. Inert while the flag is off. Accepted; the flag's
  IN PROGRESS note now says to re-run the reset before re-registering the flag.
- M1 CONFIRMED: PaperTrail claim was wrong (see (c)). The reset sets `WHODUNNIT`; spec pins a version.
- M2 CONFIRMED: `updated_at` does not change `sync_stamp` (`lib/json_api/user.rb:38`), so the claim
  that devices refetch was dropped. The guard covers stale clients instead.
- M3 CONFIRMED: a Postgres error aborts the migration's transaction for every later row. Each save
  now runs in a savepoint; the spec raises a real SQL error, and fails without the savepoint.
- M4 CONFIRMED: `spec_helper.rb:21-22` `check_all_pending!` with `db:schema:load` in CI. `schema.rb`
  version bumped to `2026_09_28_120000` (that line only; a local `db:migrate` also re-dumped an
  unrelated index expression from the local Postgres version, which was reverted).
- M5 CONFIRMED: the nested `enabled` is not coerced before the rebuild; the guard reads the rebuilt
  value, and the spec covers `true`, `'true'`, `1`, `'1'`.
- L4: the reset clears choices beta users may have made on staging (the live environment). Traci
  confirmed there are no real users yet; stated in the PR.

## Verification
- Red first: guard spec failed "true was stored as true"; reset spec failed on the missing module.
- Green: reset 6, guard 3, sanitizer 5, feature_flags all; 21 targeted examples, 0 failures.
- Falsified and restored from my own copies: guard removed -> guard spec red; reset skips the save
  -> 5 of 6 red; savepoint removed -> the failure-isolation spec red.
- `user_spec.rb` + `feature_flags_spec.rb` + reset spec: 462 examples, 11 failures, all in
  `add_premium_voice` / `track_protected_source` asserting `AuditEvent.count` (got 7, orphaned rows
  in the local test DB, CLAUDE.md Testing note). Same failures with develop's `user.rb`: baseline.
- Migration run against the local TEST database: "turned off for 0 user(s); 0 failed []".
- Frontend (worktree, Node 22): `ember test --filter "categor"` 101/101 incl. the Coming Soon
  integration test; `lint:hbs` clean; ESLint gate new=0. (A first run reported new=2 in
  `dashboard/authenticated-view.js` because the whole `node_modules` was symlinked to the main
  checkout, so the lint plugin indexed that checkout: learnings-archive/2026-09.md, "a worktree
  that borrows another checkout's node_modules". Relinked per entry; the 2 were not real.)
- i18n: the 18 `categorize_soon_*` keys added to all 13 locales. The generator also reordered two
  unrelated keys and dropped `view` from en.json; those were left out so the diff is only these keys.

## Final diff review (second, independent agent)
- No Critical or High. Taken: rollout traps in the flag note (canary and stored Settings reach more
  than beta, `lib/system_feature_settings.rb:6-30`); the guard checks the preference owner, noted in
  its comment; stale `board-detail-grid.js` comment (same line count, so `.eslint-todo` is unshifted);
  an undecryptable row is now counted rather than failing the deploy; four wrong line citations.
- Not taken: the Coming Soon badge is 15px (the block's 17px floor is for body copy; a badge is a
  label); version history shows "Unknown User" for the migration whodunnit (`lib/json_api/user_version.rb`),
  cosmetic.

## Status
- [x] proposal review  - [x] red tests  - [x] fix  - [x] falsified  - [ ] preflight  - [ ] PR
