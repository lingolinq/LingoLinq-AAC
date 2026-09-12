# AI-agent configuration consolidation

**Started:** 2026-09-12
**Status:** done (branch `scot/chore/ai-config-consolidation`, PR to `develop`)
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

22 commits, one item each; see `git log origin/develop..HEAD`. Two adversary findings
changed the plan: the GitHub MCP deny list grew from 7 to all 12 write tools, and the
proposed base-branch edit hook was dropped (it would deny every edit inside a
Claude-created worktree, because `CLAUDE_PROJECT_DIR` does not follow the worktree).

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

## Lessons for LEARNINGS

Appended to `docs/task-management/learnings-archive/2026-09.md`.
