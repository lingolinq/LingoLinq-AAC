# Branch naming convention: `<type>/<dev>-<kebab-slug>`

**Date:** 2026-09-17. **Branch:** `docs/scot-branch-naming-convention-f3117a76` from `origin/develop` at d76081fe9.
**Scope:** docs, plus one glob in `.github/workflows/codex-review.yml` (see "Adversary
findings" below) and the Rule #0 item 12 paper trail for that glob (fact sheet
in this log, `scripts/codex-review-chunked-scope.test.py`).

## What changed

`CLAUDE.md` (Branching), `AGENTS.md` (Hard rules), `.github/copilot-instructions.md`,
`CONTRIBUTING.md` (branch table, Branch Naming, Workflow snippets, section 7) and
`docs/pre-merge-audit-checklist.md` 4.1 now state one form for new branches:
`<type>/<dev>-<kebab-slug>`, hotfixes `hotfix/<dev>-<slug>`. Branches opened before
2026-09-16 in the `<dev>/<type>/<slug>` form keep their names through merge.

## Why

Scot settled the form on 2026-09-16 while verifying PR #988 (brain decision log,
2026-09-16 entry: "new branches use <type>/scot-<description> (the form the agent-wt
launcher already generates). Existing open-PR branch names are preserved"). The
deployed launcher builds `branch="$type/scot-$slug-$token"` (`~/.local/lib/agent-wt/wt-common.sh`,
verified 2026-09-17), so the written rule had been contradicting the tool that creates
every launcher-owned branch. PR #988's body recorded the departure; this PR closes it.

## Facts checked

- No CI job, hook or script in this repo validates branch names against a pattern
  (`grep` over `.github/workflows`, `scripts`, `.claude/hooks`, `bin`). One consumer
  MATCHES on the prefix: `codex-review.yml` `scot)` scope arm, which decides
  chunked versus bounded evidence. Under the new form Scot's branches never match
  the old `[[ "$PR_HEAD_REF" == scot/* ]]`. Fixed in this PR, see below.
- Teammates have used both forms in merged branches (`feat/melissa-sms-consent-page`,
  `melissa/fix/whenever-queue-drain`), so the generalised form has precedent.
- Rule #0 item 12 **does** apply: the glob lives in a workflow, and
  `CLAUDE.md:57-64` classifies workflows as application code. The earlier claim
  that the docs-only exception covered this PR was false. Fact sheet and red
  test are below (added after Codex P1 on PR #1005).

## Adversary findings applied (2026-09-17)

1. **Medium.** `codex-review.yml` line 150 matched only `scot/*`, so the live
   `CODEX_REVIEW_CHUNKED_SCOPE=scot` arm would drop every launcher-named Scot PR to the
   60,000-byte bounded path once the gate is revived (last run 2026-08-04; not a
   required check). Widened to `scot/* || */scot-*`; `.github/codex/README.md` updated
   to match. Proof, run in bash with the new expression:
   `scot/chore/x` MATCH, `docs/scot-branch-naming-convention-f3117a76` MATCH,
   `fix/melissa-scot-thing` no, `melissa/fix/x` no. The old expression misses the
   second input.
2. **Medium.** "The isolated launchers generate this form" overclaimed: the deployed
   launcher hardcodes `branch="$type/scot-$slug-$token"`. Reworded to "Scot's isolated
   launcher generates `<type>/scot-<slug>-<token>`" in `CLAUDE.md` and `CONTRIBUTING.md`.
3. **Medium.** `AGENTS.md` and `.github/copilot-instructions.md` grandfathered the old
   form without forbidding new branches in it. Added "do not start new ones in that form".
4. **Low.** The launcher whitelists nine types and refuses `hotfix` and `release`. Docs
   now say those branches are created by hand.

Second-round items applied: `docs/pre-merge-audit-checklist.md` 4.1 now lists
`hotfix/` and `release/`, exempts release branches from the handle
(`release/staging-into-main-<YYYY-MM-DD>` is the merged precedent, five PRs since
2026-08-21), and scopes its `git branch -m` hint to unpushed new branches;
`CONTRIBUTING.md` names all five files in the "change together" pointer and states the
release form; `AGENTS.md` bullet reflowed so the token clause no longer reads as a type.

Recorded, not fixed: the new form joins handle and slug with the same delimiter, so
a hyphenated login (`traci-day`) is not machine-parseable from the branch name. No
tooling depends on it today. Scot settled the form; this is a consequence to know, not
a reason to reopen it. The type list is also fixed at nine; the merged
`scot/ci/docs-only-fast-path` used a `ci` type that is not in it.

Launcher-side follow-ups outside this repo (ai-company-brain `scripts/lib/wt-common.sh`):
the hardcoded `scot` handle, and `wt_session_name` still stripping a `scot/` prefix.

## Rule #0 item 12 fact sheet (workflow glob)

Codex P1 on PR #1005: the task log claimed this change could not alter runtime
behaviour. That is false for `.github/workflows/codex-review.yml:150`. The
docs-only exception does not cover workflows.

### (a) Where is the value READ?

`PR_HEAD_REF` is read at `.github/workflows/codex-review.yml:150` inside the
`scot)` arm of `Resolve Codex review evidence mode`. That arm runs only when
`CODEX_REVIEW_REQUESTED_EVIDENCE_MODE=chunked` (`yml:144`) and
`CODEX_REVIEW_CHUNKED_SCOPE=scot` (`yml:149`). A match sets `effective=chunked`,
exported as `CODEX_REVIEW_EVIDENCE_MODE` (`yml:167`), which later selects
bounded diff gather (`yml:266-267`) versus chunked evidence (`yml:312-313`,
`yml:389-391`). **CONFIRMED** (`codex-review.yml:144-151,167,266-267,312-313,389-391`).

The resolve step runs before checkout (`yml:136` then `yml:178`), so the
matcher cannot live in a repo script without rearranging the fail-closed
prefix. **CONFIRMED**.

### (b) What are ALL the shapes?

Writers of `PR_HEAD_REF`: `gh pr view ... headRefName` (`yml:142`). Reachable
branch shapes: legacy `scot/<type>/<slug>`; new `<type>/scot-<slug>[-token]`;
hotfix `hotfix/scot-<slug>`; other-handle new `<type>/<dev>-<slug>` (including
`fix/melissa-scot-thing`); other-handle legacy `<dev>/<type>/<slug>`; bare
`scot`; `feat/scot` with no hyphenated slug. Writer of `PR_AUTHOR`:
`gh pr view ... author.login` (`yml:141`); `swahlquist` bypasses the glob.
**CONFIRMED** (convention files plus the case table in
`scripts/codex-review-chunked-scope.test.py`).

`CODEX_REVIEW_REQUESTED_EVIDENCE_MODE` defaults to `bounded` (`yml:59`).
`CODEX_REVIEW_CHUNKED_SCOPE` defaults to `all` if the GitHub var is unset
(`yml:60`). The glob only changes the result when requested=`chunked` and
scope=`scot`. `.github/codex/README.md:89-90` says those vars were still set
that way as of 2026-09-12; this session did not re-read GitHub Actions variables.
**CONFIRMED** (YAML defaults); **ASSUMED** (live var values; not load-bearing
for the glob itself). The workflow is not a required check and has not been
dispatched since 2026-08-04 (`codex-review.yml:11-13`). **CONFIRMED**.

### (c) Cross-file claims

- "Newly named Scot branches switch from bounded to chunked when the workflow
  runs" is true only on the `chunked`+`scot` arm, not on the YAML defaults.
  **CONFIRMED** (`yml:59-60,144-151`).
- Extracting the matcher to a script would require checkout before resolve, which
  currently sits after the pending-status and bind-pr steps. **CONFIRMED**
  (`yml:90-177`).

### Candidates

1. Extract the matcher to a repo script and sparse-checkout it before resolve.
   Rejected: rearranges the fail-closed prefix of a dormant required-check
   workflow for a one-line glob.
2. Keep the glob inline; add a test that extracts that `if` from the YAML and
   evaluates it in bash, plus a characterization that the old glob misses
   `docs/scot-branch-naming-convention-f3117a76`. Chosen.

Adversary already demanded the glob widening (Medium, applied in 776a513be).
This follow-up is the missing paper trail and red test, not a second glob change.

### Test

`scripts/codex-review-chunked-scope.test.py`, wired into `codex-review-tests` in
`.github/workflows/ci.yml`. Mutation that must fail: restore
`[[ "$PR_HEAD_REF" == scot/* ]]` with no `*/scot-*`. The extracted-condition
cases then miss `docs/scot-branch-naming-convention-f3117a76`;
`test_old_glob_misses_new_scot_form` records that miss as the bug.

## Assumption stated in the PR body

The team form generalises Scot's decision to every developer handle. The brain plan
(`outputs/plans/2026-09-16-aac-handoff-brain-items-plan.md`, section 2) named this as
the assumption to confirm in this PR rather than in the brain.
