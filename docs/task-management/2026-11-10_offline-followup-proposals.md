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
