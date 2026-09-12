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
  `scripts/codex-review-path-classifier.sh` flags a diff touching these paths as
  data-bearing and routes it away from the consumer reviewer; do not work around it.
- Before committing a fixture, cassette, or seed, confirm it holds synthetic data only.
  The local development database is per-machine; a prior confirmation on one machine
  does not carry over.
- Migrations are expand-contract only (add, backfill, dual-write); destructive schema
  changes ship in a later release. A `develop` migration lands in the database `staging`
  serves, so a destructive migration on `develop` breaks staging immediately.
