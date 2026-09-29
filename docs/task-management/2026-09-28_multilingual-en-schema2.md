# Task log: English schema-2 language data from pinned OpenAAC inputs (2026-09-28)

Branch `feat/scot-multilingual-en-schema2-13ad30ae`, base `develop`. Multilingual Language
Layer, PR 1 of 2.

## Goal

Generate the English schema-2 language files from pinned, public upstream OpenAAC files,
with recorded checksums and a CI check that regenerates the output and byte-compares it.
The `multilingual_grammar` flag is registered OFF. No runtime reader, no concept ids, no
`vocab-en.json` (PR 2), no other language, no change to user vocabulary or labels.

## Learnings consulted (Rule #0 item 8)

Grepped `LEARNINGS.md` and `learnings-archive/` for inflection, word_data, multilingual,
schema2, openaac, vendored, deterministic, byte-identical, zeitwerk and flag-list terms.
Relevant: the curated-boards pattern (OpenAAC board imports, unrelated to inflection data)
and the worktree `node_modules` gotcha (run `npm ci` in the worktree rather than borrowing
another checkout's install).

## Decisions (Scot, 2026-09-28)

1. `forms` are keyed by the upstream inflection names, and `pos` is the upstream `types`
   array. Upstream gives `past` and `simple_past` different values for 8 forms of "be"
   (`was` versus `were`), and `inflection_locations` puts them in different slots (`w`,
   `nw`), so mapping both to one feature bundle would raise on real data. The UD alias
   table, POS mapping and slot layouts move to a reviewed follow-up.
2. The rules resolver, its 195-fixture parity spec and a frontend parity harness are
   deferred to the PR that wires the first reader. With no reader here they would be dead
   code.
3. License (corrected 2026-09-29, approved by Scot): the OpenAAC data files are CC BY 4.0
   (their own `_license` marker, version per OpenAAC's maintainer); the upstream MIT
   license covers the repository's code, which is not used. `NOTICE.md` beside the inputs
   records source, repository, commit, paths, SHA-256 and the CC BY 4.0 attribution.

## Seams traced

- `lib/feature_flags.rb` `frontend_flags_for`: a flag reaches a user only if it is in
  `AVAILABLE_FRONTEND_FEATURES`, and then only through the effective enabled list, the
  beta pool plus a per-user value, or the canary pool. `lib/system_feature_settings.rb`:
  the stored default list is intersected with AVAILABLE, so a new AVAILABLE-only flag is
  off everywhere until someone turns it on.
- `WordData.ingest` (`app/models/word_data.rb:85`) iterates the words file's top-level
  keys, so the schema-2 file (entries under `words`) is not an ingest input. Not changed.
- `WordData.inflection_locations_for` (`word_data.rb:914`) treats `N/A`, `na`, `NA` and
  `n/a` as no form (`:945`); the generator drops the same four values. Not changed.
- `config/initializers/oj.rb` replaces `JSON.parse` and `JSON.pretty_generate` with Oj once
  Rails boots. Oj ignored `allow_duplicate_key: false`, so the duplicate-key spec failed
  under RSpec while the same call raised in plain Ruby. The generator now calls the json
  gem's `JSON::Ext::Parser` and `JSON::Ext::Generator::State` directly; output bytes were
  identical before and after (SHA-256 unchanged).

## Verification

Recorded in the PR body: tamper test, fail-closed table, red-then-green runs for every new
spec, full RSpec and Ember suites against the CI baseline for the base commit.

## Dual-review fixes (2026-09-29)

- License: generated files say `_license: "CC-BY-4.0"`; `_source` adds
  `upstream_license`, `attribution`, `license_url` and `modified`. NOTICE.md holds a
  CC BY 4.0 attribution block in place of the MIT text. The regenerated output differs
  from the previous commit only in those fields.
- Rules values: the generator now also checks rule types, inflection names, grid
  locations, override and test option values, and parts of speech in
  `inflection_locations`, and rejects empty rules, `inflection_locations` and tests
  lists. The class comment and both READMEs state exactly what is and is not checked.
- `generate!` stages both files before renaming either, refuses an output path that is
  not a regular file, and removes its `.tmp` files on failure.
- Negative specs added for each existing metadata and container check that had none.
- The Oj learning notes the load-order dependency; a spec asserts the json gem entry
  point exists.
- The flag comment mentions canary users (same line, so ledger anchors hold).

## Open items

- Scheduled (not per-PR) re-verification of the pin against the upstream commit URL.
- These files are not an input to `WordData.ingest`.
