# Offline app shell: open the web app with no network after it has synced

Started 2026-11-03 on `feat/scot-offline-app-shell-7a29ac97`, cut from `develop` at `06074fe02`.

## Problem

A web app added to a Home Screen (iPad, Android, Chromebook) shows the browser's "not connected" page
when opened with no network, even after its boards have synced. Board data is on the device
(IndexedDB), but nothing serves the page itself offline. The old HTML5 AppCache shell cache
(Rack::Offline) stopped working when browsers removed AppCache; its gem and route were deleted in
March 2026 (`0f44ec579f`, `cacd1705d6`). No service worker or web app manifest existed.

## What was traced (develop at 06074fe02)

- Boot needs no network: readiness waits on init, extras, device and lang
  (`app/frontend/app/initializers/defer_readiness.js`, `utils/extras.js` `start_after_device_init`);
  English needs no locale fetch; the session restores from the `auth_settings` stash and a network
  error never logs out (`services/session.js` `restore`, `check_token`).
- The API authenticates with the bearer token (`utils/extras.js` ajax headers,
  `application_controller.rb` `check_api_token`); the frontend never reads the CSRF meta tag.
- `window.domain_settings` is read once at startup (`services/app-state.js`, `this.set('domain_settings'`)
  and nothing refreshes it in place; a fresh page load does.
- The whole Ember app is one Sprockets file (`app/assets/javascripts/application.js`); no lazy chunks
  (`ember-cli-build.js` `splitChunks: false`).
- The parent `user` route calls network-only `store.queryRecord` on a cold boot (see the fix below).
- Modern view's `user.board-detail` route never reads the device database (#1213, open).
- CSP already allowed workers and manifests (`config/initializers/content_security_policy.rb`
  `worker_src`, `manifest_src`).

## Design (approved at STOP 1)

`lib/offline_shell.rb` holds every list. `/sw.js` (ERB) precaches `/offline-shell` (a generic page with
no user, no CSRF tag, no chart scripts), the digested `application.js` / `application.css` /
`globals.js`, and named static files. Navigations try the network first (4 s), then the cached page;
server pages are excluded (a spec walks the route table). Gate: `OFFLINE_APP_SHELL` per Cloud Run
service. Off: `/sw.js` is a worker that deletes its caches and unregisters itself.

## The `user` route fix (fact sheet, /fix-proposal)

**(a) Where the value is read.** `app/frontend/app/routes/user.js` model hook:
`this.appState.get('currentUser')` (the fast path), then `this.store.queryRecord('user', {path})`.
CONFIRMED. `queryRecord` goes `adapters/user.js` -> `adapters/application.js` `ajax` -> `$.ajax`, with no
offline gate. CONFIRMED.

**(b) Every shape.**
- `currentUser`: set (in-app navigation; the fast path) or null (cold boot: it is set from
  `setupController`, after every model hook). CONFIRMED (`utils/session_user_wait.js` header,
  `routes/board.js` cold-boot comment, Ember ordering).
- `appState.session_user_promise`: absent (no session, or `sessionUser` already set); pending; resolved
  with the session user (`refresh_session_user` resolves with the local record even when its reload
  fails offline); rejected (`{offline: true}` when no local copy). CONFIRMED (`services/app-state.js`
  `global_transition` and `refresh_session_user`). Its writer is `global_transition` on
  `routeWillChange`; that it fires before the first transition's model hooks is ASSUMED from the
  helper's documented reasoning. Not load-bearing: absent means today's behaviour.
- `params.user_id`: the user's own name, own id, or another user (supervisee, shared). CONFIRMED.
- Online: `persistence.online`, from `navigator.onLine` at start. CONFIRMED.

**(c) Cross-file claims checked.** `wait_for_session_user` always resolves (record or null), never
rejects, resolves null when nothing is in flight. CONFIRMED (`utils/session_user_wait.js`).

**Candidates.**
1. Chosen: only when offline and `currentUser` is not loaded, wait on the in-flight session-user read
   with the existing `wait_for_session_user` (longer timeout offline, since the fallback cannot
   succeed anyway). Use the record if it is the user whose page this is; otherwise, or on null, fall
   back to `queryRecord` exactly as today.
2. Read `findRecord('user', 'self')` directly when the path matches the stashed user name. Rejected:
   starts a second read of the same record, which the helper exists to avoid, and needs a stash read.
3. Make `adapters/user.js` `queryRecord` answer offline from the device by path. Rejected: changes every
   `queryRecord` caller; larger blast radius.
4. Wait on a cold boot online too. Rejected: changes online behaviour (Scot: online unchanged).

**Risks.** Offline, a slow device read now delays the error page by up to the timeout instead of
failing at once. The record is the device copy, which is the premise of offline use. Another user's
page offline still fails, as today.

**Unresolved.** Whether `routeWillChange` fires before the first model hook on every device; Playwright
shows it in Chromium only.

**Test.** `app/frontend/tests/unit/routes/user-offline-cold-boot-test.js`: red before the fix on the two
own-page cases (seen 2026-11-03: 2 failures, 4 guards passing). Mutation that must turn it red: remove the
offline branch, or drop the identity check (the "someone else's page" guard then fails).

**Review (adversary, 2026-11-03), and what changed.** No wrong-user path found. Adopted: the
"online unchanged" test asserted after an await, so it passed with the online guard removed; it now
asserts the server call synchronously. Ownership is checked against the session (`user_name` /
`user_id`, restored synchronously from the stash) before waiting, so other users' pages and
signed-out visitors never wait or see a device record. With no read in flight the route starts its own
local `findRecord('user', 'self')`. The wait is 10 s (`offline_session_wait_ms`), with a test for a read
still pending at the limit. Rejected as the reason for candidate 2: a second local read is cheap; it is
now the fallback when no read is in flight.

**Known limits, stated in the PR.**
- `persistence.online` comes from `navigator.onLine`. On Wi-Fi with no internet (captive portal, server
  outage) the app boots from the cached page after 4 s but believes it is online, so this branch does
  not run and the route waits on the server. Changing that changes online behaviour.
- Board URLs name the board's OWNER (`/:owner/board/:name`). A home board owned by another account (a
  stock board, a supervisor's board, a supporter speaking as a communicator) is not the signed-in user's
  own page, so it still reaches the error page offline. Follow-up.

**Falsification (2026-11-03).** Before the fix: 5 of 10 red (the new behaviour), 5 guards green.
After: 10 of 10 green. Mutations: online guard removed -> "online ... exactly as before" red; ownership
check removed -> "someone else's page" and "signed out" red. Restored from a copy each time.

