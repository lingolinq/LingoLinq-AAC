---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-07-11T05:55:01.669Z"
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (created 2026-07-10)

**Core value:** A person who opens a once-valid, now-expired lesson/board share link gets a clear, recoverable message instead of a bare 404 or an unstyled error page.
**Current focus:** Phase 1 (Expired-Link UX) — Plan 01-01 (backend controller + specs) and Plan 01-02 (Ember route/controller/template + UX-06 runtime finding) both complete. Phase 1 is the only phase in this project; project is functionally complete pending Scot's review/merge.

## Decisions

- Plan 01-01: no feature flag added for the `boards_controller#lesson` expired-token render change (Scot, confirmed 2026-07-11) — this is error-state polish on an already-broken path (expired tokens currently 404 or throw), not a new user-facing capability, so CLAUDE.md's new-feature-flag rule does not apply.
- Plan 01-01: retained the now-branch-irrelevant `User.find_by_lesson_share_token` call in `boards_controller#lesson`, documented inline, solely to preserve legacy-token telemetry logging for LL-310b464be4 sunset tracking (adversary-review condition).
- Plan 01-01: left `Lesson#nonce`'s pre-existing unauthenticated write-on-read untouched (adversary-review finding) — out of scope, separate future hardening item.
- [Phase 01-expired-link-ux]: Plan 01-02: UX-06 runtime finding - Ember Data 5.3.8 store.findRecord RESOLVES (does not reject) for an id-mismatched, user-less lesson payload; logs warnings instead of throwing. routes/lesson.js handles resolve-with-no-user as the primary path, .catch as a defensive fallback.
- [Phase 01-expired-link-ux]: Plan 01-02: used setupTest container tests (not setupApplicationTest+visit()) for runtime verification and acceptance coverage, since visit() hangs under Mirage in this repo (documented, already-skipped precedent); satisfies REQUIREMENTS.md UX-06's explicit integration-test alternative.
- [Phase 01-expired-link-ux]: Plan 01-02: reverted a full 'ruby i18n_generator.rb --generate' run (it reordered/dropped ~190 unrelated en.json keys); added only the 3 new link_expired_* keys by hand to en.json, plus *** placeholders to es.json only.

## Session

- **Last session:** 2026-07-11T05:55:01.642Z
- **Resume file:** None

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
