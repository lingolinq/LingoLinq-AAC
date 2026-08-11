# Codex review memory

Curated rules the automated reviewer has learned across sessions. Each entry
names the source so a rule can be re-evaluated if its origin turns out to be
wrong. This file is injected into every review prompt (see
`.github/codex/review-prompt.md`) -- keep it under ~200 lines and free of raw
session excerpts or any identifiable data; it is not `audit-reports/` or
`docs/legal/` territory, but treat it as reviewer-facing, not user-facing.

When a human overrides a verdict, or a post-merge bug slips through review,
append one short rule here in its own small PR. Do not batch memory edits
into an unrelated PR.

## Rules

- **Register drift is a merge blocker, not a style nit.** The
  `audit-artifacts-integrity` CI job runs six `--check` scripts
  (`compliance-calendar-render.rb`, `compliance-notion-publish.rb`,
  `document-register-render.rb`, `compliance-publication-status.rb`,
  `capability-check.rb`, `readiness-check.rb`) plus two guard harnesses
  (`attestation-hash-guard-test.sh`, `readiness-check-test.sh`). A PR that
  edits `audit-reports/FINDINGS.json`, `audit-reports/DOCUMENT-REGISTER.json`,
  or `audit-reports/strategy/*.json` without regenerating the corresponding
  rendered artifact will fail this gate. Verify by actually running the
  `--check` scripts, not by reading the diff.
  -- source: repo convention, `reference_register_edit_regenerate_artifacts`.

- **Stale provider-version wording is a real finding, not pedantry.**
  Compliance and infra docs that name a specific model/CLI version
  (`gpt-5.6-terra`, `codex-cli 0.146.0`, etc.) drift silently. If a PR touches a
  doc naming a provider/version, confirm the version claim against the live
  tool (`codex --version`, vendor changelog) rather than assuming the doc is
  current.

- **Flaky `persistence-sync` timing failures on `main`-targeting PRs are CI
  noise, not a regression the PR introduced.** `main` has no required
  status checks, so this does not block merge; do not raise it as a
  blocking finding unless the PR's diff touches `persistence.js` sync logic
  directly. -- source: `reference_main_build_and_test_persistence_sync_flake`.

- **A negative existence claim ("file X does not exist") requires the same
  evidence standard as a positive claim.** Search all roots (`lib/`, `app/`,
  `config/`), not only `app/`, before asserting absence. A prior review round
  of this very pipeline's design spec wrongly claimed
  `lib/json_api/lesson.rb` did not exist because the search was scoped to
  `app/` only. -- source: this pipeline's own build spec, round 1 -> round 2
  correction (FLAG-3 reversal).

- **Policy changes must update every canonical consumer in the same PR.**
  Before approving an edit to a cross-cutting policy file (e.g.
  `instructions/shared/compliance.md`), grep `instructions/`, `commands/`,
  and `agents/` for other files stating the same rule. A policy edit that
  updates one consumer and leaves siblings contradicting it is a finding,
  not a nitpick. -- source: this pipeline's build spec, round 3 (High).

- **"Approved reviewer" requires a registry entry naming the approver.** A
  policy document may not self-approve its own examples (e.g. listing a
  model as an approved Tier 2 reviewer without a row in the approved-
  reviewers table naming who approved it and when). -- source: this
  pipeline's build spec, round 3 (High).
## Codex review evidence modes

When `CODEX_REVIEW_EVIDENCE_MODE=chunked`, review chunk prompts as evidence
collection only. The final approval decision requires synthesis plus CI-owned
envelope validation over the complete manifest, chunk hashes, chunk verdicts,
current checks, merge state, and prior-loop findings.

If any manifest or chunk evidence is missing, mismatched, incomplete, or
inconclusive, the safe verdict is `NEEDS_HUMAN`; do not approve on partial
coverage.
