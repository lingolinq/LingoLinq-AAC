# AI-agent configuration consolidation

**Started:** 2026-09-12
**Status:** in review (branch `scot/chore/ai-config-consolidation`, PR #961 to `develop`)
**Scope:** apply the accepted items of the 2026-09-12 read-only audit of the repo's AI-agent
configuration (CLAUDE.md, AGENTS.md, Copilot/Gemini/Cursor files, `.claude/`, `.mcp.json`,
GitHub Actions, agent-facing docs, LEARNINGS.md).

## Goal

Every persistent instruction is accurate at HEAD, loads only where it applies, and every
deterministic requirement that already has a mechanism points at that mechanism instead of
prose. Dead Render-era artifacts are gone; the Codex gate's real status is written down.

## Context

Full audit report (inventory, target architecture, plan, validation matrix, decisions):
`~/ai-company-brain/outputs/docs/2026-09-12-aac-ai-config-audit.md`. Decisions taken by Scot
on 2026-09-12: revive the Codex gate; add Copilot to the reviewer registry (brain repo);
track `AGENTS.md`; archive Gemini Code Assist config; one branch spec; delete `claude-fix`;
drop `memory: project`; version the cited planning file; keep `Author-Model` in the PR
template; curate LEARNINGS by admission rule.

## Investigation (evidence)

- Four parallel read-only inventory agents plus orchestrator re-verification; every claim
  in the report is labelled CONFIRMED or PLAUSIBLE.
- Live checks via the GitHub API on 2026-09-12: required checks per branch, workflow run
  history (weekly-release-pr 19/19 failures, aging-digest 60/60, codex-review last run
  2026-08-04), Copilot ruleset, repo/org secret names.
- Claude Code facts verified against the official docs (nested CLAUDE.md load rules,
  `.claude/rules` `paths:` frontmatter, memory index 25 KB cap, project deny on MCP tools).

## Resolution

One commit per item; see `git log origin/develop..HEAD`. Two adversary findings during
implementation changed the plan: the GitHub MCP deny list grew from 7 to all 12 write tools,
and the proposed base-branch edit hook was dropped (it would deny every edit inside a
Claude-created worktree, because `CLAUDE_PROJECT_DIR` does not follow the worktree).

Dual review of the finished branch (Codex senior-dev pass, Claude adversary pass: 2 High,
5 Medium, 8 Low, ship-with-changes) produced six follow-up commits (including two register
regenerations and this log):

- Codex P2: the Phase 4 and Phase 5 GCP cutover runbooks still told operators to run the
  deleted Render secret sync; both now open with a dated "historical" note.
- Adversary High 1: infra-auditor.md claimed the read-only guard denied "every
  secret-revealing path"; fed to the hook, `gcloud secrets versions access`,
  `aws secretsmanager get-secret-value`, `aws ssm get-parameter --with-decryption` and
  `gcloud run jobs execute` were all allowed. The guard now denies them (and `gcloud auth
  print-*-token`, aws credential exports); the prose names exactly what the hook covers.
- Adversary High 2: the compliance-officer hook's gh pattern matched the verb anywhere on
  the line, so `gh workflow run deploy-cloudrun.yml`, `gh release upload` and
  `gh api --raw-field` were allowed while `gh run list --workflow codex-review.yml` was
  denied. Both hooks now match `gh <noun> <verb>`; 91 stdin-payload cases, 0 mismatches.
- Mediums: register-writer scripts denied without `--check`; README console paragraph
  matched to the real guard; a red-then-green test for the run-chunks timeout (proven by
  a scratch mutant that swallows the timeout: 1 failure, the new test); CLAUDE.md pointers
  to `bin/fresh_start`, `bin/kill_all` and the DB-user recipe fixed.
- Lows: modal header citation reworded (36 files, line counts unchanged); deploy-cloudrun
  and weekly-release-pr comments; CONTRIBUTING one-liner now keyed; archive markers point
  at `docs/INFRASTRUCTURE.md`; the `whenever` queue restored to the queue list with a note
  that the Cloud Run worker entrypoint does not drain it (unverified live; possible
  operational defect, see INFRASTRUCTURE.md).
- Decision withheld: `docs/planning-evidence/` (a copy of the gitignored PLAN.md the
  attested legal docs cite) was REMOVED from the branch. The repo is public and the plan
  holds counsel-gated internal content; publishing it is Scot's call, not the branch's.

Not changed: the commit subject of 4ad30a875 ("make the weekly release PR workflow able to
succeed") overstates; the workflow still needs the repo setting flipped. Left in history,
stated in the PR body.

## Not done (Scot's manual steps or follow-ups)

- Remove GitHub secrets `RENDER_API_KEY` (repo and org), `RENDER_SECRET_KEY`,
  `OP_RENDER_SYNC_TOKEN`; revoke the 1Password service-account token.
- Flip "Allow GitHub Actions to create and approve pull requests"; set or delete
  `GOOGLE_CHAT_WEBHOOK_AUTOMATION`.
- Codex revival steps in `.github/codex/README.md`; Copilot registry row in the brain.
- Prune `.claude/settings.local.json`; delete the two `.claude/worktrees/` leftovers.
- Brain repo: global CLAUDE.md guard-script name, global GitHub MCP deny, PAT downscoping,
  Codex trusted-project list. Auto-memory prune.
- Existing agent hooks resolve `$CLAUDE_PROJECT_DIR`, which does not follow a
  Claude-created worktree (adversary finding B2); needs a `cwd`-first resolution.
- Decide whether to publish the disclosures-content PLAN.md copy (see Resolution); if yes,
  re-add `docs/planning-evidence/` with a README that does not overclaim resolvability.
- Verify live whether anything drains the `whenever` Resque queue on Cloud Run.

## Lessons for LEARNINGS

Appended to `docs/task-management/learnings-archive/2026-09.md`.
