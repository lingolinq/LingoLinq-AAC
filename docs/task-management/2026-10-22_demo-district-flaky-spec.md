# 2026-10-22 — flaky `spec/lib/demo_district_spec.rb:141` (from #1170)

Branch `traci/fix/demo-district-flaky-spec`, from develop at 4bae48a9c.

## Symptom
"interrupted runs redoes a day that a killed run left half written" failed on PR #1173's CI
(`expected [Mon, 19 Oct 2026] to include Tue, 20 Oct 2026`). On develop's own code it failed 2 of 8 local runs.

## Cause (CONFIRMED)
`DemoDistrict::UsageGenerator#absent?` (lib/demo_district/usage_generator.rb:214-216) makes about 1 school day in
10 an absence with no sessions, seeded from `"#{student.id}:#{date}"`. The spec's users get a new database id every
run, so in roughly 1 run in 10 the communicator is absent on Tuesday 2026-10-20, the day the example asserts was
regenerated. Reproduced deterministically by stubbing `absent?` true for 2026-10-20 (3 of 3 runs: the CI message).
The adversary review on 55974a9ca showed the same cause in three more examples, and reproduced the worst on that head
(by advancing `users_id_seq` to an id whose absences hit): over 1,000,000 ids, day 20 absent 10.0%; days 16 and 19 both
absent 1.0% ("stops at a day whose sessions failed" only accepts a failure on the 16th or 19th); all three absent 0.1%
("skips members without a demo email...", "removes a partly written day...", "goal and profile freshness..."). The ids
come from a sequence that transactions do not roll back, so the examples' `srand` calls never reached absences.

## Fix
- One pin at the top of the spec turns absences off for every example. The "absences" examples turn them back on: the
  existing one uses the real rule (`and_call_original`); a new one makes only Mon 2026-10-19 absent and checks the fill
  carries on past it (16 and 20 filled, 19 empty, a rerun adds nothing). That one also fails if `absent?` is renamed,
  which would otherwise make the pin silently stop applying.
- No assertion changed and no product code changed (absences are intended).

## Verification (deterministic)
- Pin flipped to "absent on 16, 19 and 20": exactly the five dependent examples fail (refresh! skips members, redoes a
  half-written day, stops at a failed day, removes a partly written day, goal and profile freshness).
- `absent?` renamed in lib/demo_district/usage_generator.rb: both absence examples fail.
- With the fix: 19 examples, 0 failures.
- Earlier loop counts are not evidence: with a 1.2% residual, 60 passes in a row happen about half the time. The two
  failures seen in the first 15 runs of the earlier commit were not captured and stay unattributed.
