# Sign Out ends the session on the server

Base: `develop` at `1e502ccf2`.

## Change

- `session.js`: `sign_out` calls the server, then always finishes with `invalidate(true)`, whether the call
  succeeds, fails or takes longer than 2 seconds. `invalidate` is unchanged, so paths that clear a dead or
  shared login do not revoke anything.
- User-initiated sign-outs call it: the application and dashboard actions, `subscription-form`, and
  `login-form`. `force-logout`, `confirm-delete-user` and the end of an eval transfer are unchanged.
- `config/routes.rb`: `DELETE /api/v1/token`. `check_api_token` reads tokens only under `/api`, `/oauth2` and
  `/saml`, and installed apps send only `/api/v1/` and `/token` to the API host. The `oauth2/token` route stays.
- `device.rb`: `revoke_token!` ends one token, not the row, because SSO logins can share a row. It writes a
  `revoked_token/` marker that lasts the token's lifetime before anything else, and `check_token` reads that
  marker first, so a request in flight cannot revive the token through the cache or a stale save.
- `device.rb`: on a cache hit `check_token` uses `EXPIRE` where it used `SETEX`, so an active session keeps its
  sliding 12 hours but a hit cannot recreate a deleted entry. `logout!` also clears the cached check now.
- `session.js`: drops `as_user_id` first, so an operator viewing another user is not refused at Sign Out.

## Verification

- `spec/requests/session_logout_spec.rb` uses real tokens: a token is refused after `DELETE /api/v1/token`,
  another device stays signed in, another session on the same row stays signed in, and a revoked token stays
  refused after its cache entry or key is restored. Each was red before the change.
- `session-sign-out-test.js` (7): success, failure, no answer, a late answer, a double press, viewing another
  user, no token.
- Chromium against the local app: the old token was refused straight after Sign Out, signing back in issued
  a new token that survived a reload, and signing out offline still cleared the device.

## Review

Canonical senior-dev and adversary passes. Refuted: the `session` import reaches `sign_out` through the Proxy
in `utils/session.js`, and refresh applies only to `:integration` tokens. The adversary pass blocked on shared
rows and cache revival, both fixed here.

Adversary round 2 at `c99f72376`: both closed, ship with conditions. Its one condition was that removing the
cache refresh would end active short-token sessions at about 12 hours; `EXPIRE` restores that behaviour. The
marker now outlasts any cached check. If Redis cannot store it, the request still ends the token and logs a
warning, but the race protection is missing for that token. Final senior-dev pass at `23971a47d`:
approved with comments. Its error guard on the `EXPIRE` branch is included; that edit was not separately reviewed.
`sign_out` then moved to the end of the service so `.eslint-todo` rows do not shift, with no baseline change.

## Unresolved

- Revocation is one best-effort request. Offline, on a server error, or past the 2 second wait, the device
  signs out and the token stays valid on the server.
- A token discarded by the force-logout teardown cannot be revoked afterwards, so Log Out there is
  device-only. The same goes for `eval-status` and `confirm-delete-user`, which still call `invalidate`.
- Signing out with an already dead token can flash the session-expired message.
- `/api/v1/token_check?include_token=1` can return a row's last key for an expired token.
- The admin cookie outlives Sign Out by up to 2 hours.
- Installed apps were not tested on a device.
- A press in the short gap after `sign_out` resolves can send a second DELETE and show the session-expired message.
- The `application.js` fallback to `invalidate` exists for test stubs that have no `sign_out`.
- `logout!`, used by the `oauth2/token` route, clears the cached check but writes no marker.
- `token_logout` raises if the device row is gone; the frontend still signs out.
- `approve_token` calls `valid_token?` directly, so it does not read the marker; a key restored by a stale
  write would still pass there.
