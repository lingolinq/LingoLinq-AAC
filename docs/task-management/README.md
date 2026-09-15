# Task Management

Working logs and accumulated learnings for any non-trivial task in this repo.
Established by CLAUDE.md Rule #0 item 8.

## How it works

- **Per-task log.** As soon as a task needs research (diagnosis, multi-file
  exploration, multiple iterations), create a new file here:
  `YYYY-MM-DD_<kebab-task-name>.md` (underscore after the date, see File
  naming). Use it as a live working log: goal, hypotheses, attempts, what
  worked, what failed, evidence (`file:line`), decisions. Update it as you
  go, not at the end.
- **Shared learnings.** Before starting a task, read the curated
  [LEARNINGS.md](LEARNINGS.md) (short, grouped by surface) and grep
  `learnings-archive/` for your surface's keywords. After the task succeeds,
  append any durable lesson (a root-cause pattern, a reusable technique, a
  codebase gotcha) to `learnings-archive/YYYY-MM.md` for the current month.
  Promotion into the curated file is a deliberate, reviewed edit that must
  meet the admission rule stated at the top of `LEARNINGS.md`.
- **Skip threshold.** A truly trivial change (a typo, a one-line tweak that
  needs no investigation) doesn't need a per-task file. Everything else
  does.

## File naming

`YYYY-MM-DD_<kebab-task-name>.md`: date prefix gives a chronological sort;
the slug should read like a sentence fragment that names what the task was
about (`fix-folder-drilldown-cluster-hiding`, `add-search-to-folder-dropdown`,
etc.).

The separator after the date is an UNDERSCORE on purpose. `.gitignore` ignores
`YYYY-MM-DD-*.md` (dash form) everywhere in the tree, so a dash-named log is
local scratch that never reaches a PR and any evidence pointer to it dangles
for every other reader. Use the dash form only for a log you intend to keep
private to your machine, and never cite such a file from a tracked document.

## Template

```markdown
# <Task title>

**Started:** YYYY-MM-DD
**Status:** in-progress | done | blocked
**Scope:** one-line description

## Goal
What "done" looks like, in one or two sentences.

## Context / prior knowledge
Relevant findings from LEARNINGS.md or other prior work.

## Investigation
- Files inspected (with `file:line` evidence)
- What the code actually does vs. what was expected
- Hypotheses considered

## Attempts
- **Attempt 1 — <short label>.** What was tried, what happened, kept/reverted.
- **Attempt 2 — <short label>.** ...

## Resolution
What landed, why, links to the commits/PRs.

## Lessons for LEARNINGS.md
Durable patterns or gotchas worth distilling upstream.
```
