# Compliance register reporting date: impact preview (2026-09-15)

Branch: `docs/scot-compliance-register-reporting-date` (worktree `session-365dfba1`), based on
`origin/develop` at `20f2a0d83` (PR #973). PR #969 verified merged as `46bf1685d`.

Scope: one reporting-date correction, `audit-reports/DOCUMENT-REGISTER.json` `meta.generatedDate`
`2026-07-23` -> `2026-09-15`, plus the artifacts the supported regeneration workflow re-renders from
it. Nothing else. This log records the read-only Phase 1 preview; the canonical change is NOT
applied on this branch until Scot authorizes it.

## What generatedDate means (CONFIRMED from consumers, not from governance prose)

- No governance document defines it. `.claude/rules/compliance-docs.md`, `docs/legal/COMPLIANCE_DOCS_GUIDE.md`
  and `audit-reports/README.md` never mention `generatedDate` (git grep on `20f2a0d83`).
- `scripts/document-register-render.rb` (comment above the `meta.key?('generatedDate')` branch):
  "Anchor the 'overdue for review' window to meta.generatedDate (not Date.today) so the render is a
  pure function of the JSON". It is a snapshot anchor, so `DOCUMENT-REGISTER.md` is reproducible.
- `scripts/compliance-publication-status.rb`: `latest_source_date = max(FINDINGS meta.auditedDate,
  DOCUMENT-REGISTER meta.generatedDate)` is the stale-review cutoff. A document is stale when it is
  active and `lastReviewed` is absent or strictly before that date.
- Precedent: the calendar's identical anchor was moved as a plain reporting correction in
  `c24dce5ba` (2026-08-07, "unstick the calendar anchor") with no audit or attestation. The register
  anchor was last set by `bf43bccee` (#672, 2026-07-23) alongside a re-attestation, but the scripts
  attach no attestation meaning to it.
- Conclusion: advancing it to the preparation date is a reporting refresh. It does not imply an
  audit (`FINDINGS meta.auditedSha/auditedDate` untouched), a review (`lastReviewed`, `nextReviewDue`,
  `lastDone` untouched) or an attestation (attested bytes and `attestation` blocks untouched).

## Consumers affected (CONFIRMED by scratch render at `20f2a0d83`)

| Artifact | Effect |
|---|---|
| `audit-reports/DOCUMENT-REGISTER.json` | one line: `meta.generatedDate` |
| `audit-reports/DOCUMENT-REGISTER.md` | header date; headline "Overdue for review" goes from none to 2 items |
| `audit-reports/COMPLIANCE-PUBLICATION-STATUS.md` | Generated / Latest source date / register date headers; stale queue 58 -> 72; 57 existing rows change reason text from "older than 2026-08-18" to "older than 2026-09-15"; footer count |
| `audit-reports/compliance-calendar.md` | unchanged (own `meta.generatedDate` 2026-08-07) |
| `docs/legal/CAPABILITY_LEDGER.md` | unchanged (own ledger `meta.generatedDate`) |
| `audit-reports/notion/compliance-audit-page.md` | timestamp-only churn, restored by the wrapper |
| `audit-reports/FINDINGS.json` / `FINDINGS.md` | unchanged |
| Drive refresh queue | unchanged, 27 before and after |
| Notion sync workflows | `document-register-notion-sync.rb` reads no meta date; nothing pushed changes |
| `docs/legal/**` | no file changes; 26 attested git rows, 0 drifted, 0 unpinned |

## Before / after (scratch worktree, `--detach` at `20f2a0d83`)

Historical numbers in the task brief (61 -> 72) predate PR #973. On current develop the baseline
is 58, not 61.

| Cutoff | Stale queue |
|---|---|
| 2026-08-18 (today's committed report) | 58 |
| 2026-09-14 (informational only) | 63 |
| 2026-09-15 (proposed) | 72 |

Newly flagged (14, all git, all draft, reason "Review date is older than 2026-09-15."):

| ID | lastReviewed | nextReviewDue | Title |
|---|---|---|---|
| DOC-6c023a20a0 | 2026-08-23 | 2026-11-23 | Article 50(1) Disclosure - Production Feature-Flag Verification |
| DOC-506bbe2039 | 2026-08-24 | 2026-11-24 | AI Governance Memo (2026-08-24 successor) |
| DOC-48adac383b | 2026-08-25 | 2026-11-25 | AI Data-Flow Classification (2026-08-25 successor) |
| DOC-33e056e136 | 2026-08-25 | 2026-11-25 | AI Data-Sharing Consent: Rationale and Policy (2026-08-25 successor) |
| DOC-58b3944cad | 2026-08-30 | 2026-11-30 | Minimum-Necessary Privacy, Data Retention, and AI Use Policy: Counsel Review Memorandum (2026-08-30 draft) |
| DOC-052b0e947c | 2026-09-14 | 2026-11-08 | Subprocessor Register (2026-09-14 successor) |
| DOC-c065db673f | 2026-09-14 | 2026-11-22 | Compliance & Security Program v1.3.2 (2026-09-14 successor) |
| DOC-110d632550 | 2026-09-14 | 2026-11-22 | Compliance Posture Report (2026-09-14 successor) |
| DOC-39e71c72ee | 2026-09-14 | 2026-11-22 | Compliance Status Snapshot (2026-09-14 successor) |
| DOC-2bff04d268 | 2026-09-14 | 2026-11-25 | Compliance & Data Governance (2026-09-14 successor) |
| DOC-4dc241c83a | 2026-09-14 | 2027-04-20 | Data Retention Schedule (2026-09-14 successor) |
| DOC-9587d7124d | 2026-09-14 | 2027-07-22 | Security, Privacy & Compliance Overview (2026-09-14 successor) |
| DOC-f27de5cf05 | 2026-09-14 | 2027-07-23 | GCP BAA Acceptance Record (2026-09-14 successor) |
| DOC-f082212111 | 2026-09-14 | 2027-08-02 | Incident Response & Breach Runbook (2026-09-14 successor) |

Nothing drops out of the queue. `DOC-b7f15a728c` (scheduler dispatch evidence draft) is in the
queue before and after with reason "No review recorded." and keeps `lastReviewed` and
`nextReviewDue` absent.

Newly surfaced in the `DOCUMENT-REGISTER.md` headline as overdue by `nextReviewDue` (already
past, hidden only because the anchor was 2026-07-23):

| ID | Status | nextReviewDue | Title |
|---|---|---|---|
| DOC-771d214850 | draft | 2026-08-02 | EU AI Act Article 50 Transparency: Implementation Milestone Plan |
| DOC-1ea9f75b4f | approved | 2026-08-27 | Incident Log |

## Surprising effect worth Scot's attention (not fixed here)

The publication-status rule is `lastReviewed < latest_source_date`, strictly. Under the proposed
anchor, the nine PR #973 successors reviewed on 2026-09-14 read as stale one day later, and the
five August successors whose content changed in PR #969 read as stale for the right reason. The
queue therefore mixes "content changed after review" with "reviewed before the snapshot". That is
the open "lastReviewed semantics" item; it is deferred, not solved by picking a softer date.
Choosing 2026-09-14 to avoid it would misstate the preparation date and is not recommended.

## Validation evidence

- Baseline `scripts/regenerate-register.sh --check` on the untouched tree: all checks passed, exit 0.
- Targeted renders on the untouched scratch tree produced zero drift.
- Full `scripts/regenerate-register.sh` (write mode) on the scratch tree with the date applied:
  31 steps OK, 0 FAILED, exit 0, "All artifacts regenerated and every integrity check passed."
  Reported separately: citation-check printed 16 distinct [SKIP] lines (accepted-risk / superseded /
  attestation / runtime evidence not citation-validated). Write mode runs citation-check twice (gate
  plus verify), so the log shows them twice; the set is identical to the untouched baseline. No warnings.
  The wrapper restored the Notion mirror's timestamp-only churn, so the final scratch diff is 3 files.
- Scratch diff: 4 files, `DOCUMENT-REGISTER.json` (1 line), `DOCUMENT-REGISTER.md` (2 lines),
  `COMPLIANCE-PUBLICATION-STATUS.md`, and the Notion mirror timestamp line only.

## Proposed patch scope (awaiting authorization)

1. Edit exactly one field: `meta.generatedDate` -> `2026-09-15` in `audit-reports/DOCUMENT-REGISTER.json`.
2. Run `scripts/regenerate-register.sh` (write mode) then `--check`; commit only what it regenerates.
3. Verify structurally: only `meta.generatedDate` changed in the JSON; `docs/legal/**` clean;
   attested-row selector finds 26 rows with pinned hash equal to current hash.
4. Codex review of the diff, then PR to `develop`.

## Deferred (visible, not combined)

Retitle LL-3e36a18199; COPPA verification record successor; review scheduling for
DOC-b7f15a728c; public operational detail and raw receipts decision; overdue quarterly
audit/reviews (the two overdue rows above included); `lastReviewed` semantics; the 31 vs 34
counsel-question note.

## Execution (authorized by Scot 2026-09-15)

Executed on 2026-09-15, so the preview date stands; no backdating. Branch rebased onto
`origin/develop` at `7ac9c0357` first (three app commits since the preview, none touching
`audit-reports/`, `docs/legal/`, or `scripts/`).

- Edited exactly one field: `meta.generatedDate` `2026-07-23` -> `2026-09-15`.
- `scripts/regenerate-register.sh` (write mode): 31 steps OK, 0 FAILED, exit 0.
  citation-check: PASS 198, FAIL 0, SKIP 16, warnings 18, identical to the untouched baseline.
- `scripts/regenerate-register.sh --check`: every check OK, 0 FAILED, exit 0 ("All checks passed"); the attestation harness restored `docs/legal/AI_GOVERNANCE_MEMO.md` and the tree shows no extra change.
- Structural checks: `documents[]` byte-identical to develop (jq -S diff empty); `meta` identical
  except `generatedDate`; `FINDINGS.json`, `compliance-calendar.json`, `CAPABILITY-LEDGER.json`
  untouched; `docs/legal/**` has no changes.
- Attested selector: 26 attested git rows selected, 26 with `attestedContentHash == contentHash`,
  0 of their files differ from `origin/develop`.
- Result: stale queue 58 -> 72, Drive refresh 27 -> 27, two rows surface as overdue by
  `nextReviewDue`. Exactly the preview.

The 14 newly flagged rows are an artifact of the existing cutoff heuristic (`lastReviewed`
strictly before the register snapshot date). They are not evidence that a review failed or that
a compliance violation occurred. Redesigning that heuristic is out of scope.
