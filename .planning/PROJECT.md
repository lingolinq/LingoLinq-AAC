# LingoLinq Graceful Expired-Link UX (lesson_share_token)

## What This Is

A single-phase follow-up to LL-90045bb29c option (b) (PR #568, merged to staging 2026-07-09),
which replaced the permanent `user_token` embedded in `/lessons/...` share URLs with an
expiring `lesson_share_token`. Claude's adversary review of #568 flagged that when a token
expires, the app shows a bare `/404` (Rails HTML shell route) or an unhandled Ember Data
rejection (SPA route), rather than a recoverable "this link has expired, request a new one"
message. This project closes that UX gap.

Source spec: `~/ai-company-brain/outputs/plans/2026-07-09-lesson-share-token-scope-ll-90045bb29c.md`
(FOLLOW-UP section). Finding LL-90045bb29c stays OPEN regardless of this project shipping;
closure is Scot's attestation and out of scope here.

## Core Value

A person who opens a once-valid, now-expired lesson/board share link gets a clear, on-brand
explanation and a path to recovery (ask the sharer for a fresh link), instead of a bare 404 or
an unstyled error page.

## Requirements

### Validated

(None yet, ship to validate)

### Active

- [ ] `boards_controller#lesson` distinguishes "lesson genuinely missing/nonce-mismatched" (keep
      hard 404) from "lesson found but token invalid/expired" (render a distinct expired-link
      experience)
- [ ] `app/frontend/app/routes/lesson.js` handles both a rejected `findRecord` promise and a
      resolved model whose associated user came back nil (the tolerant path
      `Api::LessonsController#show` already takes today)
- [ ] New i18n string(s) for the expired-link message, double-quoted, via the standard i18n
      helpers
- [ ] Runtime-verified (not just unit-tested) confirmation of what Ember Data 5.3.x (Ember 5.12) actually does
      on this exact composite-id `findRecord` call when the token has expired

### Out of Scope

- Token lifespan (30 days, parity with `protected_image_token`) — locked, not touched
- Emailed `lesson_assigned.*` link TTL — staying at 30d uniform, no mailer change (documented
  no-op)
- `User#lesson_share_token` mint gating via `FeatureFlags.expiring_lesson_share_tokens_enabled?`
  — not touched
- `User.find_by_lesson_share_token` dual-format (new + legacy) acceptance — accept-side behavior
  unchanged; only what callers do when it returns nil
- Closing finding LL-90045bb29c — that is Scot's attestation, not part of this work
- Option (c) (rotating `user_token` itself, embed-frame surface) — separate, later work
