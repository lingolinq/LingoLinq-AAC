---
name: re-attest-record
description: Re-attest a git-tracked compliance record in audit-reports/DOCUMENT-REGISTER.json after its bytes change, so the attestedContentHash pin matches the new revision and the CI attested-hash guard passes. Verifies the doc is true NOW before attesting; never rubber-stamps. Only Scot attests. User-invoked only (/re-attest-record).
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# /re-attest-record: re-attest a git compliance record after its bytes change

Every git row in `audit-reports/DOCUMENT-REGISTER.json` with an `attestation` block pins
`attestedContentHash` = the sha256 of the exact bytes Scot attested. `contentHash` tracks the file
as it is NOW. `scripts/document-register-render.rb --check` (CI job `audit-artifacts-integrity`,
plus `scripts/tests/attestation-hash-guard-test.sh`) FAILS the moment the two diverge on a git row:
the attested revision no longer exists, and re-attestation is owed. So the instant you edit an
attested `docs/legal/**` doc (or any git row), you have broken its attestation and must re-pin.

This skill is that re-pin, done correctly. It is the governed counterpart to editing the doc: it
verifies the doc is TRUE now, records Scot's new attestation, rebases the review cadence without
resetting it, and re-runs every gate.

## Hard rules (always)

- **Only Scot attests.** This flow records an attestation Scot is making; run it when Scot has
  asked for the re-attestation (a `/lingo` compliance task, an explicit "re-attest X"). Do not
  invent an attestation.
- **Never edit the pinned hash just to make `--check` pass.** The render's FAIL message says this
  explicitly. Re-pinning is legitimate ONLY as part of a real re-attestation: verify-then-pin, not
  pin-to-silence.
- **Do not rubber-stamp.** An attestation asserts the document is true *now*. Before pinning,
  verify the doc's claims against live code and infrastructure (grep runtime code, `gcloud ...
  describe`, read the real config). Where verification finds a false or stale claim, FIX IT FIRST
  and record the fix; never attest around it. (2026-07-23: a runbook still named Render as the DB
  restore source post-cutover; verified against the live Cloud SQL instance and corrected before
  attesting.)
- **The render NEVER backfills `attestedContentHash`.** By design (`document-register-render.rb`
  header): backfilling from current bytes would make every attestation self-certifying. You set it
  manually, once, to the verified new bytes.
- **Only Scot closes/downgrades a finding.** This skill touches attestation + review-date fields on
  a document row; it never closes findings or changes a finding's disposition.

## The mechanism (why each field)

- `contentHash` = `sha256(file bytes)`. The render (`document-register-render.rb`, write mode)
  recomputes and writes it. `sha256sum <file>` gives the identical value.
- `attestedContentHash` = the bytes Scot attested. You set it = the new `contentHash`.
- `--check` passes when `attestedContentHash == contentHash` for the row (render shows `verified`;
  otherwise `MISMATCH - re-attestation owed`).

## Procedure

1. **Verify the doc is true now, and make any corrections.** Do the substantive review the
   attestation asserts (per "do not rubber-stamp" above). Edit the doc to reality first. If nothing
   is false, note that; if something is, fix it and record what changed (doc changelog + register
   `note`).

2. **Recompute the hash.** From the repo/worktree root:
   ```bash
   ruby scripts/document-register-render.rb        # write mode: recomputes + writes contentHash
   ```
   Then read the new `contentHash` for your row(s):
   ```bash
   ruby -rjson -e 'JSON.parse(File.read("audit-reports/DOCUMENT-REGISTER.json"))["documents"].each{|d|
     next unless d["canonicalLocation"]=="docs/legal/YOUR_DOC.md"
     puts "contentHash=#{d["contentHash"]} pinned=#{d.dig("attestation","attestedContentHash")}"}'
   ```
   (The render will print `[FAIL] attested revision no longer exists ...` for the row — that is the
   expected "re-attestation owed" state, not an error to fix by editing the pin blindly.)

3. **Record the attestation** in `audit-reports/DOCUMENT-REGISTER.json` for the row:
   - `attestation.attestedContentHash` = the new `contentHash` from step 2.
   - `attestation.attestedBy` = `"Scot Wahlquist, CEO"`, `attestedDate` = today (YYYY-MM-DD).
   - `attestation.priorAttestations` = append the superseded `attestedDate` (keep the list; do not
     drop history). For a same-day amendment of an attestation that was never merged/published as a
     distinct revision, you may keep `priorAttestations` unchanged and explain in the `note` instead
     of appending a duplicate same-day date.
   - `lastReviewed` = today; **rebase** `nextReviewDue` on the row's EXISTING interval:
     `newNextReviewDue = today + (oldNextReviewDue - oldLastReviewed)`. Do NOT reset the cadence to a
     default. (e.g. a 12-month row reviewed today -> today + 12 months.)
   - `attestation.note` = one line stating what was verified/corrected and that the prior revision no
     longer exists. NOTE: the boilerplate note text is shared across several rows, so when editing
     with `Edit`, anchor on the row's UNIQUE `attestedContentHash`, not the note string.

4. **Regenerate and verify everything:**
   ```bash
   scripts/regenerate-register.sh                    # render all artifacts + run every --check
   bash scripts/tests/attestation-hash-guard-test.sh # all guards fire; live register untouched
   git diff --check                                  # no whitespace/conflict markers
   ```
   Confirm the row reads `verified` (not `MISMATCH`) and `contentHash == attestedContentHash`.

## Gotchas (learned the hard way)

- **`DOCUMENT-REGISTER.json` is high-contention.** Many parallel compliance PRs touch it. If you
  hit a merge, the conflict is usually only in the GENERATED `DOCUMENT-REGISTER.md`; resolve it by
  regenerating from the auto-merged JSON (`scripts/regenerate-register.sh`), NOT by hand-editing the
  `.md`. Then re-verify your row's `attestedContentHash == contentHash` survived the JSON
  auto-merge before trusting it. See `docs/task-management/LEARNINGS.md`.
- **The render can fail-and-still-write.** Write mode updates `contentHash` in the JSON even while
  printing the attestation `[FAIL]`. That is why step 2 works: read the freshly-written
  `contentHash`, then pin it in step 3.
- **`sha256sum <file>` == `contentHash`.** You can cross-check the render's value directly.
- **Interval rebase, not reset.** The most common slip is setting `nextReviewDue` to a fresh
  default (e.g. +12 months) when the row's real cadence was quarterly, or vice versa. Compute the
  old interval from the row before you edit it.

## Related

- `scripts/document-register-render.rb` (the `attestationHashNote` / `attestationBackfillNote` in
  the register `meta` explain the pin contract).
- `.claude/skills/promote-finding/SKILL.md` (sibling governed register skill; adds findings).
- CLAUDE.md "PR Preflight" P3 (the artifact-integrity `--check` bundle this must pass).
