# Requirements: LingoLinq Graceful Expired-Link UX (lesson_share_token)

**Defined:** 2026-07-10
**Core Value:** A person who opens a once-valid, now-expired lesson/board share link gets a clear, recoverable message instead of a bare 404 or an unstyled error page.

## v1 Requirements

### Expired-Link UX (UX)

- [ ] **UX-01**: `boards_controller#lesson` (~line 98-105) distinguishes two nil cases that currently both hard-redirect to `/404`: (a) `@lesson` is nil or nonce-mismatched (lesson genuinely missing — keep hard 404, no change) vs. (b) `@lesson` is present but `User.find_by_lesson_share_token(params['user_token'])` returned nil (token invalid/expired — render a distinct "link expired" experience instead of `/404`)
- [ ] **UX-02**: `app/frontend/app/routes/lesson.js` `model()` hook handles a rejected `findRecord` promise (e.g. lesson genuinely not found via the API) with an explicit error path, distinct from Ember's default error substate
- [ ] **UX-03**: `app/frontend/app/routes/lesson.js` (or its controller/template) handles the case where `findRecord` resolves successfully but the returned lesson's associated user is nil/absent — the tolerant path `Api::LessonsController#show` already takes when the token doesn't resolve — by showing the same "link expired" messaging rather than silently rendering as if a valid share session existed
- [ ] **UX-04**: New user-facing string(s) for the expired-link message added via the standard i18n helpers (double-quoted user-facing text; `{{t "..." key='...'}}` in templates or `i18n.t('key', "...")` in JS)
- [ ] **UX-05**: The expired-link message text does not distinguish "token expired" from "token malformed/never valid" (same generic copy for both, to avoid giving a probing oracle on token validity)
- [ ] **UX-06**: Runtime-verified (via `ember serve` + a hand-crafted expired token, or an integration test exercising the real controller — not asserted from reading code alone) confirmation of what Ember Data 5.3.x (Ember 5.12) actually does on the `findRecord('lesson', "<id>:<code>:<expired_token>")` call today: does it resolve successfully with a nil/absent user (per `Api::LessonsController#show`'s tolerant 200 response), or does something in the identity-map/id-matching logic reject the promise? This determines whether UX-02 or UX-03's code path is the one that actually fires for an expired (not malformed) token.
- [ ] **UX-07**: No change to `User#lesson_share_token`, `User.find_by_lesson_share_token`, `FeatureFlags.expiring_lesson_share_tokens_enabled?`, token lifespan, or the `lesson_assigned.*` mailer — verified via diff review that only caller-side (controller/route) behavior changed
