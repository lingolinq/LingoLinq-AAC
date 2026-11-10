# Demo School District: rolling activity

The Demo School District is a synthetic org for demos: 3 SLPs, 20 student communicators, and 3
rooms. `DemoDistrict.refresh!` (`lib/demo_district.rb`) keeps its reports current. It runs every
morning at 6 AM UTC from `scheduler:dispatch` (`refresh_demo_district`), and `rake demo:refresh`
runs it by hand.

## What it writes, and for whom

It writes only into the one organization flagged `settings['demo_data'] == true`, and only for
members whose email ends in `@demoschooldistrict.org`. Anyone else is skipped and logged.

## Demo account email is off

The demo accounts are shared logins, so their email is off (`settings['email_disabled']`),
which stops password reset email and the notifications that check that setting. The seed and
`create_district!` turn it off as they create each account, and each daily refresh turns it off
for any demo member added to the org since. Accounts created before that (an environment
seeded earlier) need `DemoDistrict.disable_demo_emails!` once. It covers
the 23 demo user names and any `@demoschooldistrict.org` member of the flagged org, leaves any
other account alone, and is safe to rerun:

```bash
--args='exec,rails,runner,pp DemoDistrict.disable_demo_emails!'
```

For each demo student, it fills every school day from their latest session through the last
finished school day (America/Los_Angeles), with these rules:

- **Session times:** between 8am and 3pm, and only on the days the student's schedule allows (see
  "Who shows what" below).
- **Goals:** a student with no primary goal gets one from their SLP. A goal check-in note is then
  logged every 3 to 10 days.
- **SLP activity:** each SLP's daily activity log is rebuilt from the sessions and notes they
  authored. The room pages read it.
- **Reports:** weekly summaries are rebuilt for every week touched.

Every session and goal note it writes carries `seed_marker = 'DEMO_DISTRICT_ROLLING'`. A day that
already has one is skipped, so reruns are safe. The primary goals, SLP activity days and SLP
devices it adds carry no marker.

Two demo runs never overlap: `refresh!`, `create_district!` and `flag_organization!` share one
database lock. A refresh that finds another run in progress does nothing, and the scheduler
reports it as skipped, not failed.

## Who shows what

The profiles live in `DemoDistrict::UsageGenerator::STUDENT_PROFILES`.

| Student | What to demo |
|---|---|
| Isaac Thompson | Lunch-and-speech schedule: one lunchtime session each weekday, heavily modeled, plus a Thursday 2 PM speech session. Full-board heat map. |
| Aiden Parker, Mason Clark, Sam Mitchell | Sporadic use: about 3 school days in 10. |
| Hannah Lee, Quinn Taylor | Visual impairment: no touches in the top right of the board. |
| Aiden Parker, Fiona Davis, Kevin Anderson, Penelope Scott | Full-board heat map. |
| Penelope Scott | Heavy modeling (40% of presses). |
| Everyone else | Daily use at their own frequency (low, medium or high), with their own heat-map pattern. |

## Turning it on in an environment

The daily job does nothing until an org carries the flag. Run each one-off through the
environment's migrate job, with `rails runner`, so the console guard records an AuditEvent.
Set `USER_KEY` to your own email.

**Before writing anything,** list the candidate orgs. This step changes no data; like every
runner, it writes one AuditEvent:

```bash
gcloud run jobs execute <migrate-job> --project <project> --region us-central1 --wait \
  --update-env-vars=USER_KEY=<your email> \
  --args='exec,rails,runner,Organization.find_each { |o| next if o.admin; s = o.settings || {}; nm = s["name"].to_s; us = (o.users + o.supervisors + o.managers).uniq; em = us.map { |u| (u.settings || {})["email"].to_s.strip.downcase }; exact = em.count { |e| e.end_with?("@demoschooldistrict.org") }; near = em.count { |e| e.include?("demoschooldistrict") }; next unless nm =~ /demo/i || near > 0; puts "DEMO_ORG #{o.global_id} name=#{nm.inspect} members=#{us.length} demo_org_emails=#{exact} demoschooldistrict_any=#{near} flagged=#{s["demo_data"].inspect}" }'
```

Then read the `DEMO_ORG` lines from that execution's logs. What you see decides the next step:

- **The demo org exists and its members have `@demoschooldistrict.org` emails (production):**
  turn the demo accounts' email off, flag the org by name, then backfill. Production's
  district is already a premium org.

  ```bash
  --args='exec,rails,runner,pp DemoDistrict.disable_demo_emails!; DemoDistrict.flag_organization!("Demo School District"); pp DemoDistrict.refresh!'
  ```

- **No such org, or its members are not demo accounts (nonprod's "Demo" org; nonprod only):**
  build a fresh district, then backfill 90 days. `create_district!` runs only in
  `lingolinq-migrate-dev` or `lingolinq-migrate-staging`, read from the job name Cloud Run sets;
  never create a job with either name in `lingolinq-prod`. The jobs a run enqueues reach the
  nonprod worker only from the deploy that gives these Jobs the workers' namespace suffix
  (see `docs/INFRASTRUCTURE.md`, "Console and one-off work"); runs before it left them in a
  namespace no worker reads.

  ```bash
  read -rs DEMO_PW   # the demo accounts' password; no commas
  gcloud run jobs execute lingolinq-migrate-dev --project lingolinq-nonprod --region us-central1 --wait \
    --update-env-vars=USER_KEY=<your email>,SEED_DEMO_PASSWORD="$DEMO_PW" \
    --args='exec,rails,runner,org = DemoDistrict.create_district!(password: ENV["SEED_DEMO_PASSWORD"]); pp DemoDistrict.refresh!(organization: org)'
  ```

  `create_district!` refuses, and writes nothing, in any of these cases:
  - it is not running in one of those two jobs;
  - an org is already flagged;
  - an org already has the name `Demo School District`;
  - any of the 23 demo user names is taken;
  - the district board already exists;
  - another demo run is in progress.

  It never adopts an existing account or board, even one that appears while it runs. If one of
  the names is taken while it runs, it stops and names the numbered account it made instead.
  The demo flag goes on only once the whole district is built, so a run that stops partway for
  any reason (an error, a timeout, a killed job) leaves an unflagged org the daily refresh
  ignores. A rerun refuses until that org and its users, including any numbered account, are
  removed. Do not flag such a half-built org: it looks like the production case above, but
  remove it instead.

  The password you pass is visible in that execution's configuration to anyone who can view
  Cloud Run jobs in the project.

  The district is built as a premium org, so its org page shows the communicator and eval
  statistics to the org's managers (`sarah_chen_slp`). A district built before that (nonprod's first, 2026-10-30) needs it once by hand:
  a site admin opens the org's Settings and ticks Premium.

## Reading the result

`--wait` shows progress only. The summary is in the execution's logs:

```bash
gcloud logging read \
  'resource.type="cloud_run_job" AND labels."run.googleapis.com/execution_name"="<execution>" AND textPayload:"DemoDistrict"' \
  --project <project> --order asc --format='value(textPayload)'
```

The `refreshed ... through <date>` line has the counts. A `SKIP` line names a member that was
left alone; blank out those user names before sharing the log. A refresh that times out or
fails partway can simply be run again (for `create_district!`, see above).

## Environments

- **Dev and staging** share one database, so one district serves both. Staging's scheduler keeps
  it rolling once this code reaches `staging`. Dev has no scheduler.
- **Production** keeps rolling from production's scheduler once the code is released and the org
  is flagged.
