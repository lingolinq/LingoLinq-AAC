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


## Follow-up: boards owned by another account (not in this PR)

Requested by Scot on 2026-11-04 and moved to a follow-up the same day: offline, any board sync stored
on the device (the home board, sidebar boards and the boards they link to) must open whoever owns it,
not only the signed-in user's own pages. This PR opens only the signed-in user's own pages offline.

**Starting point:** local branch `feat/scot-offline-other-owner-boards` (one commit on top of this
work). It holds seven route tests in `app/frontend/tests/unit/routes/user-offline-cold-boot-test.js`
(three fail until the route change is written), a Playwright case for a home board owned by another
account (`e2e/offline-launch.spec.js`), and its seed (`e2e/support/offline-launch.rb`).

**Facts.**
- Board URLs name the board's OWNER: speak mode goes `home_in_speak_mode` ->
  `transitionToBoardForCurrentUiStyle` (`services/app-state.js`), which transitions to
  `user.board-alt` / `user.board-detail` with `:user_id = parts[0]` of the board key. Keys under `obf/`,
  `integrations/` and keys with no slash go to the top-level `board` route instead. CONFIRMED.
- Sync stores the signed-in user and supervisees as user records, and the boards (`services/persistence.js`
  sync); it never stores a board owner's user record. CONFIRMED (no other `store('user'` writer).
- A stored board is found offline by key or id: `persistence.find('board', key)` -> dbman `key` index for
  `owner/name`, primary key for an id (`utils/dbman.js` find). CONFIRMED.
- On board pages the parent model is read for `user_name` only: `routes/user/board-detail.js` builds the
  key from `user.get('user_name')` and sets `subroute_name`; `controllers/user/board-detail.js` reads
  `user.user_name`; `templates/user.hbs` renders a plain outlet for board routes; `page_user` consumers
  compare `id` / `user_name` and read `permissions` (`utils/basic_landing.js` `is_own_page`,
  `utils/supervising_context.js`). CONFIRMED. Classic (`routes/user/board-alt.js`) uses params only.

**First proposal, blocked in review (adversary, 2026-11-04).** Offline, for a board page whose board is
on the device, resolve the `user` route with a stand-in owner (an `EmberObject` with `user_name`, never
in the store). Blocked because:
- Ember keeps a parent route's model while its params are unchanged, so the stand-in stays the model
  when someone moves from that board to the owner's other pages (`/owner`, `/owner/boards`, the Classic
  header link, My Boards in speak-as). Those pages call `model.reload()` (`routes/user/index.js`,
  `routes/user/boards.js`), which a stand-in does not have, and reconnecting does not clear it.
  CONFIRMED by the reviewer; the "profile" and "edit" guards only cover the first page opened.
- Supervisees' user records ARE stored on the device, so a stand-in would discard a real record in
  speak-as, the most common case.
- It would run on every offline navigation (native apps, warm sessions), not only offline-shell
  launches, and `OFFLINE_APP_SHELL` would not turn it off.
- Classic has no edit route (editing is a mode on `user.board-alt.index`), so excluding `.edit` excludes
  nothing there; and an id-style URL found by id was not checked against the owner in the URL.

**Safer design for the follow-up.**
1. Classic view only (`user.board-alt`) until #1213 lets Modern read boards from the device.
2. Use a real record first: one already in the store (`peekAll('user')` by `user_name`), then the user
   record stored on the device (supervisees: dbman's `key` index on `user`). A stand-in only for owners
   that were never synced (stock boards and other owners' boards).
3. Use a stand-in only when the board is on the device and its key starts with the owner in the URL
   (`key.split('/')[0] === params.user_id`), including when found by id; one 10 s bound for both lookups.
4. Never let a stand-in outlive the board page: when the `user` route's model is a stand-in and the next
   transition is not a board page, or the device comes back online, re-run the `user` route's model.
5. Only while the offline shell is on (`window.offline_shell_enabled === true`), so the kill switch
   also turns this off, and only for a signed-in session (`access_token`), as in the own-page branch.

**Tests the follow-up needs** (red first): the seven on the branch, updated for 1 to 5; moving from a
stand-in board to `user.boards` / `user.index` with the same owner re-runs the model and does not throw;
coming back online replaces the stand-in; a supervisee's stored record is used rather than a stand-in;
an id-style URL whose stored key names a different owner is not resolved; signed out, no stand-in; and an
acceptance or Playwright case for the sibling navigation, since a unit test cannot show Ember reusing the
parent model. Mutations: drop step 4 (sibling test fails); drop the owner check (id test fails).

## Status 2026-11-04: Playwright offline runs not green yet (work stopped under Rule 13)

**Sync errors on the local stack: a local setup problem, not a bug in this feature.** Every new user's
default sidebar names the system board `lingolinq/crisis-vocabulary` (`User.merge_missing_default_sidebar_boards`).
A bare local database (and the shared local development database) does not have it, so sync reported
"board lingolinq/crisis-vocabulary failed retrieval for syncing, linked from sidebar board" and ended as
`finished`, not `succeeded`. The e2e seed now creates it the way `lib/tasks/system_boards.rake` does; sync
then succeeded with no errors. Not checked: whether any deployed environment lacks the board (that would
give every new user this sync error).

**Side effect to note:** the first seed run imported the bundled OBZ with upload credentials set in the local
`.env`, and the import uploads its pictures (`lib/converters/lingo_linq.rb` `upload_to_remote`), so about 47
public symbol images from `public/system-boards/crisis-vocabulary.obz` most likely went to the dev uploads
bucket. No user data; keys carry a nonce, so nothing was overwritten. Not verified in the bucket. The seed
now refuses to import while `AWS_KEY`, `AWS_SECRET` or `UPLOADS_S3_BUCKET` is set (proven: refuses on a
fresh database, passes where the board exists).

**Where the Playwright run stands.** The worker installs, sync succeeds, and an offline cold launch is
answered by the worker with the cached shell (`x-robots-tag: noindex`) and the bundle loads: the app boots
offline. But Classic then shows the app's own "Unavailable offline" error page instead of the board, Modern
does not show its board-detail error card, and the Spanish case hit the 10-minute test limit. The
`launchOffline` check that the error page is absent ran before the page rendered, so it passed too early;
it needs to wait for the board or the error, whichever comes first.

**Next steps.**
1. Find which route rejects on the offline Classic launch (parent `user` route own-page branch, the
   `board-alt` lookup, or another route in the chain): capture console and route errors on an offline
   launch. The last probe stalled waiting for sync (5 min), unlike the spec run.
2. Make `launchOffline` wait for the board or the error page before asserting.
3. Diagnose the Spanish case timeout.
4. Then the full Ember suite, the kill-switch project, `/pr-preflight`, and the draft PR.
