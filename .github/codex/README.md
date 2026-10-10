# Codex review pipeline

> **Status 2026-10-03: disabled.** `codex-review.yml` is disabled in GitHub
> Actions (state `disabled_manually`; last run 2026-09-28) until the hardening
> in PR #1103 lands and its admin steps are done (restrict the `codex-review`
> environment's deployment branches; remove the repo-level copies of its
> secrets). 268 of the 296 runs so far were dispatched on the `staging` ref, so
> `github.workflow_sha` (the trusted checkout) was staging's copy of this
> workflow. The other 28 (2026-07-16 to 2026-08-04, during development) were
> dispatched on feature branches and ran that branch's copy with the
> repo-level secrets: the exact path the environment's branch rule closes. W1
> must keep dispatching on a protected branch.
>
> **Earlier, 2026-09-26: live again, not yet required.** Dispatch stopped after
> 2026-08-04 because W1's `Debounce Delay` was a Code node sleeping 300s, equal
> to n8n's 300s task-runner timeout, so every reviewable event timed out there.
> On 2026-09-26 it was replaced with a native n8n Wait node (same 5-minute
> default, same `CODEX_REVIEW_DEBOUNCE_MS` override). Revival checklist:
> (1) restore W1 dispatch in n8n: done 2026-09-26; (2) confirm
> `CODEX_OPENAI_API_KEY` still authenticates: done 2026-09-26; (3) run one smoke
> PR: done 2026-09-26 on PR #1070 (Actions run 36276775066 completed, W2 posted
> the sticky comment); (4) re-add `codex-review/deep-pass` to branch protection
> on develop and staging: OPEN, the check is still not in the required set on
> develop, staging or main; (5) decide the canary variables (see Evidence
> modes): OPEN. Revival requires internal privacy and security sign-off. Until (4) a failing deep pass does not block merge, and the
> `--admin` exception policy in `docs/process/deep-pass-admin-exception-policy.md`
> has nothing to override. Known gap: simultaneous PR events (for example
> `opened` plus auto `review_requested`) can each dispatch before W1's
> duplicate-head record is saved, so one head can be reviewed more than once.

`codex-review.yml` is dispatched by the n8n W1 orchestrator and reports the
Actions-owned `codex-review/deep-pass` commit status. W2 owns the sticky PR
comment. The workflow keeps routing, head-SHA binding, and final status
resolution in CI-owned fields so model output cannot choose which PR or commit
receives the result.

## Approved reviewer models

Mirrored here from the company approved-reviewer registry so the pin in
`scripts/codex-review-run-chunks.py` cites something resolvable from inside this
repo. The registry is the source of truth; changing a model here without
amending it there is registry drift. Approval authority is Scot.

| Row | Credential | Approved model ids | Tier |
| --- | --- | --- | --- |
| Codex CLI (CI `codex-review` gate) | OpenAI platform API key, pay-per-use, project-scoped, no BAA | `gpt-5.6-terra` (both legs) | Tier 2 dev-loop only |
| Codex CLI (interactive / local) | Consumer OpenAI OAuth, no BAA | `gpt-5.6-terra` (default), `gpt-5.6-sol` (careful) | Tier 2 dev-loop only |

`gpt-5.6-sol` is approved for the interactive row ONLY and must not be used by
this workflow.

**Both legs of the chunked path run `gpt-5.6-terra`.** The chunk leg is the only
leg that reads the diff; synthesis sees model-authored chunk summaries and the
CI-computed structural index, never raw code. A defect the chunk pass misses is
therefore unreachable to synthesis, so detection strength has to live on the
chunk leg. Convergence does not substitute for it: runs 2 and 3 re-sample the
same model on the same prompt, which corrects sampling variance, not a blind
spot. `gpt-5.6-luna` is **not approved and not deployed** on any leg (the
registry says so explicitly; an earlier revision of this file called it an A/B
arm, which was registry drift). Moving any leg to a different model is a
reviewer-strength change, not a config tweak: it takes a registry row from Scot
plus a PR that edits `DEFAULT_CHUNK_MODEL` / `DEFAULT_SYNTHESIS_MODEL` in
`scripts/codex-review-run-chunks.py`, and review.

**Neither id is runtime-overridable, deliberately.** An earlier revision read
both from repo variables so a bad pin could be corrected without shipping a PR
through the gate the pin was breaking. Review rejected that: a repo variable is
settable with no PR and no review, so the hatch let anyone move the code-reading
leg onto a weaker model silently, which is the exact thing the pin exists to
prevent. Changing a reviewer model is a reviewed change. If terra itself becomes
unusable, the remaining levers are `CODEX_REVIEW_EVIDENCE_MODE=bounded`,
`CODEX_REVIEW_CHUNKED_SCOPE=none`, and the documented admin exception.

The models actually used are recorded in the W2 envelope as `chunk_model` /
`synthesis_model`, so the audit artifact names the reviewer.

Note that `CODEX_REVIEW_CHUNKED_SCOPE` decides who reaches this path at all (see
Evidence modes below), so a change here does not necessarily apply to every
author's PRs.

## Evidence modes

`CODEX_REVIEW_EVIDENCE_MODE` controls the diff evidence strategy:

- `bounded` keeps the legacy single bounded diff injection.
- `chunked` builds a CI-owned manifest plus deterministic diff chunks, reviews
  each chunk, then runs a synthesis pass before the envelope can approve.

`CODEX_REVIEW_CHUNKED_SCOPE` controls rollout when
`CODEX_REVIEW_EVIDENCE_MODE=chunked`:

- `all` enables chunked evidence for every Codex-routed PR.
- `scot` enables chunked evidence only when the PR author is `swahlquist` or the
  head branch is Scot-owned: `<type>/scot-<slug>` (the form since 2026-09-16) or the
  older `scot/<type>/<slug>`.
- `none`, `off`, or `bounded` force the bounded path.
- any unknown value fails safe to the bounded path.

During the first-week canary (started 2026-07-23), the variables were set to:

```text
CODEX_REVIEW_EVIDENCE_MODE=chunked
CODEX_REVIEW_CHUNKED_SCOPE=scot
```

They are still set that way as of 2026-09-12 and the canary was never closed
out, so when the gate is revived, non-Scot PRs would get the bounded path
(60,000-byte truncated diff). Revival step (5): either switch
`CODEX_REVIEW_CHUNKED_SCOPE=all` to expand chunked evidence repo-wide, or unset
both variables to keep everyone on the bounded path. Record the effective evidence mode in the envelope and
sticky-comment payload so a later audit can tell which path produced a verdict.

## Chunked evidence contract

The helper `scripts/codex-review-build-evidence.py` (run from the trusted checkout; see
[Execution isolation](#execution-isolation))
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
preserves the same convergence and fail-closed envelope checks. The raised cap
is required for #686-class large
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

Header-only changes are complete coverage. This includes mode-only changes,
pure renames, deletions, and binary diffs of expected binary types (images,
fonts, PDFs, audio/video). Any other path that diffs as binary withholds an
APPROVE (`incomplete_evidence`, needs human): git decides "binary" from file
content, so the diff cannot show what changed. Archives (`.zip`, `.gz`,
`.tgz`, `.obz` board packages) are in that group on purpose: one can carry
source or data the reviewer never sees. An expected binary type must also be
that type: the envelope takes the list of binary files from git itself
(`git diff --numstat -z`, so a name containing " and " cannot point the check
at another file), reads the first bytes of each such file at the PR head
(`--binary-content-at`), and withholds an APPROVE, naming the files, when they
do not start like the type or cannot be read. "Start like the type" means the
type's magic and header fields, plus a byte that script text cannot hold (NUL,
another control byte, or a byte outside valid UTF-8) within the first 20 bytes,
which every real media file in this repo has. So a `.png` that is plain code, a
"PDF" that is a CSV, and a script that opens with a format's magic
(`GIF89a=1;system(...)`) are withheld. This is a heuristic, not a parser:

- a script that puts such a byte early still passes, for example a NUL right
  after very short code, or a control byte inside a comment followed by more
  code on the next line (`GIF89a=1#<0x01>` then code);
- a PDF whose first 20 bytes after any BOM or whitespace are all text (no
  binary comment line, or one written in valid UTF-8) is withheld, which costs
  a human look.

That list is made with rename detection off, so for a binary file that is not
an expected type a pure rename, a move or a mode-only change also withholds an
APPROVE, although it is header-only for chunk coverage above: a rename can
change how content nobody reviewed is used (`data.bin` to `config/boot.rb`),
and a mode change can make it executable. Renaming an expected binary type that
still starts like its type passes.

The exclusion policy is stored in `.github/codex/evidence-policy.json`, which
comes from the trusted checkout of the workflow ref. Exclusions are deterministic
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

## Execution isolation

The review job runs PR content only as data:

- The workspace is a checkout of the workflow ref (`persist-credentials:
  false`). Every helper, prompt, schema and policy file comes from it. Python
  helpers run as `python3 -I "$GITHUB_WORKSPACE/scripts/..."`; the shell
  helpers run by the same absolute path.
- The PR's commits are fetched as git objects and never checked out. Diffs are
  computed from those objects with the trusted worktree's git attributes, and
  the path classifier fails closed (exit 3, no route) on a name git quotes (a
  tab, newline, `"` or `\`), on an empty diff and on a git or grep failure, so
  quoting cannot hide a data-bearing path. It matches in any letter case and
  byte by byte (`LC_ALL=C`), treats every path under `db/language/` as
  data-bearing, and lists a rename by both names (`--no-renames`), so moving a
  file out of a data-bearing path does not hide the old one. A file
  that diffs as binary is checked on the untruncated diff (see Oversized and
  excluded evidence).
- `codex exec` runs from an empty directory with a fresh `CODEX_HOME`, the key
  only in `CODEX_API_KEY` on the reviewer step (no `codex login`, no stored
  credential), and the arguments in `.github/codex/codex-exec-args.txt`:
  read-only sandbox, no command, browser, image, web, plugin or goal tools, no
  session saving, and an explicit `codex-review` provider for the OpenAI API.
- The feature flags do not remove every tool: the bundled catalog entry for
  the model adds `exec`, `apply_patch` and the collaboration tools
  (`spawn_agent`, which takes a model name, and others). The install step
  therefore writes a locked catalog (`scripts/codex-review-model-catalog.py`):
  the approved models only, with the fields that add those tools set to null.
  Every call selects it and the `codex-review` provider, and refuses to run
  without it. The model is offered only `request_user_input`, which nobody
  can answer in `codex exec`.
- The CI job `codex-review-tests` installs the pinned codex version and checks
  that each disabled feature exists in it and is really off, that the other
  overrides are accepted, and that `codex exec` accepts every flag. It also
  runs the real binary with the hardening file, the lock arguments, `-C` and
  `-m` (the review's arguments without the two output flags, plus one override
  that points it at a local stand-in for the API) and checks the tools named
  in the request it sends. Separately, the unit tests pin the whole argument
  list of every bounded call (both runs and the retry) and of the chunked
  path's `run_model`, so a flag added anywhere fails them. The reviewer step
  refuses to run if the argument list is empty.
- Model calls get no other credential and no `GITHUB_*` runtime variable in
  their environment (`scripts/codex-review-quiet-exec.py`). `GH_TOKEN` is set
  only on the steps that call `gh`; neither reviewer step has it.
- Secrets are passed as step `env`, never written into a step script. The
  webhook URL reaches `curl` as a config line on stdin; the HMAC key is read
  from the step environment. Before the W2 POST,
  `scripts/codex-review-secret-scan.py` refuses an envelope that contains
  anything credential-shaped (best effort: a split or encoded secret is not
  found) and posts a specific failure status.
- **Admin preconditions, NOT enforced by this file.** The job names the
  `codex-review` environment, but GitHub creates a referenced environment with
  no protection, and `secrets.*` falls back to repository secrets. Isolation
  holds only after a repo admin (1) restricts the environment's deployment
  branches to the branch W1 dispatches from, (2) moves
  `CODEX_OPENAI_API_KEY`, `CLAUDE_REVIEW_API_KEY`,
  `N8N_CODEX_RESULTS_WEBHOOK_URL` and `N8N_CODEX_RESULTS_HMAC_SECRET` into the
  environment and deletes the repository-level copies, and (3) rotates all
  four. Step (1) is enforced: `status-pending` reads the environment through
  the API and fails the run (failure status, no review) while it is missing or
  open to every branch. Steps (2) and (3) cannot be checked from the workflow
  (that would mean reading secrets outside the environment, and a modified copy
  of the workflow would drop the check anyway), so they stay admin actions.
- Three jobs: `status-pending` posts the pending anchor, `codex-review` holds
  the environment and does the review, and `status-final` (`always()`)
  resolves deep-pass from the review job's result. The two status jobs hold no
  environment and no secret, so a run the environment refuses still gets a
  terminal status.
- `zizmor` scans this workflow in CI (`--persona auditor`, medium and above).

## Watchdog and heartbeat

**Watchdog recovery is best-effort. There is no 30-minute SLA.** (Issue #710.)

`codex-watchdog.yml` has two triggers, but **both run the same job behind the
same age gate**, so neither one provides prompt recovery:

- **`workflow_run`.** Fires when a review job concludes, however it concluded.
  It then runs the identical `fail-stale-pending` job, whose only writer is
  gated on `age_min -ge 30`. For a status younger than that it finds nothing
  and exits. There is no `github.event_name` branching in the file.
- **`schedule`.** A sweep requested every 10 minutes, subject to the same age
  gate. This is the only trigger that covers a run which hangs and never
  completes, because a still-running job emits no `workflow_run` event.

Do not treat `workflow_run` as a fast path. `audit-reports/deep-pass-admin-overrides.md`
records a run that concluded at the auth step and still took **41 minutes** to
resolve (`05:39:18Z pending` to `06:20:56Z failure`). The `workflow_run` trigger
fired; the age gate was what it waited on.

Prompt resolution comes from `codex-review.yml`'s own terminal-status step
(PR #702), which runs on all exit paths and typically resolves in under a
minute. That is a different mechanism. Do not credit this watchdog with it.

The 30 minutes is the age at which a status becomes **eligible** to be failed.
It is not a deadline, and nothing bounds how long a status can stay pending.
GitHub does not guarantee scheduled workflows run on time and drops them under
load: on 2026-07-29 four consecutive `*/10` firings were missed, no sweep ran
for about 45 minutes, and PR #701 sat pending for 77 minutes. Nothing was
misconfigured.

This is load-bearing in **at least two** places:

1. **The status-write-failure path**, where `codex-review.yml` provably cannot
   resolve its own status because the status API is what is failing.
2. **A hung `codex exec`.** `run_model` in `scripts/codex-review-run-chunks.py`
   caps each `codex exec` at `CODEX_REVIEW_MODEL_CALL_TIMEOUT` seconds (default
   1500) and retries once, so one hung call costs at most about 50 minutes before
   that chunk is written as NEEDS_HUMAN and the run moves on. Several hung calls
   in one run can still reach the 90-minute ceiling, and no `workflow_run`
   completion event is emitted while a call hangs, so the scheduled sweep remains
   the cover for that residual.

Everywhere else `codex-review.yml`'s own terminal-status step (PR #702)
resolves the status. A strict bound would need a monitor outside GitHub
Actions; scheduling cannot provide one. There is also no `workflow_dispatch`
on the watchdog, so there is currently no operator lever and no audited manual
path (issue #717).

Chunked reviews can legitimately take longer than the old 2-3 model-call path.
`scripts/codex-review-run-chunks.py` can repost pending status before every
model call (`--heartbeat`), but the workflow no longer passes that flag
(2026-10-02): the heartbeat needs a GitHub token in the process that starts
codex, and it only ever refreshed the pending text. The watchdog times a run
from its EARLIEST pending status, so heartbeats never moved its clock. Progress
is in the run log.

Measured smoke timing:

- 2026-07-25 confirmation smoke on synthetic large non-PII PR #685: 6 chunks,
  12 chunk calls plus 2 synthesis calls, all approve-converged.
- Reviewer step wall-clock: 75 seconds for 14 serial `codex exec` calls.
- Total workflow wall-clock: about 2 minutes 27 seconds.
- Reasoning effort: none, as currently shipped by
  `scripts/codex-review-run-chunks.py`.
- Heartbeats (then enabled) fired about every 5-6 seconds.

The 16-chunk worst case has not been live-smoked yet. Using the #685 timing as
a rough lower-bound throughput check, assuming the smoke had no structural
retries (75 s / 14 invocations = about 5.4 s per invocation), 51 logical calls
would be about 4.5 minutes of reviewer-step time. A 102-invocation case would
be about 9 minutes only if retries fail fast. A single hung `codex exec`
dominates that estimate: it is bounded by the per-call timeout (1500 s, retried
once, so up to about 50 minutes for that chunk), and several hung calls can
still reach the 90-minute job timeout. Past that, the watchdog will fail the
stale status, but only once it is 30 minutes old AND a scheduled sweep actually
runs, which is best-effort and unbounded.
Treat 5.4 s as a floor, not an estimate: per-call latency scales with prompt size, and
the manifest block embedded in every chunk prompt grows with chunk count.

Two known limits this cap raise does not address, both unchanged from the
8-chunk canary and both currently fail-closed rather than wrong:

- `run_model` passes `timeout=` (1500 s per attempt, one retry; env
  `CODEX_REVIEW_MODEL_CALL_TIMEOUT`) to `subprocess.run`, so a single hung
  `codex exec` costs up to about 50 minutes and then that chunk is NEEDS_HUMAN.
  Two residuals: the kill reaches the direct child only, so an orphaned `codex`
  process could still write `output_path` while the retry runs; and several
  hung calls can still push the run past the 90-minute ceiling. In that case the
  watchdog flips the status once a scheduled sweep sees it at least 30 minutes
  stale, so the merge gate does resolve fail-closed, but the timing is
  best-effort: the sweep may be delayed or skipped, and the runner minutes and
  operator wait time are spent either way.
- The synthesis prompt embeds every chunk review verbatim
  (`chunk_result_group` keeps the full `review` object for each run), so its
  input scales with chunks times runs: up to 48 full review objects at this
  cap, versus 24 before. Neither `chunk-review-schema.json` nor
  `synthesis-prompt.md` bounds finding count or description length. A synthesis
  prompt too large to answer degrades to an invalid review and blocks, which is
  correct but moves the failure from chunking to synthesis.

If real timings approach the 30-minute staleness threshold, keep the
fail-closed status behavior and revisit chunk parallelism or job boundaries as a
separate design. Do not treat the watchdog as a timing backstop it cannot be.

Chunked evidence is still opt-in through `CODEX_REVIEW_EVIDENCE_MODE=chunked`;
the workflow defaults to bounded evidence. Do not make chunked evidence the
default, or raise the 16-chunk ceiling, without a fresh large non-PII smoke and
recorded wall-clock result.

This timing is valid only for the current `reasoning effort: none` config. If
production changes to a higher reasoning effort, re-run the controlled smoke and
replace this timing before flipping `CODEX_REVIEW_EVIDENCE_MODE=chunked` to the
default.

## Human exit

If coverage is incomplete for a non-excludable path, a human maintainer with
admin rights clears the fail-closed result by reviewing the PR directly and
using GitHub's audited admin-merge path. Do not manually post a green
`codex-review/deep-pass` status from automation to bypass incomplete evidence.
