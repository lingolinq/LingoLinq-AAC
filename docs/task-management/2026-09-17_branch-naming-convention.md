# Branch naming convention: `<type>/<dev>-<kebab-slug>`

**Date:** 2026-09-17. **Branch:** `docs/scot-branch-naming-convention-f3117a76` from `origin/develop` at d76081fe9.
**Scope:** docs, plus one glob in `.github/workflows/codex-review.yml` (see "Adversary
findings" below). No hook, script or application code changes.

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
  MATCHES on the prefix: `codex-review.yml` `scot)` scope arm,
  `[[ "$PR_HEAD_REF" == scot/* ]]`, which decides chunked versus bounded evidence.
  Under the new form Scot's branches never match it. Fixed in this PR, see below.
- Teammates have used both forms in merged branches (`feat/melissa-sms-consent-page`,
  `melissa/fix/whenever-queue-drain`), so the generalised form has precedent.
- Rule #0 item 12 does not apply: this change cannot alter runtime behaviour.

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

## Assumption stated in the PR body

The team form generalises Scot's decision to every developer handle. The brain plan
(`outputs/plans/2026-09-16-aac-handoff-brain-items-plan.md`, section 2) named this as
the assumption to confirm in this PR rather than in the brain.
