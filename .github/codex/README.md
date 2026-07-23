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

- maximum chunks: 8
- target raw bytes per chunk: 40 KB
- synthesis calls: up to 3 successful model runs
- approving chunk calls: up to 3 successful model runs per chunk
- structural retry: one retry only for invalid JSON, schema failure, missing
  output, or transient CLI/API failure
- current serial timeout: 90 minutes

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

This timing is valid only for the current `reasoning effort: none` config. If
production changes to a higher reasoning effort, re-run the controlled smoke and
replace this timing before flipping `CODEX_REVIEW_EVIDENCE_MODE=chunked` to the
default.

## Human exit

If coverage is incomplete for a non-excludable path, a human maintainer with
admin rights clears the fail-closed result by reviewing the PR directly and
using GitHub's audited admin-merge path. Do not manually post a green
`codex-review/deep-pass` status from automation to bypass incomplete evidence.
