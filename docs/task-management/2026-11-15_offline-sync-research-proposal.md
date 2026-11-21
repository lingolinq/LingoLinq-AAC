# Offline board sync: research and proposal (2026-11-15)

Author: Traci Day, with Claude (opus-5.5). Status: being implemented, every phase together (Traci, 2026-11-20). Section 12 is the plan of record and wins where it differs from sections 5 to 10.
Nothing here is built. Follows #1322, which fixed the specific failures on Traci's Android phone without changing the
sync design. #1322 is not yet in develop: statements about `board_download.js`, the 60 s board attempt, parked
retries and the saved sync log describe #1322's branch, not develop 9728d6bd1.

**How to read the evidence labels.**
- *Measured*: run on 2026-11-15; the method is in Appendix B.
- *Verified*: read in the code at develop 9728d6bd1.
- *Traced*: reported by a research agent that read the code; not re-read line by line.
- *Sourced*: from external documentation, linked in Appendix A.
- *Estimate*: a model with its assumptions stated; not a measurement.

## Summary

The sync is the original CoughDrop-era design. It walks the board tree and downloads each board as JSON and each picture as its own file, with a fixed time limit per request, while the app is open. Its core idea (a copy on the device, version hashes to skip unchanged boards) is still sound. The way it moves data is not.

**Finding 1: pictures, not boards, are about 99% of a sync.** Production Quick Core 60, the public template your phone synced on dev, measures:
- **Boards:** 61 boards, 1.35 MB of JSON (0.36 MB if compressed).
- **Pictures:** 2,085 files, 33 MB. 12% of the bytes are the same picture downloaded again under a different URL.

*Measured.*

**Finding 2: dev is not representative.**
- **Dev:** Quick Core 60 folders are about 1.52 MB each, with pictures inline as base64 inside the board JSON.
- **Production:** the median board is 27 KB, about 56 times smaller.

The phone failure that #1322 fixed was amplified by this. Sizes *Measured*.
- **Why dev has inline pictures is not established.** The code stores a picture inline when an upload to S3 fails (`uploadable.rb` fallbacks), but which failure happened on dev was not proven.
- **Dev and staging share one database** (`.claude/rules/deploy.md`), so re-saving boards on dev also changes staging.

**Finding 1 understates real syncs.** The measurement used anonymous requests, which return no symbol-set alternates, skin variants or high-contrast pictures. A real sync downloads every skin and symbol set of the person and of every supervisee (`services/persistence.js:3172-3181`, `models/board.js:335-366`, *Traced* by review). Sounds, private boards, later syncs and supervisor caseloads were not measured. Phase 0 measures them before phase 2 is scoped.

**Finding 3: against current best practice, the gaps are:**
- no response compression;
- one request per picture, and only one picture download at a time on Android;
- batched board fetches that fan out instead of running one after another;
- full-size PNGs where a display-sized WebP is a quarter of the size;
- no de-duplication of identical pictures;
- total-time timeouts that throw away a slow download in progress (except in the iOS app, where the WebView sees no progress until a response is complete);
- no way to resume a download;
- a discovery walk instead of a single change manifest;
- nothing that continues in the background.

**Recommendation:** fix it in phases, inside the current data model. Do not replace the sync with an off-the-shelf sync engine.
0. **Phase 0:** measure real sync shapes (supervisors, skins, symbol sets, sounds) and count every sync, before scoping phases 2 and 3.
1. **Phase 1 (small, low risk):**
   - serial batches, then no 100-board cut-off;
   - platform-aware stall timeouts;
   - more picture downloads at once on Android;
   - compressed API responses;
   - storage persistence.
2. **Phase 2 (largest byte savings):**
   - lossless WebP renditions in a separate field;
   - de-duplication by a private content hash;
   - erasure of renditions;
   - binary storage on Safari;
   - button sets without the base64 proxy.
3. **Phase 3:** one change manifest per sync, then compressed batched fetches.
4. **Phase 4:** decide only after measuring phases 1 to 3. Either a per-board-set bundle file, or native background download in the Capacitor app.

Modelled on a 4 Mbps Android connection, a production Core 60 first sync goes from roughly 5 to 8 minutes today to about 1.7 minutes after phases 1 and 2 (*estimate*, section 6). Most of the time saved comes from concurrency; WebP saves bytes and storage.

## 1. What a Core 60 sync downloads today

| Item | Production Quick Core 60 | Source |
|---|---|---|
| Boards in the set (home plus linked folders, depth 3) | 61 | *Measured* |
| Board JSON, total | 1,354 KB raw; 357 KB gzip-6 (3.8×) | *Measured* |
| Board JSON per board | min 3 KB, median 27 KB, max 45 KB | *Measured* |
| Home board JSON | 46 KB raw, 11 KB gzip (4.0×); no inline images | *Measured* |
| Picture references | 2,085, every one a different URL | *Measured* |
| Picture bytes | 33.0 MB: PNG 1,305 files, 30.2 MB; SVG 778 files, 2.6 MB | *Measured* |
| Identical picture files behind different URLs | 250 extra copies; 12% of picture bytes | *Measured* (SHA-1 of every file) |
| PNG pixel width (150-file sample) | min 128, median 250, p90 250, max 500 | *Measured* |
| Same PNGs as WebP quality 80 | 26% of PNG bytes | *Measured* |
| Same PNGs as lossless WebP | 54% of PNG bytes (pixel-identical) | *Measured* |
| Same PNGs as AVIF quality 60 | 26% of PNG bytes | *Measured* |
| API response compression | none: dev returns identical bytes with or without `Accept-Encoding: gzip` | *Measured*; no `Rack::Deflater` in config (*Verified*) |
| Picture caching headers (CloudFront) | no `Cache-Control` | *Measured* |
| Dev Quick Core 60 folder JSON | about 1.52 MB each, inline `data:image` pictures | `2026-11-14_android-sync-slow-problems.md` |

**Why each button has its own picture URL.** The URL embeds the picture record's id (`images/…/1_89118_<hash>.png`). Copying or creating a board creates new image records, even for the same symbol. *Measured* (URL pattern); the record model is *Traced* (`app/models/button_image.rb`, `uploadable.rb`).

## 2. How the sync works today

### 2.1 The server side

Each item is *Verified* where marked; the rest is *Traced* (the server agent's file:line references are in the research log).

- **Board JSON:** built by `lib/json_api/board.rb`. Its big fields are `buttons`, `grid`, `translations` and `image_urls` (a map from image id to CloudFront URL).
  - `show`, `tree`, `bulk` and `users#boards` all use `skip_subs`. So clients get URL maps, never image objects.
  - The content can live in a shared `BoardContent` row (copy by reference).
- **Version signal:** `current_revision`, an MD5 of id, grid, buttons, public, unlisted and translations, set on save. `full_set_revision` covers a board and everything below it. There is no "changed since" endpoint.
- **Change check:** GET `/users/:id/board_revisions` returns one map of `{board → current_revision}` for the home board, the sidebar boards, their downstream boards, and starred boards only when `sync_starred_boards` is set. It uses `BoardRevisionsAccess` for fresh share decisions.
- **Batch fetch:** GET `/users/:id/boards?ids=`, at most 25 ids per request; more is a 400. *Verified*, `users_controller.rb:850`.
- **Tree:** GET `/boards/:id/tree`: `MAX_TREE` 500, paged by 100 ids or a 1 MB budget (*Verified*, `boards_controller.rb:418-429`). Used by the sign-in warm-up, not by the sync.
- **Button sets** (`BoardDownstreamButtonSet`):
  - a flat list of every button below a root board, up to depth 10 (*Verified* `MAX_DEPTH = 10`), with a variant for each user;
  - stored on S3 when `REMOTE_EXTRA_DATA` is set, otherwise inline in the database row;
  - can reach megabytes: one was 1.73 MB with 3,717 buttons (`OFFLINE_BOARDS_STATUS.md`);
  - fetched through `/api/v1/search/proxy`, which returns the file as **base64 inside JSON**, about a third larger (*Verified* `search_controller.rb:268-271`).
- **Middleware and infrastructure:**
  - `Rack::Timeout` 16 s (*Verified*);
  - no compression (*Verified*);
  - no caching headers on the sync endpoints (*Traced*; Rails' default weak ETag is still sent, *Measured* on dev);
  - Cloud Run cuts off a non-streamed response at 32 MiB (*Sourced*).
- **Exports:** OBZ export (`Converters::Utils.board_to_remote`) already runs as a background job and caches its result on S3 by revision. A possible base for bundles (*Traced*).
- **Permissions:** board view rules are in `board.rb:84-104`, and the endpoints apply them differently:
  - `tree` filters by the caller;
  - `users#boards` filters by the target user;
  - `board_revisions` uses `BoardRevisionsAccess`.
  Any new endpoint must pick one rule deliberately (*Traced*).

### 2.2 The client side

*Traced*, with spot checks marked *Verified*. "S" is `app/services/persistence.js`.

- **Which code runs:**
  - the sync is the persistence service (`window.persistence`), in `sync` and `sync_boards`;
  - every Ember Data board fetch goes through the utils copy's `DSExtend.findRecord`, the only user of `board_download.js`. Transport changes must go there.
- **Order of a sync:**
  1. prime caches;
  2. reload the user (20 s limit);
  3. "eventually" tasks (stash log, free-space check);
  4. offline edits, the user, supervisees, sounds, usage logs, tags and contacts, spaced 1.5 s apart;
  5. the board walk, started at once alongside step 4;
  6. store the settings and `lastSync`.
- **The board walk:**
  - **Revision check:** it first calls `board_revisions` and marks matching boards "cached".
  - **Batched fetch:** stale boards are fetched in batches of 25, **only when fewer than 100 are stale** (*Verified*, the `< 100` check), falling back to one request per board.
    - The batches are **not** sequential: `next_batch()` runs once per board stored from a response, not once per response (*Verified*, `services/persistence.js:2966-2975`). So one 25-board answer can start up to 25 more batch requests.
    - Removing the 100 cut-off without fixing this would let one device fire many concurrent 25-board requests. Each runs the full serializer (one `ButtonImage` lookup per picture, uncached `images_and_sounds_for`) under the 16 s `Rack::Timeout`.
  - **Seeds:** home, sidebar, starred and Crisis Vocabulary. Starred boards are seeded but are not in `board_revisions` unless the flag is set, so they never batch.
  - **Link following:** breadth-first, 6 threads on mobile and 10 otherwise.
  - **Board state:**
    - "downloaded" with no request when the in-memory record is under 5 minutes old;
    - "cached" by revision plus `known_on_device`;
    - otherwise reloaded.
- **Pictures:**
  - **Queue:** every button picture and sound goes through one global queue: 3 workers, 2 on mobile, **1 on Android** (*Verified*, `max_watchers`, S:1502-1507).
  - **Fetch:** CORS XHR as a blob, 45 s, falling back to the base64 proxy.
    - The production picture CDN already sends `access-control-allow-origin: *`, and develop already fetches it directly (`utils/direct_fetch.js`, #1268), so the proxy is the fallback, not the usual path (review, *Measured*).
    - Android does **not** shrink pictures: `size_image` returns at once for an `http` URL (*Verified*, `services/content-grabbers.js:740`). Why Android uses one worker is unknown.
  - **Storage:** native apps and Chrome write a file plus a `dataCache` row. On Safari the picture is a data URI inside the IndexedDB `dataCache` row, about a third larger (stored in `dataCache` *Verified*, data-URI form *Traced*).
  - **De-duplication:** by URL only, which misses the 12% stored under different URLs.
- **Timeouts:**
  - every limit is total time (a jQuery `timeout` or `setTimeout`);
  - a GET's first attempt gets 8 s, later ones 20 s, up to 3 attempts, each from zero;
  - boards now get one 60 s attempt (#1322);
  - nothing resumes (no `Range`) and nothing detects a stall;
  - **in the iOS Capacitor app, the WebView receives no progress at all until a response is complete.** CapacitorHttp on iOS buffers the whole body in a `URLSession.dataTask` completion handler (*Verified*, `lingolinq_mobile/node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift:154`). Android streams it. A stall timeout there would abort every slow but healthy download.
- **Storage:**
  - IndexedDB, or SQLite in the Capacitor app;
  - one database per user (`lingolinqStorage::<user>===db`);
  - quota errors are counted and fail the sync;
  - `navigator.storage.persist()` is requested only after a first successful sync on a trusted, installed device;
  - eviction is not detected.
- **Background:**
  - the service worker caches only the app shell and never `/api/`;
  - no Background Sync, Background Fetch or periodic sync is used;
  - the Capacitor 8 app (repo `lingolinq_mobile`) has no background-download plugin;
  - a sync runs only while the app is in the foreground.
- **Automatic sync:** every 5 minutes it checks `sync_stamp`, with back-off from 30 minutes to 6 hours after a failure. Cancel pauses it.
- **Sign-in warm-up:** pages through `/tree` and pushes boards into memory, not the database. It can make boards look current to the walk; `known_on_device` (#1322) now guards that.

### 2.3 What this means

- **Bytes:** the cost of a sync is pictures. Board JSON matters for speed (requests and latency), not for bytes.
- **Request count:** on Android a first sync makes about 2,085 picture requests one at a time. On a 100 to 200 ms link, the round trips alone take 3.5 to 7 minutes before any data moves (*estimate*).
- **Two caches:** "is this board on the device?" is answered partly from memory flags, not from the database. #1322 added a guard; a manifest would remove the ambiguity.

## 3. Best practice, and how LingoLinq compares

| Practice (2024-2026) | Source | LingoLinq today | Gap |
|---|---|---|---|
| Compress API responses (gzip everywhere, brotli about 97% of browsers); Cloud Run does not do it for you | *Sourced*: caniuse, Google Cloud docs, Rack source | None | Large for speed; small for bytes (JSON is 1% of a sync) |
| Keep media out of documents; store as Blobs, not base64 (+33%) | *Sourced*: web.dev, MDN | Production: separate files. Dev: inline. Safari: base64 rows. Button sets: base64 through the proxy | Partial |
| Content-addressed, de-duplicated media | general practice (*Sourced*: no single canonical source) | One file per button-picture record | 12% waste in Core 60 alone; more across boards and supervisees |
| Serve images at display size, in modern formats | general practice; WebP supported since iOS 14 | Full PNGs, median 250 px, max 500 px | 46% of PNG bytes with lossless WebP, 74% with lossy (*Measured*) |
| One change manifest per sync (cursor or version map), then fetch only what changed | *Sourced*: Replicache, RxDB, CouchDB docs | `board_revisions` exists but skips starred boards; batches fan out and stop at 100 stale | Partial: the right idea, with gaps |
| Batch requests; "fewer, larger transfers" | *Sourced*: Apple URLSession guidance | Batches of 25 for some boards; pictures one per request | Large for pictures |
| Conditional requests (ETag, 304) | *Sourced*: MDN, Rails guide | Weak ETag sent, never used | Small: a manifest makes it mostly unnecessary |
| Stall timeouts, not total-time; capped retries with jitter | *Sourced*: MDN XHR timeout, AWS | Total-time only; retries from zero; parked retries with jitter (#1322) | Large: the root cause of the phone failure. Not possible in the iOS app (no progress through CapacitorHttp) |
| Resumable downloads (`Range`, `If-Range`) | *Sourced*: MDN | None | Matters only for large files (bundles) |
| Background download | *Sourced*: web-features, caniuse, Apple, Capacitor docs | None | iOS web apps cannot do it at all; native apps can (bundles only) |
| Persistent storage and eviction awareness | *Sourced*: WebKit storage policy, web.dev | `persist()` late; no eviction detection | Medium: Home Screen apps are exempt from Safari's 7-day deletion |
| Off-the-shelf sync engine (Replicache, PowerSync, ElectricSQL, RxDB, PouchDB) | *Sourced* | n/a | **Not a fit:** row-based engines or a full storage rewrite, for whole documents plus pictures. Borrow the protocol shape (manifest, cursor, batches, idempotent apply), not the engine |

**Platform constraints that shape the design** (*Sourced*):
- **iOS Safari and iOS Home Screen web apps:** no Background Sync, no Periodic Background Sync, no Background Fetch. A web sync can only run in the foreground, so speed matters most there.
- **Capacitor on iOS:** background `URLSession` can download files while the app is suspended, but Apple rate-limits repeated background relaunches and recommends fewer, larger transfers. That favours bundles over many small requests. The `background-runner` plugin allows only about 30 s per run on iOS, which is not enough for a sync.
- **Android:** WorkManager or a foreground service (Android 15+ limits `dataSync` foreground services to 6 hours a day).
- **Compression formats:** zstd only reached Safari in 26.3 (February 2026). Use gzip, with brotli as an upgrade.
- **Storage:** Safari 17+ gives an origin up to 60% of disk. Home Screen web apps are exempt from the 7-day deletion of script-writable storage; Safari tabs are not.

## 4. Options considered

**A. Keep the design; fix transport and pictures (phases 1 and 2).**
- *For:* most of the gain for the least risk. No new protocol; every change can be shipped and measured on its own.
- *Against:* the walk and the many requests stay.

**B. A manifest plus batched, compressed fetches (phase 3).**
- *For:*
  - one request says what changed across the whole set, starred boards included;
  - boards arrive in compressed batches;
  - pictures are listed by content hash, so the device fetches only the ones it lacks;
  - removes the discovery walk and the memory-versus-database ambiguity.
- *Against:* a new endpoint with careful permissions, and client changes in the most sensitive code in the app.

**C. A bundle per board set (phase 4 candidate).**
- *For:*
  - one compressed, resumable file (boards plus pictures), built on the server when the set changes and served from S3 or CloudFront;
  - the best fit for native background download and for Apple's guidance;
  - builds on the existing OBZ export job.
- *Against:*
  - bundles of private boards must be per user, with short-lived signed URLs, never public;
  - rebuilding on every edit costs server time;
  - a small edit means a new bundle unless bundles are split or delta-encoded.

**D. Adopt a sync engine.** Rejected (section 3).

**Recommendation:** A then B; decide on C after measuring A and B in production.

## 5. Proposed phases

Each phase touches sync and offline, so each change follows `/fix-proposal`:
- a fact sheet;
- a red test first;
- adversarial review of the proposal;
- falsification after the fix lands.

Traci decided (2026-11-16):
- **No feature flags:** these fix outdated behaviour.
- **Best-practice choices where the proposal left one open:** lossless WebP for symbols.
- **One PR per phase, stacked on #1322.** Each PR replaces what it supersedes in #1322 rather than adding beside it.

Effort figures are rough planning estimates.

### Phase 0: measure first (about 2 days)

- **Count each sync.** Record bytes, requests, duration, peak concurrent requests and failures per sync in the sync log entry. Client only; nothing new leaves the device. Show them in "Technical details".
- **Measure real shapes, not just the public template:**
  - a synthetic supervisor with three supervisees on different skins and symbol sets;
  - sounds;
  - a second sync with nothing changed;
  - a large synthetic caseload.
  These decide the scope of phases 2 and 3.
- **Find out why dev's pictures are inline** before changing anything there. Dev and staging share one database, so any re-save touches staging too. Infra (Scot).

### Phase 1: quick wins (about 5 to 7 days; corrected after review round 2)

Items 1 and 4 change server behaviour for every installed build, so each is built to be safe for old clients.

1. **Batches: one at a time per device, then lift the cap.**
   - **One batch slot per device:** supervisee syncs start in parallel (`services/persistence.js:2594-2621`), so a per-user loop is not enough.
   - **When the next batch starts:** `next_batch()` runs once per response, after the boards are pushed to the store, not after the device writes. A device write that never settles must not hold the sync.
   - **Each batch checks:** the cancel flag and its sync id.
   - **A time budget:** after it, the walk starts anyway.
   - **Then:** remove the 100-board cut-off.
   - **Tests:** two supervisees; a store write that never settles; 150 stale boards (request count and peak concurrency).
   - **Starred boards in `board_revisions`:** deferred. The client seeds only the first 50 liked boards (`User::LIKED_BOARD_REFS_LIMIT`, *Verified*), while `starred_board_ids` is uncapped. Adding them as-is would store likes 51 and up as board JSON with no pictures. If done later: the same cap and suggested-board filter on the server, from one shared constant, with a 60-likes spec.
2. **Platform-aware stall timeouts:**
   - **Web and Android:** the no-bytes clock starts when headers arrive (readyState 2), with a separate header deadline above `Rack::Timeout`'s 16 s, since a healthy batch can send nothing for longer than N seconds.
   - **iOS Capacitor app:** detected with `window.Capacitor.getPlatform() === 'ios'` (`utils/ipad_detect.js`); keeps a total-time ceiling only.
   - **Tests:** through the real transport (the test helper replaces the adapter's `ajax`), plus a device check.
3. **Android picture concurrency:** measure the native bridge write speed first (pictures cross it as base64), then raise the worker count, on a low-end device.
4. **Compression (proposed to Scot):**
   - only when the request carries a header that new clients send, so installed builds keep uncompressed answers;
   - with an ENV off switch;
   - the proxy route decided deliberately;
   - both native apps tested on devices;
   - CPU measured.
6. **A failed avatar download no longer fails the whole sync** (found by the sync UI suite, 2026-11-16).
   - **The bug:** `sync_user` rejects when saving the person's avatar picture fails, so a connection that drops at that moment ends the entire sync as failed ("failed to save user avatar", `services/persistence.js:3496-3500`).
   - **The fix:** treat a passing (network) failure of the avatar as non-fatal and retry it on the next sync. A full-storage failure still fails the sync.
   - **Tests:** the e2e scenario "the link drops during a sync and comes back" is red on #1322 until this lands, plus a unit test.
5. **Storage:**
   - request `navigator.storage.persist()` at the first sync on a **trusted** device only. The `device_trust` gate (`utils/offline_shell.js:263-266`) stays: a shared device's data should be evictable.
   - show `estimate()`;
   - detect a missing device database.

### Phase 2: pictures (NEEDS REWORK after review round 2; see section 10)

1. **Display-sized lossless WebP renditions:**
   - **Separate field:** returned in a separate, additive field (for example `image_renditions`), **never inside `image_urls`**. Clients read every `image_urls` key matching `<id>-` as a symbol-set alternate (`utils/button.js:627-633`), so an added key would show up as a new symbol library on old builds and cached app shells.
   - **Skins:** every skin variant needs its own rendition (skins rewrite the URL, `models/board.js:2108-2151`). The skin tone is chosen from the original URL, never from the rendition's.
   - **Test:** with an old-client fixture.
   - *Measured:* lossless WebP is 54% of PNG bytes.
2. **De-duplicate by content:**
   - a content hash per picture file, used only as a de-duplication key inside authenticated JSON;
   - picture storage keys stay secret-derived (`uploadable.rb:73-76`), never hash-named;
   - on a public-read bucket a hash-named URL would let anyone holding a picture (for example a photo of a child) check whether LingoLinq stores it.
   - The client stores pictures by hash and skips any it has. *Measured:* 12% of Core 60 picture bytes; more across skins, liked boards and supervisees is expected but not measured.
3. **Erasure:** renditions live under the original key prefix and are deleted with it (`remote_remove`), with a spec. Account deletion must remove them (GDPR, COPPA, FERPA).
4. **Binary on Safari:** store picture Blobs in IndexedDB instead of base64 data URIs (33% of picture storage).
5. **Button sets without the base64 proxy:** fetch them directly by signed URL. Pictures already go direct; the CDN already sends CORS.
6. **Caching headers:**
   - long-lived `Cache-Control` only for verified non-SVG pictures;
   - SVGs can be rewritten in place at the same URL after sanitising (`uploadable.rb:584, 605-619`), so they get a short lifetime or a new key on sanitise.

### Phase 3: one manifest per sync (NEEDS REWORK after review round 2; see section 10)

1. **Picture lists precomputed per board when the board is saved.** Picture URLs depend on the viewer (licences, preferred symbols, supporter role: `board.rb:2539-2544`, `json_api/board.rb:258-294`), and their cache is commented out (`board.rb:2561`). Without precomputing, a manifest for a supervisor's caseload would be the heaviest call in the app.
2. **New endpoint**, `GET /users/:id/sync_manifest`:
   - **Paging:** per root board, compressed.
   - **Contents:** every board the device should hold, with id, key and `current_revision`; the picture hashes and URLs for this viewer; the button-set revision; and revoked ids.
   - **Permissions:** the manifest and the batched board fetch use **one permission rule**, both reading current shares (`BoardRevisionsAccess`). Today `board_revisions` reads current shares while `users#boards` uses a 30-minute permission cache, so a just-shared board would be listed but not delivered, and a just-unshared one served for up to 30 minutes.
   - **Test:** a spec that shares and then unshares within that window.
3. **Client:**
   - **Compare:** diff the manifest against the database, not memory.
   - **Fetch:** changed boards in serial, compressed batches, then missing pictures by hash, several at a time.
   - **Delete:** remove what the manifest no longer lists (with revocation handling).
   - **Fallback:** the old walk stays when the manifest call fails.
4. **Size limits:** the manifest stays under Cloud Run's 32 MiB non-streamed cap and the 16 s `Rack::Timeout` for the largest caseload measured in phase 0.

### Phase 4: decide after measuring (not scheduled)

- **Bundles:**
  - only if phase 3 still leaves first syncs too slow;
  - keyed by viewer variant (skins, symbol sets, licences), per user, with short-lived signed URLs;
  - never a shared public bundle, which would leak licensed symbols or lose a person's chosen symbol set.
- **Native background download** of bundle files in the Capacitor app. iOS web apps stay foreground-only.

## 6. Expected effect (*estimate*)

**Assumptions:**
- a production Quick Core 60 first sync on Android, as measured anonymously (so without alternates or skins);
- 4 Mbps (500 KB/s) and 150 ms per request round trip;
- server and on-device processing not modelled.

On-device processing is real: each picture is read and crosses the Capacitor bridge as base64. Phase 0 measures it.

| Stage | Bytes moved | Requests | Rough time |
|---|---|---|---|
| Today | about 34 MB (1.35 MB JSON, 33 MB pictures) | about 2,150 (pictures 1 at a time) | about 5 to 8 min |
| After phase 1 (4 picture workers, gzip) | about 33 MB | about 2,150 (4 at a time) | about 2.5 min: 78 s of round trips, 66 s of transfer |
| After phase 2 (lossless WebP for PNGs, de-duplication) | about 30.2×0.88×0.54 + 2.6×0.88 + 0.36 ≈ 17 MB | about 1,900 | about 1.7 min |
| After phase 3 (manifest, batches) | about 17 MB | about 1,860 | about 1.6 min |

**Reading the table:**
- Concurrency buys most of the time; smaller pictures buy bytes and storage.
- Lossy WebP (26%) would bring phase 2 to about 9.6 MB. Not chosen (section 5).
- When nothing changed, automatic sync already makes one `sync_stamp` request. Phase 3 pays off for syncs where something did change, and for the many per-picture checks a sync does today.

## 7. Risks and invariants

Every phase must keep:
- **Isolation:** a person's boards never reach another person's device or database. New endpoints and bundles enforce the same view rules as today. Private bundles are per user, with short-lived signed URLs.
- **Nothing lost offline:** a failed or partial sync never deletes or replaces a working device copy (#1322's guards stay).
- **Revocation:** revoked boards are still removed (board_revocation.js).
- **Speak Mode:** never interrupted. The drawer stays hidden; the sync is never cancelled by using the board.
- **Old clients keep working:** new fields are additive; old endpoints stay until every client in use has moved.
- **No production data in non-production environments:** measurements use public templates and synthetic accounts.
- **Erasure:** every derived file (renditions, hashes) is deleted with its original and with the account.
- **Pictures stay unguessable:** storage keys stay secret-derived. A content hash is never part of a public URL.
- **Personalisation is preserved:** skins, symbol sets, licensed symbols and high-contrast pictures resolve exactly as today, per viewer.

Specific risks:
- **Compression costs CPU** on Cloud Run and runs outside `Rack::Timeout`. Measure before and after; decide the proxy route deliberately; test both native apps.
- **WebP and skins:** a rendition is missing for some skin variant, so a skinned picture 404s. Renditions are rendered for every variant and checked before the field is sent.
- **The backfill job** for renditions and hashes touches every picture: run it in batches on the `slow` queue.
- **The manifest permission rule:** the existing endpoints disagree. Choosing wrongly could hide shared boards or expose them. Adversarial review is required (it touches access to another user's data).

## 8. Decisions

**Decided by Traci (2026-11-16):**
- **Order:** phases 0, 1, 2 and 3; phase 4 decided after measuring.
- **Best-practice choices:** lossless WebP for symbols. Lossy would save more but risks fine lines, and is left for later.
- **No feature flags.**
- **One PR per phase, stacked on #1322.**

**Needed from Scot (infra):**
- why dev's pictures are inline, and what a fix touches on staging (they share one database);
- compression on Cloud Run: CPU cost, and whether the proxy route is included;
- `Cache-Control` for pictures on the CDN (non-SVG only). CORS is already in place.

## 9. Review round 1 (2026-11-16)

An `adversary` review at 38cad5029 returned "needs rework" with 12 findings. Each was checked in the code before this revision; the four that changed the plan most were re-read here (*Verified*).

| Finding | Rating | Disposition |
|---|---|---|
| Batches fan out (`next_batch` per stored board), so lifting the 100 cut-off multiplies concurrent heavy requests | High | Accepted. *Verified* `services/persistence.js:2966-2975`. Phase 1.1 makes batches serial first |
| A stall timeout aborts healthy downloads in the iOS app (no progress through CapacitorHttp) | High | Accepted. *Verified* `WebViewAssetHandler.swift:154`. Phase 1.2 is platform-aware |
| WebP or hash URLs inside `image_urls` collide with symbol-set alternates and skin rewriting | High | Accepted. *Verified* `utils/button.js:627-633`. Renditions go in a separate field; skins covered |
| Content-hash URLs on a public bucket leak whether a picture exists and break erasure | High | Accepted. The hash stays private; keys stay secret-derived; erasure invariant added |
| Picture lists are per viewer and uncached, so a manifest with them is expensive | High | Accepted. Precompute per board; page the manifest per root; measure a caseload first |
| The manifest and the batched fetch use different permission rules | Medium | Accepted. One rule; share/unshare spec |
| The measurement understates real syncs (anonymous: no alternates or skins) | Medium | Accepted. Phase 0 measures supervisor-shaped syncs |
| Section 6 arithmetic overstated (SVGs, round trips dominate, the no-change case, the dev ratio) | Medium | Accepted. Table recomputed for lossless WebP; ratio is 56×, not 20× |
| Android's single worker is not explained by shrinking (`size_image` returns at once for URLs) | Medium | Accepted. *Verified* `content-grabbers.js:740`. Phase 1.3 measures the bridge |
| SVG bytes can change at the same URL after sanitising, so long caching is unsafe for them | Medium | Accepted. Long caching only for non-SVG |
| Baseline drift: CORS is already on the CDN; #1322 is not in develop; the dev cause is unproven | Medium | Accepted. Labels corrected; 2.4 narrowed to button sets; dev cause is an open question |
| Deflater details: the proxy is JSON too; compression runs outside `Rack::Timeout`; iOS header passthrough | Low | Accepted. Phase 1.4 checks |

## Appendix A: sources

- Cloud Run quotas (32 MiB non-streamed response, 60 min request): https://docs.cloud.google.com/run/quotas
- Cloud Run does not compress by default (issue tracker, Google comment): https://issuetracker.google.com/issues/147185337 (secondhand); app-layer gzip sample: https://docs.cloud.google.com/run/docs/internet-proxy-nginx-sidecar
- Cloud CDN dynamic compression: https://docs.cloud.google.com/cdn/docs/dynamic-compression
- Rack::Deflater behaviour: https://raw.githubusercontent.com/rack/rack/main/lib/rack/deflater.rb
- Brotli support: https://caniuse.com/brotli ; zstd in Safari 26.3: https://webkit.org/blog/17798/
- XHR timeout is total time: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/timeout ; progress and Safari stream support: https://jakearchibald.com/2025/fetch-streams-not-for-progress/
- Backoff with jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- ETag and Range: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag , https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests ; Rails caching: https://guides.rubyonrails.org/caching_with_rails.html
- Sync protocols: https://doc.replicache.dev/strategies/global-version , https://rxdb.info/replication.html , https://docs.couchdb.org/en/3.5.1/replication/protocol.html , https://docs.powersync.com/usage/sync-streams , https://electric.ax/docs/api/http
- Background work: https://web-platform-dx.github.io/web-features-explorer/features/background-sync/ , https://caniuse.com/mdn-api_backgroundfetchmanager_fetch , https://developer.apple.com/documentation/foundation/downloading-files-in-the-background , https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started , https://capacitorjs.com/docs/apis/background-runner , https://capawesome.io/docs/sdks/capacitor/file-transfer/
- Storage: https://webkit.org/blog/14403/updates-to-storage-policy/ , https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ , https://web.dev/articles/persistent-storage , https://web.dev/articles/storage-for-the-web , https://developer.mozilla.org/en-US/docs/Glossary/Base64

**Not verified:**
- Cloud Run HTTP/3;
- Chromium's default limit on concurrent HTTP/2 streams;
- which brotli gem for Rack is maintained;
- whether Cloud CDN dynamic compression works in front of a Cloud Run backend.

## Appendix B: how the measurements were made (2026-11-15)

- **Requests:** read-only GETs of public content, no sign-in, user agent `lingolinq-sync-research`.
- **Board set:** `https://app.lingolinq.com/api/v1/boards/<key>`, breadth-first from `lingolinq/quick-core-60` through every button's `load_board`: 61 boards, 0 failures. Sizes are raw response bytes, with gzip at level 6.
- **Pictures:** every URL in the 61 boards' `image_urls` was downloaded once (2,085 files, 8 at a time). Sizes are response bytes; duplicates by SHA-1 of the body.
- **Re-encoding:** a random sample of 150 PNGs, with ImageMagick 6.9.12: `-resize 400x400> -quality 80` (WebP), `-define webp:lossless=true`, `-quality 60` (AVIF).
- **Dev compression check:** `https://dev.lingolinq.com/api/v1/boards?public=true&per_page=5` fetched with and without `Accept-Encoding: gzip`. Identical 10,045 bytes, no `Content-Encoding`.
- **Data retention:** nothing downloaded was kept in the repository. The copies were in a session scratch folder, deleted afterwards.

## 10. Review round 2 (2026-11-16)

An `adversary` review at 07bd4f5f1 found 13 issues.
- **Verdict:** phases 0 and 1 are ready with named corrections; phases 2 and 3 still need rework.
- **Checked here (*Verified*):** the database-delete path (`utils/dbman.js:684-688`) and the 50-liked-board cap.

| Finding | Rating | Disposition |
|---|---|---|
| Serial batching per user is not enough (supervisees run in parallel); waiting on device writes can stall a sync | High | Accepted into phase 1.1 |
| Starred roots in `board_revisions` would not match the 50-board seed cap | High | Accepted: deferred out of phase 1 |
| A separate rendition field leaves most picture readers, button sets and older app builds unaware of renditions | High | Phase 2 rework: store rendition bytes under the original URL's device key, so every reader and every build finds them |
| A device database version bump can delete a person's offline boards (an older shell gets a VersionError, and the second failed open deletes the database) | High | Phase 2 rework: no version bump (new fields inside existing rows), or make a VersionError non-destructive a release earlier |
| Picture lists precomputed at board save cannot follow per-viewer licences (subscriptions, supervisees, variant rewrites do not save the board) | High | Phase 3 rework: key by board revision plus viewer variant; invalidate on subscription, supervision and image changes; licence-expiry spec |
| The stall timer ignores time to first byte | Medium | Accepted into phase 1.2 |
| Compression has no opt-in or off switch for installed builds | Medium | Accepted into phase 1.4 |
| `persist()` at the first sync would remove the shared-device trust gate | Medium | Accepted into phase 1.5 |
| Device-side de-duplication by hash crosses users (one picture folder per device) and skin variants | Medium | Phase 2 rework: de-duplicate within a person's own rows, per variant as served; never delete a shared file without reference counts |
| Erasure must use the prefix sweep (`remote_remove_thumbnail_family`), not `remote_remove` | Medium | Phase 2 rework |
| A backfill on the `slow` queue can trigger queue-pressure mode (over 20,000 jobs) | Medium | Phase 2 rework: a self-rescheduling batch job with a queue-depth ceiling; estimate S3 and CPU cost from the `ButtonImage` count |
| Section 6 request counts inconsistent after phase 1 batching; the 4-worker gain not yet justified | Low | Noted: section 6 is an upper bound to re-estimate from phase 0 measurements |
| Phase 0: name the measurement environment (staging shares dev's database); a client byte counter sees decoded sizes | Low | Accepted: phase 0 runs on a private local e2e database with synthetic accounts; transfer bytes are taken from the server side or the test link (`e2e/support/sync-link.js`) |

## 11. Status (2026-11-19)

The proposal is kept as written above; this section records what happened since, so it is not read as a plan of
record for work already done or overtaken.

Shipped to develop:
- #1326: each parked board keeps its own retry wait; a resumed retry goes through `add_thread`'s limit.
- #1327: a profile, supervisor, contact or tag picture never fails the sync (phase 1 item 6, wider than proposed:
  `sync_contacts` and `sync_tags` also read `this` inside callbacks, so any supervisor with a picture failed every
  sync of a communicator).
- #1334: a picture cut off by a dropped link is tried again.

Open PRs: #1328 (offline, the boards page and Basic's Boards tab list "Boards on This Device"), #1330 (a board saved
late in a sync is not downloaded again on slow links), #1336 (Sync Details: no percentage, the drawer's wording).

Measured (local, synthetic account `synth_big`: home board and 56 folders of about 0.75 MB; Chrome with a Pixel 7
profile; a local link with a shared bandwidth cap and 100 ms latency; the old code is develop just before #1322):

| Link | Old | New (#1322) |
|---|---|---|
| 4 Mbps | 92 s, 41.9 MB, 57/57 boards | 91 s, 41.9 MB, 57/57 |
| 1.5 Mbps | 301-335 s, 51-56 MB, 57/57 | 240 s, 42 MB, 57/57 |
| 0.8 Mbps | 478 s, 43 MB, 57/57 | 869 s, 80.6 MB, 57/57 |

The 0.8 Mbps result was a regression in #1322: boards that timed out while still downloading were parked, their late
answers stored, and the retry after the walk downloaded each again by key (traced: 56 requests by id, then 53 by key).
#1330 fixes it. Locally the old code never failed a board, so the phone's original failure (9 Core 60 folders of
0.9 to 2 MB) is not reproduced by this setup; phase 0's on-device measurement is still the missing evidence.

## 12. Implementation plan: every phase, as one design (2026-11-20)

Traci chose to build phases 0 to 3 together (2026-11-20): "we really need to be taking a holistic overview of
everything when implementing." This section is the plan of record. Where it differs from sections 5 to 10, this
section wins. Facts were re-checked against develop f581c0066 on 2026-11-20 (four read-only researchers, key claims
re-read; log: `2026-11-20_sync-proposal-implementation.md`). Labels as before: *Verified* (read at f581c0066),
*Traced* (researcher, re-checked in each item's fact sheet before it carries a fix), *Estimate*.

### 12.1 What changed since section 5 was written

- **Done:** phase 1 item 6 (a failed avatar no longer fails the sync; #1327, `optional_picture`). #1330 merged.
- **Wider than written:**
  - Only the utils copy's single-board `findRecord` got the 60 s attempt (`utils/board_download.js:19`). The 25-board
    batches, `board_revisions` and the proxy still run on 8 s then 20 s (`utils/extras.js`). Phase 1.2 covers them.
  - `persist()` has a second, ungated caller: `requestQuota` maps to `navigator.storage.persist()`
    (`utils/capabilities.js:56`), reached from `root_dir` on Chrome. Phase 1.5 must gate it too.
  - `image_urls` are personalised for the **caller** (a supervisor syncing a supervisee gets the supervisor's
    variant). *Traced*. Phase 3's viewer key must name the caller, as today, until a decision says otherwise.
- **Found, new:**
  - **Out-of-date picture rows (defect).** `find` sets `record.raw.important` (`services/persistence.js:425`) but
    tests `record.important` (:429), so every row persisted over a week ago is `outdated`, and
    `usable_database_copy` rejects it. On browsers with no file storage this likely re-downloads week-old pictures
    on every sync (*to measure in phase 0*). New item 1.7.
  - **Pictures survive account deletion (existing erasure gap, not caused by this work).** `flush_user_content`
    sweeps ButtonSounds and UserVideos by `user_id` but not ButtonImages (`lib/flusher.rb:456-461`); boards reach
    images only through `BoardButtonImage` rows, which nothing writes (`app/models/board.rb:1717`). Not in the
    findings register. Phase 2's erasure work depends on the fix; how it is tracked is Scot's call (12.6).
  - **Device storage facts that shape phase 2** (*Traced*, spot-checked): one picture folder per device shared by
    every user; file names are a deterministic function of the URL plus the content type's extension; nothing counts
    references, and `store_url_now` deletes the file at a url's name before every write (`services/persistence.js:1758`,
    utils copy :1797; corrected after review round 3, F3); `dataCache` rows are free-form JSON in `raw`, so new fields need no
    `dbversion` bump (4); on the no-file path `url_cache` is never filled.
  - `button_images.file_hash` exists and is unused: phase 2's content hash goes there (no migration for the column).
  - Button sets stay on the proxy only because a direct request "has not been tried against production"
    (`utils/direct_fetch.js:6-8`); the file is client-encrypted at a secret-derived CDN path. No signed URL is needed.

### 12.2 Before any of this lands (prerequisites)

1. **#1336 (Sync Details) merges first.** It is a draft, conflicts with develop, and rewrites the places phase 0
   writes: the `log.push` sites in `sync` and `end_canceled_sync`, `sync_log_store.entry_copy`, and Technical details.
   Another session owns it.
2. **#1328 (Boards on This Device) merges before phase 3:** phase 3 changes which device rows are current, and
   `offline_board_list` reads them, including #1336's `content` tag.
3. **Test hygiene in `persistence-sync-test.js` (#1121, #589) before phase 1:** every item adds tests to that file.
   Fold the fix in here rather than file it again.

Work that does not depend on these (the server side of phases 2 and 3, the measurement seed, the erasure fix) starts
now, on this branch.

### 12.3 Shared building blocks (built once, used by several phases)

| Block | Used by | Where |
|---|---|---|
| **Sync counters**: start time, duration, requests, bytes (transfer size where the browser reports it, decoded size otherwise, labelled), peak concurrent requests, failures by kind; carried through `entry_copy` | 0, and the before/after evidence for every later item | `services/persistence.js` (+ utils copy), `utils/sync_log_store.js`, a new `utils/sync_counters.js` |
| **Transport limits**: one module for every sync request's timing (header deadline, no-bytes clock, total ceiling), with an iOS-app rule | 1.2, 1.1 (batch budget), 3 (manifest) | new `utils/sync_transport.js`; `utils/extras.js`, `utils/board_download.js`, `store_url_now` |
| **Platform helper**: `is_ios_app()` from `window.Capacitor.getPlatform()` | 1.2, 1.3 | `utils/ipad_detect.js` or a new `utils/platform.js` |
| **Device row contract** (review round 3, F1-F3): everything a reader needs is under the ORIGINAL url's key, in the fields every build already reads (`local_filename`, `local_url`, `data_uri`). New fields are metadata only, never the only path to the picture. A de-duplicated picture's file is hash-named and never rewritten by a url's store path; a row points at it only after checking it exists, and the hash entry is written only after the row commits, one row per hash. Tested by running the previous build's `find_url` (from `git show`) on new rows, offline | 1.7, 2.1, 2.2, 2.4 | `store_url_now`, `find_url`, `prime_caches` |
| **Erasure of every derived file**: one server helper that deletes an upload and every sibling it owns (`.raster.png`, renditions), with a spec per suffix | 2.1, 2.3, the account-deletion fix | `lib/uploader.rb`, `uploadable.rb`, `lib/flusher.rb` |
| **One permission rule** for "which boards may this device hold": `board_revisions`' four-part rule (public and not shallow; own; a shallow clone by `allows?`; otherwise current shares through `BoardRevisionsAccess`), moved into the service and used by `board_revisions`, `users#boards` and the manifest, with revoked ids built by the same `disclosed_ids` / `linked_from` logic (review round 3, F6). `boards#show` keeps the cached check: the one remaining 30-minute path, written down | 1.1 batches, 3 manifest | `users_controller.rb:798-812`, `app/services/board_revisions_access.rb` |
| **Synthetic measurement seed**: a supervisor with three supervisees on different skins and symbol sets, sounds, a large caseload; extends `e2e/support/sync-users.rb` | 0, and every item's before/after | `app/frontend/e2e/support/` |

### 12.4 The work, item by item

Each item is sync, offline or data work: fact sheet, red test first, adversarial review of the item's proposal,
falsification after it lands (`/fix-proposal`). Items marked **(dual review)** touch access to other users' data,
infra or deploy config.

**Phase 0: measure**
- 0.1 Sync counters (12.3). Technical details shows a plain-language summary (12.6); the full counters go in the
  sync log. No percentages (Traci 2026-11-16).
- 0.2 The measurement seed and a scripted run of the e2e suite that records the counters for each shape and link
  speed, before and after each phase. Local private database only.
- 0.3 Measure item 1.7's effect (a second sync more than a week later, simulated clock) and the first-sync share of
  public catalog boards (#1221).
- 0.4 Dev's inline pictures: Scot (12.6). Nothing on this branch writes to dev or staging data.

**Phase 1: quick wins**
- 1.1 Batches: one batch slot per device (supervisee syncs share it), `next_batch` once per response (after the
  store push, not after device writes), cancel and sync-id checks, a time budget after which the walk starts anyway,
  then lift the 100-board cap. First, the sync stops seeding public catalog boards (#1221; Traci 2026-11-20, 12.6),
  on the client's seed list only: `board_revisions` is shared by older clients and by revocation, so it is unchanged.
  A batch still in flight when the time budget ends finishes and is stored; the walk skips boards it delivered. Folds in #1341's "a save that never settles holds the walk".
- 1.2 Transport limits (12.3) for single boards, batches, `board_revisions`, the proxy and pictures: the no-bytes
  clock starts at headers; a header deadline above `Rack::Timeout` (16 s); total ceiling only in the iOS app. Device
  check on iOS.
- 1.3 Android picture concurrency: measure the bridge first (0.2 on the emulator, then a low-end phone), then raise
  `max_watchers` for Android to the measured value.
- 1.4 Compression **(dual review: infra)**: gzip only when the request carries a header new clients send, an ENV off
  switch, the proxy route decided, CPU measured, both native apps checked. Needs Scot's yes before merge.
- 1.5 Storage: request `persist()` only on a trusted device (the existing gate). On the `requestQuota` path gate only
  the `persist()` call and leave `root_dir`'s result unchanged, so no device switches between file and no-file storage
  (review round 3, F8); test both trust states against an existing file-backed row; show `estimate()` in Technical details; detect a missing device database and say so.
- 1.7 Out-of-date picture rows: read the flag where it is set; key `importantIds` by the stored (personalised) url,
  not `image.url`; and merge the lists across the root and supervisee syncs instead of each sync overwriting them
  (`services/persistence.js:2348, 2618, 2621`; review round 3, F9). Red test first, including a supervisor device and
  a skinned picture.

**Phase 2: pictures (redesigned)**
- 2.1 Renditions: the server makes a lossless WebP for raster pictures (never SVG) **on LingoLinq's own upload hosts
  only** (library and skin-variant urls on other buckets keep the original), sized from the largest rendered button
  times screen density, and never for boards the sync keeps big (`services/persistence.js:3184`). Licensed symbol
  sets (PCS, SymbolStix) are excluded until their licences are checked (review round 3, F10). Stored as a sibling of
  the original key (`<key>.r<size>.webp`), in a self-rescheduling batch job with a
  queue-depth ceiling (stays under `QUEUE_SLOW_BOG`). Board JSON gains an additive map, original url to rendition url,
  only for renditions that exist. **The device stores the rendition's bytes under the ORIGINAL url's key** (12.3), so
  every reader and every older build that shares the device finds the picture. A url with no rendition, or an older
  client, stores the original as today. The skin tone is chosen from the original url.
- 2.2 De-duplication: the server computes a hash of **the exact file each served url points at** and sends it only
  when that url is the ButtonImage's own file (never for a skin variant, a library alternate or a personalised
  rewrite), only in authenticated board JSON (review round 3, F4). Existing `button_images.file_hash` values are
  untrusted (the column predates this work) and are recomputed. The client keeps one row per hash **per person**,
  pointing at a hash-named device file that no url's store path rewrites; it checks the file exists before reusing
  it and writes the hash row only after the picture row commits (12.3, F3). Test with skin variants. Any future file
  deletion counts references first (an invariant with a test).
- 2.3 Erasure: the 12.3 helper deletes renditions with their original; account deletion closes the existing gap
  (Traci 2026-11-20: fixed here). **Policy needed first (review round 3, F5):** board copies keep the original's
  picture ids (`app/cloners/board_cloner.rb:101`), and the S3 file is removed once no ButtonImage row shares its url
  (`uploadable.rb:144-152`), so deleting a person's picture records strips every copy of their boards, public ones
  included. Options: move pictures that other people's boards still use onto their copies, or delete and accept the
  loss. Decided with Traci, Scot and legal before coding; spec with a public board someone else copied. **(dual review: another
  user's data)**: a picture record can be shared by boards that other people copied (to check in the fact sheet).
- 2.4 Safari and Firefox (no file storage), in two releases (review round 3, F2): first ship a build that reads a
  Blob first (`find_url`, `usable_database_copy`, and new `prime_caches` code for the no-file path, which today
  returns early at `services/persistence.js:1301-1305`) while still writing data URIs; only after that build is the
  oldest shell in use, write Blobs (outside `raw`, which is JSON) without the data URI. A write-then-read probe on
  Safari falls back to data URIs. SQLite (native) is unchanged.
- 2.5 Button sets direct: request the encrypted file from the uploads CDN like a picture (type `json`), with the
  proxy as fallback; verified first with a read-only request against production (12.6).
- 2.6 Caching headers: long-lived `Cache-Control` on renditions and non-SVG originals at upload; SVGs short. CDN
  behaviour is Scot's (12.6).

**Phase 3: one manifest per sync (redesigned)**
- 3.1 `GET /users/:id/sync_manifest`, paged per root, compressed when 1.4 allows: every board the device should
  hold (id, key, `current_revision`), liked boards within the same 50-board cap the client seeds
  (`User::LIKED_BOARD_REFS_LIMIT`, one shared constant), the button-set revision, revoked ids, and a **viewer key**: a hash of what
  personalises pictures for the caller (enabled protected sources, preferred symbols, supporter role, skin
  preferences). **No precomputed picture lists**: pictures still come in board JSON, so licences and supervision
  changes need no invalidation scheme; when the viewer key changes, the client re-fetches the boards' JSON. The picture pass covers every board on the
  device on every sync, not only changed boards (a supervisee's skin change, a new supervisee; review round 3). **(dual
  review: another user's data)**.
- 3.2 One permission rule (12.3) for the manifest and `users#boards`; a spec that shares then unshares inside the
  30-minute window.
- 3.3 Client: diff the manifest against the device database (not memory); fetch changed boards through 1.1's serial
  batches; fetch missing pictures by 2.2's hashes; only boards the server lists as **revoked** are marked (combining the root's and every supervisee's lists before
  deciding); a board that is merely no longer listed (an old home set, a like past 50) is left alone, since a
  revocation mark blocks opening it offline (`utils/board_revocation.js:25-31`; review round 3, F7). Nothing with
  unsynced local edits is touched (#1301); the walk stays as the fallback.
- 3.4 Limits: the largest synthetic caseload's manifest page stays under Cloud Run's 32 MiB cap and `Rack::Timeout`;
  shares the picture-lookup cost work with #1219.

**Phase 4** stays undecided until phase 3 is measured (section 5).

### 12.5 Order of work

1. Now, on this branch: 0.2 (seed and measurement harness), 0.1 (counters, behind #1336's log shape), the server
   halves of 2.1 to 2.3 and 3.1 to 3.2, item 1.7.
2. After #1336 merges: 0.1's log and Technical details, 1.5, 1.2.
3. After the test hygiene fix: 1.1 (starting with the #1221 seed change), 1.3.
4. After #1328 merges: 2.2 on the client, then 3.3 (it uses 2.2's hashes); 2.4's reader release, 2.5, 3.4; 2.4's
   writer change only after its reader build is the oldest in use.

Ordering rules from review round 3 (F11): the 2.3 erasure helper exists before the 2.1 rendition writer runs (no
orphaned renditions); the backfill's ceiling stays under both `QUEUE_SLOW_BOG` and `queue_pressure?`'s QUEUE_MAX/2
(`config/initializers/resque.rb:203-228`), and the pre-existing Integer-vs-ENV-string comparison at `resque.rb:206` is
fixed first; every new device-format writer (2.1 renditions, 2.2 hash rows, 2.4 Blobs) has a server-side off switch,
so a rollback can stop new rows without a client release (not a UI flag; Traci to confirm, 12.6).
5. Measure the whole set (0.2) before and after; update section 6 with measured numbers.

Rough effort: about 5 to 6 weeks of work, plus the waits for Scot and devices (*estimate*). The branch lands as one
PR (Traci's instruction); review is sized to it: `/review-pr` plus `/adversary-review`, and a security review for 1.4,
2.3, 3.1 and 3.2.

### 12.6 Decisions and help needed

**Decided by Traci (2026-11-20):**
- **#1221: the first sync downloads only the person's own boards:** home, sidebar, liked, supervisees' boards and
  Crisis Vocabulary. Public catalog boards download when someone opens or likes one. This lands in 1.1, before the
  cap is lifted.
- **Technical details shows a plain-language summary**, informative but not technical (for example, how long it
  took, how many boards, how much was downloaded, problems found, storage used). The full counters go in the sync
  log for support and diagnosis. The wording and layout are mocked up for Traci's OK before they are built.
- **The erasure gap is fixed inside 2.3**, in this branch (not as a separate fix ahead of it).

**Also needed from Traci (review round 3):**
- Server-side off switches for the new device-format writers (2.1, 2.2, 2.4), as a rollback tool, not a UI flag.
- The 2.3 policy for pictures other people's copied boards still use (with Scot and legal).

**From Scot:**
- Compression on Cloud Run (1.4), CPU budget, and the proxy route.
- `Cache-Control` and CDN behaviour for uploads (2.6); a read-only check of a direct button-set request (2.5).
- Storage and CPU cost of renditions for every ButtonImage, and the backfill's pace (2.1).
- Why dev's pictures are inline (0.4).
- The erasure gap's register entry (the fix itself is in 2.3, Traci 2026-11-20).

**Devices:** an iPhone or iPad with the native app (1.2), a low-end Android phone (1.3), both native apps (1.4),
folded into #1314's device test.

### 12.7 Review round 3 (2026-11-20)

An `adversary` review of section 12 at 89db2125d returned "needs rework" with 12 findings (code at f581c0066). F3, F4,
F5, F6 and F9 were re-read here before the corrections (*Verified*: `services/persistence.js:1758`,
`lib/json_api/board.rb:294`, `app/cloners/board_cloner.rb:101`, `uploadable.rb:144-152`, `users_controller.rb:798-812`,
`importantIds` in `services/persistence.js`).

| Finding | Rating | Disposition |
|---|---|---|
| F1 New pointer fields unreadable by older shells or after a rollback | High | Accepted: 12.3 device row contract (existing fields carry the path; new fields metadata only; previous-build reader test) |
| F2 Blobs outside `raw` blank pictures for older shells | High | Accepted: 2.4 in two releases (reader first), probe and fallback |
| F3 `store_url_now` deletes the file before every write | High | Accepted: 12.1 corrected; hash-named files, existence check, write order, one row per hash |
| F4 One hash per ButtonImage does not match served urls | High | Accepted: hash per exact served file; only the image's own url |
| F5 Account erasure strips other people's copied boards | High | Accepted: policy decision before coding (12.6) |
| F6 Wrong permission rule named | High | Accepted: the four-part rule moved into the service for all three endpoints; `boards#show` documented |
| F7 "Marked" blocks boards that were never revoked | Medium | Accepted: only server-revoked ids, combined across users |
| F8 Gating `requestQuota` flips file storage | Medium | Accepted: gate only `persist()` |
| F9 Item 1.7 partial (overwritten lists, wrong key) | Medium | Accepted: key by stored url; merge across syncs |
| F10 Rendition scope undefined (other buckets, keep-big, licences) | Medium | Accepted: own upload hosts only; skip keep-big; licensed sets excluded pending licences |
| F11 Rollback and ordering | Medium | Accepted: server-side writer switches (Traci to confirm); helper before writer; 2.2 before 3.3; queue ceilings; `resque.rb:206` fixed first |
| F12 Smaller gaps (old `file_hash` values, starred in manifest, picture pass scope, where #1221 lands, in-flight batches) | Low | Accepted: each written into its item |

The reviewer's verdict also said phase 0, 1.2 and 1.4 can start now; 1.5, 1.7, F7 and F10 were named corrections, now
made. A further review of the reworked 12.3, 2.2, 2.3 and the access rule follows before those items start.
