# Offline boards: six follow-up proposals (2026-11-10)

Six read-only investigations run in parallel on 2026-11-10, each asked for a fact sheet, a red-test design and
candidate fixes (`/fix-proposal` format). **These are subagent reports: evidence to verify, not verified findings.**
Every `file:line` below is the investigator's and must be re-read before a fix is built. Nothing here is built.
Paths are under `app/frontend/` unless they start with `app/`, `lib/` or `spec/`. Parent log:
`docs/task-management/2026-11-05_offline-boards-sync.md`.

## 1. A 'kept' board can have no copy on the device (#1212, item 2)

- Real, but narrower than first thought. `keep_stored_board` (`app/utils/sync_board_fallback.js:31`) checks only
  the in-memory record's `permissions` and `image_urls`.
- Reachable for boards visited BY ID that were pushed from a `/tree` answer without a device write
  (`app/utils/board_detail_cache.js:185-190`): the folders under a liked board, and the home board. Not the liked
  board itself, which is seeded by key and goes through the adapter.
- Only a timeout or a 429 reaches `keep_stored_board` when a row exists; a 5xx or status 0 is answered from the row
  inside the adapter (`app/utils/persistence.js:4320-4346`).
- Reliable signal that a row exists: `persistence.find('board', id)` rejects when there is none
  (`app/services/persistence.js:368-457`). `retrieved` and `local_result` are not reliable.
- Adjacent hole, same defect with a wider trigger: the 'cached' branches (`app/services/persistence.js:2770-2777`)
  accept an in-memory record with a matching revision and no device check, with no failed reload needed.
- Proposed fix: before keeping, read the device row; with none, reject with the original error so the retry runs.
  One local read per board whose reload failed. Rejected: writing the in-memory copy (a lite `/tree` payload) as
  the offline copy.
- Red test: in `tests/utils/persistence-sync-test.js`, beside `lookupFailing` (about line 6159): same in-memory
  record, `find('board', id)` resolving (kept) versus rejecting (must not be kept, error stays). The five existing
  'keep' tests gain the resolving stub. Plus one real-database test in the `syncWithBoard167` style.
- Open: give the 'cached' branches the same check as a separate unit.

## 2. Modern view: a device copy editable offline, no notice (Traci's decision, 2026-11-09)

- An offline save from Modern does reach the device and goes out at the next sync: `board.save()`
  (`app/controllers/user/board-detail.js:6285`) through the adapter's offline `updateRecord`
  (`app/utils/persistence.js:4513-4515`, `changed = true`), replayed by `sync_changed` (`:3528`, `:3577-3579`) with no
  conflict check.
- The record is a real store record (`app/routes/user/board-detail.js:793-800`), so it can be saved.
- Two things to settle with tests first: (a) whether `newest_copy` (`app/utils/board_device_copy.js:22-26`, a string
  compare of dates) would prefer an equal-instant memory copy over the edited row; (b) entering Edit invalidates the
  memory cache (`app/routes/user/board-detail/edit.js:73-76`), so a copy that exists only in memory is gone if the
  edit is abandoned offline.
- Offline rename keeps the old key (the rename runs only in the online success branch,
  `board-detail.js:6383-6386`). "Board saved!" offline does not say the edit is waiting for a sync.
- Recommended design B: offline, actions run on the copy; ONLINE with a copy showing, Edit refetches first and then
  continues in one tap (no server answer: continue on the copy; a refusal still wins). Keep the flag internally (it
  stops stale grids being cached, `board-detail.js:2201`, `:2251`). Design A (never refetch) would send a stale copy
  straight to the server while online, which is beyond the accepted risk.
- Tests that encode the old decision and change only with Traci's approval:
  `tests/unit/routes/board-detail-device-copy-test.js` at about lines 615, 637, 658, 668, 684, 732 (and 718, 740,
  748 depending on the design); `e2e/offline-launch.spec.js:240`. Several e2e tests use the notice as proof the
  board came from the device and need another probe (a non-visible attribute was suggested).
- Questions for Traci: design A or B when online; should "Use this board" and Translate also be unblocked offline;
  is a hidden test-only attribute acceptable.

## 3. A trusted Home Screen iPad still gets the organization's idle timeout in its first session

- Real. With the shell on, the sign-in sends no `long_token`, so the key gets the org timeout
  (`app/models/device.rb:206-210`); the Trust answer sets the device row's `long_token`
  (`app/models/user.rb:3856-3869`) and never touches the key. A per-key timeout wins over the row
  (`device.rb:297`), and a timed-out browser key never recovers (`device.rb:304-309`), so the person is signed out.
- A long token already bypasses the org timeout by design, before this branch and for any trusted browser today,
  so the fix restores behaviour and adds no new bypass.
- Smallest fix (recommended): at `device.rb:297`, ignore the key's timeout when the row is a browser with
  `long_token` true. Covers the Preferences toggle and SSO, and reverses if the person later picks Shared.
- Red test: `spec/controllers/api/users_controller_spec.rb`, modelled on line 717 and `spec/models/device_spec.rb:281`:
  org timeout 20 minutes, sign in without `long_token`, answer Trust, 21 idle minutes later the token is still
  valid; control with Shared stays invalid.
- This is an authentication change: dual review is required. Open for Scot: does any organization expect its
  timeout to hold even on trusted devices.

## 4. #1034: "Pick for home" claims the board is saved offline (item 3)

- The claim is one toast, `board_now_your_home_board` ("...and it's saved for offline use."),
  `app/components/board-preview-overlay.js:476`. It shows when image preloading resolves, which only warms the
  browser cache and always resolves (`app/utils/board_preview_warmer.js:92-112`); nothing is written to the device
  and this path starts no sync. The `_no_offline` variant is dead code.
- "Ready to communicate" is the speak tour's last step (`app/utils/tours/board-detail-speak.js:141`), not tied to
  sync state. The set-as-home tooltip also says "available offline" (`app/components/board-actions.hbs:184`,
  `app/templates/user/board-detail.hbs:1035`).
- Option (a), recommended first: new wording plus start a sync as the sibling flows do
  (`app/components/trial-bar.js:113-116`). Proposed text: "This is now your home board. It will be kept on this
  device for offline use after the next sync." Tooltip: "Make this the board you start on. It is kept on this
  device after the next sync."
- Option (b): say "saved" only after the sync that saved it (`device_has_board`,
  `app/utils/board_device_copy.js:41-45`), with a "not saved yet" message otherwise.
- Use new i18n keys so the 12 other locales do not keep the old claim.

### 4a. #1034 built (2026-11-10, Traci: "fix the message to reflect what happens and do what else is necessary")

**Part 1, the message. Facts (CONFIRMED by reading):**
- The claim is read at one place: `_finishPickForHome` ended with
  `preload_board_images(homeBoard).then(finish, finish_without_images)` (`app/components/board-preview-overlay.js`).
  `preload_board_images` always resolves (`app/utils/board_preview_warmer.js:92-112`: every branch calls
  `resolve`, including the 6 s safety timer and the `catch`), so `finish_without_images` could never run and the
  "saved for offline use" message showed whatever happened.
- Nothing in that step writes to the device: it creates `Image` objects only. On this branch a board is on the
  device once a sync has saved it, and the home board is one of the boards a sync starts from
  (`app/utils/offline_sync_seeds.js`).
- This path started no sync of its own. Five other home-board flows do, under the same condition (online and
  `auto_sync`), for example `app/controllers/board-picker.js:194-196` and `app/components/trial-bar.js:113-116`.
- The same claim is in the Set as Home description, in two templates (`app/components/board-actions.hbs:184`,
  `app/templates/user/board-detail.hbs:1035`).
**Change:** one message, `home_board_set_message()`: "This is now your home board. It will be kept on this device
for offline use after the next sync."; `sync_after_home_change(persistence)` starts that sync when one can run
(both in `app/utils/home_board.js`); the dead second handler is removed; the Set as Home description reads "Make
this the board you start on. It is kept on this device after the next sync." New translation keys, so other
languages do not keep the old claim under the old key. The five existing copies of the sync condition are left as
they are (moving them to the helper is a refactor for its own change).

**Part 2, "Ready to communicate" with no home board: already gone from the code. Facts (CONFIRMED by reading):**
- The words "Ready to communicate" are no longer on the Home page's Speak Mode card; it reads "Speak Mode" and
  "Open Board" (`app/components/dashboard/authenticated-view.hbs:407-410`).
- The flow in the issue (the home tour's "start speaking / pick a board for me" hand-off,
  `_startSpeakingHandoff` in `app/components/guided-tour.js:888`) has NO caller any more
  (`git grep _startSpeakingHandoff -- app/frontend`: its definition and two comments). It polled the starter
  board's `/tree` up to 15 times, each a request the ajax layer repeated twice on a timeout
  (`app/utils/extras.js:186-190`, `:361-364`), and it never saved a home board: that is the 22-request storm and
  the "no home board selected" in the issue, recorded on 2026-09-20.
- The tour redesign of 2026-10-12 replaced it with `start_talking_now` (`app/utils/tours/start_talking.js`, called
  at `guided-tour.js:1525`): the person's own copy of Vocal Flair 60 is copied or reused AND saved as their home
  board (`copy_or_reuse_as_home` -> `saveHomeBoard`, confirmed against what the server stored), then Speak Mode
  opens; a failure shows a message and opens the board picker. The board picker's own "pick for me" button copies
  Vocal Flair 84 and saves it as the home board (`app/utils/assign-vocal-flair-home.js`).
- **My mistake, corrected before anything was committed:** I first put a time limit and a single-request option
  into `_startSpeakingHandoff` and wrote three tests for it, without checking that anything calls it. Nothing does.
  The edit and its test file were removed. Rule 0.12(a): find where the value is READ, and here that includes
  "is this function called at all".
- Removed with Traci's OK (2026-11-10): `_startSpeakingHandoff`, its comment block and the board-cache import only
  it used. Checked first that nothing calls it: no mention in any tracked file but its definition and one comment;
  no computed-name call in the component; the welcome buttons dispatch by fixed labels to `_welcomeAction`; one
  occurrence (the definition) in the compiled production bundle. The file's lint baseline rows were re-anchored by
  hand (approved): 12 moved by 1 line, 6 by 101, 1 dropped with the function; 18 findings, 18 rows, none new.
  `_speakHandoffActive` stays: the live flow sets it.

**Tests:** `tests/unit/utils/home-board-message-test.js` (5).

## 5. Item 9, the four smaller items

| Item | Real at HEAD? | Fix size | Notes |
|---|---|---|---|
| A. #1206 iOS schema row | Yes, dormant | Small | The shipped shell's bridge already strips the `{ios_columns}` row (`lingolinq_mobile/www/sqlite_bridge.js:28-37`); the Ember copy (`app/utils/capacitor_sqlite_shim.js:25-35`) does not, and installs only when the shell's is absent. Copy the strip; new unit test. |
| B. "Needs a connection" while online | Yes, two places | Small | Trial bar "Use" (`app/components/trial-bar.js:95-98`) and the languages modal's Translate (`app/components/switch-languages.js:129-132`) never check `online`. Proposal 2 may remove these paths. |
| C. 5-minute cache on shared devices | Yes, narrow | Small to medium | Sign-out clears the cache, so "another user's board" is not reproducible. Exposed: boards cached in this session for up to 5 minutes after a server-side session end, a revocation, or offline on an untrusted device (`app/routes/user/board-detail.js:126-163`, `:641-646`). Auth and offline: dual review. |
| D. 8 + 8 seconds | Yes | Medium | Owner lookup 8 s (`app/routes/user.js:119-124`) then board fetch 8 s (`DEVICE_COPY_WAIT_MS`). Safest: one shared budget with a floor of about 3 s; a 400 or 404 inside the window still wins. |

## 6. Item 8: "N of M boards saved"

- A count already ships: Basic view's dashboard and Sync Details show "Syncing... 12 / 40 boards"
  (`app/components/sync-details.hbs:44-52`, `app/components/dashboard/classic-view.hbs:403-409`,
  `classic-rail.hbs:558-562`). Modern view's dashboard shows nothing while syncing.
- M cannot be truthful from client data: the total grows as links are found and can also go down
  (`app/services/persistence.js:1972-1987`, `:3082-3095`). The server's board_revisions count is a floor only.
- A board is counted as visited before its pictures are stored (`:3132`). 'kept' boards are left out of the log
  tallies (`app/components/sync-details.js:29-31`).
- Recommended (about half a day to a day): drop M, show "Saved so far: 12 boards", add the same line to a syncing
  notice on the Modern dashboard, and say how many boards had a problem. Alternative: "12 of at least 40 boards".
- Questions for Traci: "saved" or "checked"; include supervisees; does Modern get a syncing notice; should 'kept'
  have its own tally. No feature flag for rewording; the new Modern notice is borderline.

## 7. Production pictures go through the server proxy; let the app fetch the uploads CDN directly (#1212)

Investigator's report, not re-verified except where noted.
- In production an uploaded picture's URL is on `https://d34sa6lc5jfe66.cloudfront.net` (`lib/uploader.rb:649-660`,
  `app/models/concerns/uploadable.rb:46-52`); 47 such URLs were found on the public board
  `lingolinq/crisis-vocabulary`. `cors_match` (`app/services/persistence.js:1546-1552`, and the copy in
  `app/utils/persistence.js:1583-1673`) does not include that host, so every such picture goes to
  `/api/v1/search/proxy` (`:1634`), one server thread each.
- The CDN allows it: ranged GETs with `Origin` set to `https://app.lingolinq.com`, `capacitor://localhost` and
  `https://localhost`, with and without `?cr=1`, all answered `access-control-allow-origin: *` (curl, 2026-11-10).
  The `cr=1` query the app appends does not seem to be part of the CDN cache key (a request without it was a cache
  hit right after one with it); to confirm in the CloudFront cache policy.
- The frontend never learns the CDN host: `UPLOADS_S3_CDN` is in no view, JSON API or frontend config.
- Side finding: `is_permanent_upload_url` (`app/utils/permanent_upload.js:9`) returns false for a real production
  picture URL. It expects `<n>_<n>-<128 hex>`, but `ButtonImage` and `ButtonSound` ids carry a nonce
  (`1_<id>_<nonce>`), so only legacy records match. The #1221 "trusted by its shape, not downloaded again" reuse
  therefore does not apply to current uploads. Needs its own proposal.
- What a direct download skips: the proxy's content-type allow list (`search_controller.rb:438`), its size cap
  (`:447-451`) and the new cut-off check (`:457-460`); a browser fires `error` on a short body, native behaviour is
  unchecked. Gained: no Rails thread, no base64 JSON (about a third smaller), CDN edge caching.
- The report-only CSP already allows `https://*.cloudfront.net` for `connect-src`
  (`config/initializers/content_security_policy.rb:74`, `:113`).
- Recommended (A): emit the CDN host to the page (next to `symbol_proxy_key`, `application.html.erb:137`) and move
  the direct-fetch list into ONE helper used by both persistence copies; dev and staging have no CDN and are
  unchanged. The mobile bundle must get the value too (how the apps receive page-level settings: to verify).
  Rejected: hard-coding the host a third time; a server-side redirect.
- Red tests: in `tests/unit/utils/persistence-saved-pictures-test.js`: a CDN picture is requested directly and not
  through the proxy; a failed direct request still falls back to the proxy; with no CDN host configured nothing
  changes.
- Expected effect: the `search/proxy` requests for uploaded pictures disappear from production syncs. To measure:
  count proxy log lines per sync before and after.

### 7a. Fact sheet and proposal (second session, 2026-11-10)

Re-verified by reading the code and by requests to production. Learnings consulted: the 2026-11-08 entry "The Ember
Data adapter runs the UTILS persistence copy" (`learnings-archive/2026-11.md:169`), which is why both copies get a test.

**(a) Where the value is read.**
- CONFIRMED: `store_url_now` builds `cors_match` at `app/frontend/app/services/persistence.js:1551-1552` and reads it
  once, at `:1577`, to decide whether to send a direct `XMLHttpRequest` (`:1582-1612`). Any rejection of that request
  (network error, abort, a status other than 200, a blob that cannot be read) reaches the fallback at `:1617`, which
  asks the external symbol proxy only when `window.symbol_proxy_key` is set (`:1622`) and then
  `/api/v1/search/proxy` (`:1634`).
- CONFIRMED: the second copy is `app/frontend/app/utils/persistence.js:1588-1589`, read at `:1614`, proxy at `:1673`.
- CONFIRMED: nothing else reads `cors_match` (`git grep cors_match -- app/frontend/app`: these two functions only).

**(b) The shapes the address can hold.**
- CONFIRMED: production uploads are `https://d34sa6lc5jfe66.cloudfront.net/images/<digits>/<id>_<nonce>-<sha>.png`
  (the public board `lingolinq/crisis-vocabulary` has 47 such addresses, fetched 2026-11-10). The host matches no
  pattern at `:1546-1552`, so these go to the proxy. Red tests show it (below).
- CONFIRMED: button-set and other extra-data JSON files are uploaded to the same bucket as `text/json`
  (`app/models/concerns/extra_data.rb:102`), so on production they are on the same CDN host. A direct request returns
  that content type, which the decrypt step needs (`services/persistence.js:1649`).
- CONFIRMED: staging and dev picture and sound addresses are on the bucket host and already go direct
  (`uploads_bucket`, `:1549-1550`). The change gives production pictures and sounds the route staging already uses.
  Corrected after review: this is NOT true of button-set files. With no CDN set, staging returns relative
  button-set addresses (`app/models/board_downstream_button_set.rb:326`, `:391`), which go through the proxy, so
  a direct request for a production button-set file has no precedent anywhere.
- CONFIRMED: the trust decision (`trusted_not_to_change`, `:1546-1548`, `:1556`) is separate from the route. This
  change does not touch it.
- Production does not set `SYMBOL_PROXY_KEY` (neither the page nor the globals bundle carries it; reviewer's
  check), so the fallback there goes straight to `/api/v1/search/proxy`.

**(c) Claims about other systems.**
- CONFIRMED: the CDN answers `access-control-allow-origin: *` for `Origin: https://app.lingolinq.com`,
  `capacitor://localhost` and `https://localhost`, with `?cr=1`, and for an `OPTIONS` preflight (curl, 2026-11-10,
  one public picture). A missing file answers 403 (reviewer's check), so it falls back to the proxy.
- CONFIRMED: the frontend has no source for the CDN host today. The server reads `UPLOADS_S3_CDN` in
  `lib/uploader.rb`, `app/models/concerns/extra_data.rb:196`, `app/models/concerns/uploadable.rb:215` and
  `app/models/board_downstream_button_set.rb:326`, `:391`, and sends it to no page.
- Corrected after review: there IS a route by which a server setting reaches the mobile apps. `extras:mobile` writes
  the live `/api/v1/domain_settings` answer into the app (`lib/tasks/extras.rake:730`), and the web page reads the
  same settings. `globals.js.erb` is not part of the bundle the apps copy (`app/assets/javascripts/application.js:1-5`).
- CONFIRMED: the offline shell's worker leaves requests to other origins alone
  (`app/views/offline_shell/service_worker.js.erb:147`), and the CSP is report-only and allows the host
  (`config/initializers/content_security_policy.rb:71`).
- REPORTED by the first session, not re-run: the direct blob request works in the installed Android app (the
  emulator sync fetched the staging-bucket pictures directly).
- NOT CHECKED: the CDN's behaviour for a button-set file (no production account here); CloudFront's cache policy.

**Candidate fixes.**
- **B (recommended): name the production CDN host in one small helper** (`app/frontend/app/utils/uploads_cdn.js`,
  `on_uploads_cdn(url)`, anchored to `https://d34sa6lc5jfe66.cloudfront.net/`), and add it to `cors_match` in both
  copies, in place on the existing line. Works the same on the web, in the offline shell and in the mobile apps,
  with no server change. Cost: a production host name in source (the list already names buckets and two old CDN
  hosts). If the CDN host ever changes, pictures quietly go back through the proxy and still work.
- **A: the server tells the app the CDN host**, through `/api/v1/domain_settings`. Correct for any deployment and
  it follows a CDN change (on the web at once, in the apps at their next build). It needs a server change and its
  spec as well. Not chosen for now because B is smaller; it remains a sound follow-up. Neither A nor B can be
  switched off in the installed apps without an app release.
- **C: try any address shaped like an upload directly, on any host.** No host list, but it sends a device's request
  to hosts the proxy used to hide it from, and adds a failed request before every proxied one on hosts without CORS.
- Rejected as simplest alternative: adding the host inline to both regex lists (the same idea twice, Rule 0.6).

**Risks.**
- A direct download skips the proxy's content-type list, size cap and cut-off check
  (`app/controllers/api/search_controller.rb:438-460`). The same is already true for every staging and dev upload
  and for symbol-library pictures. The files are LingoLinq's own uploads, whose type and size were limited when
  they were uploaded.
- Button-set JSON on production moves to the direct route too (same host). Staging does this today. Not measured
  on production.
- The `.eslint-todo` baseline is line-anchored: the edit stays on the existing `cors_match` line and the import
  goes with the others at the end of each file.

**Review outcome (adversary agent, 2026-11-10; each finding checked in the code before acting).** Ship with
conditions, all applied:
1. The service copy's direct request had no time limit (the utils copy has 45 s). Added, with the `timeout`
   listener, so a stalled CDN connection falls back to the proxy and frees its slot.
2. A direct answer of status 200 with a web page (a filtering network) was saved as the picture. Now refused in
   both copies when the type is `text/html`, so the proxy is asked. Narrower than the reviewer's "only image, audio
   or JSON": a stricter list could refuse files that load directly today.
3. The fact sheet is corrected above.
4. Tests added: the host alone is not trusted (Sync still refreshes a changeable CDN file); a longer host name
   that starts the same way; a 403; a timeout; a web page answer, in both copies.
My own narrowing after the review: only pictures and sounds take the direct route (`on_uploads_cdn(url, type)`).
Button-set files on the CDN stay on the proxy until a direct request for one is tried against production.

**Questions not resolved.** Whether `cr=1` is in the CDN cache key (if it is, the app's requests and the page's
`<img>` requests are cached separately at the edge; correctness is unaffected). Native iOS behaviour on a short
body.

**Tests** (`tests/unit/utils/persistence-saved-pictures-test.js`, ten; before the fix 7 of the first 9 failed and 2
are guards): a CDN picture is requested from the CDN and not through the server; a failed direct request, a 403
and a timeout fall back to the proxy; a web page answer is refused; another CloudFront host and look-alike
addresses still use the proxy; a sound goes direct and a button-set file does not; the host alone is not
trusted; the utils copy also goes direct. Mutations that must fail: remove the helper from either copy's `cors_match` (the
service tests or the utils test); loosen the host pattern to any CloudFront host or drop its anchor (the two
guards).

### 7b. The "do not download again" rule misses current uploads (#1221): fact sheet and proposal

**(a) Where the value is read.** CONFIRMED: `is_permanent_upload_url` (`app/frontend/app/utils/permanent_upload.js:9-16`)
has two callers, `app/frontend/app/services/persistence.js:1556` and `app/frontend/app/utils/persistence.js:1593`.
Each adds its answer to `trusted_not_to_change` AFTER `cors_match` is built (`:1551`, `:1588`), so it changes
only whether a saved copy is looked for and reused (`:1559-1575`), never the fetch route.

**(b) The shapes an upload address can hold.**
- CONFIRMED: the key is `file_path + global_id + "-" + sha512` plus an extension
  (`app/models/concerns/uploadable.rb:58-80`), kept in `settings['full_filename']` (`:64`). A picture's is set
  once; a sound's is replaced by the transcoded file's key (`app/models/concerns/media_object.rb:34`).
- CONFIRMED: `ButtonImage` and `ButtonSound` have protected ids (`app/models/button_image.rb:8`,
  `app/models/button_sound.rb:9`), so `global_id` is `1_<id>_<nonce>` unless the record's nonce is `legacy`
  (`app/models/concerns/global_id.rb:4-10`). The nonce is 24 hex characters (`go_secure` 0.70, `nonce`:
  the first 24 of a SHA-512 hex digest).
- CONFIRMED on production: all 47 uploads on the public board `lingolinq/crisis-vocabulary` are
  `/images/<digits>/1_<id>_<24 hex>-<128 hex>.png` or `.svg`. The pattern at `permanent_upload.js:9` expects
  `<n>_<n>-<128 hex>` and matches none of them.
- CONFIRMED: a transcoded sound keeps the same prefix and adds `v<unix time>`
  (`app/models/concerns/media_object.rb:87`), under a new key; the old key is not overwritten.

**(c) Claims about other files.** CONFIRMED: no third caller (`git grep is_permanent_upload_url -- app/frontend/app`).
Carried over from the first review of this rule, not re-derived: an upload's bytes are never rewritten under the
same key. The nonce does not change that argument: it is part of the id, fixed when the record is created.

**Candidates.** (1, recommended) allow one optional `_<hex>` part between the id and the dash:
`\d+_\d+(?:_[0-9a-f]+)?-`. (2) Accept any id text before the dash: simpler to write, but it widens "trusted" to
shapes the server never produces. Rejected.

**Risks.** A wrongly saved copy of a current upload is no longer replaced by tapping Sync (already the accepted
behaviour for trusted pictures: status doc, code work item 1). This rule was decided and reviewed on 2026-11-08;
the change makes it apply to the uploads it was written for.

**Review outcome (adversary agent, 2026-11-10): ship with conditions, all applied.**
1. The negatives did not catch a wider character class (their "other text" case failed on its hyphens). Added:
   non-hex letters, a nonce one character short, one character long. The pattern now requires exactly 24 hex
   characters, what the server makes; any other length is simply not trusted.
2. Where this changes what people see: with file storage the sync already skips a saved picture before
   `store_url_now` runs (`services/persistence.js:3192`, `:3226`), so trust matters only in a race. On a device
   WITHOUT file storage (iPad Safari, the Home Screen app, after a quota error), tapping Sync no longer downloads
   current uploads again. The other side of that: on such a device nothing replaces a bad saved row of a current
   upload (the picture repair only handles file copies, `utils/button.js:1258-1270`). Test added for the
   no-file-storage forced Sync.
3. Exception to "never rewritten": the upload form the server hands out is valid for 60 minutes and
   `upload_success` has no already-confirmed guard (`lib/uploader.rb:736-741`,
   `app/models/concerns/remote_uploader.rb:13-37`), so an owner could post different bytes to a published key
   within the hour. Older than this branch; a server guard is separate work.
The reviewer also confirmed no other path rewrites a published key and no newly matched address can change.

**Tests** (red before the fix): `permanent-upload-test.js` "matches a current upload, whose id carries a nonce"
(with an empty nonce, two nonces, other text, and a video as negatives); `persistence-saved-pictures-test.js` "the
Sync button reuses a saved CURRENT upload". Mutations: remove the optional group (both fail); make the nonce
accept any characters or repeat (the negatives fail).

## 8. Three small sync items

Investigator's report by code trace; nothing was run.
- **Retry gap (#1212): real, low severity.** A board whose lookup failed is in neither list while it waits for its
  retry (`app/services/persistence.js:3364`), so a board that links to it queues it again (`:3238-3252`) and it is
  requested at once; if that fails too, two error rows are recorded for the one board. The two-request limit holds
  per lookup string. Fix (about 3 lines): remember unreachable boards for the sync and do not queue them again.
  Red test: beside "should ask for a board linked from two places at most twice", with the failing board listed
  first. The interleaving itself cannot be reached in the one-thread test harness.
- **iPad detection wiring (#1201): a test gap, not a defect.** The only call of `is_ipad_with_mac_agent` is
  `app/utils/capabilities.js:230`, inside code that runs when the module loads; removing it leaves every test green.
  Proposed: move the detection block unchanged into `detect_platform(caps, nav, win)` and test that. The report
  lists every reader of `capabilities.mobile` (sync thread counts, touch handling, sign-in overlay, autofocus,
  ratings prompt).
- **`lookupsToSyncSeeds`: dead code.** No caller in `app/`; one unit test
  (`tests/unit/utils/board-prefetch-planner-test.js`, "lookupsToSyncSeeds produces sync queue entries"). Its seeds
  carry no `button_set` mark. Deleting it and that test needs Traci's approval (Rule 0.14); otherwise a comment.

## 9. The app shell answers a launch from the device on a server error and after a time limit (Traci, 2026-11-10)

Traci's decision: a person must not be locked out of communication when the network answers the page request
with a server error page or never answers. "Never" is to be defined. She chose Scot's original design for the
limit. This is offline and infra work: `/fix-proposal`, dual review.

**History (CONFIRMED).** Scot's original worker (`2f6c95b17`, 2026-11-03) tried the network first and, after
`NAVIGATION_TIMEOUT_MS = 4000` (`lib/offline_shell.rb:27` at that commit), answered with the cached page; the
request carried on and its answer was dropped (`service_worker.js.erb:75-99` at that commit). A 5xx answer was
passed through unchanged even then. Review round 2 removed the limit (`913cda12a`, 2026-11-05: "a page that took
over four seconds online got the cached copy, which could be an older version than the server's"); Scot's log
lists it as "Timeout (4)" among the fixes he approved (`2026-11-03_offline-app-shell.md:310-311`, `:339-340`). So
the limit was Scot's original design AND its removal was approved by him; this change reverses the removal, and
Scot should hear about it before merge.

**(a) Where the value is read.** CONFIRMED: every top-level app-page navigation on a trusted device is answered
by `navigationResponse` (`app/views/offline_shell/service_worker.js.erb:132-141`), called at `:152`. The browser
paints whatever that function resolves with. Nothing in the Ember app runs before it, so this is the only place a
page-load fallback can live.

**(b) The shapes the network's answer can take, and what happens today.**
- Rejects (no connection, DNS failure, connection refused): the cached page if there is one, else the error.
  CONFIRMED `:133-140`. This is the only case that opens from the device today.
- Resolves with a 2xx app page: shown. CONFIRMED.
- Resolves with a 3xx: `fetch` follows it; a sign-in redirect lands on `/login`, shown. CONFIRMED by the
  `redirect` default; the precache path refuses redirects (`:60-62`) but navigations do not.
- Resolves with a 4xx (a sign-in page, a denial, a 404): shown. Correct: a real answer.
- Resolves with a 5xx (Rack::Timeout 500, Cloud Run 503, a proxy's 502): shown as the error page. CONFIRMED
  `:133` resolves it like any response. This is case 1.
- Resolves with a 200 that is not the app (a captive portal, a school filter's block page): shown. Not
  distinguishable without a marker on the live page; out of scope, stays a known limit.
- Never settles (a hang): the worker waits for the browser's own network timeout, which can be minutes, then the
  reject branch runs. CONFIRMED by the absence of any timer (`:132-141`; the controller spec pins
  `not_to include('setTimeout')`, `spec/controllers/offline_shell_controller_spec.rb:102-107`). This is case 2.

**(c) Cross-file claims.**
- CONFIRMED: the two e2e cases for these shapes exist and fail today:
  `app/frontend/e2e/offline-launch.spec.js:479-521` ("the page request gets an error page (503)" and "the page
  request hangs"); "nothing answers" passes.
- CONFIRMED: two existing tests encode the removed decision and must change (Rule 0.14; Traci's instruction
  "settle with Scot's original decision" is taken as that approval, named here so she can object):
  `spec/controllers/offline_shell_controller_spec.rb:102-107` "answers a navigation with the cached page only
  when the request fails, never after a wait"; `app/frontend/e2e/offline-worker-lifecycle.spec.js:78-97`
  "online, a slow page load waits for the network instead of answering with the cached copy" (holds the page 6 s).
- CONFIRMED: the worker's code feeds the cache name (`lib/offline_shell.rb:29-35`, `:139`), so every device
  installs the new version on its next online launch; no `WORKER_VERSION` bump is needed.
- CONFIRMED: the cached page is the generic shell with no user and no token (`:155-181` of the controller spec),
  and the app it boots reads the device for who is signed in and talks to the server normally afterwards, so a
  shell answered to a slow online launch still works online; it only runs the app version the device has.

**Definition of "never answers".** No response from the network within **4 seconds** of the request
(`NAVIGATION_TIMEOUT_MS = 4000`, Scot's original value). "Response" means the headers have arrived: a server that
has started answering is not cut off, however long the body takes.

**Candidate fixes.**
- **A (recommended): restore Scot's original `navigationResponse` with one addition.** Network first; the cached
  page answers (i) a rejected request, (ii) a 5xx response, (iii) no response within 4 s. With nothing cached, the
  network's answer stands in every case. (ii) is the one thing the original did not do. About 25 lines, in the
  shape of `2f6c95b17:75-99`. The constant returns to `lib/offline_shell.rb` so the spec and the worker share it.
- **B: 8 seconds instead of 4,** the app's own first-request limit. Fewer false fallbacks on a slow but working
  server (a Cloud Run cold start can exceed 4 s), a longer wait for a person on a hung network. Traci chose 4.
- **C: fall back on 5xx only, keep waiting on a hang.** Rejected: leaves case 2, which Traci named.
- Rejected: marking the live page to detect block pages (needs a layout change and a header; a follow-up).

**Risks.**
- A working server that takes more than 4 s to start answering a page gets the cached shell: the person is in
  the app, online, on the app version the device holds, until the next launch. This is the trade-off review round
  2 removed and Traci is accepting. On production a cold start of the web service may exceed 4 s; the first launch
  after one would open from the device. To watch after release.
- The dropped request still completes on the server (as in the original); no double side effects, it is a GET.
- A 5xx during a deploy (a bad revision) answers the shell to trusted devices instead of the error page, which is
  the wanted behaviour.
- A device with no cached page (first launch, or after the kill switch) is unchanged.

**Questions not resolved.** Whether Scot wants 4 s or a different value now that his removal is reversed. Whether
`Response.ok` on the 5xx branch should also cover a 0-status opaque response (cannot occur same-origin).

**Tests.** Red before the fix: the two e2e cases above (real worker). Spec: replace the "never after a wait"
example with one that asserts the limit constant is in the worker, the timer, and the 5xx branch (source guard,
as the others are). Lifecycle e2e: the 6 s slow page now gets the cached copy; the case is rewritten as "online, a
page that answers within the limit is the live page, a page slower than the limit is the saved copy" (two
timings, 2 s and 6 s). Mutations that must fail: remove the timer (hang case red); pass 5xx through (503 case red);
set the limit to 0 (the 2 s live-page case red).

**Review outcome (adversary agent, 2026-11-10; no Critical or High; each finding checked before acting).**
1. A navigation request is fetched with redirect mode `manual`, so a same-origin 302 comes back as an opaque
   redirect with status 0 (and app pages do redirect: renamed boards and users, `boards_controller.rb:84-85`,
   `:118-119`). So the error branch is `status >= 500 || status === 429`, never `!response.ok`, and the fact
   sheet's "fetch follows it" row above was wrong. Applied; a redirect e2e case added.
2. A 429 from the request limiter (Rack::Attack, 150 requests per 3 s per IP, shared by several iPads behind one
   school network) is a plain-text page, the same lockout. Treated like a 5xx. Applied; a 429 e2e case added.
3. Fact (c) was too strong: a cached page served to a slow ONLINE launch is not the live page. It has no chart
   scripts (the stats charts break on that launch), `SYMBOL_PROXY_KEY`, `STRIPE_PUBLIC_KEY` and `TRACK_JS_TOKEN`
   are frozen at cache time, and the old build stays for the whole session (no version check, nothing listens
   for `controllerchange`). Recorded as known limits; a "newer version available" prompt is a follow-up.
4. Mutants the first test plan missed: `!response.ok`, `>= 400`, a timer that answers nothing with no cache, a
   limit of 3 or 5 s. Added: the spec pins `NAVIGATION_TIMEOUT_MS == 4000` and the exact error expression; a
   lifecycle case with the cached page removed (a slow page then waits); the 2 s live-page case is answered from
   a body fetched beforehand so Rails' render time is not added; 404 and redirect cases. The 2 s and 8 s
   timings bracket the 4 s limit from both sides. Not added: a launch at `/` with the API also answering 503
   (the manifest's start page), noted as not covered.
5. The cold-start premise was wrong: the web service runs with `--min-instances 1` everywhere
   (`deploy-cloudrun.yml:976`); slow pages are more likely Puma queueing under classroom load, when many
   devices would get the cached page at once. To watch after release (count cache answers by reason).
6. The PR body's "Known limits", the worker header and the test comment are rewritten with the fix.
7. The two existing tests that encode the removed rule are changed only with Traci's explicit approval
   (asked 2026-11-10, after the proposal review).

## 10. Liked boards: a like past the limit of 50 says so (Traci, 2026-11-10)

Facts (CONFIRMED): the server lists the first `User::LIKED_BOARD_REFS_LIMIT` (50) liked boards
(`app/models/user.rb:2467-2473`) and the sync saves the listed ones; the like endpoint answered only
`{starred, user_id, stars}` (`app/controllers/api/boards_controller.rb:1059-1066`); the user's liked list is
kept by a queued job (`Board#star` at `app/models/board.rb:206` schedules `User#remember_starred_board!`), so a
count read in the request is the stored list plus or minus this like; the app showed "kept on this device" for
every like (`app/frontend/app/models/board.js:982`). Change: the answer adds `liked_boards`, `liked_limit` and
`kept_offline` (the board's place in the list), and `utils/like_limit.js` picks the message: plain under the
limit; "you have reached the limit of 50" on the like that reaches it; a warning "not kept on this device" past
it. 14 exact-shape assertions in `spec/controllers/api/boards_controller_spec.rb` gained the three keys (a
response-shape change Traci asked for); the second like in the shallow-clone tests counts 1, because the first
like's list update is still queued there. Tests: the spec's "should say a like past the limit is not kept
offline"; `tests/unit/models/board-like-offline-test.js` (3 new).

**Withdrawn the same day (Traci, 2026-11-10): the 4-second limit.** Asked whether Scot wanted it, the answer
was that he designed it (2026-11-03) and then approved its removal (2026-11-05). Traci chose not to regress what
he approved. Commit `efd023286` (the limit plus the error branch) was pushed; the follow-up commit removes the
limit and keeps the error branch (5xx or 429 answers the saved page), restores the "never after a wait" spec with
the error branch added, restores the lifecycle "slow page waits" case, and turns the hang e2e case into one that
pins the known limit (no answer and no cached page within 10 s). Scot's PR comment got a follow-up saying so.

## 11. Item 9A, #1206: the backup SQLite shim passes the iOS column-list row through (Traci, 2026-11-10: "fix item 9")

**(a) Where the value is read.** CONFIRMED: `toResultSet(values)` in `app/frontend/app/utils/capacitor_sqlite_shim.js:25-34`
exposes every element of `values` as a row. It is reached from `runSql` for SELECT and PRAGMA (`:98-106`,
`p.query(...).then(res => toResultSet(res.values))`), on both the `executeSql` path (`:124-136`) and the
`transaction` path (`:137-196`, through `runSql`). dbman reads results through `rows.length` / `rows.item(i)`.
**(b) Shapes.** CONFIRMED in the shell's tests and the plugin source cited by #1206: on iOS the raw plugin's
`query` answers `[{ios_columns: [...]}, row, row...]` for a non-empty result; on Android `[row, row...]`; an empty
result `[]`; `values` can be missing or not an array (the shim already guards with `Array.isArray`). A real column
aliased `ios_columns` holds a string, not an array.
**(c) Cross-repo claim.** CONFIRMED: the shell's bridge (`~/lingolinq_mobile/www/sqlite_bridge.js:28-37`, commit
`cc94c74`) drops row 0 when `Array.isArray(rows[0].ios_columns)`, with tests in `test/sqlite_bridge.test.js`.
The shim installs only when `window.sqlitePlugin` is absent (`:197-199`), so it is dormant in the shipped app.
**Fix.** The same check, copied into `toResultSet`. The shared implementation the issue suggests cannot be one
module: the two copies live in different repositories (the shell is a plain browser script, the shim an Ember
module). The port is kept line-for-line so a diff shows drift. Alternative rejected: deleting the backup shim
(then a monorepo-only package would have no SQLite on iOS).
**Review outcome (adversary agent, 2026-11-10): ship with conditions, applied.** The shell got a second fix after
`cc94c74`: `9a9789b` accepts the short `executeSql(sql, success, error)` form the sync uses
(`services/persistence.js`) and adds `abortAllPendingTransactions`; without both, a live shim would fail every
sync (the plugin rejects a function as `values`, and the abort call throws). Both ported with the shell's three
tests. Corrections: four iOS-shaped cases are red before the fix (the PRAGMA case too); the shell has twelve cases
at its head; the shim's lines were `:94-103`, `:123-134`, `:135-192` before this change. "Risk: none" was wrong
for the reason above; with the second port the shim matches the shell's head. **Tests:**
`tests/unit/utils/capacitor-sqlite-shim-test.js` (13 cases through the shim's Cordova-shaped API with a fake
native plugin). Mutation: drop the `Array.isArray` qualifier (the "real column named ios_columns" case fails).

## 12. Item 9B and 9D: "needs a connection" while online, and the 8 + 8 second wait (Traci, 2026-11-10)

**9B facts (CONFIRMED).** The trial bar's Use (`app/frontend/app/components/trial-bar.js:95-98`) and the languages
modal's Translate (`app/frontend/app/components/switch-languages.js:129-132`) show "needs an Internet connection"
whenever a device copy is on screen, without reading `online`. The board page's other actions go through
`_blocked_on_device_copy` (`app/frontend/app/controllers/user/board-detail.js:10463-10473`), which offline says
"needs a connection" and online says "Getting the latest version" and fetches the board (`_refresh_device_copy`).
The trial bar is given `@deviceCopy` (`app/frontend/app/templates/user/board-detail.hbs:626`); the modal is opened
with `{board, device_copy}` (`board-detail.js:9869`). Basic view passes neither. **Change:** the page also hands
each its gate (`@onDeviceCopy` on the bar; `refresh_device_copy` in the modal's options); each calls it when
present and keeps its own message otherwise (Basic view, older callers). Nothing about what the gate does
changes; #1301 will decide whether Use and Translate should go further than "fetch and try again".

**9D facts (CONFIRMED).** On a cold board launch with a hung network, `routes/user.js` tries the owner lookup once
with `owner_wait_ms` 8 s (`:119-124`) and then falls back to the device; the board route then tries the server
once with `device_copy_wait` 8 s (`routes/user/board-detail.js:652`, `_one_try` `:678-680`) before the copy opens:
16 s in all. Both limits are pinned by tests (`board-detail-device-copy-test.js` "the waits are the ones the
design promises"; `user-board-owner-test.js:165`). **Change:** when the owner lookup's bounded try gets no answer
(`no_server_answer`), the user route notes the time on app state (`device_copy_server_silent_at`); `_one_try` asks
`remaining_wait(note, now)` (`utils/board_device_copy.js`): the full 8 s with no note, otherwise what is left of
it, never under 3 s, and a note older than 20 s is ignored. Worst case 8 + 3 = 11 s. A server refusal inside the
shorter window still wins (unchanged path). Alternatives: share one deadline object between routes (more
coupling); drop the board route's try entirely after a silent owner lookup (loses a server refusal that would
have arrived in 3 s). **Risks:** a server that answers the board request between 3 and 8 s after a silent owner
lookup now gets the device copy on that launch; the copy shows the notice and Edit refreshes. **Tests:** red first:
`tests/unit/utils/board-device-copy-wait-test.js` (5), the `_one_try` case in `board-detail-device-copy-test.js`,
two user-route cases, and three 9B cases. Mutations: ignore the note (the `_one_try` case fails); no floor (the
floor case fails); never note (the user-route case fails).

**Review outcome (adversary agent, 2026-11-10): 9B ship with conditions, 9D stop; both reworked, applied.**
- 9D: the note was going to be the FAILURE time, which on a real hang leaves nearly the full 8 s again (the test
  server rejected at once, so the tests could not tell). Now the START of the bounded try is noted, and the test
  server stays silent for a while and asserts the note is no later than the time the request was sent. The note
  is cleared by any server answer (owner found, or a refusal), read once by the first board request, and cleared
  at sign-out (`clear_user_state`). A board with no device copy gets the shorter first try too; its patient
  retry is unchanged, so this is the same shape as today, five seconds sooner. Accepted.
- 9B: the gate is a bound function on the controller (`device_copy_gate`), not an action: `ctrlAction` drops
  return values. Added: a test of what the controller hands over, and a test that a gate answering false lets
  Translate open. Not done, recorded as a limit: Use refreshes the page's board, not the tried root board, so a
  tried board already in memory as a device copy could still be adopted stale from a folder; that is the
  pre-existing path for fresh folders too, and belongs to #1301 ("Use this board" on device copies).

## 13. Item 9C: the 5-minute memory cache on a shared device (Traci, 2026-11-10)

**Facts (CONFIRMED).** Modern view keeps a board's JSON in memory for 5 minutes (`utils/board_detail_cache.js:27`,
`TTL_MS`) and, on a hit, serves it with no server round trip (`routes/user/board-detail.js:126-162`). The only
gate on that hit is `cached_unless_revoked` (`:635-640`), which does nothing while online
(`utils/board_revocation.js:641-643`, `blocks_view_route`). So, while online, two things the server would refuse
are still shown from memory for up to 5 minutes: a board the sync has just marked revoked
(`apply_revocations`, `:356-397`, writes the mark to the stored copy and the index, and touches no memory copy),
and any board once the session is dead (the token check sets `session.invalid_token`, `services/session.js:294-297`;
the memory cache is cleared only at SPA sign-out, `services/app-state.js:2254`, or by a page reload). "Another
user's board" is not reachable: sign-out clears the cache (corrected 2026-11-11, final review pass 2: a tree warm
still in flight at sign-out could write its pages back after the clear; a cache generation now drops them). The remaining window is also bounded by whatever
navigation misses the cache next.
**Change, two small pieces.** (1) `apply_revocations` tells listeners which ids it marked (`on_marked`,
`notify_marked`); the memory cache registers a listener the first time it stores anything (at call time, not at
module load: `board_detail_cache` imports `utils/persistence`, which imports `board_revocation`, so a load-time
registration could run before `board_revocation` has evaluated) and drops those boards by id and key. (2) The
route's cache-hit branch also requires `!session.invalid_token`; a known-dead session asks the server, which
answers for the dead session as it does on a miss. **Not changed:** the TTL, and the token-check cadence (a
server-side session end is still noticed only at the next check, on the cached and the network path alike; a
background token check per cache hit would add a request to every folder tap).
**Alternatives rejected:** importing the cache into `board_revocation` (import cycle through `utils/persistence`);
checking `is_revoked` on every online hit (a database read per folder tap, and the index is not in memory).
**Risks:** a listener registered once per page lifetime; `notify_marked` runs on the sync's completion path and
must never throw (listeners are called in a try). **Tests:** red first: `board-detail-device-copy-test.js`
"a memory hit is not served once the session is known to be dead"; `board-revocation-test.js` (listeners hear the
marked ids); `board-detail-cache-revoked-test.js` (dropped by id and key, the other board stays, registered on
first store). Mutations: drop the `invalid_token` condition; notify before the marks are written (the ids still
arrive, so pin the order with the record check already in the revocation test); forget to register.

**Review outcome (adversary agent, 2026-11-10): stop; reworked, applied.** (1) Modern's board page is always in
Speak Mode, where `apply_revocations` holds marks back (`:381-385`), so "notify the ids it marked" would have sent
nothing in the main case; the notice now goes out at the top of `apply_revocations` with the server's full
revoked list, before the Speak Mode check and the device-row walk, which also reaches boards held only in memory
(never synced). (2) In Speak Mode a board request that answers 400 with `invalid_token` sets only the route's
`_dead_token` (`:773-781`), not `session.invalid_token`; the gate reads both (`_session_known_dead`). (3) The route
test is now the shared-device case with the dead 400 (a trusted device keeps the copy by the existing policy,
`:779`), and also covers the route-only dead token. (4) The cache registers by asking `has_marked_listener`,
`reset_for_tests` leaves listeners alone, `unsubscribe` runs in `finally`, and a listener that throws is caught.
Still open, said plainly: a server-side session end is noticed only at the next token check, on the cached and
the network path alike; a trusted device keeps the device copy on a dead session by design.

**Code-level review of the item 9 commits (adversary agent, 2026-11-11; no Critical or High; applied).** (1) The
dead-session gate now exempts trusted devices, which keep their copies on a dead session by the existing policy;
without the exemption a trusted iPad made two failing requests per tap before showing the same copy. Test added.
(2) The wait note is also cleared when the patient owner retry (no owner on the device) succeeds. Test added.
(3) The memory cache unregisters its listener in `clear()` and registers again on the next store, so a test's
cleanup drops it and a background `settle` from an earlier test cannot reach a later test's cache. (4) `_one_try`
takes the smaller of the route's wait and the remaining wait, so an overridden wait is honoured and the dead
branch is gone. Limits added to the status doc: Basic view's own memory path is not gated; the revoked list
covers the synced tree only. Style point accepted as a point: statements joined to existing lines keep the
line-anchored lint baseline still; it is the repo's own pattern, not line compression of old code.



## 14. Item 8: the board count during a sync (Traci, 2026-11-11: "build it")

Facts (CONFIRMED): Basic view showed "Syncing... 12 / 40 boards" in three places (`components/sync-details.hbs:44-52`,
`components/dashboard/classic-view.hbs:403-409`, `classic-rail.hbs:558-562`) from `sync_progress.visited` and
`.total`; `total` is `to_visit + visited` summed over every synced user (`services/persistence.js:1972-1988`), so
it grows as linked boards are found and can shrink. Modern view showed nothing while syncing
(`authenticated-view.hbs` has only the sync-failed notice). `sync_progress.errored` counts boards that ended with
an error. Decisions taken (Traci answered "ok / yes" to the shape on 2026-11-09; the small questions are settled
here as follows): "saved" (visited minus errored), supervisees' boards included (the sync syncs them), boards kept
from an earlier sync count as saved (they are on the device), and the problem count is shown when it is not zero.
Change: one function, `utils/sync_progress.js#sync_progress_line`, used by the three Basic places and by a new
Modern notice ("Syncing your boards for offline use. Saved so far: 12 boards", with a Sync Details button). No
flag: a rewording of a shipped line and a notice that mirrors the existing sync-failed one. Tests:
`tests/unit/utils/sync-progress-line-test.js`, `tests/unit/components/dashboard-syncing-notice-test.js`.
\n
Found while building, not fixed here: `i18n.t` in JS applies a `count` to a "a || b || %{n} c" string through
`String#sub` (`utils/i18n.js`, the `count` branch), which is the legacy HTML wrapper, not a replacement, so the
number is never substituted ("<sub> 1 board </sub>"). The template `t` helper takes another path and works. The
progress line uses two plain keys instead. Worth its own small fix with a test; any JS caller passing `count`
for a "||" string is affected.

**Code-level review of the item 8 commit (adversary agent, 2026-11-11; ship with conditions, applied).** (1) `errored`
also counts boards the sync could not fetch at all (deleted or unreachable links, `services/persistence.js:3378`,
`:3380`), which were never visited, so "visited minus errored" undercounted; the count is now `visited` (the
board's record is on the device; pictures may still be arriving) and the problems are reported beside it, as two
sentences. The §14 line "errored counts boards that ended with an error" was wrong. Test added through the
service's own `update_sync_progress`. (2) The Modern notice's live region is now only the fixed sentence, so a
screen reader does not re-read the count every few seconds; the count sits beside it, outside the region.
Reserving the notice's space so the grid does not move is Traci's UI call, not done. (3) Tests added for the
external-device and other-user-database gates. (4) Correction to the i18n note: the template `t` helper calls the
same `i18n.t`; English works only because `en.json` is never loaded and the code's one-word defaults are used; in
any other language a JS `count` call on a "||" string hits `String#sub` (for example
`controllers/offline_boards.js:46`). Older than this PR; its own fix.

## 15. Item 8, second form: the sync as an app-wide drawer, like a board copy (Traci, 2026-11-11)

Traci's direction after seeing the Modern home notice: "when the syncing starts, show a message in the bottom
right that shows no matter what page the user goes to (unless it's in speak mode on board-alt or board-detail,
then hide it), but reshow it if the user navigates away from speak mode. Then, a syncing notification (like when
the copying boards is completed), again unless the user is in speak mode on either board-detail or board-alt."
Facts (CONFIRMED): the board-copy drawer is `components/copy-progress-drawer` (bottom right, `styles` class
`.ll-copy-drawer`), mounted once from `templates/application.hbs:5` so it survives route changes, driven by
`services/copy-progress.js` (status, message, dismiss); its result card waits to be dismissed. The sync runs in
the persistence service and reports through `sync_status` ('syncing', then 'succeeded' | 'finished' | 'failed';
`sync_errors` and `sync_status_error` carry the detail). Speak Mode is `appState.speak_mode`; the board pages are
the `user.board-detail`, `user.board-alt` and `board` routes. Built: `services/sync-notice.js` follows
`sync_status` (an observer, removed on destroy; a sync of another user's open database is ignored, as the failed
notice does); `components/sync-progress-drawer` reuses the copy drawer's classes and slot, hides while
`speak_mode` is on and the route is a board page, yields to a running copy, and offers Sync Details and Dismiss;
a clean success dismisses itself after 8 s (automatic syncs succeed many times a day), problems and failures
wait. The Modern home notice from §14 is removed. Tests: `tests/unit/services/sync-notice-test.js`,
`tests/unit/components/sync-progress-drawer-test.js`. Mutations: ignore Speak Mode (the hidden test fails); never
turn the drawer into a card (the result tests fail).


**Code-level adversarial review of `986559581` (2026-11-11): ship with conditions, both applied.** Medium 1,
confirmed at `services/persistence.js:2400` then `:2404` and `:2442` then `:2455-2459` (also
`utils/storage_failures.js:33-35`): the sync writes its status first and the detail after it, and the observer
runs inside the first write, so the card copied the previous sync's count and reason; `message` and `detail`
are now computed from the live fields. Medium 2, confirmed at `:4900`: a cancelled sync ends as failed and got a
"Sync failed" card; `root_sync_canceled` now means nothing to report, as on the Modern home page. Low 1,
confirmed: the service has no `clear_user_state`, so after an SPA sign-out a waiting card stayed on the login
page with the previous person's Sync Details; `appState.clear_user_state` dismisses it. Three tests in the
real write order plus one in `app-state-clear-handoffs-test.js`; each red before its fix. Low 2 (a live
region that arrives already filled may not be announced), not applied: the previous review asked for the
live region to cover only the sentence, and the two branches never show together; a screen-reader check is on
the list for the accessibility pass. Also noted: `session.js:898` calls a `persistence.clear_user_state` that
the service does not define (guarded by `typeof`, so a silent skip); not this PR's defect.

## 16. The starter board is Vocal Flair 60 everywhere, and sign-up likes it (Traci, 2026-11-11)

Decision: "pick a board for me", Quick Assign and the start-talking welcome all use Vocal Flair 60, and a new
account likes its Vocal Flair 60 so the offline sync keeps it; the person can unlike it later.

**Facts.** (a) READ: the home-board pick reads 'Vocal Flair 84' in `utils/assign-vocal-flair-home.js:81` (regex
`:16`) for Quick Assign (`controllers/board-picker.js:259`, `controllers/setup.js:1023`,
`components/tour-board-picker.js:115`) and defaults to 84 in `utils/recommended_home_board.js:82` for "pick for
me" (`controllers/board-picker.js:255`); the welcome card reads `STARTER_BOARD_KEY = 'lingolinq/vocal-flair-60'`
(`utils/tours/start_talking.js:23`); the eval report passes its measured grid size (`eval-page-set-card.js:95`),
not a default. The offline sync reads `user.stats.starred_board_refs` (`utils/offline_sync_seeds.js:52`) from
`User#starred_board_refs` (`app/models/user.rb:2469`) from `settings['starred_board_ids']`, written by
`User#remember_starred_board!` (`:2449`), which `Board#star` schedules (`app/models/board.rb:206`). Sign-up
provisioning is `UserBoardProvisioner.provision_for` from `api/users_controller.rb:287` and
`session_controller.rb:1008` (the two sign-up routes). (b) SHAPES: provisioning is off (flag,
`user_board_provisioner.rb:7`: sidebar only), Spanish (`SPANISH_LIBRARY_SLUGS`), or the async list
`SIGNUP_ASYNC_SLUGS` (VF84 first "so home-board pickers see it soon"), each a `Progress.schedule(user,
:copy_board_to_library, {'id'}, source_id, nil, for_user:)` job. `copy_board_to_library` returns false (no
original or updater), true with an existing copy (retried), or true after `copy_for` plus `copy_board_links`;
the copy is `user.boards.where(parent_board: original).order('id DESC').first` (`user.rb:3914`). (c) CROSS-FILE:
`findExistingUserCopy` expects the copy at `user_name/<slug>` (`utils/board-copy.js:30-34`); `copy_for` keys
the copy that way (checked below). The like list keeps the first 50 (`LIKED_BOARD_REFS_LIMIT`); a liked board
that is also the home board is one seed (`offline_sync_seeds.js:38`). The sidebar written at sign-up carries the
public VF84 (`User.signup_sidebar_boards`, `user.rb:4371`), a separate feature, not changed here.

**Proposal.** Frontend: one `utils/starter_board.js` (`STARTER_BOARD_SLUG`, `STARTER_BOARD_KEY`,
`STARTER_BOARD_BUTTONS = 60`); `assign-vocal-flair-home.js` becomes `assignStarterBoardAsHome`, querying and
matching the starter; `recommended_home_board.js` defaults to `STARTER_BOARD_BUTTONS`; `start_talking.js` reads
the shared constant; the Quick Assign label says 60 (en plus the number in the other locales). Backend:
`SystemBoardSources::STARTER_BOARD_SLUG` (and the Spanish `vocal-flair-60-es`), `SIGNUP_ASYNC_SLUGS` puts the
starter first (the picker's reuse window), and the provisioner schedules `User#provision_starter_board!` for
the starter slug: `copy_board_to_library`, then find the copy and `star!(self, true)` plus
`remember_starred_board!` inline (the job `Board#star` schedules repeats it, idempotently). Alternatives
rejected: liking the public `lingolinq/vocal-flair-60` in the request (a write on one hot public row per
sign-up, a stars count that counts sign-ups, and two trees synced once the copy becomes home); a frontend like
after registration (misses SSO and API sign-ups). Risks: the like and the copy must be one job (two jobs on
parallel workers can run out of order), hence the method; flag off means no copy and no like; the 50-like
limit (the starter is like one); the spec that pins VF84 first in the async order is rewritten for the new
order (a specification change under Traci's decision, named in the PR). Open: whether the sign-up sidebar's
VF84 entry should also become 60 (Traci). Tests: provisioner spec (starter first, the new method, both paths),
`User#provision_starter_board!` (copy liked and listed; retry idempotent; missing original a no-op), frontend
(assign util queries and picks the starter; "pick for me" default is 60). Mutations: default back to 84; drop
the `star!`.

**Review (2026-11-11): build with changes, all applied.** High, confirmed at `app/models/progress.rb:233` and
`user.rb:2240-2246`: the job's user row is loaded when the job starts, so an inline `remember_starred_board!`
after a seconds-long copy would write the whole settings column over a home board chosen meanwhile; the method
saves nothing on `self` (`Board#star!` schedules the list update, which loads the user fresh), and a spec pins
that. Medium: a copy the welcome card makes can race the job; the like prefers the home board when it is a copy
of the starter (read from a fresh row), else the newest copy. Medium: Spanish sign-ups (flag-gated) like
`vocal-flair-60-es` while the pick stays English, as it is today; recorded below as a follow-up rather than
widened. Low: Quick Assign looks the starter up by its exact key first and keeps the name search as the
dev-seed fallback. Comment and locale sweep done (13 locale files, the number only). Traci also decided the
sign-up sidebar's library entry becomes Vocal Flair 60 (it resolves to the same copy, `User.resolve_sidebar_boards_for`).
Spec rewrites approved by Traci: the provisioner order example and the sidebar examples that pinned 84. Tests:
`spec/models/user_starter_board_spec.rb` (5), the provisioner spec, `tests/unit/utils/starter-board-assign-test.js`
(3), one in `recommended-home-board-test.js`. Mutations: no like (3 red), ignore the home copy (1 red), default
84 (red before the build). Follow-ups: the Spanish pick (`STARTER_BOARD_KEY` is English); with `shallow_clones`
on, a liked own copy's `my:` key is not matched by the home seed (two seeds of one tree, beta flag); jobs queued
under `provision_starter_board!` fail on a rollback to older code (no copy for those sign-ups).

**Code-level review of `fe22582ea` (2026-11-11): stop, then ship with conditions; applied.** High, confirmed
at `user.rb:4333` and `lib/user_board_provisioner.rb:37`: the sign-up sidebar chose the Spanish starter by
locale alone while the Spanish copy jobs are gated on `signup_spanish_library_boards_enabled?` (a flag, off by
default), and `lingolinq/vocal-flair-60-es` is not on staging or production (the reviewer's public GET); a
stored entry for a missing board stays stored and is seeded into every sync. The sidebar now uses the copy
jobs' gate; specs for both flag states; mutation (locale alone) red. Medium: workers still on older code during
a deploy fail the new job without retry (`progress.rb:243-246`, NoMethodError), so sign-ups in that window get
no starter copy and no like (dev web shares the staging worker pool; prod replaces workers last): named in the
PR, no code change. Low: Quick Assign fell back to the name search on every failure (offline, 5xx), whose
loosest match is any public board; it now searches only when the key is not found (`is_not_found`), with
tests for found, not found and other failures; mutation (always search) red. Low, not applied: the like job's
`remember_starred_board!` is a plain `save_with_sync` (the existing like path, milliseconds wide). The no-save
spec now also catches `save!`. Installed mobile builds carry the old Quick Assign (Vocal Flair 84) until
their next app store release while sign-up likes 60: two sets would sync for a user who takes Quick Assign on
an old app build.

**Worker rollover fixed in code (Traci, 2026-11-11).** `provision_starter_board!` is gone: the like rides on the
copy job that workers on older code already run, as `'like_copy' => true` in the board argument of
`User#copy_board_to_library` (`User#like_library_copy!` does the like, home copy preferred, no save of the
job's row). An old worker ignores the key and copies the starter as before this PR; a new worker copies and
likes; nothing unknown to old code is scheduled, and there is no second job to order. Residual: sign-ups whose
starter job ran on an old worker during the rollover have the copy but not the like. Resque here has no
delayed jobs, which ruled out a separate like job that waits for the copy. Specs rewritten for the flag
(`spec/models/user_starter_board_spec.rb`, 6, one for "no flag, no like"); mutations: no like on the new-copy path (the
like spec red), no like on the existing-copy path (the home-copy spec red). The Spanish
pick mismatch is follow-up issue #1303.

## 17. Final review round, pass 1: `/review-pr` (2026-11-11)

`REVIEWED=PR lingolinq/LingoLinq-AAC#1268 at e484fd0a67f76669e9e857a286e6b5ef0b086069`, PII preflight exit 0 (guard
PASS, no data-bearing paths). The diff (162 files) was split into five slices reviewed in parallel, each reviewer
reading only its slice of the preflight's diff file. Verdicts: backend approve with comments, frontend core request
changes (two Highs to verify), frontend UI request changes (one confirmed High), tests approve with comments, docs
approve with comments. No Critical.

Verified and fixed: the tabs selector list in `app.scss` split by an inserted block (High, confirmed: board picker
tabs lost their rules); a replaced sub-board dropped when the byte budget stopped a page before it (now looked up
through the requested id, `Board.sub_board_replacements`, and sent in that id's position; a board listed twice is
sent once per page; specs); a storage failure in a root sync for someone else published "Sync failed" as the
signed-in person's result (the helper takes the #1230 gate); a database setup answering after the watchdog gave up
connected a database reported as unavailable (settled once); device-copy pictures (data URIs) left in memory after
an SPA sign-out (cleared in `clear_user_state`); the board cache unbounded (at most 400 entries, expired and oldest
first); the shell watchers not ended with their app instance (`registerDestructor`); the drawer's duplicate
app-state injection; status-doc contradictions. Each code fix has a test that a mutation turned red.

Verified as not defects: `schedule_sync_board_step` is defined (`services/persistence.js:79`); `store()` counts failed
writes on the service instance (`root = this`, `:707`); the imports in `trial-bar.js` and `switch-languages.js`
exist; the Modern opener passes `device_copy`/`refresh_device_copy` to Switch Languages; `la-sync-details-muted-block`
exists; the reconnect sync goes through `sync()`, whose base guards a running sync; the device idle-timeout change is
Scot's reviewed round-2 decision (a trusted device's own limit applies to keys issued before trust; a shared or valet
device keeps the organization's timeout). Not changed, noted: approval records for the test rewrites and the
`.eslint-todo` re-anchoring are in the task logs and PR body of the sessions that made them; fixed sleeps and
assignment-style stubs in older test files of this PR are left as they pass the leak check; the e2e order dependence
is local-only; `:has()` on iOS below 15.4; the Spanish starter's sidebar name (#1303).

## 18. Final review round, pass 2: `/adversary-review` (2026-11-11), and the fixes for its Mediums

`REVIEWED=PR lingolinq/LingoLinq-AAC#1268 at b15f3482aa96c00df7e89866101612648d99e8b6`, preflight exit 0. Three
red-team agents (sessions and infra; another person's data; sync integrity), each reading only the preflight diff. No
Critical or High. Fixed already (`de9d4c75e`): a tree page or a device-copy picture that arrived after sign-out was
written into the next session (a cache generation, bumped by `clear()`, and the `copy_image_urls` array identity).
Traci, 2026-11-11: fix the real ones, each through a reviewed proposal, so the full review need not run again.

**P1. A trust change only from the person's own explicit answer.** Fact: `User#process_device` (`app/models/user.rb:3856`)
writes `long_token` from any user save carrying `preferences.device.long_token`; for a supervisor saving device
settings `users_controller#update` picks the communicator's most recent device (`api/users_controller.rb`, the
"Supervisor editing another user" branch), and an offline replay of a stored user record carries the old value. Since
this PR a trusted browser device's keys drop the organization's idle timeout (`app/models/device.rb:296-302`), so either
writer can turn a Shared iPad's 20-minute session into 28 days. Proposal: `process_device` changes `long_token` only
when the value differs from the device's and (a) the updater is the user and no one acts for them (`operator` absent),
(b) the device written is the request's own device (`options['device']` came from `@api_device_id` for the user
themself), and (c) the payload carries `long_token_chosen_at` within 10 minutes of the server clock. The client sets
that stamp in exactly two places: the Trust/Shared answer (`components/login-form.js:1034`) and a Preferences save in
which the checkbox changed. An unchanged value is written as before (`long_token_set`). Not chosen: stamping the device
on an explicit answer and lifting only for keys issued before the stamp (still lets a supervisor save set the flag the
lift reads elsewhere, `offline_shell` and `board_device_copy` read it too). Lost capability: a supervisor can no longer
set a communicator's device trust from their own account; the PR's workaround for #1285 already says to change it on
the iPad. Tests: own explicit answer changes it; a supervisor save, an act-as save, a stale stamp, a missing stamp and a
save from another device do not; an unchanged value still sets `long_token_set`. Mutation: drop each guard.

**P2. The "ready" card waits for every root sync.** Fact: a root sync requested while one runs is not refused
(`services/persistence.js` sync: `sync_progress` is kept, a second pass runs with its own seeds, so a home board chosen
mid-sync is saved by it); but the first pass's 'succeeded' turns the drawer into "Your boards are synced and ready for
offline use." while the second is still saving, and the second's own 'succeeded' is the same value, so no observer
fires. Proposal: the service's root `sync()` counts running root syncs in an observable `root_syncs_running`
(incremented at the call, decremented when the promise settles); `services/sync-notice.js` keeps the drawer in
'syncing' while a settled status arrives with another root sync still running, and shows the result when the count
reaches 0, reading the then-current status. Tests: two overlapping syncs, the first succeeding, shows no card until the
second settles, then its result; one sync unchanged; a failure of the last one shows failed. Mutation: ignore the
count. Liking during a sync starts no sync (as before); the like copy does not claim it is saved.

**P3. Small, from the same pass.** (a) The finished card's count is every sync error (pictures included), not boards:
"Boards synced. %{n} had a problem." becomes "Boards synced, with %{n} problems. Sync Details has the list." (b) SQLite
write errors never set `quota`, so the installed apps say "try again" when the disk is full: `dbman` sets `quota` when
the message matches `SQLITE_FULL`, "database or disk is full" or "disk full". (c) The offline-scope strings say every
liked board is kept: they say "up to 50 liked boards" (from `LIKED_BOARD_REFS_LIMIT`). Not fixed here: the row-queue
watchdog that frees a hung row without answering its caller predates this PR (an issue); #1285's rescoping (every
Home Screen sign-in while the shell is off) is Scot's decision on that issue.

**P1 revised (Traci, 2026-11-11: "don't remove something a supervisor can do today").** Every writer keeps setting
`long_token` as it does today, the supervisor save included. What changes is what the organization-timeout lift reads:
`process_device` records `long_token_owner_choice = true` only when the change comes with all of (a) the updater is the
user, no operator, (b) the request's own device, (c) a fresh `long_token_chosen_at` stamp; any other write of
`long_token` sets it false. `Device#keys` lifts the organization's idle timeout (`device.rb:296-302`) only for a
trusted browser device whose `long_token_owner_choice` is true. A supervisor-set or replayed trust behaves as trust
did before this PR: the key's organization timeout still wins. Tests: own explicit answer lifts it; a supervisor save
sets the flag but does not lift; a stale or missing stamp does not lift; an unchanged value leaves the record as it is.

**Review of P1 to P3 (2026-11-11).** P1 revised: build with changes, applied (two-sided 10-minute window, the
stamp stripped before it is stored, Shared records false, the device must belong to the person); built in
`5d5f14234` with the device_spec lift examples updated for the changed specification (Traci). P3: build with
changes, applied (two keys for the singular, only the write path flags "database or disk is full", the limit from
one constant guarded by a spec against `LIKED_BOARD_REFS_LIMIT`); built in the commit after it. P2: stop. Its premise
was wrong: a root sync requested while one runs is not run at all. It gets a new sync id, `check_first`
(`services/persistence.js:2061`) skips every step, and its promise never settles; nothing saves a home board chosen
mid-sync (pre-existing on develop). In this PR the absorbed call also sets `_active_root_sync_id` (#1230,
`e842c958b`), so a cancel afterwards leaves `sync_status` at 'syncing' and automatic sync stops until a reload or a
manual Sync (on develop it ended 'failed').

**P2 redesigned: a sync requested while one runs queues one follow-up.** The service's root `sync()` (the wrapper,
`services/persistence.js` ~4880) keeps the running root sync's promise. A root sync requested while it runs does not
call the base sync (so it never sets `_active_root_sync_id` or `sync_status`): it records one pending follow-up
(later requests coalesce into it, keeping the latest reason) and returns a promise that settles with the follow-up's
result. When the running sync settles, the wrapper starts the follow-up, unless the running sync was cancelled (the
person stopped syncing; the follow-up's promise rejects as cancelled) or the app is gone. The drawer
(`services/sync-notice.js`) keeps 'syncing' when a settled status arrives while a follow-up is pending, so "ready"
appears only after the follow-up. Supervisee syncs (`ignore_supervisees`) pass through untouched. Tests: a home board
chosen mid-sync gets a follow-up sync whose seeds include it; two mid-sync requests make one follow-up; cancel then a
mid-sync request leaves the status not 'syncing' and starts nothing; the drawer shows no "ready" until the follow-up
ends; the absorbed promise settles. Mutations: no follow-up; follow-up after cancel; drawer ignores the pending flag.

**Review of P2 redesigned (2026-11-11): build with changes (one High, five Medium), not built here.** The follow-up
queue touches the core of the sync (cancel timing, a sync started before extras are ready, one follow-up per user with
`force` and the manual reason kept, automatic reasons never queuing, the drawer flag). What this PR itself broke is
narrower and is fixed: a root sync requested while another runs took over `_active_root_sync_id`, so cancelling the
running sync left `sync_status` at 'syncing' (drawer pinned, automatic sync stopped). The absorbed request no longer
takes the id (`services/persistence.js`, the sync_id line); test "should not leave the status at syncing when a sync
requested mid-sync is followed by a cancel" (`tests/utils/persistence-sync-test.js`), red before the fix. Unchanged and
as on develop: a request made while a sync runs does nothing and its promise does not settle, so a home board chosen
mid-sync is saved at the next sync (the sync stamp bump makes the next stamp check pick it up), while the running sync's
card can still say "ready". The follow-up queue, with the review's seven conditions, is its own change.

## 19. The follow-up queue, built (2026-11-11; Traci: on the #1268 branch itself)

Handoff: `NEXT-SESSION-sync-follow-up-queue.md` (the seven conditions of section 18's review). Lines re-read at
`f661e7e1c`.

**Fact sheet.**

(a) Where the decision is read.
- CONFIRMED `services/persistence.js:2040`: the base marks a root request `absorbed` when `sync_progress.sync_id`
  is another sync's, and `check_first` (`:2062-2064`) then skips every step. `sync_resolve` is reached only inside
  the skipped callbacks (`:2192`, `:2350`), so the absorbed promise never settles.
- CONFIRMED `:2042`: `sync_status` is set to 'syncing' synchronously in the call, for the signed-in user only.
- CONFIRMED `:1998-2007`: before extras are ready the base returns a waiting promise and later calls
  `_this_sync.sync` (the wrapper again); `sync_progress` is not touched on that path (it is first set at `:2051`).
- CONFIRMED `:4880-4901`: the wrapper writes `_root_sync_reason` (`:4882`) before calling the base.
- CONFIRMED `services/sync-notice.js:49,63-88`: the drawer reads only `sync_status`, synchronously.

(b) Every shape of "a sync is running".
- `sync_progress` null: no sync. Writers: the success branch `:2397`, the failure branch `:2438`, the wrapper's
  cancel handler `:4895`, sign-out `utils/persistence.js:1978` (`clear_user_state`, which does NOT settle the running
  sync: its `check_first` skips from then on and its promise never settles), test cleanup.
- `sync_progress` with this sync's id; with `canceled: true` (cancel, `:1992`; sign-out `:1975`).
- A wrapper-tracked promise whose `sync_progress` was cleared without a settle (sign-out). A "running" flag cleared
  only on settle would stay set forever here and queue every later sync of the next session: so "running" must be
  "the tracked id is still `sync_progress.sync_id`".

(c) Cross-file claims.
- CONFIRMED `utils/persistence.js:4569-4600`: the utils copy forwards `sync` to the service (Proxy, bound).
- CONFIRMED callers that use the sync promise: `utils/home_board.js:78` (both outcomes resolve true);
  `components/push-to-cloud.js:72` has no rejection handler (as today for a sync that fails).
- CONFIRMED `force` values: `true` (sync-details), `'all_reload'` (`controllers/user/index.js:1454`), read as stronger
  at `:3127`.
- CONFIRMED automatic reasons are exactly `long_time_since_sync:` and `sync_stamp_changed:` (`:4914`), started at
  `:3974`, `:3996`, `:4867` (and the utils copies, which forward).

**Proposal (candidate A, recommended).** A second `persistence.reopen` at the end of `services/persistence.js` (no
baseline rows move) wraps the existing wrapper:
1. Supervisee calls pass through. If a tracked root sync is live (`_running_root_sync.id === sync_progress.sync_id`),
   the request does not reach the existing wrapper (so `_root_sync_reason` is untouched): an automatic reason returns
   the running sync's promise; anything else joins the one pending entry for its `user_id` (`force`: 'all_reload' >
   true > falsy; latest reason) and gets a promise settled by that entry's follow-up.
2. Otherwise it calls the existing wrapper and tracks the call only if the base passed readiness, observed as
   `sync_progress.sync_id === _this_call_sync_id` after the call (condition 3: the not-ready outer call is not
   tracked; its inner call is).
3. When the tracked promise settles (either way) it clears the tracking and, if the service is alive, starts the
   first pending entry: if offline, every pending entry is dropped and its callers reject `{error: "not online"}`
   (condition 6). The next sync is started BEFORE the drawer flag is recomputed, so `sync_status` is already
   'syncing' when the hold lifts (no flash of the result card). Remaining entries wait for that one.
4. `cancel_sync` drops every pending entry at once (callers reject `{error: "canceled"}`) and recomputes the flag
   synchronously; a request made after the cancel queues normally and runs (condition 1). Because drops happen at
   cancel time, the settle handler starts whatever is pending whether the cancelled sync resolved or rejected
   (condition 2's purpose; test with a resolving cancel).
5. `follow_up_sync_pending` is true only while an entry is for the signed-in user (`sync_status_is_for_signed_in_user`,
   condition 4). The drawer reads an effective status (`'syncing'` while that flag is true, else `sync_status`) and
   observes both.
6. Sign-out (`clear_user_state`) drops pending entries. A request that finds pending entries whose running sync is no
   longer live drops them first (their sync will never settle).

Disagreement with condition 6's "(and `auto_sync`)": the base runs manual syncs with automatic sync off, and only
manual reasons queue, so checking `auto_sync` would drop a manual request that would have run had nothing been
running. Online only.

**Candidates not chosen.** B: let the absorbed call run its own pass (drop the `check_first` id test): two walks
writing the same stores at once, double work on low-end devices. C: settle the absorbed promise with the running
sync's result and rely on the stamp check: the home board still waits 5-10 minutes and the drawer still says ready.

**Risks / open questions.** A pending entry is keyed by the literal `user_id`, so 'self' and the signed-in person's
own global id (profile Sync on one's own page) make two follow-ups. A running sync that hangs (row-queue watchdog,
out of scope) holds its follow-ups, as today it holds `sync_progress`. Push-to-cloud has no rejection handler.

**Tests (red first).** Seeds (user fixture changed mid-sync gets exactly one follow-up whose seeds include it, plus a
one-request control with one `sync_boards` pass); two requests make one follow-up (user, reason, force asserted);
the absorbed promise is pending until the follow-up ends and rejects when it fails; a request before cancel is
dropped, after cancel runs, with a resolving cancel too; automatic reason does not queue and does not overwrite
`_root_sync_reason`; offline at settle drops; a not-ready outer call does not deadlock; drawer: stays 'syncing' while
pending, cancel-while-pending and other-user both end not 'syncing'. Mutations: no follow-up; follow-up after cancel;
drawer ignores the pending flag.

**Correction to fact (b).** "A sync whose `sync_progress` was cleared never settles" is wrong for the running sync:
`check_first` decides when the chain is BUILT (`services/persistence.js:2062`, called while building `:2097`, `:2103`),
so steps already chosen still run, the board walk resolves once `sync_progress` is null, and the sync settles. The
settle handler therefore acts only when the tracked sync is still its own.

**Review of section 19 (`adversary`, 2026-11-11): build with changes.** Checked each finding in code; all applied:
- Sign-out never reaches `utils/persistence.js` `clear_user_state` (CONFIRMED: `services/session.js:897` calls it on
  the persistence service, which does not define it). Pending follow-ups are dropped in `services/app-state.js`
  `clear_user_state`, BEFORE the drawer is dismissed (the flag falling after the dismiss would reopen it), and a
  follow-up does not start when `local_db_is_current_user()` is false.
- Settle handler identity check (above).
- Drawer: when the flag drops without a follow-up starting, the drawer closes, unless the running sync wrote a failure
  or problems during the wait. It no longer shows an old "ready" (someone else's root sync never writes `sync_status`).
- `auto_sync`: the reviewer was right that the home-board and sidebar callers check it at request time
  (`utils/home_board.js:77`, `controllers/board-picker.js:194` and others). A follow-up made only of those reasons
  re-checks it at start; one that includes the Sync button, push-to-cloud or the first Home Screen sync does not.
  `manual_sync` wins a merge (the base resets the storage check and refreshes caches only for it).
- The follow-up starts through `this.sync`, and each pending promise carries its own no-op rejection handler, so a
  dropped request of a caller without one (`components/push-to-cloud.js:72`) raises no unhandled rejection.
- Existing test "should not remember a cancelled sync as failed when another sync starts before it stops" (its
  post-cancel request now runs): passes timing-strict unchanged, so no test change was needed.

**Built.** `utils/sync_follow_up.js` (merge rules), the last `persistence.reopen` in `services/persistence.js` (queue,
start, drop, flag; `sync_is_automatic` now uses the shared reason check), `services/sync-notice.js` (effective status),
`services/app-state.js` (drop at sign-out). Tests: `tests/utils/persistence-sync-test.js` "a sync requested while
another runs" (13 cases), `tests/unit/services/sync-notice-test.js` (4), `tests/unit/utils/sync-follow-up-test.js` (4),
`tests/unit/services/app-state-clear-handoffs-test.js` (1). 13 of the first red run's cases failed before the fix for
the traced reason (the queued request's promise never settled; the drawer showed "done" while a follow-up waited).

**Verified.** Targeted run, timing-strict (`--query timingStrict=1`, filter covering the new cases, the drawer, the
merge unit, the sign-out tests and the three existing cancel tests): 39 of 39, no leak-check, late-read, queued-fetch
or owner-gone lines. `node scripts/eslint-todo-gate.js`: no new findings. Mutations, each in a build with the
committed fix otherwise intact:
- A1, `start_follow_up_sync` returns at once (no follow-up): every case that needs a follow-up goes red (seeds, two
  requests, pending-then-rejects, request after a cancel either way, offline, automatic sync off, other database,
  another person). Two more reds in that build were late assertions from the hung test before them, not leaks.
- A3, the drawer ignores the pending flag: the three drawer cases that hold or drop a follow-up go red.
- B2, `cancel_sync` keeps pending follow-ups: both "drops a request made before a cancel" cases go red.
- B4, sign-out keeps them: "a pending follow-up sync is dropped and the drawer stays closed" goes red.

**UI check (2026-11-11, local dev stack, Playwright driving the Modern view as the seeded `example` user).**
- Home board picked mid-sync through `/board-picker` ("Set as Home Board" on Quick Core 40) while a manual sync from
  Extras > Sync ran: the request queued (flag up at 10.7 s), the first sync ended at 13.9 s and the follow-up started in
  the same moment under a new sync id, and the drawer stayed on "syncing" until the follow-up ended at 54 s. Only the
  follow-up's sync log lists the new home board set (`example/core-40-*`).
- Cancel from Sync Details with a follow-up waiting: the follow-up was dropped at the click (flag down, nothing queued).
- Found, pre-existing (not this change): (1) the profile page's "Change Home Board" (`components/available-boards-section.js`,
  `copy_or_reuse_as_home`) requests no sync at all, so on that path the new home board waits for the stamp check; the
  queue cannot help it. (2) A cancelled sync often never ends: the board walk stays in "syncing boards" and the drawer
  stays on "syncing". On the #1268 head without this change it hung in 3 of 5 runs (2 of 2 cancelled 1.5 s in), with this
  change 5 of 6; the samples are too small to compare rates. While it hangs, a request made after the cancel waits
  behind it (on the head, the same request is absorbed and never runs either). (3) When a cancelled sync does end, it
  ends as 'finished' and the drawer shows the result card (condition 2, as recorded above).

**The hanging cancel (Traci, 2026-11-11: fix it in #1268). Diagnosis incomplete; no change made.**
- Seen: 10 of 11 cancels hung (both builds) during one stretch of the session, all shortly after board sets had been
  copied (Quick Core 40/84/112). The base's own log repeated "Sync waiting on [syncing boards for example]"; the cancel had
  registered (`sync_progress.canceled` true, cancel id = running id); `sync_progress.root_user` was still 'self'.
- Then: 8 cancels in a row ended 8.2-8.4 s after Cancel, same conditions (cancel 1.5 s in, no interception), with home
  Crisis Vocabulary and with home Quick Core 40 again; Resque workers idle, queues empty. A probe that tracked the walk's
  calls (`board_lookup`, `store_url`, `find`, ...) found only button-set `store_url` calls open after a clean end.
- Ruled out by reading: `schedule_sync_board_step` (`services/persistence.js:79`) never drops a step; nothing in the
  walk calls `sync`/`cancel_sync` or the new queue methods; the walk does not await progress polling directly.
- Unverified hypothesis: a walk thread waits on server work for freshly copied boards and ignores the cancel.
  Next step: copy a NEW board set, wait for its copy to finish and its sync to start, cancel within 1.5 s with the probe
  on, and read which call stays open. The attempt with Vocal Flair 112 timed out before its sync started.
- Next step run (Traci: hold the push until the hang is fixed). Fresh copies of Vocal Flair 112, 84 and 60, each followed
  by a cancel of a sync over the new set, with call tracking and Resque queue sampling: one cancel took 58.1 s to land
  (VF84; queues empty throughout, so pending server jobs are not the cause; only a `/api/v1/boards/lingolinq/core-112/tree`
  request, from the previous home set, was open at the end), the others ended in 0.6-5.2 s. The long stall seen earlier
  (minutes) did not recur. The pick's own sync for VF60 had not started 10 minutes after "Set as Home Board"; not followed up.
  Status: not reproduced, cause unverified, no change made.

**The pick whose sync never started (Traci, 2026-11-12: investigate with UI testing). Cause found, pre-existing, not fixed.**
- UI traces of `/board-picker` "Set as Home Board": a REUSED copy (Vocal Flair 60) took the self branch of
  `_finishPickForHome` (`components/board-preview-overlay.js`): board opened, `persistence.sync(self, null,
  home_board_changed)` at 4.7 s. A FRESH copy (Vocal Flair 40, then 24) took the "picking for someone else" branch:
  `/example/boards` with "Great! This is now the user's home board!", no sync; the only sync was the stamp check 10 min later.
- Why: the copy job's end runs `refresh_session_user()` 100 ms later (`utils/edit_manager.js`, the
  `copy_board_links` progress handler), which loads `findRecord('user', 'self')`; from then on `setup_user`, `currentUser`
  and `sessionUser` report id `'self'` (traced every 100 ms: `1_3` until the job ended, `self` after). The branch test
  `setupUser.get('id') != currentUser.get('id')` compares the click-time snapshot (`1_3`) with `'self'` and is true for the
  person themself. Same comparison and same refresh on develop (`board-preview-overlay.js:388`, `edit_manager.js:2829`).
- Also seen in the traces: the client's home-board key flips between the old and new value as the two user records
  (`1_3` and `self`) carry different preferences.

## 20. A self pick read as "for someone else": fixed; the 'self' record, its history, and an audit (2026-11-12)

**Fix (Traci: make it).** `components/board-preview-overlay.js` `_finishPickForHome` decides "picking for someone else"
by `backend_user_id` (`utils/backend_user_id.js`, the helper `components/confirm-home-board-copy.js` `forSomeoneElse`
already uses) instead of `id`. Tests (`tests/unit/utils/home-board-message-test.js`): a self pick whose current user is
the `{ id: 'self', global_id: '1_3' }` record opens the board and starts the sync (red before the fix: no sync); a pick
for another person still takes the other-person path (guard, green before and after). Neighbouring picker modules,
timing-strict: 54 of 54. UI, fresh copy of Vocal Flair 84 w/ Keyboard: ids turned `'self'` at 16.8 s as before, and the
pick now opened the board, said "This is now your home board..." and started `home_board_changed` at 30.2 s.

**Why the session user is keyed 'self' (do not undo).** `findRecord('user', 'self')` gets a payload with the real id.
`serializers/application.js#normalizeResponse` rewrites it to 'self' and parks the real id in `_actual_id`
(`4656159f3`, 2025-12-30, "preventing Ember Data warnings"; `updateRecord` was added to the request types later).
On Ember Data 5.3.13 this is more than a warning: when a 'self' record and a real-id record are both materialized
(the normal state after any `refresh_session_user`), a response re-keying 'self' to the real id THROWS ("Failed to
update the 'id' for the RecordIdentifier 'user:self' to '1_3', because that id is already in use", `@ember-data/store`
identifier merge). Every reload and save of the session user depends on the pin. `models/user.js#global_id` and
`utils/backend_user_id.js` exist for comparisons; LEARNINGS already says to compare `global_id`.

**Where the second record comes from.** Startup (`services/app-state.js` ~495) compares the session's real id with
the 'self' record's `id`, so it always refetches by real id: `sessionUser` starts as the real-id record. Afterwards
`refresh_session_user()` (`app-state.js` ~2288) installs the 'self' record; it runs after every board copy
(`utils/edit_manager.js` ~2829) and after every successful token check, because `services/session.js:325` compares
`sessionUser.id` with the server's real `data.user_id` (always unequal while the record is 'self').

**Audit of other user-id comparisons (Explore agent; rows 1-4 re-read by hand).** Affected, read in code:
`utils/sync.js` `send`/`in_room` (subscriptions hold the real id; callers pass `currentUser.id`, so your own
remote-modeling and follower updates can be dropped); `services/session.js:325` (refreshes on every token check);
`services/app-state.js` ~495 (always the extra fetch). (Corrected in section 21: `utils/board-roots.js` is NOT
affected; its id-gated rule only drops boards an ungated rule drops anyway.) Affected, plausible (not traced end to end):
`controllers/board-picker.js` `for_self` and the `user_id == setup_user.id` checks there and in `controllers/setup.js`
/ `routes/setup.js`; `page_user_id === currentUser.id` in `controllers/user/index.js`, `available-boards-section.js`,
`dashboard-user-boards.js`; daily use `is_self` (`controllers/user/index.js` ~243); `app-state.js`
`set_speak_mode_user` (`board_user_id == session_user_id`); the Mine-list cache key `id || _actual_id` (wrong order) in
`create-board-new.js`, `confirm-delete-board.js`; `controllers/user/preferences.js`, `stats.js`; focus-word
`user_id` stashes; `tour-offer.js`. Not fixed here (Traci: fix the picker, audit the rest).

## 21. The other user-id comparisons: traced end to end, proposal (2026-11-12; Traci: trace, then fix in this branch)

Three Explore agents traced the audit rows; the load-bearing links below were re-read by hand.

**Fact sheet.**
- (a) Where the session user's id is read, and when it is 'self'. CONFIRMED: the dashboard model is
  `findRecord('user', 'self')` (`routes/index.js:59`, `routes/bento.js:26`), so on the dashboard the card user is the 'self'
  record. `sessionUser` becomes the 'self' record after `refresh_session_user()` (`app-state.js` ~2288), which runs after a
  board copy (`edit_manager.js` ~2829), on the first route transition when no session user is loaded yet
  (`app-state.js` ~775-781, a startup race with `find_user`), and after every successful token check while it is already
  'self' (`session.js:325`), so once 'self' it stays 'self' for the page session.
- (b) Shapes: a user record's `id` is the real global id ('1_3', local read or a findRecord by real id or user_name) or
  'self' (network load of 'self'); `global_id`/`backend_user_id` give '1_3' for both, and null only with no record. Ids
  from the server (ws subscriptions `res.user_id`, token check `data.user_id`, shallow-clone suffixes `<board>-<user>`,
  `global_id.rb:14-15`) are always real.
- (c) Cross-file claims CONFIRMED by reading: subscriptions are keyed by the server's real id (`users_controller.rb`
  `ws_settings` `user.global_id` -> `sync.js:224-230`, `:145`); `send`/`in_room` look them up with the caller's id
  (`sync.js:1062-1066`), callers pass `currentUser.id`/`sessionUser.id`; `default_listen` compares the message's real id
  with `sessionUser.id` (`sync.js:700-703`); dashboard "Help me Choose" passes the card user's id when it differs from
  `currentUser.id` (`dashboard-user-boards.js:21-25`) and the picker decides `for_self` by `id` (`board-picker.js:32-36`).

**Findings kept (traced).**
1. Sync and pairing (`utils/sync.js` send, in_room, default_listen, send_update's comparisons at :478, :486, :535, :565):
   while the session user is 'self', your own room's updates, pairing confirmations and rejections are dropped and
   incoming pair requests ignored. CONFIRMED.
2. `services/session.js:325`: refreshes on every token check while 'self' (the refresh reinstalls 'self'). CONFIRMED.
3. Picker and its entry points: `dashboard-user-boards.js` `homeBoardPickerUserId`, `controllers/user/index.js`
   `homeBoardPickerUserId` and `toggleSetHomeMode`, `available-boards-section.js` `boardPickerQuery`,
   `controllers/board-picker.js` `for_self`: a new user's own "Help me Choose" opens the picker for "someone else"
   (`?user_id=self`). CONFIRMED by reading; UI check pending (needs an account with no home board).
4. Trial bar and Basic Try: the snapshot stores `(setup_user || currentUser).id` (`board-preview-overlay.js` ~308, ~315,
   `board_picker_landing.js:32`) and is compared by `id` (`trial-bar.js:66`, `board_picker_landing.js:60`). PLAUSIBLE.
5. `app-state.js` `set_speak_mode_user` (`board_user_id == session_user_id`): your own real id with a 'self' session user
   loads a second copy of you as the speak-mode user (run_eval from your own profile). CONFIRMED for that caller.
6. Own page: daily use `is_self` (`controllers/user/index.js` ~243), `helpers/remote-modeling-access.js` `is_self`,
   shallow-root grouping (`controllers/user/index.js:816`). PLAUSIBLE (stale page model vs 'self' session user).
7. Mine-list cache clears keyed by `currentUser.id || _actual_id` (wrong order) or `model.user.id`
   (`create-board-new.js` ~1883, `confirm-delete-board.js` ~251, `copying-board.js` ~253) while the snapshot is written
   and read under `model.id`: a deleted board can reappear after a reload within 10 minutes. PLAUSIBLE.
8. `controllers/user/preferences.js` ~1254, `controllers/user/stats.js` ~458/~470: saved preferences do not reach the live
   record when the page model and current user are different records of you. PLAUSIBLE.
9. Tour offer (`tour_offer.js:58` stores `currentUser.id`, `tour-offer.js:28` compares), last focus words
   (`focus-words.js` ~98/~190). PLAUSIBLE, low.
Dropped after tracing: `utils/board-roots.js` (same output either way), `mine_board_grouping.js` (no live caller),
`controllers/setup.js`/`routes/setup.js` (self-heals; only a hand-typed URL), `controllers/profile.js` (never 'self'),
`sync.js:509` focus_words.user_id (never set anywhere: separate dead condition), `controllers/modals/*` (orphaned).

**Proposal.** One rule: compare people by backend id on both sides, `utils/backend_user_id.js` (a record) and, for id
strings, 'self' read as the session user's backend id. Per finding:
1. `sync.js`: one helper `sync.same_user(a, b)` / `sync.room_id(id)` ('self' -> backend id of sessionUser, other ids
   unchanged), used on BOTH sides of every comparison listed (lookups in send/in_room map the argument; default_listen
   and send_update compare room ids). Mapping only the argument would break send_update's `sessionUser.id == user_id`
   tests, so both sides go through it.
2. `session.js:325`: compare `backend_user_id(sessionUser)` with `data.user_id`. With no session user it is null and
   still refreshes (login, boot); a different person still refreshes.
3-6, 9: compare `backend_user_id` on both sides; the computeds return null (self flow) when they match; snapshots store
   the backend id.
7: clear every key the person's snapshot can be under (the backend id and 'self').
8: same person but a different record: reload the live record (`refresh_session_user()`) instead of assigning the page
   record to `currentUser` (assigning would split currentUser from sessionUser; the `set_current_user` observer would
   revert it).

**Not changed, on purpose.** The serializer pin (section 20). `app-state.js` ~495 startup branch: comparing by backend id
there would stop the only fetch that gives the session a real-id record at startup and make 'self' the state for every
session; the extra fetch is the cost.

**Alternative rejected.** Make the session user always the real-id record (rewrite `refresh_session_user` to
`findRecord(backend id)` or unload 'self'): fewer comparisons to fix, but it changes what every reload and save of the
session user goes through, which is exactly what the pin protects (Ember Data's identifier merge throws when both
records exist). Larger blast radius, separate change if ever.

**Risks / open.** A 'self' record without `_actual_id` (read back from the device) still yields 'self': no fix there, no
regression. `set_speak_mode_user` change makes a real-id self call take the self branch: verify every caller passes a
supervisee's id or 'self' otherwise (switch-communicators not verified).

**Tests (red first).** Per finding, stubs in the network-load shape `{ id: 'self', global_id: '1_3' }` against a real id,
plus a genuinely-different-person guard for each comparison. Mutations: revert each comparison.

## 22. The hanging cancel: diagnosed with UI probes, proposal (2026-11-12; Traci: investigate thoroughly, propose a fix)

**Diagnosis (CONFIRMED in code and live).** `store_url` (`services/persistence.js`, and the same code in
`utils/persistence.js` ~1515-1536) feeds downloads through a queue served by up to 3 workers
(`persistence.storing_urls`, `storing_url_watchers`). A worker that finishes an item calls `storing_urls()` again; a
worker that finds the queue empty decrements the count. The branch for an item of a cancelled sync
(`part_of_canceled`, from `1941a8306`, 2018, "more aggressive short-circuiting of board sync"; on develop) resolves that
item and does neither. So after a cancel each worker takes at most one cancelled item and stops, the count stays at 3,
no worker is ever started again, and every queued item stays pending: the board-walk thread waiting on its board's
downloads (`RSVP.all_wait(visited_board_promises)` before the next `nextBoard`, the only place the cancel is read) never
returns, the walk never resolves, and the sync stays 'syncing'. Until a reload, every later `store_url` (the next sync,
button-set downloads) also queues behind the dead workers.

**Why it looked intermittent.** It needs the cancel to land while downloads are queued: a large, not-yet-cached home
set (fresh copies) mid-walk. Cancels before the walk, or after the queue drained, ended normally (0.6-8 s).

**UI evidence (Playwright, local stack, picture requests slowed 3 s so the queue fills, cancel 8 s into a manual sync).**
- Home Quick Core 112: hung 2 of 2. 160 s after Cancel still 'syncing' with `sync_progress.canceled` true; the queue
  frozen at 9 and 14 items (same count 30 s later), `storing_url_watchers` 3, 2 queued items tagged with the cancelled
  sync's id.
- Home Crisis Vocabulary (small): the sync ended, but the queue was left frozen with 4-10 untagged items (button-set
  JSON) and 3 workers: the dead queue without the visible hang.
- Probe (temporary, reverted): the cancelled branch also calls `storing_urls()`. Same reproduction, home Quick Core 112:
  ended 2.6 s and 3.7 s after Cancel, queue drained to 0, 2 of 2.

**Second problem the fix will expose (CONFIRMED live).** The board walk resolves on cancel, so a cancelled sync ends
in the success branch (`services/persistence.js` ~2399-2409) and writes 'succeeded' (or 'finished'), stashes
`last_sync_status`, and moves `last_sync_at`. The drawer then says "Your boards are synced and ready for offline use."
after the person pressed Cancel (seen in both probe runs). Condition 2 of section 18 named the same branch.

**Proposal.**
1. Queue (both copies): in the cancelled branch, after resolving the item, call `storing_urls()` like the other two
   branches (candidate A, the probed one). Candidate B, rejected: on cancel, drain every item of the cancelled sync from
   the queue at once; faster for a huge queue, but it moves queue ownership into cancel and touches more code; A
   already drains at one item per tick with no download.
2. Success branch after a cancel: when `_canceled_sync_id === sync_id`, do what the failure branch does for a cancel
   (`~2442`): clear `sync_status` only if this is still the active root sync, do not write 'succeeded'/'finished',
   do not stash `last_sync_status`, do not move `last_sync_at` or the stamps (the sync did not finish; the next one must
   still run), still clear `sync_progress`. The promise still resolves.

**Risks / questions.** (2) changes what a resolving cancel reports: today 'succeeded' plus a moved clock, after it
nothing. A partner of a later follow-up (section 19 queue) is unaffected: the queue starts on settle either way.
`last_sync_at` staying put means the 48-hour/stamp checks may start a sync sooner after a cancel: intended (the
boards were not saved). The `storing_url_watchers` count can still drift if `store_url_now` itself never settles (not
seen; out of scope).

**Tests (red first).** Unit: queue three sync-tagged items with a cancelled `sync_progress` plus an untagged item; all
four settle and a later `store_url` runs (red today: the untagged item and the later one stay pending). Same for the
utils copy. Sync: a cancel during the walk whose board step waits on a queued download ends the sync (red today:
hangs); a cancelled sync that resolves leaves `sync_status` not 'succeeded', `last_sync_status` and `last_sync_at`
unchanged. Mutations: drop the new `storing_urls()` call; drop the cancel guard in the success branch.

**Review of section 22 (`adversary`, 2026-11-12): build with changes; findings checked by hand.**
- CONFIRMED (re-ran the reviewer's node harness on the real `store_url` source with real RSVP): the one-line fix drains
  cancelled items by recursion and overflows the stack at ~9,000 queued items ("Maximum call stack size exceeded"),
  after which the queue freezes again at 3 workers. Same harness: after a cancel and a new sync, leftover items of the
  OLD sync download under the new one (before and after the one-line fix), because the check reads the current
  `sync_progress`, not the item's own sync id.
- CONFIRMED: the failure branch writes `last_sync_event_at` (`services/persistence.js:2472`); skipping it after a
  cancelled success lets the stamp/48-hour check restart a sync right after Cancel. `last_sync_stamp` moves at :2379,
  before the planned check.
- Accepted: tests must save and restore the service-class queue statics (the bare `persistence` in the service is the
  class, :91; test cleanup resets only the instance and the utils class), and reach the utils copy through
  `persistence.proto().store_url` (parity only).
- Accepted: a cancelled sync of someone else's boards must not clear the signed-in person's status
  (`sync_status_is_for_signed_in_user`, missing in the failure branch's cancel clear too).

**Revised proposal.**
1. Queue, both copies: one helper `item_is_stale(opts)` (an item of a sync that is not the running one: tagged, and
   `sync_progress` null, cancelled, or a different `sync_id`; supervisee items carry the root's id, `:2036-2038`).
   `storing_urls` first resolves and drops stale items in a LOOP (`while` the head is stale), then downloads one item
   or, with an empty queue, decrements the worker count. No recursion per stale item, so no stack growth.
2. Base sync, cancelled sync that resolves (`_canceled_sync_id === sync_id`), checked BEFORE `last_sync_stamp` moves
   (`:2379`): clear `sync_progress`; clear `sync_status` only if still the active root sync AND it is the signed-in
   person's (the same guard added to the failure branch's cancel clear); write `last_sync_event_at`; write a
   `sync_log` entry with its own "Sync canceled" summary (new i18n key); do NOT write 'succeeded'/'finished', stash
   `last_sync_status`, move `last_sync_at`, the stamps or `last_sync_stamp`. Resolve as before.
3. Board walk: `nextBoard` also stops when `sync_progress.sync_id !== sync_id`, so a thread woken by the drained queue
   after a follow-up sync started does not carry on under the new sync.
Not covered (residual, recorded): a storage write in `store_url_now` that never calls back still holds a worker.

**Tests (red first).** Unit, service copy with the class statics saved/restored by descriptor: cancelled-tagged items
plus an untagged item and a later `store_url` all settle and the worker count returns to 0; 10,000 cancelled items
drain without a stack error; an item tagged with an old sync id is not downloaded once a new sync runs. Utils copy
through `proto()`: the first case (parity). Sync (persistence-sync harness): a cancel while a board step waits on a
queued download ends the sync; a cancelled sync that resolves leaves `sync_status` not 'succeeded', `last_sync_status`,
`last_sync_at` and `last_sync_stamp` unchanged, moves `last_sync_event_at`, logs "canceled"; a walk thread does not
continue under a new sync id. UI: the Quick Core 112 reproduction ends within seconds and the drawer shows no "ready"
card. Mutations: put back the recursion-free loop's missing continue; drop the stale-id check; drop the cancel guard in
the success branch.

**Built (Traci, 2026-11-12: "yes build it").**
- `utils/url_store_queue.js` (`is_stale_item`, `drop_stale_head`, which returns what is left): both queue copies
  (`services/persistence.js` `store_url`, `utils/persistence.js` `store_url`) drop stale items at the head in a loop
  before taking one, and the old cancelled branch now continues the worker instead of stopping it. Lines edited in
  place, so no baseline row moved.
- `end_canceled_sync` (last `persistence.reopen`), called from the success branch's guard line before
  `last_sync_stamp` moves: clears `sync_progress`, clears `sync_status` only for the active root sync of the signed-in
  person, logs "Sync canceled" (`sync_canceled_summary`, `public/locales/en.json`), sets `last_sync_event_at`, and
  writes no result, stash, clock or stamp. The failure branch's cancel clear got the same signed-in guard.
- Board walk: the thread-start and per-board cancel checks also stop when `sync_progress.sync_id` is another sync's.
- Tests: `tests/unit/utils/url-store-queue-test.js` (helper, incl. 10,000 items), `tests/unit/services/store-url-queue-test.js`
  (service queue, class statics saved and restored: queue keeps going after a cancel, 10,000 cancelled items drain and
  the workers end, an older sync's item is not downloaded), `tests/utils/persistence-sync-test.js` "a cancelled sync
  that resolves". Red before the fix: 4 of 4 (the helper module did not exist yet, so its test ran only after).
- Green, timing-strict: the whole persistence-sync module plus the new and neighbouring modules, 148 tests, 147 pass,
  1 skip (the `xit` already on HEAD), 0 fail, no leak, late-read, queued-fetch or owner-gone lines. ESLint gate: no new
  findings.
- Mutations (one build): no loop drop -> the 10,000-item service test red; older-sync items not stale -> the older-sync
  tests in both modules red; `end_canceled_sync` inert -> the cancelled-resolve test red.
- UI (Quick Core 112, pictures slowed 3 s, cancel 8 s in; hung 2 of 2 before): ended 3.9, 3.9 and 4.1 s after Cancel,
  `sync_status` null, no drawer card, queue drained to 0. An uncancelled sync still finished normally (9.4 s, its usual
  "finished" card).
- Not covered by a test: part 3 (a walk thread stops under a newer sync); proving it needs the real walk with a
  follow-up starting mid-walk. One worker stays counted 30 s after an empty queue (a download in flight; the residual
  `store_url_now` case), blocking nothing.
