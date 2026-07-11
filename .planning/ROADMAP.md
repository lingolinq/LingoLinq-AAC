# Roadmap: LingoLinq Graceful Expired-Link UX (lesson_share_token)

## Overview

Single phase. The scope is fully specified by the source doc (adversary-review follow-up on
PR #568) and Scot's 2026-07-10 decisions; no domain research is needed before planning.

## Phases

- [ ] **Phase 1: Expired-Link UX** - Distinguish "lesson missing" (404) from "token invalid/expired" (graceful message) at both the Rails HTML-shell layer and the Ember Data layer; add i18n string; runtime-verify Ember Data 5.12 behavior.

## Phase Details

### Phase 1: Expired-Link UX
**Goal**: When a `lesson_share_token` fails to resolve (expired or malformed), the person sees an explicit "this link has expired, request a new one" message instead of a bare 404 or an unstyled Ember error state — on both the fresh-navigation path (`boards_controller#lesson`) and the already-booted-SPA path (`app/frontend/app/routes/lesson.js`). A lesson that is genuinely missing or nonce-mismatched still hard-404s, unchanged.
**Depends on**: Nothing (first and only phase)
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07
**Success Criteria** (what must be TRUE):
  1. `boards_controller#lesson` renders a distinct expired-link view/state when the lesson exists but the token doesn't resolve, and still hard-404s when the lesson itself is missing or nonce-mismatched
  2. `app/frontend/app/routes/lesson.js` has explicit handling for both a rejected `findRecord` and a resolved-but-user-absent model, both leading to the same "link expired" UI treatment
  3. The expired-link message is a new, double-quoted, i18n-routed string (not raw text), and reads identically whether the token was expired or malformed
  4. A runtime trace (not just a unit test) confirms which of the two code paths (rejected promise vs. nil-user resolved model) actually fires for a real expired token under Ember Data 5.12, and the implementation covers whichever one it is
  5. `git diff` against `origin/staging` touches only caller-side files (`boards_controller.rb`, `lesson.js`, its template/controller, locale files) — `app/models/user.rb`, `lib/feature_flags.rb`, and the mailer views are untouched
**Plans**: 2 plans

Plans:
- [ ] 01-01: `boards_controller#lesson` boots the Ember shell (not bare 404) when the lesson exists but the share token is unresolved
- [ ] 01-02: Ember `lesson` route/controller/template surface a reason-agnostic link-expired panel; runtime-verifies Ember Data findRecord behavior on an expired token

## Progress

**Execution Order:**
Single phase, no parallelism.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Expired-Link UX | 0/2 | Not started | - |
