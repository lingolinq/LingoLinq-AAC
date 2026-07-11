---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 1 planned, plan-checker PASS, adversary-review ship-with-conditions (conditions applied to plans); ready for /gsd-execute-phase 1
last_updated: "2026-07-11T02:27:58.000Z"
last_activity: 2026-07-10/11 -- bootstrapped single-phase project, planned Phase 1 (2 plans), ran gsd-plan-checker (PASS, 4 non-blocking warnings), ran adversary-review (ship-with-conditions), applied all 3 conditions to the plans. Worktree was unexpectedly deleted mid-session (worktree+branch both gone, cause undetermined -- not the worktree-sweep cron, which only runs Mondays and skips this repo for stash entries) and was recreated from scratch with commit_docs now true to prevent recurrence.
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 2
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (created 2026-07-10)

**Core value:** A person who opens a once-valid, now-expired lesson/board share link gets a clear, recoverable message instead of a bare 404 or an unstyled error page.
**Current focus:** Phase 1 (Expired-Link UX) — plans written and reviewed, ready to execute.

## Context

This project bootstraps directly from a fully-specified follow-up finding rather than fresh
domain research: `~/ai-company-brain/outputs/plans/2026-07-09-lesson-share-token-scope-ll-90045bb29c.md`
(FOLLOW-UP section), filed from Claude's adversary review of PR #568 (LL-90045bb29c option (b),
already merged to `origin/staging`). Scot's decisions on lifespan, email TTL, rollout lever, and
legacy-fallback residual are locked in that doc and out of scope here (see PROJECT.md).

Working in an isolated worktree
(`~/.local/share/agent-wt/worktrees/LingoLinq-AAC-ea35b3a9/lesson-expired-link-ux`) on branch
`scot/feat/lesson-expired-link-ux`, cut from `origin/staging` (which already has PR #568's
`lesson_share_token` code — the primary checkout at `/mnt/c/Users/scotw/projects/LingoLinq-AAC`
does not, per the known main-vs-staging lag).

## Review history

- **gsd-plan-checker (goal-backward verification):** PASS, no blockers. 4 non-blocking warnings:
  (1) Plan 01's frontmatter over-claimed UX-06 coverage — fixed (removed from 01-01, UX-06 lives
  solely in 01-02); (2) ROADMAP's "runtime trace, not just unit test" bar is nominally stronger
  than the stubbed-acceptance-test primary mechanism in 01-02 — accepted, plan requires an
  `ember serve` attempt first and explicit SUMMARY disclosure if not feasible; (3) Plan 01 opts
  out of a new feature flag for this UX change — flagged for a one-line confirmation from Scot
  before merge (not before execution); (4) Plan 02 has 4 tasks (context-budget watch, not a
  functional issue).
- **adversary-review (red-team):** Ship-with-conditions, no blockers. 3 conditions applied
  directly to the plans: (1) documented why the retained (but now functionally unused)
  `find_by_lesson_share_token` call in `boards_controller#lesson` must stay — legacy-token
  telemetry for LL-310b464be4 sunset tracking; (2) `setupController` must explicitly overwrite
  `model` on both branches so a stale prior lesson can't linger across a fast valid->expired
  transition, plus a new regression test asserting this; (3) a pre-existing, out-of-scope
  unauthenticated write-on-read in `Lesson#nonce` was explicitly called out as NOT to be "fixed"
  here (switching to `settings['nonce']` risks breaking first-time share-link opens without
  verification) — documented as a separate future hardening item, not touched.
