---
paths:
  - "spec/fixtures/**"
  - "spec/factories/**"
  - "spec/cassettes/**"
  - "spec/vcr_cassettes/**"
  - "db/seeds.rb"
  - "db/seeds/**"
  - "db/migrate/**"
  - "db/language/**"
  - "lib/tasks/**"
---

# Data-bearing paths (Tier 1 boundary)

Fixtures, factories, cassettes, seeds, data migrations, data rake tasks and generated
vocabulary under `db/language/` can hold real user rows. Content that could contain
identifiable student or patient data is **Tier 1**
regardless of the surrounding task:

- Never paste rows from these paths into a prompt for a reviewer that has no BAA
  (Codex on OpenAI credentials, Copilot, any consumer endpoint). The CI classifier
  `scripts/codex-review-path-classifier.sh` routes a diff away from the consumer reviewer
  when it touches fixtures, factories, cassettes, `db/seeds*`, `db/migrate/**`, `db/data/`,
  `db/language/**` (generated vocabulary, in any letter case), SQL/CSV/spreadsheet dumps,
  structured-data directories, or a `lib/tasks/*.rake` whose filename contains `seed`,
  `import`, `export`, `backfill`, `load` or `sync`. Name every rake task that reads or
  moves user rows with one of those keywords. Do not work around the classifier.
- Every path under `db/language/` is data-bearing, the vendored upstream files under
  `db/language/vendor/` included. The rule matches the brain review guard; a change to it
  is made in the classifier and in the brain guard together.
- The classifier fails closed: an empty diff, a git-quoted path, or a git or grep failure
  exits 3, writes no route, and stops the review job.
- Before committing a fixture, cassette, or seed, confirm it holds synthetic data only.
  The local development database is per-machine; a prior confirmation on one machine
  does not carry over.
- Migrations are expand-contract only (add, backfill, dual-write); destructive schema
  changes ship in a later release. A `develop` migration lands in the database `staging`
  serves, so a destructive migration on `develop` breaks staging immediately.
