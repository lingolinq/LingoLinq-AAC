# AI instruction cleanup: entry points for Claude, Codex and Copilot

**Started:** 2026-09-16
**Status:** in review (PR #988 to `develop`, branch `scot/chore/ai-instruction-cleanup`)
**Scope:** the repo-owned instruction entry points only (`CLAUDE.md`, `AGENTS.md`,
`.github/copilot-instructions.md`, `app/frontend/CLAUDE.md`, `.claude/rules/*.md`,
`.claude/settings.json`). Shared instruction sources, the installed global copies, the
launchers and the Codex/Claude skills belong to `ai-company-brain` and are not edited here.
Continues the 2026-09-16 handoff at
`docs/task-management/2026-09-16_ai-tooling-efficiency-cleanup-handoff.md` (unlanded on
`docs/scot-compliance-register-reporting-date`) and the #961 consolidation.

## What loads where (verified 2026-09-16)

| Tool | Loads at start | Loads on demand | Never sees |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` (brain copy, 376 lines), root `CLAUDE.md`, `.claude/rules/*.md` without `paths:` (none here), `.claude/settings.json` | `app/frontend/CLAUDE.md` when a file under it is read; the three `paths:`-scoped rules when a matching file is read; skills on invocation | `AGENTS.md`, `.github/copilot-instructions.md` |
| Codex CLI | `~/.codex/AGENTS.md` (brain copy, 803 lines, drifted from source) then root `AGENTS.md`, walking root to cwd only, frozen at session start, capped by `project_doc_max_bytes` (65536 here) | nothing by path; it follows pointers it reads | `.claude/rules/*.md`, `app/frontend/CLAUDE.md`, `.claude/skills/*` unless pointed at them |
| Copilot | `.github/copilot-instructions.md` | repo files it opens | `.claude/**` unless pointed at them |

Sources: Claude memory docs (`code.claude.com/docs/en/memory`, read 2026-09-16: subdirectory
files "are included when Claude reads files in those subdirectories"; path rules "trigger
when Claude reads files matching the pattern"; "target under 200 lines per CLAUDE.md file").
Codex AGENTS.md docs (`learn.chatgpt.com/docs/agent-configuration/agents-md`, read
2026-09-16: "Starting at the project root ... Codex walks down to your current working
directory"; "stops adding files once the combined size reaches the limit"). OpenAI's
"Rethinking skills and prompts" post: "Requiring a stack of docs or a full repo map before
every edit is excessive for a typo fix"; move workflow guidance to on-demand skills; remove
approval steps written for older models.

## Findings

1. **Codex could not discover the three path-scoped rules.** `AGENTS.md` pointed at
   `app/frontend/CLAUDE.md`, the `pr-preflight` skill and the docs, but not at
   `.claude/rules/compliance-docs.md` (attested bytes frozen, `regenerate-register.sh --check`),
   `data-bearing-paths.md` (Tier 1 boundary, expand-contract migrations) or `deploy.md`.
   Those files exist only as Claude path rules, and Codex loads nothing by path. Same gap
   for Copilot. FIXED: one pointer paragraph in `AGENTS.md`, one bullet in the Copilot file.
2. **Rule #0 item 12 mandated the `/fix-proposal` fact sheet for every change**, while the
   header says Rule #0 "applies to every change: additions, refactors, fixes, deletions,
   styling" and the skill's own description scopes it to "any bug fix or behaviour change".
   A docs or config change had no sensible way to satisfy "write the red test first".
   FIXED: item 12 and the table row now say bug fix or behaviour change in application
   code; only a change that cannot alter runtime behaviour skips the sheet (adversary
   review moved the exemption from file class to runtime effect).
3. **Rule #0 item 8 required reading the whole curated `LEARNINGS.md` (294 lines) before
   any researched task.** FIXED: grep both files for the surface's keywords and read the
   matching entries, which is what the archive README already describes.
4. **`.github/copilot-instructions.md` carried a hand-maintained "Last Updated" stamp**
   that goes stale on every other edit and says nothing git does not. FIXED: removed.
5. **`docs/task-management/2026-09-12_ai-config-consolidation.md` still said "in review"**
   for a PR squash-merged 2026-09-13 (`7183d488f`). FIXED: status line.

Checked and left alone: every path cited by the seven entry-point files resolves (scripted
check, 2026-09-16); version pins agree with the repo (`.ruby-version` 3.4.4, `.nvmrc` 22,
`Gemfile.lock` rails 7.2.3.2, `ember-source ~5.12.0`); branch spec agrees across `CLAUDE.md`,
`AGENTS.md`, the Copilot file and `CONTRIBUTING.md` (nine types plus `hotfix` from `main`);
"Copilot code review runs automatically on every PR to `develop`" is true (ruleset
`Copilot PR Review`, `copilot_code_review` on `~DEFAULT_BRANCH`); `develop` requires
`rspec`, `build-and-test`, `audit-artifacts-integrity`, `secret-detection`,
`codex-review-tests`; `.claude/settings.json` denies are the only enforceable controls in
the repo config and were not touched. The three agent hooks are wired per agent, not
globally, and were not touched.

## Not done here, and why

- **A PreToolUse hook that blocks edits on `develop`, `staging`, `main`** would turn the
  branching rule from prose into an enforced control (the memory docs say CLAUDE.md is
  "context, not enforced configuration"). It runs for every teammate and needs deny and
  allow cases in `scripts/tests/agent-hook-guards-test.sh` first. Follow-up, not this PR.
- **Copilot path-scoped instructions** (`.github/instructions/*.instructions.md` with
  `applyTo`) could mirror `.claude/rules/` for Copilot code review. Adds three files to keep
  in step; the pointer bullet covers discovery for now.
- **Brain-owned items** (handoff, not edited here): `~/.codex/AGENTS.md` is 803 lines and
  drifts from `instructions/CODEX.md`; `~/.claude/CLAUDE.md` restates AAC-owned facts
  (NODE VERSION section, Hosting section, AAC branch base) that the repo files already
  carry, so two sources can disagree; the per-repo hard rules in `commands/lingo.md` repeat
  the same list a third time. Desired behaviour: the global files hold cross-repo policy
  and point at the repo's `CLAUDE.md` / `AGENTS.md` for repo facts.

## Verification

- `git diff --check` clean; no em dashes in touched files.
- Path-rule globs resolve to tracked files (`git ls-files` per glob, see PR body).
- Codex byte budget on 2026-09-16: `~/.codex/AGENTS.md` 48151 B plus `AGENTS.md` 3609 B against
  `project_doc_max_bytes` 65536, so 13776 B of headroom. Codex drops whole files at the cap,
  and the global file is brain-owned, so this is a measurement, not a guarantee.
- `CLAUDE.md` 195 lines (cap 200).
- Codex review of the diff (Tier 2: docs only, no data-bearing paths).
