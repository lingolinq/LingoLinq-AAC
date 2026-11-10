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
  `scripts/codex-review-path-classifier.sh` (named for the retired CI Codex review gate;
  the `data-bearing-paths` gate now reads it) flags a diff when it touches fixtures, factories, cassettes, `db/seeds*`, `db/migrate/**`, `db/data/`,
  `db/language/**` (generated vocabulary, in any letter case), SQL/CSV/spreadsheet dumps,
  structured-data directories, or a `lib/tasks/*.rake` whose filename contains `seed`,
  `import`, `export`, `backfill`, `load` or `sync`. Name every rake task that reads or
  moves user rows with one of those keywords. Do not work around the classifier.
- Every path under `db/language/` is data-bearing, the vendored upstream files under
  `db/language/vendor/` included. The rule matches the brain review guard; a change to it
  is made in the classifier and in the brain guard together.
- The classifier fails closed: an empty diff, a git-quoted path, or a git or grep failure
  exits 3 and writes no route, and a classifier failure fails the `data-bearing-paths` check.
  The check does not call the classifier for a diff with no changed paths; that diff passes.
- The `data-bearing-paths` check scans the lines a PR adds under these paths (2026-11-06):
  a clean change passes with no label; an email on a domain not reserved for examples, a
  phone number outside 555-0100 to 555-0199, an SSN-shaped number, a base64 image, audio
  or video `data:` URI (a voice recording is student data) or a binary file needs
  the `synthetic-data` label, and so does any change under `db/language/` or a VCR
  cassette directory. The scan sees shapes, not meaning: names, addresses and free text
  pass it. Write test data that is obviously fake (`example.com`, 555-01xx, "Test Student").
- Before committing a fixture, cassette, or seed, confirm it holds synthetic data only.
  The local development database is per-machine; a prior confirmation on one machine
  does not carry over.
- Migrations are expand-contract only (add, backfill, dual-write); destructive schema
  changes ship in a later release. A `develop` migration lands in the database `staging`
  serves, so a destructive migration on `develop` breaks staging immediately.
