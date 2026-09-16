# Stale token workspace loading

Redo of `fix/omer-stale-token-workspace-loading` (0fd403347) on current develop.
Omer's branch is 8000+ commits behind and must not be merged as-is.

## Fact sheet

### (a) Where the hang is READ

- `routes/index.js` `afterModel` proceeds when `model.user_name && session.access_token` (`:92`).
- `app-state.js` `setup_controller` calls `modal.setup(route)` (`:443`) then `findRecord('user', 'self')` (`:462`).
- `session.js` `force_logout` (`:645`): if `modal.route` is set it opens `force-logout` and does **not** `invalidate`.
- `session.js` `check_token` writes `persistence.tokens[key] = true` at the start (`:232-239`). `restore` then skips `check_token(true)` when `tokens[key] != null` (`:594`).
- Persistence `findRecord` treats any `invalid_token` as a local fallback (`utils/persistence.js:4375`, `services/persistence.js:4479`).

### (b) Error shapes

Writers of a dead-token failure:

1. `Device.check_token` (`app/models/device.rb:340-350`): `error` is `"Invalid token"` / `"Expired token"` / `"Token needs refresh"` / `"Disabled token"`, plus `invalid_token: true`.
2. `extras.js` ajax (`:296-328`): `{ result: data }` with `data.invalid_token` / `data.error` / `data.status`. When `invalid_token` and not speak mode, it already calls `force_logout`.
3. Ember Data reject: `err.result.invalid_token` or `err.errors[0]`.
4. `check_token` success body: `{ authenticated: false }`.

### (c) Cross-file claims

- CONFIRMED: later develop already gates login on `token_validated` (`routes/login.js:28-29`) and retries a stale **browser** `client_secret`. That is a different token than the user access token.
- CONFIRMED: `check_token(false)` is intentional (`utils/persistence.js:4283`, Ember Data handlers, `stashes.setup`). Existing test: "should not invalidate the session if not allowed".
- CONFIRMED: board local-fallback on token error must stay (`tests/utils/persistence-test.js` "should use the local copy when online but getting a token error").

## Candidates

1. Merge Omer's patch as written. Rejected: always-logout on `check_token(false)` and dropping the force-logout modal.
2. Chosen: expand logout-worthy auth errors; no online `user/self` IndexedDB fallback; tear down a dead session even when the modal opens; do not mark `tokens[key]=true` until the server accepts the token. `restore` treats only `true` as "already confirmed".

## Tests that must go red without the fix

- `is_logout_worthy_auth_error` is false for `"Token needs refresh"` / `result.invalid_token` before the helper exists / is wired.
- `check_token()` with `{authenticated:false}` leaves `tokens[key] === true`.
- `force_logout` with `modal.route` set leaves `access_token` in place.
- Online `user/self` + `invalid_token` + local row resolves the cached user.
