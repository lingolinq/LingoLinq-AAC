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

