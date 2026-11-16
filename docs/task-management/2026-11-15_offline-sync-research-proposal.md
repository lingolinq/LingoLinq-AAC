# Offline board sync: research and proposal (2026-11-15)

Author: Traci Day, with Claude (opus-5.5). Status: proposal for review; nothing here is built.
Follows #1322, which fixed the specific failures on Traci's Android phone without changing the sync design.

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
- **Dev:** Quick Core 60 folders are 1 to 2 MB each, because dev's upload bucket refuses uploads and pictures fall back to inline base64 inside the board JSON.
- **Production:** the median board is 27 KB.

The phone failure that #1322 fixed was amplified by this. *Measured and verified.*

**Finding 3: against current best practice, the gaps are:**
- no response compression;
- one request per picture, and only one picture download at a time on Android;
- full-size PNGs where a display-sized WebP is a quarter of the size;
- no de-duplication of identical pictures;
- total-time timeouts that throw away a slow download in progress;
- no way to resume a download;
- a discovery walk instead of a single change manifest;
- nothing that continues in the background.

**Recommendation:** fix it in phases, inside the current data model. Do not replace the sync with an off-the-shelf sync engine.
1. **Phase 1 (small, low risk):**
   - compress API responses;
   - use stall timeouts instead of total-time ones;
   - raise picture download concurrency on Android;
   - fix the batching gaps;
   - make dev representative.
2. **Phase 2 (largest byte savings):**
   - serve display-sized WebP pictures;
   - de-duplicate pictures by content;
   - store pictures as binary on Safari;
   - stop routing pictures through the base64 proxy.
3. **Phase 3:** one change manifest per sync, then compressed batched fetches.
4. **Phase 4:** decide only after measuring phases 1 to 3. Either a per-board-set bundle file, or native background download in the Capacitor app.

Modelled on a 4 Mbps Android connection, a production Core 60 first sync goes from roughly 5 to 8 minutes today to about 1.5 minutes after phases 1 and 2 (*estimate*, section 6).

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
  - **Batched fetch:** stale boards are fetched in batches of 25, one batch after another, **only when fewer than 100 are stale** (*Verified*, the `< 100` check), falling back to one request per board.
  - **Seeds:** home, sidebar, starred and Crisis Vocabulary. Starred boards are seeded but are not in `board_revisions` unless the flag is set, so they never batch.
  - **Link following:** breadth-first, 6 threads on mobile and 10 otherwise.
  - **Board state:**
    - "downloaded" with no request when the in-memory record is under 5 minutes old;
    - "cached" by revision plus `known_on_device`;
    - otherwise reloaded.
- **Pictures:**
  - **Queue:** every button picture and sound goes through one global queue: 3 workers, 2 on mobile, **1 on Android** (*Verified*, `max_watchers`, S:1502-1507).
  - **Fetch:** CORS XHR as a blob, 45 s, falling back to the base64 proxy. Android shrinks pictures after download.
  - **Storage:** native apps and Chrome write a file plus a `dataCache` row. On Safari the picture is a data URI inside the IndexedDB `dataCache` row, about a third larger (stored in `dataCache` *Verified*, data-URI form *Traced*).
  - **De-duplication:** by URL only, which misses the 12% stored under different URLs.
- **Timeouts:**
  - every limit is total time (a jQuery `timeout` or `setTimeout`);
  - a GET's first attempt gets 8 s, later ones 20 s, up to 3 attempts, each from zero;
  - boards now get one 60 s attempt (#1322);
  - nothing resumes (no `Range`) and nothing detects a stall.
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
| Serve images at display size, in modern formats | general practice; WebP supported since iOS 14 | Full PNGs, median 250 px, max 500 px | About 74% of picture bytes (*Measured*, lossy WebP) |
| One change manifest per sync (cursor or version map), then fetch only what changed | *Sourced*: Replicache, RxDB, CouchDB docs | `board_revisions` exists but skips starred boards; batching stops at 100 stale | Partial: the right idea, with gaps |
| Batch requests; "fewer, larger transfers" | *Sourced*: Apple URLSession guidance | Batches of 25 for some boards; pictures one per request | Large for pictures |
| Conditional requests (ETag, 304) | *Sourced*: MDN, Rails guide | Weak ETag sent, never used | Small: a manifest makes it mostly unnecessary |
| Stall timeouts, not total-time; capped retries with jitter | *Sourced*: MDN XHR timeout, AWS | Total-time only; retries from zero; parked retries with jitter (#1322) | Large: the root cause of the phone failure |
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

Effort figures are rough estimates for planning, not commitments.

### Phase 0: measure first (about 1 day)

- **Count each sync.** Record bytes, requests, duration and failures per sync in the sync log entry (client only, no new data leaving the device). Show them in "Technical details". This is how each later phase proves its gain.
- **Make dev representative.** Fix dev's upload bucket so pictures are files, as in production, and re-save the affected dev boards. Otherwise every dev test overstates board sizes about 20 times. Infra (Scot).

### Phase 1: quick, low-risk wins (about 3 to 5 days)

1. **Compress JSON API responses:**
   - `Rack::Deflater`, limited to `application/json` with `:include`;
   - JSON measured at 3.8 to 4× smaller.
   - Checks before shipping:
     - Cloud Run CPU per request;
     - nothing on the client depends on `Content-Length`, which Deflater removes;
     - `Rack::Timeout` (16 s) still holds for the largest responses.
2. **Stall timeouts.** Replace the total-time limits on board and picture downloads with a stall timeout: abort only after N seconds with no bytes, using XHR `onprogress`, the most reliable option on Safari. Keep an overall ceiling. This removes the root cause #1322 worked around with a 60 s limit.
3. **Picture concurrency on Android:**
   - find out first why Android uses one worker (it shrinks pictures after download, which may be memory-bound);
   - then raise it, measured on a low-end device;
   - with 1 worker, round trips dominate (section 2.3).
4. **Batching gaps:**
   - include starred boards in `board_revisions`, so the seeds and the server agree;
   - send stale boards in pages of 25 with no 100-board cut-off.
5. **Storage:**
   - request `navigator.storage.persist()` at the first sync, not after it;
   - show `estimate()` in Sync Details;
   - detect a missing database (eviction) and say so instead of failing quietly.

### Phase 2: pictures, which are the bytes (about 1.5 to 3 weeks)

1. **Display-sized WebP renditions:**
   - generate a WebP rendition (longest side capped at about 400 px) when a picture is uploaded or imported, and backfill existing ones in a background job;
   - add it to `image_urls` as an alternate the client prefers; keep the PNG original for editing and export;
   - *Measured:* lossy WebP is 26% of PNG bytes, lossless 54%.
   - **Decision for Traci and SLP reviewers:** lossy or lossless for symbols. Lossy needs a visual check on high-contrast and fine-line symbol sets before it is chosen.
2. **De-duplicate by content:**
   - store a content hash per picture file, sent alongside each URL;
   - the client stores pictures by hash and skips any it has;
   - *Measured:* 12% within Core 60. More across liked boards, copies and supervisees (*estimate*, not measured).
3. **Binary on Safari:** store picture Blobs in IndexedDB instead of base64 data URIs (33% of picture storage).
4. **No base64 proxy for pictures:** add CORS headers on the CloudFront and S3 picture origin so the direct fetch always works. Fetch button sets directly by signed URL, not as base64 JSON through `/search/proxy`. Infra (Scot).
5. **Caching headers:** serve pictures with long-lived `Cache-Control` (the URLs are already unique per file), so the browser cache and the sync agree.

### Phase 3: one manifest per sync (about 2 to 3 weeks)

1. **New endpoint**, `GET /users/:id/sync_manifest`. One compressed response listing every board the device should hold (home, sidebar, starred and liked, Crisis Vocabulary, all their folders), each with:
   - id, key and `current_revision`;
   - the picture content hashes and URLs it needs;
   - the button-set revision for seed boards;
   - revoked ids.
   It extends `board_revisions` and reuses `BoardRevisionsAccess` for permissions. Its permission rule is decided once and documented (caller or target user; see 2.1).
2. **Client:**
   - **Compare:** diff the manifest against the database, not memory. Removes the 5-minute "fresh" shortcut and the warm-up overlap for sync purposes.
   - **Fetch:** changed boards in compressed batches of 25 to 50, then missing pictures by hash, several at a time.
   - **Delete:** remove what the manifest no longer lists (with the existing revocation handling).
3. **Safety:**
   - the old walk stays as the fallback when the manifest call fails;
   - the manifest must be streamed or paged to stay under Cloud Run's 32 MiB non-streamed cap and `Rack::Timeout`'s 16 s for very large caseloads.

### Phase 4: decide after measuring (not scheduled)

- **Bundles (option C)** if phase 3 still leaves first syncs too slow on the slowest real links. Most likely for the native app, paired with background `URLSession` and WorkManager downloads.
- **Native background sync** in the Capacitor app for bundle files only. iOS web apps stay foreground-only, which is a platform limit.

## 6. Expected effect (*estimate*)

**Assumptions:**
- a production Quick Core 60 first sync on Android;
- 4 Mbps (500 KB/s) and 150 ms per request round trip;
- requests overlap only as far as the worker counts allow;
- server time is not modelled.

| Stage | Bytes moved | Requests | Rough time |
|---|---|---|---|
| Today | about 34 MB (1.35 MB JSON, 33 MB pictures) | about 2,150 (pictures 1 at a time) | about 5 to 8 min |
| After phase 1 (gzip, 4 picture workers) | about 33 MB | about 2,150 (4 at a time) | about 2.5 min |
| After phase 2 (lossy WebP, de-duplication) | about 8 MB | about 1,900 | about 1.5 min |
| After phase 3 (manifest, batches) | about 8 MB | about 1,860 (boards in batches) | about 1.3 min; a later sync with nothing changed is 1 request |

Later syncs are where phase 3 pays most: today, a sync with nothing changed still walks the tree and checks every picture against the device.

## 7. Risks and invariants

Every phase must keep:
- **Isolation:** a person's boards never reach another person's device or database. New endpoints and bundles enforce the same view rules as today. Private bundles are per user, with short-lived signed URLs.
- **Nothing lost offline:** a failed or partial sync never deletes or replaces a working device copy (#1322's guards stay).
- **Revocation:** revoked boards are still removed (board_revocation.js).
- **Speak Mode:** never interrupted. The drawer stays hidden; the sync is never cancelled by using the board.
- **Old clients keep working:** new fields are additive; old endpoints stay until every client in use has moved.
- **No production data in non-production environments:** measurements use public templates and synthetic accounts.

Specific risks:
- **Compression costs CPU** on Cloud Run. Measure before and after; include only JSON.
- **Lossy WebP may soften fine symbol lines.** It needs a visual review; lossless is the safe fallback.
- **The backfill job** for renditions and hashes touches every picture: run it in batches on the `slow` queue.
- **The manifest permission rule:** the existing endpoints disagree. Choosing wrongly could hide shared boards or expose them. Adversarial review is required (it touches access to another user's data).

## 8. Decisions needed

1. **Traci:** proceed in this order (0, 1, 2, 3, then decide 4)?
2. **Traci with SLP reviewers:** lossy or lossless WebP for symbols, after a visual check.
3. **Traci:** feature flags. #1322 shipped without one because it was a fix. Phases 1 and 2 are fixes in the same sense. Phase 3 changes the sync protocol, and a flag would let it roll out to a few accounts first.
4. **Scot (infra):**
   - fix dev's upload bucket;
   - CORS and `Cache-Control` on the picture CDN;
   - review of the CPU cost of compression on Cloud Run.

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
