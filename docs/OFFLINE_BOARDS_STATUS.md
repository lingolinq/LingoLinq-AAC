# Offline boards: status and what's left

Last updated: 2026-11-08. Branch: `feat/scot-offline-app-shell-7a29ac97` (PR #1268, draft, targets `develop`).
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
- A Home Screen launch with no network opens the app (Scot's shell), including on Wi-Fi with no internet.
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

**Retrying a failed sync (#1229)**
- A device that has never finished a sync stays on the first-sync marker after a failed sync, including when the device could not save. The automatic retry is not pushed out 48 hours. A device that has already synced still waits 48 hours after two failures.
- One reconnect starts the first sync for a device that has never finished one. A device that has already synced gets one stamp check instead. A failure that landed within a few seconds of going offline is included. The next reconnect in that same backoff waits.
- Tested on an Android tablet emulator in Chrome on 2026-11-08. Syncing is working: a new account finished a sync, the tablet reported succeeded, and the board files downloaded. With the connection off, the synced boards still draw.

**Sign-in and trust**
- A Home Screen sign-in asks "Trust this Device" or "This is a Shared Device", only where the offline shell is on.
- A new device never borrows another device's trust choice.
- Shared devices get no offline shell and do not open offline.
- iPads are recognised as mobile devices (#1201, partly).

**Tests added for this work**
- Unit tests for every change above.
- Browser tests (Playwright, against Rails with the shell on):
  - `e2e/offline-launch.spec.js`: launches, both views, pictures, not-saved boards, storage full, which boards
    sync.
  - `e2e/offline-worker-lifecycle.spec.js`: worker updates.
  - `e2e/offline-kill-switch.spec.js`.
  - `e2e/offline-webkit.spec.js`: Safari's engine, set up as a current iPad.

## Decisions made

| Decision | By | Date |
|---|---|---|
| A real server denial wins on Modern view, except home and sidebar boards; Speak Mode no longer exempts | Traci | 2026-11-05 |
| Device copies are for speaking only; saving actions are refused; no swap when the connection returns | Traci | 2026-11-05 |
| Ask "Trust this Device" on Home Screen sign-ins | Scot | 2026-11-05 |
| Ask it only where the offline shell is on | Scot (suggestion), Traci | 2026-11-07 |
| Earlier trusted Home Screen iPads: keep Scot's manual workaround for now; code fix is Scot's call (#1285) | Traci | 2026-11-07 |
| Offline sync saves home, sidebar, liked boards and Crisis Vocabulary; like a board to keep it offline | Traci | 2026-11-08 |
| Keep "Like" in both views (Modern's "Set as Favorite" renamed) and add the offline wording | Traci | 2026-11-08 |

## What's left

### Before merge (needs a person)

- **`synthetic-data` label on PR #1268.** The `data-bearing-paths` check needs a person with write access to look
  at the changed test seed (`app/frontend/e2e/support/offline-launch.rb`) and add the label. Agents must not.
- **CI.** `security-scan` fails on `develop` too (known; needs a Rails 8 upgrade). Everything else should be green
  on the latest push; check before merging.
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

1. **#1221, second half: the same data written twice in one sync.** The overlapping SQLite saves and the save
   queue are fixed (see "What's done"). Left:
   - **Rows already duplicated on devices** stay until the record is removed; reads take one of the copies and
     the next save updates both. No cleanup is in this branch.
   - **Rows saved before the button-list fix** keep both copies until the button set changes (see "What's done").
   - **The before-and-after board count** on a real account still needs staging or production.
   - **Button-set files cannot download on staging or dev.** The uploads bucket is private and only production
     has the CDN that serves these files (`UPLOADS_S3_CDN`); the search proxy fetches the raw bucket link, which
     is refused, and the app then asks the server to rebuild the same button set repeatedly. Offline sync tested
     on staging or dev is therefore slower than production and has no button-set files. Not fixed here.
2. **#1212:** board downloads time out under load (slow server, many requests at once, short client limits).
3. **#1219:** the board tree request (`/tree`) fails on very large boards (Cloud Run response size cap).
4. **Picture data repair (operations):** some saved picture addresses fail; a one-time data cleanup.
5. **#1229:** done. A new device that has never finished a sync keeps retrying after the backoff, and one reconnect can retry a dropped connection. See the task log.
6. **#1230:** Modern view's "Sync failed" notice can show the wrong state.
7. **#1034:** "Pick for home" says "saved for offline use" and "Ready to communicate" when neither is true.
8. **A "N of M boards saved" count** during sync.
9. **Smaller items:**
   - #1206: the iOS SQLite shim passes a schema row through as data.
   - "Needs a connection" wording that can show while online.
   - A 5-minute cache path on shared devices.
   - Up to 8 + 8 seconds of waiting on a hung network before the device copy opens.

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
| #1212 | Board requests time out under load | Open |
| #1213 | Modern view never loads from the device | Fixed |
| #1219 | `/tree` fails on large boards | Open |
| #1221 | First offline sync too slow | Board selection done; duplicate writes and the doubled button list fixed; board count on a real account not measured |
| #1229 | Retry gaps after a failed sync | Fixed on this branch |
| #1230 | Modern "Sync failed" notice | Open |
| #1034 | "Pick for home" claims | Open |
| #1234 | Translations for the 12 locales | Open (steps above) |
| #1285 | Earlier trusted Home Screen iPads | Waiting on Scot |
