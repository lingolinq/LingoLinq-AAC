# 2026-10-28: Demo School District for nonprod, varied usage, rooms and caseloads

Branch `claude/demo-district-rolling-activity-uhzmsk`, from develop at a01becefd. Follows #1170
(rolling refresh) and #1177 (spec flake).

## Why

- The one-off flag-and-backfill on nonprod refused. Nonprod's demo org (`1_2`) is named "Demo",
  not "Demo School District".
- A read-only lookup (execution `lingolinq-migrate-dev-wc7qq`) showed that org has 6 members and
  `demo_org_emails=0`. Flagging it would have written nothing, because refresh! only writes for
  `@demoschooldistrict.org` users.
- Scot chose to build a separate synthetic district in nonprod and leave "Demo" alone.
- Scot also asked for the demo data to vary by student:
  - some daily users and some very sporadic;
  - one student who only uses the device at lunch (Mon-Fri at noon, the only time staff model)
    plus a Thursday 2 PM speech session;
  - full heat-map coverage for some students and a visual-impairment pattern (no top right) for
    others;
  - modeling that shows in reports;
  - enough per-student data that rooms, caseloads and the org dashboard are populated.

## Facts (CONFIRMED unless marked)

- **The seed can't build a second district.** `db/seeds.rb` reuses `Organization.find_by(admin:
  false)`, and `organizations.admin` is uniquely indexed (`db/schema.rb`, `index_organizations_on_admin`).
  Running the seed on nonprod would overwrite "Demo" in place, so a second district has to be
  stored with `admin` nil.
- **The seed's board lookup never matches.** `Board.find_by(key: 'demo_district_home')` misses
  because board keys are `<user_name>/<suggestion>` (`app/models/concerns/processable.rb`
  `generate_board_key`). This is pre-existing and preserved as-is, but flagged in the PR.
- **Creating the users sends no email.** `User.process_new` for a new user sets neither
  `@password_changed` nor `@email_changed` (`app/models/user.rb` `process_params`), and
  `Organization` / `OrganizationUnit` call no mailer.
- **Room supervision links are asynchronous.** They come from `OrganizationUnit#add_communicator`
  → `schedule(:assert_supervision)`. refresh! picks a session's author from the student's
  supervisors (`author_for`), so a backfill run straight after creation would have credited the
  modeling to the students themselves. `create_district!` therefore calls
  `assert_supervision!` synchronously.
- **What the screens read** (from a delegated survey, with the key claims re-checked here):
  - Org dashboard: 'session' rows plus WeeklyStatsSummary (`Organization.usage_stats`), and
    `primary_goal.last_tracked` for the Goals tile.
  - Rooms: `units_controller#stats` reads supervisor rows from each SLP's 'daily_use'
    LogSession `data['days']` and goal faces from 'note' rows with `goal_id` and `score`.
  - Caseload: shows goals, not usage (`lib/json_api/user.rb` supervisee fields).
- **The client's daily_use shape** is `{date, activity_level 0-5 by minutes (>=60, 30, 15, 5, >0),
  active: minutes>=30, models: int, modeled: [words]}` (`app/frontend/app/services/stashes.js`
  `track_daily_use`, `track_daily_event`). `LogSession.process_daily_use` merges days by date.
- **Logging a goal note moves `primary_goal.last_tracked`.** `LogSession#schedule_summary`
  schedules `UserGoal#update_usage` on the slow queue, and refresh! also calls it directly.
- **Stats can be read without S3.** LogSession offloads only `data['events']` to S3
  (`extra_data`), so `data['stats']` is safe to read when rebuilding supervisor days.

## Change

- **`lib/demo_district/seeder.rb`:** seed sections 2-6 plus the student-preferences block, now
  used by `db/seeds.rb`.
- **`DemoDistrict.create_district!(password:)`:** a guarded builder for a fresh, flagged district.
  It refuses if any org is already flagged, if an org already has the name, or if any of the
  district's user names is taken.
- **UsageGenerator:**
  - schedules (`:daily`, `:sporadic`, `:lunch_and_speech`);
  - a `:top_right_blocked` heat profile;
  - per-student `heat` and `modeling_rate`.
  - Index-based heat assignment is pinned to the original five profiles.
- **refresh!:**
  - creates a primary goal for a demo student who has none;
  - writes goal check-in notes on the student's cadence;
  - rebuilds SLP daily_use days for every date it touched plus the last 14.
- **db/seeds.rb** also records SLP daily_use for its 90 days.

## Not done

- Org `supervisor_models` needs `org.settings['supervisor_profile']`.
- Room per-week `goals` counts need 'session' rows with `goal_id`.
- Badges, `org_status` and `recent_profiles` history aren't generated.
- The seed still creates no goals; refresh! adds them.

## Verification

- RSpec could not run in this session: Ruby 3.4 downloads are blocked by the session's network
  policy (403), and only Ruby 3.3.6 is installed. All files pass `ruby -c`. CI runs the full suite.

## Independent review (local subagent, read-only) and dispositions

No Critical or High findings.

**Medium (all fixed):**

- **M1:** the goal-note cursor query could not use an index. It now filters by `user_id`, so the
  `(user_id, goal_id)` index serves it.
- **M2:** `create_district!` could adopt an existing board with the district's key. It now
  refuses instead.
- **M3:** a killed backfill left permanent gaps in goal notes and SLP daily activity. Both are now
  rebuilt from what is stored rather than what one run remembers:
  - goal notes cover every day with sessions since the goal's latest note, on the caught-up path
    too;
  - SLP days fill any date in the backfill horizon where the SLP authored sessions or notes but
    daily_use has no entry.
  - A spec simulates the killed run.

**Low:**

- **Fixed:**
  - L1: `create_district!` reloads each student before setting preferences. The seed keeps its old
    behaviour (no reload), since it is a refactor.
  - L2: rooms are reloaded before `assert_supervision!`.
  - L5: goal-note and goal-creation failures now count as refresh failures. Since the notes now
    catch themselves up, a later run retries them.
- **Accepted:**
  - L3: the daily rebuild overwrites `models`/`modeled` for an SLP day that a presenter used live
    in the last 14 days.
  - L4: lunch modeling is credited to the room's SLP; the district has no classroom-staff
    accounts.
  - L6: in production, changed profiles switch pattern from the backfill on.

## Follow-up: demo account email is off (dual review)

Demo accounts are shared logins and never need mail, so their email is now off.

- **Facts (CONFIRMED):**
  - `settings['email_disabled']` is read by `Api::UsersController#forgot_password` (it filters
    disabled accounts before scheduling the mail) and `Notifiable#channels_for`.
  - Its only other writer is `UserMailer.bounce_email`, via `Processable#update_setting`, and
    nothing clears it.
  - `update_setting` refuses a stale copy (`assert_current_record!`) and queues the change
    instead, so the flag must be written before `add_supervisor` / `add_user`, which save the
    user through a copy they load themselves.
- **Change:**
  - `Seeder.disable_email!` sets the flag and drops outstanding reset codes, only for an
    `@demoschooldistrict.org` account.
  - `build!` calls it on each account before linking it, so `db/seeds.rb` and `create_district!`
    both get it.
  - `DemoDistrict.disable_demo_emails!` covers accounts created earlier. It reloads each
    account before writing and logs, rather than stops on, one saved elsewhere mid-run.
  - The runbook adds it to the production flag-and-backfill command.
- **Verification:**
  - Red first: 3 new examples failed before the change.
  - `spec/lib/demo_district_spec.rb` plus `spec/lib/demo_district/usage_generator_spec.rb`:
    40 examples, 0 failures (local, private test DB).
  - Mutations, each red then restored: dropping the `build!` call, dropping the
    `demo_email?` guard, dropping the reset-code clear.

## Follow-up: second dual review

- **Facts (CONFIRMED):**
  - `create_district!` checked the user names, then `Seeder.build!` looked each one up again and
    reused whatever it found, with no lock around either.
  - The supervisor daily-activity queries selected by author only, so a session an SLP authored
    for someone outside the district reached the room's modeled words
    (`Api::UnitsController#stats` reads the SLP's `daily_use` log unscoped).
  - `Board#generate_board_key` always prefixes the owner's user name, so the district board is
    `sarah_chen_slp/demo_district_home`; the lookup by `demo_district_home` never matched, and
    each seed rerun made another board.
  - `mail_message` takes its channel from the caller label, which on Ruby 3.4 is
    `UserMailer#password_changed`, so the `channels_for` exemption list never matches and those
    notices honour `email_disabled`.
- **Change:**
  - One Postgres advisory lock (`DemoDistrict::LOCK_KEY`) around `refresh!`, `create_district!`
    and `flag_organization!`, taken and released on one connection. A busy `refresh!` returns
    `{ skipped_busy: true }`, which `scheduler:dispatch` reports as done.
  - `Seeder.build!` takes a required `adopt:`. `create_district!` passes `false`, which refuses an
    existing user or board, and takes the demo flag off a district it could not finish.
    `db/seeds.rb` passes `true`.
  - `refresh!` turns email off for the flagged org's demo members on every run, and
    `Seeder.disable_email!` clears reset codes on an account whose email is already off.
  - Both supervisor queries take the demo communicators' ids.
  - `Seeder.board_key` is the real key, used by `build!` and by the `create_district!` guard.
  - The runbook wording matches the code: what carries `seed_marker`, the AuditEvent the
    listing step writes, and email-off before flagging.
- **Verification:**
  - 10 new or changed examples, plus one existing call given the new keyword. Four were red
    at head for the defect itself: email-off, adoption, reset codes and the scheduler abort.
    Six were red only because the new constant, method or keyword did not exist yet, so the
    mutations below are their real proof.
  - Three files (`demo_district_spec.rb`, `usage_generator_spec.rb`, `tasks/scheduler_spec.rb`):
    56 examples, 0 failures.
  - Mutations, each red then restored from git:
    - drop the refresh email-off;
    - drop the lock, or drop its release;
    - pass `adopt: true`;
    - drop either supervisor filter;
    - restore the old skip;
    - restore the old board lookup, or the old guard key;
    - drop the scheduler busy branch;
    - drop the unflag.
- **Not done:** two mailers outside this module ignore `email_disabled`. They are app-wide and
  outside this PR.

## Follow-up: environment guard on create_district! (round-1 F2)

- **Facts (CONFIRMED 2026-10-29):**
  - `RAILS_ENV=production` on the prod and both nonprod migrate jobs (`gcloud run jobs describe`), so
    `Rails.env` cannot tell them apart.
  - Cloud Run sets `CLOUD_RUN_JOB` to the job's name, and the runtime contract's variables are
    reserved (docs.cloud.google.com/run/docs/container-contract). `bin/docker-entrypoint` ends in
    `exec "$@"` and keeps the environment.
  - Nonprod's migrate jobs are `lingolinq-migrate-dev` and `lingolinq-migrate-staging`; no prod job
    has either name. Job names are unique only per project (`lingolinq-utility-dedupe-dryrun` is in
    both).
- **Change:** `create_district!` refuses unless `CLOUD_RUN_JOB` is in `DemoDistrict::NONPROD_JOBS`
  or it runs under specs. The development environment is not exempt: a local shell can point
  `DATABASE_URL` at another database. The runbook marks the build branch nonprod only and warns
  against reusing those job names in prod.
- **Rejected:** an operator-supplied opt-in variable (it travels with a copied command, so the code
  still could not tell environments apart), and a `DEFAULT_HOST` check (its values are secret refs,
  unverified here).
- **Verification:** 2 of 4 new examples red at a1639f9bc ("nothing was raised"); the 2 nonprod
  examples guard against an over-strict check. Three files: 60 examples, 0 failures. Mutations, each
  red then restored: drop the guard; allow `lingolinq-migrate`; drop `lingolinq-migrate-staging`;
  treat an unset job as nonprod.
- **Not covered:** `db/seeds.rb` builds the district through `Seeder.build!` with its own
  `SEED_DEMO_DATA` opt-in, outside this guard.

## Follow-up: third dual review

- **Facts (CONFIRMED):**
  - `create_district!` saved the org with `demo_data` on before building, and its cleanup ran only from
    `rescue => e`, which a timeout (SignalException) or a killed job never reaches.
  - `Processable#generate_unique_key` gives a numbered name when the requested one is taken, and
    `Seeder.build!` checked only that the account saved.
  - `author_for` returned the latest session's author on a demo email alone, without the
    `org.supervisor?` check its fallback branch has.
  - `turn_email_off` had no per-member rescue and runs before any student is processed.
- **Change:**
  - The flag goes on only after the build, students and supervision links are done;
    `unflag_partial_district` was removed as dead.
  - `Seeder.refuse_renamed!` stops the build when a user name or the board key came back
    numbered. It runs after the account's email is off, so a numbered account left behind has none.
  - `author_for` requires `org.supervisor?(author)`.
  - A member that fails in the email-off step is reported as a refresh failure at the end.
  - The runbook says a half-built org is left unflagged and must be removed, not flagged.
- **Verification:** 6 new examples, all red against the previous code. Three files: 66 examples,
  0 failures. Mutations, each red then restored from git: flag set up front; drop the SLP, student
  or board name check; student check before email off; drop the org-supervisor check; drop the
  per-member rescue.
- **Not done (Low, tracked in the review record):** busy spec for `flag_organization!`, release
  check after a successful refresh, a cap on goal-note catch-up, the lunch-modeling rate spec, and
  an alert on repeated busy skips.
