# Offline boards: status and what's left

Last updated: 2026-11-10. Branch: `feat/scot-offline-app-shell-7a29ac97` (PR #1268, draft, targets `develop`).
Detailed working log, with every review, decision and test run: `docs/task-management/2026-11-05_offline-boards-sync.md`.
Scot's own log for the offline app shell: `docs/task-management/2026-11-03_offline-app-shell.md`.

## The goal

A person who uses LingoLinq to communicate (often a child, on a dedicated iPad) must be able to open the app
and their boards with no network: on a bus, at a school with weak Wi-Fi, in airplane mode. Boards are their
voice, so "synced" has to mean the boards are really on the device, and the app has to open without the
server.

## How it works now (on this branch)

Three layers, all needed for an offline launch:

1. **The app itself opens offline: Scot's offline app shell.** A service worker (`/sw.js`, `lib/offline_shell.rb`)
   keeps a generic copy of the app page and its files. When a Home Screen launch has no network, the worker
   answers with that copy instead of the browser's "not connected" page. It is only kept on a device whose
   person chose "Trust this Device"; a shared device gets no worker. It is switched per environment with
   `OFFLINE_APP_SHELL` (off unless set; removing it is the kill switch).
2. **Boards are saved on the device: the sync.** The sync saves boards, button sets, pictures and sounds to the
   device database (IndexedDB in a browser, SQLite in the installed app). What it saves is described under
   "Which boards are saved offline" below.
3. **The board pages read the device copy.** Both views open a saved board when the server cannot answer:
   Basic view (`routes/user/board-alt.js`) and Modern view (`routes/user/board-detail.js`, with the shared logic in
   `utils/board_device_copy.js`). A copy opened this way is for speaking only: it shows "Showing the copy saved on
   this device", and editing, sharing, copying, translating and "set as home" are refused until the connection is
   back.

### Which boards are saved offline (#1221, decided 2026-11-08)

The sync starts from these boards, and then saves each one's folders:

- the home board;
- the sidebar boards (the person's own copies, where they have them);
- the boards the person **liked** (the heart: "Like" in both views);
- Crisis Vocabulary, always, also when someone replaced the whole sidebar.

Nothing else: not every board in the person's list, not the starter boards copied in at sign-up (Vocal Flair,
Quick Core, Senner-Baud and others), and not public library boards. **To have any other board offline, like
it.** The rule lives in one place, `app/frontend/app/utils/offline_sync_seeds.js`, used by both copies of the sync
code. The app now says this where people like a board, on the boards page's Liked tab, and in Sync Details.

The `background_board_prefetch` setting no longer affects what is saved offline. It only loads boards into
memory ahead of time while online, so they open faster.

## Done on this branch

Each item below has tests; the PR's "Fix status" table lists the exact spec for each.

**Opening offline**
- A Home Screen launch with no network opens the app (Scot's shell). On Wi-Fi with no internet it opens when
  nothing answers the page request; when the network answers with an error page or the request hangs, it does not
  (tested 2026-11-09; see "Before merge").
- Modern view opens synced boards offline (#1213); Basic view already did, and now also has browser tests.
- Synced boards owned by someone else (a teacher's board, Crisis Vocabulary) open offline.
- A board that is not on the device is never a dead end (#1209): the app moves to the home board, or to the
  Always-Available Boards page.
- On a hung or failing server online, Modern view tries the server once (8 seconds), then the device copy; a real
  "not allowed" from the server wins and is not overridden by the device copy (except the home and sidebar boards).

**Saving to the device**
- Safari (iPad) has no file storage, and every sync used to fail there within a fraction of a second. Fixed;
  pictures are kept in the database instead and show offline.
- A failed database setup no longer leaves every storage call waiting forever (#1205).
- A device that cannot save (out of storage) no longer reports the sync as succeeded with nothing saved. The sync
  now ends as failed with a message ("This device is out of storage..."), and saves those boards on the next sync.
- The offline sync saves only the boards above (#1221, first half).
- Liked boards past the 25th are saved: the server now lists the first 50 liked boards, where it listed 25, so
  later likes never reached the sync. A liked board gets its button set saved again (lost in a merge from
  `develop`), and a home board that is also liked is handled once (#1221).
- A board the sync reports as 'kept' (its refresh failed, the device copy stays) or 'cached' (unchanged, not
  downloaded again) must really be on the device, in a form that opens. Otherwise it is downloaded, or reported as
  failed. Before this, with single-board requests failing, a sync on the Android emulator listed 97 boards as fine
  and saved none (#1212).
- A board that cannot be fetched is reported once per sync, not once for each board that links to it (#1212).
- The installed app (SQLite) keeps one row per record: two saves of the same row, or a save and a removal, now run
  one after the other instead of overlapping, so they no longer insert the record twice (`utils/sqlite_row_queue.js`).
  A second save still rewrites the whole record. A record that cannot be saved is now reported as failed instead
  of leaving the save waiting forever. If a row's work never finishes (a lost answer or an error in a lookup),
  later work on that row goes ahead after 5 minutes; a bridge that stops answering altogether still stalls every
  save, as before. A removal by board key, rather than by id, is not held behind a save (no caller does this
  today) (#1221, second half).
- A record loaded twice in quick succession is saved once: a waiting save of the same record (same store, id and
  key) is replaced by the newer copy (`utils/eventual_store_queue.js`). Measured locally: the button set written
  twice is now written once (15 writes to 14). The signed-in user is still written twice per sync, because the sync
  saves a fresh copy of it after the queue has written the first; that is a real update (#1221, second half).
- A decrypted button list is saved once. The "1.7 MB chunk written twice" was one save holding the same list twice:
  the parsed list (1.73 MB) and a base64 copy of it (2.3 MB) in one 4.2 MB row. Only the parsed list is saved now;
  every reader already used it first. Measured on the Android emulator (installed app, SQLite): that row is now
  1.90 MB, each chunk is written once, and after a relaunch the device reads back all 3,717 buttons. Rows saved
  before this change keep both copies until the button set changes (#1221, second half).
- A picture used on several boards is saved once per sync. Saved pictures were recorded on the wrong object (a
  leftover of the move to an Ember service), so the "already saved?" check never saw them. Measured on the Android
  emulator, first sync: 42 records written more than once (one picture 48 times) before, none after (#1221).
- Pictures and sounds uploaded to LingoLinq have permanent addresses and are no longer downloaded again when a
  copy is already saved (by address shape, on any host). Button-set files on the same server still refresh. Not
  measurable locally (no uploaded pictures in the local data). Corrected 2026-11-10: the address check missed
  every current upload (their ids carry an extra part) and now matches them. What changes for people: on a device
  with no file storage (iPad), tapping Sync no longer downloads uploaded pictures again. On such a device nothing
  replaces a bad saved copy of an uploaded picture (#1221).
- With no file storage (iPad), a picture already saved in the database is reused instead of downloaded and written
  again on every sync. The picture proxy now refuses a download cut off part way, so a broken copy is not saved
  (`spec/controllers/api/search_controller_spec.rb`). Measured in WebKit, second sync: 1,692 writes (22.1 MB, 237 s) before, 7 writes (0.54 MB, 13 s) after, all 1,651 pictures still saved; first sync 56 records written more than once before, 2 after (#1221).

**Retrying a failed sync (#1229)**
- A device that has never finished a sync stays on the first-sync marker after a failed sync, including when the device could not save. The automatic retry is not pushed out 48 hours. A device that has already synced still waits 48 hours after two failures.
- One reconnect starts the first sync for a device that has never finished one. A device that has already synced gets one stamp check instead. A failure that landed within a few seconds of going offline is included. The next reconnect in that same backoff waits.
- Tested on an Android tablet emulator in Chrome on 2026-11-08. Syncing is working: a new account finished a sync, the tablet reported succeeded, and the board files downloaded. With the connection off, the synced boards still draw.

**Sign-in and trust**
- A Home Screen sign-in asks "Trust this Device" or "This is a Shared Device", only where the offline shell is on.
- A new device never borrows another device's trust choice.
- Shared devices get no offline shell and do not open offline.
- iPads are recognised as mobile devices (#1201, partly).
- A device trusted after sign-in on the Home Screen is no longer signed out by its organization's idle timeout.
- `offline-shell` is a reserved name, and a reserved name cannot be taken as a user name by changing its letter
  case.

**Checked on a device (2026-11-10)**
- Android emulator with hardware graphics, the installed app (SQLite), a local server, one test account with 102
  boards.
- A first sync finished with 0 errors and saved all 102 boards (207 to 276 s).
- In airplane mode with the server unreachable, a cold start opened the home board from the device, and all 102
  boards had a copy that opens.
- Not checked on any device: iPad or iOS, staging, production, pictures and sounds offline, Basic view offline,
  opening a folder by tapping it, and a liked board past the 25th through a real sync.

**Tests added for this work**
- Unit tests for every change above.
- Browser tests (Playwright, against Rails with the shell on):
  - `e2e/offline-launch.spec.js`: launches, both views, pictures, not-saved boards, storage full, which boards
    sync, and three "Wi-Fi with no internet" cases (one passes; two fail on purpose until the decision under
    "Before merge" is made).
  - `e2e/offline-worker-lifecycle.spec.js`: worker updates.
  - `e2e/offline-kill-switch.spec.js`.
  - `e2e/offline-webkit.spec.js`: Safari's engine, set up as a current iPad.

## Decisions made

| Decision | By | Date |
|---|---|---|
| A real server denial wins on Modern view, except home and sidebar boards; Speak Mode no longer exempts | Traci | 2026-11-05 |
| ~~Device copies are for speaking only; saving actions are refused~~ (replaced 2026-11-09, next row); no swap when the connection returns | Traci | 2026-11-05 |
| Modern view treats a device copy like Basic view does: no "saved on this device" notice, Edit works offline, other actions are not blocked up front (ones that need the server say so). Accepted risk: an offline edit is sent at the next sync with no check for newer server changes. A real server denial still wins (row 1). NOT BUILT YET: the code still shows the notice and refuses saving actions ("How it works now", item 3) | Traci | 2026-11-09 |
| Ask "Trust this Device" on Home Screen sign-ins | Scot | 2026-11-05 |
| Ask it only where the offline shell is on | Scot (suggestion), Traci | 2026-11-07 |
| Earlier trusted Home Screen iPads: keep Scot's manual workaround for now; code fix is Scot's call (#1285) | Traci | 2026-11-07 |
| Offline sync saves home, sidebar, liked boards and Crisis Vocabulary; like a board to keep it offline | Traci | 2026-11-08 |
| Keep "Like" in both views (Modern's "Set as Favorite" renamed) and add the offline wording | Traci | 2026-11-08 |
| The first 50 liked boards are kept offline (the server listed only 25, so later likes never synced; first set to 100 on 2026-11-09, then 50). The liked-list home grid shows every listed liked board, so up to 50 (holding it at 25 with a "Show more" tile was dropped the same day: not needed at a limit of 50); a message when a like is past the limit, hiding boards a person can no longer view and clearing deleted ones are a follow-up PR | Traci | 2026-11-10 |

## What's left

### Before merge (needs a person)

- **`data-bearing-paths` check.** It passes on `980a92772` (checked 2026-11-10). If it fails after a later push, a
  person with write access looks at the changed data files and adds the `synthetic-data` label. Agents must not.
- **CI.** `security-scan` fails on `develop` too (known; needs a Rails 8 upgrade). The three #1205 tests that kept
  the Ember check red are fixed (`407ef94ac`).
- **Decision needed (Traci and Scot):** the app does not open from the device when the page request gets a server
  error page or hangs. Either fall back to the device copy on a server error and after a time limit, or list both
  as known limits. Two browser tests fail on purpose until this is decided.
- **Decided, not built yet:** Modern view device copies editable offline with no notice (2026-11-09).
- **The dual review** (`/review-pr` and `/adversary-review`), because the PR touches sign-in.
- **A sync with many liked boards, measured** (time, requests, failed saves): a condition from the review of the
  50-board limit.
- **Scot's review** of the parts of his PR that changed after he handed it over.

### Needs a real device (after merge to `develop`, on dev.lingolinq.com)

- **The device checklist** in the PR text (iPad, Android, Chromebook):
  1. Add to Home Screen.
  2. Sign in, "Trust this Device".
  3. Sync.
  4. Airplane mode.
  5. Open boards and pictures.
  6. Try a shared sign-in.
- **#1201:** check the iPad reports `system=iOS` (needs a simulator or device).
- **#1205:** force a database setup failure and check the on-screen message.
- **Sounds** on synced boards offline (never tested).
- **One unexplained WebKit stall:** once in 15 sign-ins in Safari's engine, "Trust this Device" did not finish (no
  save request went out). Not reproduced since; a real iPad will tell.
- **The `dev` environment needs `APP_OFFLINE_APP_SHELL=on`** (GitHub environment variable) for the shell to be on there.

### Code work still to do (priority order)

1. **#1221, second half: the same data written twice in one sync.** Code work done (see "What's done": SQLite
   saves, the save queue, the doubled button list, pictures written again, and the proxy refusing cut-off
   downloads). Decided 2026-11-09 (Traci):
   - **Rows already duplicated on devices:** accepted, no cleanup. Only devices that synced an older build of this
     branch have them (assumed none in real use); reads take one copy and the next save updates both.
   - **Rows saved before the button-list fix:** accepted; they shrink when the button set changes.
   - **A bad saved picture on an iPad with no file storage:** fixed at the source. The server's picture proxy
     accepted a download cut off part way (it still reports status 200) and now refuses it. A copy saved before
     this fix is still kept; tapping Sync does not refresh trusted pictures.
   - **In a browser, a picture from an untrusted outside site** can still be downloaded twice in one sync when
     several boards ask at once: accepted; revisit with the item 10 measurements.
   - **Button-set files on staging and dev:** the dev bucket refuses them (it has no CDN; production has one).
     Syncing and offline use do not depend on them: the sync does not wait for the button-set file, and boards
     and pictures sync and open offline (uploaded pictures in the dev bucket load). Only a few online features
     that use the file are affected on dev (copy-and-translate, the copy dialog's sub-board picker, focus words,
     batch recording, word suggestions). Not part of this PR.
   - The measurements that need production or a real device are item 10.
2. **#1212:** board downloads timed out on staging during full syncs in the iOS app.
   **Client side done (measured on the Android emulator only, 2026-11-10):** iPads use mobile parallelism (#1201,
   the wiring has no test yet); a board refresh is cut off after 20 s instead of 5 s; when a refresh fails for a
   passing reason (timeout, no connection, server error, too many requests) and the device has a copy that opens,
   that copy is kept and its folders still sync; a board whose lookup fails for a passing reason is tried once more
   about 10 s later, at most twice per board, and a board that cannot be fetched is reported once.
   **Pictures in a browser (measured locally):** dev-bucket pictures went through the server's picture proxy because
   the bucket (`lingolinq-dev-uploads`) refused the local origin. Scot added the local and app origins on 2026-11-09.
   Local first sync in WebKit as an iPad (one test account, 102 boards, same build before and after, a build from
   before the client changes above): pictures through the proxy 1,383 before, 3 after (uploaded pictures 1,380 before, 0 after); sync time 209 s
   before, 88 s after; no board errors either time.
   **Cause on staging: not established.** The iOS and Android apps download through Capacitor's native HTTP
   (`CapacitorHttp` on in the mobile shell), which the bucket's CORS rule does not affect, so the rule probably
   changes nothing in the apps (read in the code, not tested on a device).
   **Production pictures (fixed 2026-11-10, not measured on production):** production picture and sound links use
   the CDN host `d34sa6lc5jfe66.cloudfront.net`, which the app did not try directly, so every uploaded picture went
   through the server proxy on every platform. The app now asks the CDN directly and falls back to the proxy
   (`utils/direct_fetch.js`). A direct request also has a 45 s limit in both copies of the sync code now, and a web
   page answered in place of a picture (a filtering network) is refused. Button-set files on the CDN still go
   through the proxy. To measure after release: proxy requests per sync on production, before and after.
   **Left:** a
   first sync in the iOS or Android app against staging with a large account, counting proxy requests and
   board errors, compared with the issue's 246-error first sync; the full sync on iOS and Android; production server load under a full
   sync; a board slower than the adapter's 15 s limit on both tries is still lost with its folders (parked until the
   app and production measurements). Parked: Sync Details showing 'kept' boards.
3. **#1034:** "Pick for home" says "saved for offline use" and "Ready to communicate" when neither is true.
4. **Picture data repair (operations):** some saved picture addresses fail; a one-time data cleanup.
5. **#1229:** done. A new device that has never finished a sync keeps retrying after the backoff, and one reconnect can retry a dropped connection. See the task log.
6. **#1230:** Modern view's "Sync failed" notice can show the wrong state.
7. **#1219:** the board tree request (`/tree`) fails on very large boards (Cloud Run response size cap).
8. **A "N of M boards saved" count** during sync.
9. **Smaller items:**
   - #1206: the iOS SQLite shim passes a schema row through as data.
   - "Needs a connection" wording that can show while online.
   - A 5-minute cache path on shared devices.
   - Up to 8 + 8 seconds of waiting on a hung network before the device copy opens.
10. **Verify #1221 after release** (needs production or a real device): before and after timings on a
    hardware-accelerated Android device and an iPad; the board count on a real account; one first sync checked
    board by board for missing boards.

### Translations (after this PR's work, likely its own PR under #1234)

The new messages are in English only. Steps:

1. `ruby i18n_generator.rb --generate` checks the English file against the code.
2. `ruby i18n_generator.rb --merge` adds `***` placeholders to the 12 other languages.
3. `op run --env-file=.env.op.local -- bundle exec rake extras:translate_ui_locales LOCALE=all` machine-translates
   them. It needs 1Password signed in for the Google Translate key.

`es.json` alone already has 701 strings waiting, most from before this work. A native speaker should review the
important languages.

### Decisions still open

- **#1285 (Scot):** should iPads that were trusted on a Home Screen sign-in before this PR be asked again by code,
  instead of the manual workaround (Preferences > Session Timeout on each iPad)? A design and a standards write-up
  are in the issue and in `docs/task-management/2026-11-07_aac-device-trust-research.md`.
- **Liking in Modern view (Traci, UI):** Like is only in Edit mode (Board Actions). Now that liking is how a board is
  kept offline, a Like on Modern's board page outside Edit may be wanted.
- **Scot's open review items** in the PR text (the four Low items left as known limits).

## Known limits

- **Full storage:** the tests force database writes to fail; nobody has filled a real iPad. Writes made through the
  older Ember Data save path are not counted as failures, and the reason for a failed sync is not kept after a
  restart.
- **Library account name:** the app assumes the system library account is named `lingolinq`. The server reads it
  from `SYSTEM_BOARD_USER_NAME`; a different value would make the sync ask for the wrong Crisis Vocabulary board.
- **A missing Crisis Vocabulary board** on the server makes every sync end "finished with errors". It is seeded in
  real environments (`SystemBoardSources.ensure_crisis_vocabulary!`); not checked on staging or production.
- **Unchecked in production:**
  - whether an admin override turns `background_board_prefetch` off;
  - the `auth_spa_transition` value.
- **WebKit tests:** WebKit on Linux is Safari's engine, not iOS, and has no Home Screen mode. Playwright cannot take
  a worker-controlled page offline in WebKit, so `offline-webkit.spec.js` goes offline by closing a local proxy.
- **Before this branch,** an ordinary user's sync never reached "owned" or public boards anyway: the library list
  request needs permission they do not have, and its failure dropped the whole list. The 1,355 extra boards
  measured in #1221 most likely came from an account with admin rights (not checked).

## Running the tests locally

Rails must serve the page (not `ember serve`), from a production Ember build, with the shell on.

```
cd app/frontend && npx ember build --environment production && cd ../..
bin/rails extras:assert_js
OFFLINE_APP_SHELL=on bin/rails s -p 5077    # against a local lingolinq-e2e* database
bin/rails runner app/frontend/e2e/support/offline-launch.rb   # seed the test users (local databases only)
cd app/frontend
E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-launch --project=offline-worker-lifecycle
E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-webkit   # needs Playwright WebKit and its system libraries
```

Notes:
- **Do not use a development build.** It includes Mirage, which answers requests itself.
- **The kill-switch spec** runs after `offline-launch`, with Rails restarted with `OFFLINE_APP_SHELL=off`.
- **The seed script's header** has the environment it needs (made-up values, blank upload settings).

## Related issues

| Issue | Topic | State on this branch |
|---|---|---|
| #1201 | iPads detected as Macs | Partly fixed (`mobile`); `system` needs a device check |
| #1205 | Failed database setup hangs storage | Fixed in unit tests; device check pending |
| #1206 | iOS SQLite shim row | Open |
| #1209 | Not-saved board is a dead end | Fixed |
| #1212 | Board requests time out under load | Client side done, including production pictures from the CDN; cause on staging not established; not measured on staging or production |
| #1213 | Modern view never loads from the device | Fixed |
| #1219 | `/tree` fails on large boards | Open |
| #1221 | First offline sync too slow | Code work done (board selection, duplicate writes, doubled button list, pictures written again); verification on production and real devices is item 10 |
| #1229 | Retry gaps after a failed sync | Fixed on this branch |
| #1230 | Modern "Sync failed" notice | Open |
| #1034 | "Pick for home" claims | Open |
| #1234 | Translations for the 12 locales | Open (steps above) |
| #1285 | Earlier trusted Home Screen iPads | Waiting on Scot |
