# Branch naming convention: `<type>/<dev>-<kebab-slug>`

**Date:** 2026-09-17. **Branch:** `docs/scot-branch-naming-convention-f3117a76` from `origin/develop` at d76081fe9.
**Scope:** docs only. No code, config, workflow or hook changes.

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
  (`grep` over `.github/workflows`, `scripts`, `.claude/hooks`, `bin`: only
  `codex-review.yml` reads `headRefName`, for scoping, not validation).
- Teammates have used both forms in merged branches (`feat/melissa-sms-consent-page`,
  `melissa/fix/whenever-queue-drain`), so the generalised form has precedent.
- Rule #0 item 12 does not apply: this change cannot alter runtime behaviour.

## Assumption stated in the PR body

The team form generalises Scot's decision to every developer handle. The brain plan
(`outputs/plans/2026-09-16-aac-handoff-brain-items-plan.md`, section 2) named this as
the assumption to confirm in this PR rather than in the brain.
