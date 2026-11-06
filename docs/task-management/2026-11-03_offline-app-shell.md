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

## Follow-up: Wi-Fi without internet (not in this PR)

Agreed with Scot on 2026-11-05. The own-page branch in `routes/user.js` runs only when
`persistence.online` is false at the time the model hook runs. That value starts from `navigator.onLine`
(`services/persistence.js` init), which is true on a device that is on Wi-Fi with no internet (a school
network that blocks the app, a captive portal, a router with no uplink). There the route asks the server
at once, the request fails, and the app shows "Unavailable offline" instead of the board, just as an
offline cold launch did in Playwright before the spec fixed `navigator.onLine` (see the status below).

**Proposal.** For the signed-in user's own page only (the same session ownership check as the offline
branch), when `query_server()` fails with a network error (no HTTP status: jQuery status 0, or the
adapter's offline rejection), use the user record from the device (`session_user_promise`, else
`store.findRecord('user', 'self')`, with the same 10 s bound), and only if it matches the page's user.
Any answer from the server (400, 403, 404, 5xx) still bubbles exactly as today, and online success paths
are unchanged.

**Open questions for the fact sheet.** What a failed `queryRecord` rejects with when the network is down
versus when the server answers an error (the shapes `adapters/application.js` produces); how long a
request takes to fail on a captive portal (it may answer with a redirect or an HTML page, not a network
error, and then nothing here runs); whether `persistence.online` should also be set false on that failure.

**Tests it needs** (red first, `tests/unit/routes/user-offline-cold-boot-test.js`): online flag true but the
server request fails with a network error -> the device record; a server error answer (400, 404) still
rejects; someone else's page and signed out still reject; no device record -> rejects as before. Mutation:
drop the network-error check -> the 400 and 404 tests fail. Playwright: an offline launch with
`navigator.onLine` left true (the reverse of the spec's override) opens the board.

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

## Status 2026-11-05: offline launch diagnosed; e2e sync still depends on the network (stopped under Rule 13)

**Which route failed, and why.** The `:user_id` parent route (`routes/user.js`) never reached its offline
branch. Playwright 1.62.1's `setOffline(true)` blocks the network, but every page loaded after it still reads
`navigator.onLine === true` (seen on worker-served pages, a reload, a `data:` URL, and with page-level CDP
emulation). `persistence.online` starts from `navigator.onLine`, so at about 750 ms, when the model hook ran,
the app believed it was online, asked the server for the user record, and showed "Unavailable offline" when
that failed. `persistence.online` turned false only about 2 s in. A device with no network reports false
from the start; on Wi-Fi with no internet it reports true (follow-up above).

**Spec changes (commit 1b65b8e8d).** `launchOffline` makes `navigator.onLine` read false from page start, with
a comment naming the gap, and checks the page sees it. It then waits until the page shows the expected
element or the app error page, and requires it not to be the error page. The error page is found by its
picture's address (any language; offline the picture itself is not cached, so it is present but has no
size). The shared sign-in helper picks the trust-device button by class (any interface language: this was
the Spanish 10-minute timeout, the helper waited for an English label) and waits for the URL to leave
`/login`: sign-in finishes with an in-app transition or by loading `/` again
(`components/login-form.js` `_login_dispatch_after_wait`), and a sync started before that reload is lost with
the page (this was the Classic 5-minute sync stall).

**Results.** With those changes all three offline-launch cases passed (fresh profiles, 1.3 min). Mutation:
override removed -> Classic fails at "not the app error page" (the first attempt failed at the settle step
instead, which exposed the uncached-picture problem; fixed, then re-run). The next full run failed the
Spanish case at "sync finished without errors" (`finished`, not `succeeded`).

**That failure: the local sync fetches every system-board picture from the real dev bucket.** Direct fetches
fail CORS from `localhost`, so the app goes through `/api/v1/search/proxy`. In the log, 611 proxy fetches
succeeded and one was refused as "blocked or invalid URL": `SafeHttp.resolve_addresses` returns nil on a DNS
lookup timeout. One slow DNS lookup on this machine ends the sync as `finished`. A local setup dependency on
the network, not a bug in this feature, but it makes the spec nondeterministic. Not re-run to green.

**Next steps.**
1. Decide how the e2e stack stops depending on the network (Scot): for example, seed the
   `lingolinq/crisis-vocabulary` system board without remote pictures for the e2e database only.
2. Then a full offline-launch run, the kill-switch project, the full Ember suite, `/pr-preflight`, the
   reviews, and the draft PR ("Wi-Fi without internet" goes under known limits).

## Status 2026-11-05 (later): offline launch green; the kill switch leaves the cache behind (stopped: app code)

**E2E setup (commit 451679ec6, within Scot's pre-approval for e2e setup and helpers).** A new private
database, `lingolinq-e2e-7a29ac97-v3`, loaded from `db/schema.rb` inside a connection checked to be that
database (not `db:schema:load`, which in development also acts on the test configuration). The seed makes
`lingolinq/crisis-vocabulary` a text-only stand-in, creates every seeded board empty and then adds its
buttons (on the creating save, `Board#process_suggested_symbols` adds OpenSymbols pictures), and gives the
e2e users a stored sidebar naming only that board with an icon Rails serves. It refuses outside a private
`lingolinq-e2e*` database, while any upload setting is present, and when a board it would use already has
pictures (each refusal shown). Seed and server run with `AWS_KEY`, `AWS_SECRET`, `UPLOADS_S3_BUCKET` and
`STATIC_S3_BUCKET` set empty (dotenv never overrides a set variable): board writes and sync upload
button-set caches to the bucket when it is configured (`BoardDownstreamButtonSet` -> `Uploader.remote_upload`),
so earlier runs with the real `.env` most likely wrote button-set JSON for the synthetic e2e boards to the
dev uploads bucket. Not verified in the bucket. The older databases `lingolinq-e2e-7a29ac97` and `-v2`
are left in place.

Sync status depends only on board errors (`errors = errors.concat(progresses[idx].board_errors || [])`,
`services/persistence.js`), so the app's own CDN fetches during the online part (chart.js from jsdelivr,
sound effects from CloudFront, default sidebar icons) do not affect it. In the run's server log every
image-proxy fetch was local.

The Spanish case now reloads online once the worker is active: in 3 of 4 diagnostic runs the page after
sign-in was not controlled by the worker (sign-in reloads the page before the worker is active, and the
worker never claims an open page), so `es.json` was not cached; after the reload it was, every time.
Known limit for the PR: a device that goes offline before any load through the worker has no cached
interface language file, and `initializers/attempt_lang.js` then falls back to English (read from code,
not tested).

**Result.** offline-launch: 3 passed (1.0 min), fresh profiles, `OFFLINE_APP_SHELL=on`.

**Kill switch: fails.** With Rails restarted `OFFLINE_APP_SHELL=off`, reopening that profile online: the
worker is gone but its cache `ll-offline-shell-...` stays (polled 60 s). Cause, from the run: the page
logged `[offline-shell] worker removed`, i.e. `sync_registration`'s off branch (`app/utils/offline_shell.js`)
unregistered the registration; the server log has no browser fetch of `/sw.js` after the navigation, so the
browser's update check never fetched the removal worker (`kill_switch.js.erb`, which deletes the caches),
and the off branch itself deletes no caches. Functionally the rollback works (no worker serves anything),
but the cached copy of the app stays on the device, and the PR promises the caches are removed.

**Proposed fix (needs approval: app code).** In the off branch, after unregistering, also delete the
caches whose names start with `ll-offline-shell-` (`window.caches`), so both removal paths end the same
way. Red unit test first in `tests/unit/utils/offline-shell-test.js`: off, with a fake `caches` holding a
prefixed and an unrelated name -> the prefixed one is deleted, the unrelated one kept; no `caches` -> still
unregisters. A spec that the JS prefix equals `OfflineShell::CACHE_PREFIX`. Then rebuild, re-run both
Playwright projects, mutation (drop the delete -> the kill-switch spec and the unit test fail).

**Next.** On approval: the fix above, then the full Ember suite, `/pr-preflight`, reviews, draft PR.

## Review fixes (2026-11-05, approved by Scot)

The two reviews of 47c3e1148 (Codex gpt-6.1-sol: request changes; adversary: block the merge,
draft PR fine) led to these changes. Scot approved fixes 1 to 4, gating the route change, the
identity-mismatch test and the Low items, and then, after the gap below, "Worker on trusted only".

### Shared devices: the worker only on trusted devices (fact sheet)

- **Where the value is read.** `appState.sessionUser` (set in `services/app-state.js` `find_user`
  from `findRecord('user', 'self')`, network or device) → `preferences.device.long_token`. In the
  user route: the resolved device record, the same field. CONFIRMED.
- **Its shapes.** `true` (Trust this Device), `false` (Shared Device), missing (no choice
  recorded, or no device entry for this token: `lib/json_api/user.rb` writes it only when
  `preferences.devices[unique_device_key]` exists), and in principle a string. Only `=== true`
  counts as trusted. Saving the choice (`login-form.js` login_followup) writes both the device
  setting and the device entry (`app/models/user.rb`, the `devices[device_key]` loop), so a trusted
  device's record carries `true`. CONFIRMED by reading; the e2e signs in with Trust and needs it.
- **Why the route check alone was not enough.** Offline, the app still boots from the shell on a
  shared device, `find_user` sets `currentUser` from the device with no trust check, and the
  top-level board route (`/*key`) reads boards from the device. So the fix moved to the worker
  itself: `utils/offline_shell.js` `follow_device_trust` registers it only for a trusted session
  user and removes it and its caches for a shared one; nothing happens until the user is known,
  and signing out leaves a trusted device's worker. The route check stays as a second guard, and
  `persist()` is asked only on trusted devices.
- **Known limit.** A trusted device that is later handed to someone else keeps its worker until
  someone signs in on it as shared.

### The other changes

- **Gate (5).** The user route's offline branch runs only when the page says the shell is on, so
  the kill switch turns off everything this PR adds and the native apps are unchanged.
- **Timeout (4).** A navigation waits for the network however long it takes; the cached page
  answers only a failed request. `NAVIGATION_TIMEOUT_MS` is gone; `WORKER_VERSION` is 2.
- **Language file (2).** A new version copies `/locales/*.json` from the old caches at install
  (fresh when it can be fetched, else the old copy), and the first-use write is tied to the fetch
  event (`waitUntil`).
- **Real worker tests (3).** `e2e/offline-worker-lifecycle.spec.js`: slow page online, failed
  update, update waiting, language file carried over.
- **Low items.** A removal-worker-only kill-switch case; a route walk that fails when no sample
  reaches a server route; a signed-in vs signed-out shell spec; the identity-mismatch route test.

### Existing tests changed (each approved)

- `tests/unit/utils/offline-shell-test.js`: three tests now supply a trusted session user
  ("registers and watches for a sync when on", "waits for the page to finish loading before
  registering", "asks once, after a successful sync while signed in"); what each checks is the same.
- `tests/unit/routes/user-offline-cold-boot-test.js`: the helper turns the gate on and makes the
  device record trusted, so the existing cases keep testing what they did.
- `spec/controllers/offline_shell_controller_spec.rb`: the line that required the timeout constant
  in the worker is replaced by a check that there is no timeout (fix 4 reverses it).

### Results at the head of these changes

- `lint:js:ci` new=0; `lint:hbs` exit 0.
- Full Ember suite: 3953 tests, 3911 pass, 37 skip, 5 todo, 0 fail.
- RSpec, the five offline shell files: 60 examples, 0 failures.
- Playwright (fresh profiles, Rails restarted after the build was copied in): offline-launch 4
  passed, offline-worker-lifecycle 3 passed, offline-kill-switch 2 passed.
- Red and mutations as listed in the commit messages. One run without a Rails restart after copying
  in a rebuilt frontend rendered the login page twice and failed 3 of 4 launch cases; after the
  restart all passed. Cause not proven (likely the dev server recompiling).
- Learned: Playwright's routing sees a page's and a service worker's own requests but not the
  browser's fetch of the worker script, so a test cannot hand it a new version that way; a local
  pass-through proxy can (e2e/support/worker-proxy.js).

## Review round 2 (2026-11-05, approved by Scot): fixes in; stopped under Rule 13

Reviews of 1071b9c8d: Codex gpt-6.1-sol request changes; adversary block merge, draft fine. Fixed,
red first, each with a mutation or red run:

1. A device borrowed another same-name device's "Trust this Device" value (lib/json_api/user.rb
   nearest_device). The user JSON now reports this device's own setting (spec + e2e "before the
   trust choice"; red on the old serializer in a real browser: the new device reported true).
2. Register and remove could race; the trust watcher now runs one operation at a time, and
   removal also takes a root registration whose script is still downloading (2 unit tests).
3. A language file cached while an update waited was lost; activation now carries it too (the
   lifecycle update case loads fr.json while waiting; red before).
4. The cache name now covers the worker template, the shell templates and the locale files (2
   specs; red before, and with the digest left out).
5. Offline, a trusted device never expires (nothing enforces the 28-day timeout or a remote
   sign-out offline): known limit, follow-up below. Not fixed here.
Also (e2e, pre-approved): the kill switch now needs the install record the launch spec leaves, so a
rerun on a cleaned profile fails (shown).

Results at 5bc75744c plus two test-only commits: Playwright offline-launch 5 passed,
offline-worker-lifecycle 3 passed, offline-kill-switch 2 passed (fresh profiles, Rails restarted);
lint:js new=0, lint:hbs 0; RSpec, the offline files plus the serializer, device, token and session
specs: 389 examples, 0 failures. The serializer change was also run with users_controller_spec:
1185 examples, 1 failure, a geolocation lookup that this machine's .env turns on (passes with
IPLOCATE_API_KEY unset).

Stopped under Rule 13 after two self-inflicted errors close together: a new test named a local
function `stop`, which the QUnit lint rule read as QUnit's stop() (renamed), and a source check this
PR added still named the old install call after fix 3 (not rerun after the worker edit; corrected,
and the Ruby specs rerun green).

Remaining, in order: the full Ember suite; the PII preflight on the new head; both reviews; update
the PR body (Testing, Known limits: trusted devices never expire offline; the new cases); open the
draft PR to develop.

### Follow-up: offline expiry for trusted devices (not in this PR)

Offline, nothing enforces a trusted browser's 28-day inactivity timeout (Device#token_timeout) or a
remote sign-out. Proposal: record when the session was last confirmed online (a successful
check_token) and refuse to open from the shell offline once longer than the device's timeout has
passed; a remote sign-out then takes effect at the next online launch, as today.

## Review round 3 (2026-11-05): stopped on High findings

Reviews of d1baf26c2: Codex gpt-6.1-sol request changes (2 High, 1 Medium); adversary draft fine,
block merge (1 High, 1 Medium, 2 Low).

- **High (adversary), CONFIRMED by reading:** an iOS Home Screen sign-in is trusted without asking.
  `navigator.standalone` makes the app "browserless" (`utils/capabilities.js`), the login then sends
  `long_token = true` (`components/login-form.js`, the submit path) and the server stores it
  (`session_controller.rb`, `generate_token!`), so the Trust/Shared question never appears and every
  iOS Home Screen device, shared or not, keeps the worker. Old behaviour; this PR adds the offline
  consequence. Needs Scot's decision: Home Screen counts as a trusted app (like the native apps), or
  show the choice on iOS Home Screen and keep the worker only after an explicit one.
- **High (Codex), CONFIRMED by reading:** the cache name does not cover `lib/offline_shell.rb`,
  whose lists the worker embeds (EXCLUDED_FIRST_SEGMENTS, RUNTIME_CACHED_SOURCE), so a worker change
  can keep the name, and a failed install then deletes the live cache (`caches.delete(CACHE_NAME)`).
  Availability, not privacy (the adversary rated it Low). Present since the first version.
- **High (Codex), CONFIRMED in code, exposure PLAUSIBLE:** the one-at-a-time queue is per page; two
  tabs loading at nearly the same moment across a shared sign-in could still leave the worker.
- **Medium (adversary), CONFIRMED by reading:** a supervisor saving a communicator's Preferences
  writes the posted (borrowed) `long_token` onto the communicator's most recent device
  (`users_controller.rb` update, `User#process_device`).
- **Medium (Codex):** the kill-switch install record does not prove the browser still has the
  install (storage cleared while the record remains).
- **Low (adversary):** one register() that never settles holds up later removals in the queue.
- **Low (adversary):** the shell's footer partial and ENV values in the page are outside the digest.

### Round 3 fixes (approved by Scot: ask on iPad Home Screen; fix both Codex Highs)

- **Home Screen sign-in asks.** `components/login-form.js` `device_login_flags`: an installed app
  still signs in with a long token; a Home Screen web app keeps the form's choice, so the Trust /
  Shared question appears. Red: unit test and the e2e "a Home Screen sign-in asks". Note: an iPad
  that signed in from the Home Screen before this change already holds a long token, so the server
  keeps it trusted (`Device#generate_token!` keeps an existing long token) and no question appears
  there until its token ends or someone changes it in the device settings. Listed in the PR.
- **Across pages.** Register and remove run under a site-wide lock (`navigator.locks`), and each
  page records its latest trust decision in localStorage (`ll-offline-shell-trust`, the value only),
  so a stale page's "trusted" step does not register after a shared sign-in elsewhere.
- **Cache name and failed installs.** The name covers `lib/offline_shell.rb` and
  `shared/_footer.html.erb` too, and a failed install deletes its cache only when it created it.

Results: Playwright offline-launch 6 passed, offline-worker-lifecycle 4 passed, offline-kill-switch
2 passed (fresh profiles, Rails restarted after the build); lint:js new=0, lint:hbs 0; Ember
offline/sign-in filter 122 of 122; RSpec offline files plus every spec that mentions long_token
(users, session, token, device, user): 1247 examples, 0 failures (IPLOCATE_API_KEY unset).

Per Scot: the PR opens after this round's reviews whatever they find; new findings go in the PR
body as open items, Highs marked as merge blockers for Traci. No further fix round.

## Review round 4 (2026-11-05)

Reviews of 40d45e2ba: Codex gpt-6.1-sol request changes (2 High); adversary draft fine with
conditions (no High; 2 Medium, 3 Low). Scot: fix both Highs, then open the draft PR; Mediums and
Lows go in the PR as open items for Traci.

- **Fixed (Codex H1):** a page now registers only while its own sign-in token is the current one
  (the stored auth settings, read fresh by every page through `stashes.get_object`), and acts again
  on each new sign-in. This replaces the round-3 trust record in localStorage (`ll-offline-shell-trust`
  is no longer written).
- **Fixed (Codex H2):** without `navigator.locks`, a trusted device gets no worker and loses one it
  has (known limit: Safari before 15.4).
- Red: five unit tests on the round-3 code; three mutations. e2e: launch 6, lifecycle 4, kill switch 2.
- Open items (in the PR): the Home Screen sign-in change is outside the OFFLINE_APP_SHELL gate; an
  organization's short token timeout survives a later Trust choice; the supervisor-save trust write;
  the kill-switch e2e trusts its record; a never-settling register holds the site-wide lock; a failed
  install into an existing cache; the iPhone sign-in overlay path; ENV values outside the cache name.
- One full Ember run at the round-3 head failed one session test ("check_token accepts the answer
  for the token this tab is sending after another tab signed in"); it passes alone (16 of 16 in its
  module) and passed in the previous complete run. Rechecked in the final full run.
- These two fixes were not re-reviewed.
