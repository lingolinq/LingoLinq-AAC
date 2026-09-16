# Scheduler-interruption compliance-record corrections

**Date:** 2026-09-14
**Branch:** `docs/scot-scheduler-interruption-record-corrections` (from `develop` @ `bab2e9b48`)
**Status:** implemented; Codex CLI reviewed through `5873133fd` (2026-09-15); awaiting the approving GitHub review

## Goal

Five editable compliance drafts described retention, redaction, purge, flush and expiry work in
language that did not distinguish configured cadence from observed execution, and none of them
mentioned the 2026-07-21 to 2026-09-02 scheduler-dispatch interruption (`LL-3e36a18199`, open).
Correct the five, add one dated evidence record they can all cite, and record the evidence on the
existing finding without closing or downgrading it.

## What was done

- Corrected five unattested drafts. Every insertion of the interruption disclosure uses one
  identical literal string so a later `git grep` finds all of them.
- Added `docs/legal/2026-09-14_scheduler-dispatch-interruption-and-restoration.md`
  (`DOC-b7f15a728c`), a statusless dated evidence draft. Supersedes nothing.
- Appended a dated evidence block to the `notes` of `LL-3e36a18199`. `lastSeen` was DELIBERATELY
  PRESERVED at 2026-09-02: the defect was not re-observed on 2026-09-14, and the appended note says
  so. Status, severity and disposition unchanged. (An earlier version of this line said `lastSeen`
  was set; that was never true of the committed register and was corrected 2026-09-15.)
- Added acceptance criteria to `rev-coppa-retention-quarterly`. `lastDone` and `nextDue` unchanged.

## Evidence

Read-only Google Cloud captures, 2026-09-14, held outside this public repo at
`~/ai-company-brain/outputs/docs/2026-09-14-scheduler-evidence-receipts/run-20260914T072304Z-945417/`
and cited by sha256 in section 3 of the new record. Twelve captures, all structurally valid.
Key facts: trigger `lingolinq-scheduler-hourly` ENABLED on `0 * * * *`; 278 on-cadence executions
covering all 278 expected hourly slots with no gap; 280 dispatch-complete entries and zero failed;
six of eleven daily tasks inspected, each appearing once per UTC date 2026-09-03 through
2026-09-14 and reporting zero.

## Lessons

1. **A receipt without its generating command is not evidence.** The prior scheduler receipt was a
   bare three-column TSV with no field names and no recorded command; its columns could not be
   interpreted, so it had to be superseded rather than cited. The replacement harness stores raw
   structured stdout, and argv/exit/scope/window in a sidecar, because that failure is otherwise
   undetectable after the fact.
2. **A validator that reports problems and exits 0 is the same defect it is meant to catch.** An
   early draft of the harness printed "stdout is not parseable JSON" and still exited 0. Receipt
   validation must drive the final exit status, and the regression suite must include exit-0
   malformed output, exit-0 empty output, and a valid empty array as three distinct cases.
3. **`--freshness` and `--order=asc` do not compose.** The gcloud reference states `--freshness`
   "Works only with DESC ordering and filters without a timestamp"; the existing `read-*.sh`
   probes pair it with `--order=asc`. Use explicit `timestamp >=` / `<` bounds instead.
4. **`--limit` and `--filter` cannot establish coverage.** `--limit` defaults to `unlimited` and
   `--filter` is applied client-side after fetch, so omitting them proves nothing either. State
   the query scope; do not infer completeness from a record count.
5. **`rails runner` in production is not a read.** `config/initializers/auditing.rb` registers a
   runner hook that writes an `AuditEvent` fail-closed, with the full command line in the
   encrypted `data` column. A probe named `report` or `read` can still run application code and
   write to the database; classify by what the script does, not what it is called.
6. **Zero is not "matched nothing".** A worker in `:disabled` mode returns zero without scanning.
   Read a zero against the implementation that produced it before describing what it means.
7. **A creator annotation records a credential, not a person.** `run.googleapis.com/creator`
   identifies the identity the execution was created under; it does not establish interactive
   invocation.

## Known blocker, since resolved in this PR

`scripts/regenerate-register.sh` initially refused to run: its citation-check gate failed on three findings
added by PR #963 (`LL-89b97af30f`, `LL-5d856983bf`, `LL-57bb9f1af4`), whose `evidence.sha`
`e37817432a58...` does not exist in this repository. Proven pre-existing: the same three fail
against the unmodified base register at `bab2e9b48` with an identical 195 PASS / 3 FAIL.

The three snippets resolve exactly, at their cited lines, at the real squash commit
`4104b657b243164a4ba257fad015db4942ce79f0`. Repointing the sha in a scratch copy yields
198 PASS / 0 FAIL. **RESOLVED: Scot authorized the repair, and commit `da239703f` in this PR applies it.** With it
applied, `scripts/regenerate-register.sh` write mode and `--check` both exit 0 at 198 PASS / 0 FAIL. The commit is
cherry-pickable if it should later be split out.

Artifacts for this change were regenerated by running the wrapper's own generators directly, in
its documented order, never by hand. CI is unaffected: `citation-check` is deliberately not gated
in `.github/workflows/ci.yml` (see its comments at lines 170 and 255).

## Changes after the first Codex CLI approval (a0434e4d4)

- `9b82f0e2c` merged `develop` (`cdf50fb1d`) into the branch. Verified a clean merge: a recomputed
  merge tree is identical to the merge commit's tree, and `develop` changed nothing under
  `audit-reports/`, `docs/legal/` or the compliance scripts between the branch base and the merge base.
- `852525ad2` extended `scripts/compliance-calendar-render.rb` so `linkedFindings`,
  `acceptanceCriteria` and `criteriaNote` are rendered, then regenerated
  `audit-reports/compliance-calendar.md`. `--check` compares the rendered string to the file on
  disk, so the new fields came under it automatically; proven by inducing DRIFT (exit 1) on scratch
  copies for a changed note, a dropped criterion and an emptied `linkedFindings`, and OK on restore.
  The rendered output of the OTHER entries is NOT byte-identical, contrary to that commit's message:
  thirteen other recurring entries gained a `- **Linked findings:** (none recorded)` line. Only
  `rev-coppa-retention-quarterly` carries the criteria block and note.
- `a6c0b27ad` and `5873133fd` narrowed two claims in the evidence record (the related-records
  summary of `LL-3e36a18199`, and the EU-jurisdiction zero scoped to the rows present at the
  2026-08-23 read). Each moved only `DOC-b7f15a728c`'s `contentHash`.
- Codex CLI reviewed all three through `5873133fd` on 2026-09-15 and found no blocking issue.

## Known reporting limitation, deferred to Scot

`audit-reports/COMPLIANCE-PUBLICATION-STATUS.md` is NOT a complete current review queue. Its
stale-review cutoff is `max(FINDINGS meta.auditedDate 2026-08-18, DOCUMENT-REGISTER
meta.generatedDate 2026-07-23)` = 2026-08-18. The four drafts edited on 2026-09-14
(`2026-08-22_compliance-program.md`, `2026-08-24_ai-governance-memo.md`,
`2026-08-25_ai-data-flow-classification.md`,
`2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md`) carry `lastReviewed`
dates of 2026-08-22 to 2026-08-30, later than that cutoff, so they are OMITTED from the report's
stale list although their content changed after those dates. Advancing `meta.generatedDate` to a
September cutoff would widen the list from 61 to 72 documents and re-anchor staleness for the whole
register, so it is left unchanged here as a separate, bounded reporting correction awaiting Scot's
decision. Related open follow-up: `lastReviewed` has no defined semantics.
