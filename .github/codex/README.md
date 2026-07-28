# Codex review pipeline

`codex-review.yml` is dispatched by the n8n W1 orchestrator and reports the
Actions-owned `codex-review/deep-pass` commit status. W2 owns the sticky PR
comment. The workflow keeps routing, head-SHA binding, and final status
resolution in CI-owned fields so model output cannot choose which PR or commit
receives the result.

## Evidence modes

`CODEX_REVIEW_EVIDENCE_MODE` controls the diff evidence strategy:

- `bounded` keeps the legacy single bounded diff injection.
- `chunked` builds a CI-owned manifest plus deterministic diff chunks, reviews
  each chunk, then runs a synthesis pass before the envelope can approve.

`CODEX_REVIEW_CHUNKED_SCOPE` controls rollout when
`CODEX_REVIEW_EVIDENCE_MODE=chunked`:

- `all` enables chunked evidence for every Codex-routed PR.
- `scot` enables chunked evidence only when the PR author is `swahlquist` or the
  head branch starts with `scot/`.
- `none`, `off`, or `bounded` force the bounded path.
- any unknown value fails safe to the bounded path.

During the first-week canary, set:

```text
CODEX_REVIEW_EVIDENCE_MODE=chunked
CODEX_REVIEW_CHUNKED_SCOPE=scot
```

Leave both variables unset to keep production on the bounded path. After the
canary, switch `CODEX_REVIEW_CHUNKED_SCOPE=all` to expand chunked evidence
repo-wide. Record the effective evidence mode in the envelope and
sticky-comment payload so a later audit can tell which path produced a verdict.

## Chunked evidence contract

The trusted workflow-ref helper `scripts/codex-review-build-evidence.py`
generates:

- `manifest.json`
- `manifest.md`
- `full.diff`
- `chunk-0001.diff`, `chunk-0002.diff`, and so on

The diff command is pinned:

```text
git -c core.quotepath=false -c core.abbrev=40 -c diff.algorithm=default -c diff.noprefix=false -c diff.mnemonicPrefix=false diff --no-color --no-ext-diff --no-textconv --find-renames=50% -U3 BASE...HEAD
```

The manifest includes the complete changed-file list, base and head SHA, every
chunk hash, coverage range, policy-covered exclusions, incomplete-coverage
reasons, and a CI-computed structural index. Evidence is derived from commit
objects (`git diff BASE...HEAD` and `git ls-tree HEAD_SHA`), not the index.

Limits are intentionally explicit:

- maximum chunks: 16
- target raw bytes per chunk: 40 KB
- synthesis calls: up to 3 successful model runs
- approving chunk calls: up to 3 successful model runs per chunk
- structural retry: one retry only for invalid JSON, schema failure, missing
  output, or transient CLI/API failure
- current serial timeout: 90 minutes

Worst-case budget is 51 *logical* calls: up to 16 chunks times 3 chunk-review
runs, plus up to 3 synthesis runs. Because every logical call may fire one
structural retry (`run_model` re-invokes `codex exec` with a strict-JSON
suffix), the worst-case count of actual `codex exec` invocations is 102, not
51. Use 102 for any timeout or watchdog headroom analysis. This is a larger
budget than the first canary's 27-logical/54-invocation ceiling, but it
preserves the same convergence and
fail-closed envelope checks. The raised cap is required for #686-class large
frontend PRs, where about 298 KB across 29 SCSS, template, and i18n-heavy files
produced 8 chunks and then failed coverage as `(diff-wide): too_many_chunks`
under the old cap. A PR that needs a 17th chunk still records
`too_many_chunks`, marks coverage incomplete, and cannot approve.

A blocking chunk verdict is not rerun for confirmation, but the remaining
chunks still run so the author receives complete findings and CI can attest
coverage.

## Oversized and excluded evidence

Files larger than one chunk may be split only on hunk boundaries. Each chunk
re-emits `diff --git`, file headers, and the relevant `@@` hunk headers so
file/line evidence remains attributable.

One oversized hunk is not split. It marks coverage incomplete and the envelope
returns `NEEDS_HUMAN`.

Header-only changes are complete coverage. This includes binary diffs,
mode-only changes, pure renames, and deletions.

The exclusion policy is stored in `.github/codex/evidence-policy.json`, which
is restored from the workflow ref before it is used. Exclusions are deterministic
policy coverage, not semantic model review. The policy separates paths excluded
from chunking from approval-safe classes, and the envelope recomputes approval
safety from the trusted policy before approval.

In v1, `db/schema.rb` is excluded from chunking but is not approval-safe by
itself. A schema-only diff needs human review because migration paths are
data-bearing and route away from the external reviewer.

Locale JSON is not excluded in v1 because there is no named deterministic
validation for it in this workflow.

## Synthesis

Chunk reviews are evidence collection. They are not the final gate.

The synthesis prompt receives:

- complete changed-file manifest
- base and head SHA
- every chunk hash and coverage range
- every chunk verdict and finding
- CI-computed structural index
- current PR checks and merge state
- prior-loop findings when applicable

Synthesis must return `NEEDS_HUMAN` if any chunk is missing, mismatched,
truncated, structurally failed, or inconclusive. It must return
`REQUEST_CHANGES` if any chunk has an unresolved blocking finding. It approves
only when coverage is complete, every chunk was reviewed, all chunk hashes
match, all chunks approved, and synthesis finds no cross-file blocker.

Findings preserve file, line, evidence, verifiable check, and chunk provenance.
`chunk_id` is provenance only, not cross-loop identity. Cross-loop matching
should prefer file, category, and `verifiable_check`; descriptions are
model-authored display text.

## Prompt-injection guard

The envelope is the enforcer. Synthesis can add a block but cannot clear one.

The guard scans the complete raw diff, every chunk, and the synthesis input.
Raw diff hashes identify the exact Git evidence. Prompt hashes identify the
defanged bytes sent to the model. `CI_INJECT` markers in diff or model-authored
chunk findings are defanged before prompt assembly.

## Watchdog and heartbeat

`codex-watchdog.yml` fails pending `codex-review/deep-pass` statuses that age
past its threshold. Chunked reviews can legitimately take longer than the old
2-3 model-call path, so `scripts/codex-review-run-chunks.py` reposts pending
status before every model call and retry. Heartbeat failures are non-fatal; they
are progress hints, not correctness gates. A real hang stops heartbeating and the
watchdog still fails closed.

Measured smoke timing:

- 2026-07-25 confirmation smoke on synthetic large non-PII PR #685: 6 chunks,
  12 chunk calls plus 2 synthesis calls, all approve-converged.
- Reviewer step wall-clock: 75 seconds for 14 serial `codex exec` calls.
- Total workflow wall-clock: about 2 minutes 27 seconds.
- Reasoning effort: none, as currently shipped by
  `scripts/codex-review-run-chunks.py`.
- Heartbeats fired about every 5-6 seconds, far inside the 30-minute watchdog
  window.

The 16-chunk worst case has not been live-smoked yet. Using the #685 timing as
a rough lower-bound throughput check (75 s / 14 invocations = about 5.4 s per
invocation), 51 logical calls would be about 4.5 minutes of reviewer-step time,
and the 102-invocation retry-saturated worst case about 9 minutes, at the
current `reasoning effort: none` setting and before ordinary GitHub runner and
API variance. Both remain well inside the 90-minute job timeout, and each model
call still posts a pending-status heartbeat before it starts. Treat 5.4 s as a
floor, not an estimate: per-call latency scales with prompt size, and the
manifest block embedded in every chunk prompt grows with chunk count.

Two known limits this cap raise does not address, both unchanged from the
8-chunk canary and both currently fail-closed rather than wrong:

- `run_model` passes no `timeout=` to `subprocess.run`, so a single hung
  `codex exec` stops heartbeating and stalls the job until the 90-minute
  ceiling. The watchdog flips the status to failure after 30 stale minutes, so
  the merge gate still resolves, but the runner minutes are spent.
- The synthesis prompt embeds every chunk review verbatim
  (`chunk_result_group` keeps the full `review` object for each run), so its
  input scales with chunks times runs: up to 48 full review objects at this
  cap, versus 24 before. Neither `chunk-review-schema.json` nor
  `synthesis-prompt.md` bounds finding count or description length. A synthesis
  prompt too large to answer degrades to an invalid review and blocks, which is
  correct but moves the failure from chunking to synthesis.

If real timings approach the watchdog threshold, keep the fail-closed
status behavior and revisit chunk parallelism or job boundaries as a separate
design.

This timing is valid only for the current `reasoning effort: none` config. If
production changes to a higher reasoning effort, re-run the controlled smoke and
replace this timing before flipping `CODEX_REVIEW_EVIDENCE_MODE=chunked` to the
default.

## Human exit

If coverage is incomplete for a non-excludable path, a human maintainer with
admin rights clears the fail-closed result by reviewing the PR directly and
using GitHub's audited admin-merge path. Do not manually post a green
`codex-review/deep-pass` status from automation to bypass incomplete evidence.
