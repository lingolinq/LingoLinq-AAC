# Resolve LEARNINGS merge conflict

**Started:** 2026-05-26
**Status:** done
**Scope:** Resolve the active merge conflict in `docs/task-management/LEARNINGS.md` without dropping entries from either side.

## Goal
Leave `docs/task-management/LEARNINGS.md` in a clean merged state with all durable learning entries preserved and no remaining git conflict on the file.

## Context / prior knowledge
Skimmed `docs/task-management/LEARNINGS.md` first per Rule #0 item 8. The conflict was in the shared learnings file itself, so the safe merge strategy was to compare base, ours, and theirs and keep all distinct entries.

## Investigation
- `git status --short --branch` showed a single unresolved file: `docs/task-management/LEARNINGS.md`.
- The working copy contained conflict markers in the index and near the end of the document around the newly added learning sections.
- `git show :1:docs/task-management/LEARNINGS.md` confirmed the base file ended after the stale Ember bundle entry.
- `git show :2:docs/task-management/LEARNINGS.md` added the `organizations.admin` entry plus the duplicate-selector note.
- `git show :3:docs/task-management/LEARNINGS.md` added the `RESERVED_ROUTES` entry.

## Attempts
- **Attempt 1 — three-way compare.** Compared base/ours/theirs directly, verified the additions were independent, and merged by preserving both new index links plus both new learning sections.

## Resolution
Removed the conflict markers from `docs/task-management/LEARNINGS.md`, kept both added learning entries, and staged the file to clear the merge conflict.

## Lessons for LEARNINGS.md
No new durable codebase lesson beyond the task-specific merge resolution work.
