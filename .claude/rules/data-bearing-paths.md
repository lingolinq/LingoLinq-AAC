---
paths:
  - "spec/fixtures/**"
  - "spec/factories/**"
  - "spec/cassettes/**"
  - "spec/vcr_cassettes/**"
  - "db/seeds.rb"
  - "db/seeds/**"
  - "db/migrate/**"
  - "lib/tasks/**"
---

# Data-bearing paths (Tier 1 boundary)

Fixtures, factories, cassettes, seeds, data migrations and data rake tasks can hold real
user rows. Content that could contain identifiable student or patient data is **Tier 1**
regardless of the surrounding task:

- Never paste rows from these paths into a prompt for a reviewer that has no BAA
  (Codex on OpenAI credentials, Copilot, any consumer endpoint). The CI classifier
  `scripts/codex-review-path-classifier.sh` routes a diff away from the consumer reviewer
  when it touches fixtures, factories, cassettes, `db/seeds*`, `db/migrate/**`, `db/data/`,
  SQL/CSV/spreadsheet dumps, structured-data directories, or a `lib/tasks/*.rake` whose
  filename contains `seed`, `import`, `export`, `backfill`, `load` or `sync`. A rake task
  that reads user rows under any other name (a purge or scrub task, for example) is NOT
  caught: name it with one of those words, or keep its diff off the consumer route by
  hand. Do not work around the classifier.
- Before committing a fixture, cassette, or seed, confirm it holds synthetic data only.
  The local development database is per-machine; a prior confirmation on one machine
  does not carry over.
- Migrations are expand-contract only (add, backfill, dual-write); destructive schema
  changes ship in a later release. A `develop` migration lands in the database `staging`
  serves, so a destructive migration on `develop` breaks staging immediately.
