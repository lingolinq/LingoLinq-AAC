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
The same unpinned input lets "skips members without a demo email and fills weekdays through yesterday" fail when all
three days are absences (about 1 in 1000).

## Fix
Both examples pin `absent?` to false. They test the redo of a half-written day and the weekday fill, not absences;
absence keeps its own example ("does not fill an absent last day on a rerun"), unchanged. No assertion changed, and
no product code changed (absences are intended).

## Verification
With the fix, `--order random` over the whole file: 13 of the first 15 runs passed and the two failures were not
captured (cause unknown); then 60 consecutive runs passed (two batches of 30, each run's output kept on failure).
