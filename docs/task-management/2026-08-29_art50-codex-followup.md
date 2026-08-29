# Article 50 Codex follow-up + staging merge

## Goal

Resolve the in-progress merge of `staging` into `scot/fix/art50-gate-subject-session-user`, then review two Codex comments on that PR and fix them if they are real defects.

## Merge

`staging` (#884 Spanish Flexiones / sidebar locale) into the art50 subject branch. Only conflict: `app/frontend/.eslint-todo` generated timestamp. Bodies auto-merged. Completed as `bda5bc6e8`.

## Codex comments — verdict

### P1: ack POST must not send `user.id` when it is `'self'` — VALID

Verified:

- `serializers/application.js` pins `findRecord('user', 'self')` so `.id` stays the literal `'self'` and the backend id is `_actual_id` / `models/user.js#global_id`.
- `ai-disclosure.js` POSTed `/api/v1/users/` + `user.get('id')`.
- `users_controller#article_50_disclosure_ack` does `User.find_by_path(params['user_id'])`.
- `global_id.rb#find_by_path`: for `User`, a path that does not start with a digit is `find_by(:user_name => path.downcase)`. `'self'` is therefore a username lookup, not the authenticated user.

Same documented gotcha as eval-workbook authorship (`LEARNINGS.md` 2026-08-18). A supporter who entered speak mode while the session record was still keyed as `'self'` could not acknowledge.

Fix: `art50UserId(user)` prefers `global_id`, then `_actual_id`, then `.id`, drops `'self'`. Ack URL uses that.

### P2: read the feature flag from the gate subject — VALID

Verified:

- `services/app-state.js#feature_flags` is computed from `currentUser.feature_flags`.
- In speak mode `set_current_user` repoints `currentUser` at `speakModeUser` (the communicator).
- `needsAcknowledgement` already read disclosure fields from `art50Subject` (sessionUser) but still checked `appState.feature_flags`.
- `lib/feature_flags.rb`: an org `settings['enabled_features']` override is per-account. Server `frontend_flags_for(user)` is the authenticated account.

Mismatch:

- Communicator flag ON + supporter flag OFF → client shows the modal; server will not enforce it.
- Communicator flag OFF + supporter flag ON → client skips the modal; server 403s the supporter.

Fix: `needsAcknowledgement` reads `user.get('feature_flags.article_50_disclosure')` on `art50Subject`.

## Follow-up: capability-check line drift

The Codex comment on `lib/feature_flags.rb` added two lines above
`eu_under16_blocks_ai_for?`. `eu-under16-ai-block` still cited `:290`.
Updated the ledger anchor to `:292` (HEAD present-tense check), re-rendered
`CAPABILITY_LEDGER.md`, regenerated the unattested document-register hash.
`ruby scripts/capability-check.rb --check` and `scripts/regenerate-register.sh`
both green.

## Not changed

`ai_feature_gate.js` still reads `currentUser` (data-subject question). No server-side change. No compliance register / attestation.

## Tests

- `article50-gate-test.js`: flag-from-subject speak-mode cases; `art50UserId` cases.
- `article50-degrade-test.js`: user stubs now carry `feature_flags` (dotted get).
- `ai-disclosure-test.js`: `'self'` + `global_id` URL; `'self'` with no parked id errors without POST.
- `focus-words-article50-test.js`: `setAppState` writes the flag onto the subject so `flagOn=false` still means flag off.
