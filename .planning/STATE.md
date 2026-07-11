---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-07-11T04:54:09.221Z"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (created 2026-07-10)

**Core value:** A person who opens a once-valid, now-expired lesson/board share link gets a clear, recoverable message instead of a bare 404 or an unstyled error page.
**Current focus:** Phase 1 (Expired-Link UX) — Plan 01-01 complete (backend controller + specs); Plan 01-02 (frontend SPA route) up next.

## Decisions

- Plan 01-01: no feature flag added for the `boards_controller#lesson` expired-token render change (Scot, confirmed 2026-07-11) — this is error-state polish on an already-broken path (expired tokens currently 404 or throw), not a new user-facing capability, so CLAUDE.md's new-feature-flag rule does not apply.
- Plan 01-01: retained the now-branch-irrelevant `User.find_by_lesson_share_token` call in `boards_controller#lesson`, documented inline, solely to preserve legacy-token telemetry logging for LL-310b464be4 sunset tracking (adversary-review condition).
- Plan 01-01: left `Lesson#nonce`'s pre-existing unauthenticated write-on-read untouched (adversary-review finding) — out of scope, separate future hardening item.

## Session

- **Last session:** 2026-07-11T04:49:50Z — Completed 01-01-PLAN.md (`boards_controller#lesson` expired-token render fix + controller specs; commits `d64fef846`, `4ddc6f9c6`).
- **Resume file:** .planning/phases/01-expired-link-ux/01-02-PLAN.md

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
  out of a new feature flag for this UX change — Scot confirmed 2026-07-11: no flag, this is
  error-state polish on an already-broken path, not a new capability; decision recorded inline
  in 01-01-PLAN.md Task 1; (4) Plan 02 has 4 tasks (context-budget watch, not a
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
