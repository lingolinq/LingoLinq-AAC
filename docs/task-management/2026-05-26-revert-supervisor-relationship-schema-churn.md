# Revert supervisor relationship schema churn

**Started:** 2026-05-26
**Status:** done
**Scope:** Remove an unrelated `db/schema.rb` dump-format change from the beta feedback branch.

## Goal
Return `db/schema.rb` to the same effective schema shape as `staging` so this branch does not include an unrelated partial-index serialization change.

## Context / prior knowledge
Skimmed `docs/task-management/LEARNINGS.md`; no existing entry directly covered schema-dump-only churn.

## Investigation
- Checked `db/schema.rb:538-542` and confirmed the only relevant line is the `index_supervisor_rel_active_pair` partial index dump.
- Checked `db/migrate/20260322000001_create_supervisor_relationships.rb:27-39` and confirmed the migration already defines this index with `where: "status IN ('pending', 'approved')"`.
- Compared this branch to `staging` and verified the schema diff is only a `where:` string reserialization, not a functional migration or index change.

## Attempts
- **Attempt 1 — verify diff origin.** Confirmed the branch introduces only a normalized schema dump string for the existing partial index.

## Resolution
Reverted the single `db/schema.rb` hunk for `index_supervisor_rel_active_pair` so the branch no longer carries an unrelated schema-dump serialization change. Left the existing migration unchanged because it already defines the intended partial index and there was no functional database change to preserve in this PR.

## Lessons for LEARNINGS.md
- Candidate lesson: when a PR only changes a `schema.rb` partial-index predicate string and the originating migration is unchanged, treat it as likely schema dump churn and revert unless the PR intentionally changes the DB shape.
