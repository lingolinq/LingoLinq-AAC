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
