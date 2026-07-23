# Speak-mode board cache latency — working log

**Goal:** Map what/when is cached for speak-mode board opens, measure why opens still feel long, propose one verified fix.

**Branch:** `docs/melissa-speak-mode-board-cache-diagnosis`

## Confirmed UI / flags (local `lingolinq` user)

| Item | Value | Evidence |
|------|--------|----------|
| `board_view_style` | `modern` (board-detail) | `User#preference_defaults` default `'modern'`; local user `settings.preferences.board_view_style` = `modern` |
| `background_board_prefetch` | **ON** (global) | In `ENABLED_FRONTEND_FEATURES` ([`lib/feature_flags.rb`](../../lib/feature_flags.rb)); `FeatureFlags.feature_enabled_for?` → `true` for `lingolinq` |
| Home board | `lingolinq/vocal-flair-84` (`1_635`) | 96 downstream boards |

Default speak path: `user.board-detail` → session `boardDetailCache` (5 min TTL) → miss hits `GET /api/v1/boards/:key/tree`.

## Caching map (brief)

1. **Session** — [`board_detail_cache.js`](../../app/frontend/app/utils/board_detail_cache.js): raw JSON, 5 min TTL; warmed by open + `prefetch_for_user` (home always; liked/owned/public when flag on).
2. **Offline** — IndexedDB/SQLite via persistence: boards, images, sounds, buttonsets, `dataCache`; sync stamp ~5 min; force sync >48h.
3. **Server** — no HTTP/Redis body cache on board `show`/`tree`/`bulk`; lite serialize for tree; button-set S3/CDN separate.

## Instrumentation

Opt-in client timings (no console noise by default):

- [`app/frontend/app/utils/board_cache_diag.js`](../../app/frontend/app/utils/board_cache_diag.js)
- Wired into [`routes/user/board-detail.js`](../../app/frontend/app/routes/user/board-detail.js)

Enable in browser:

```js
localStorage.setItem('ll_board_cache_diag', '1');
// reload, open a board, then:
window.__LL_BOARD_CACHE_LOG
```

Marks: `model:start` → `model:cache_hit` | `model:cache_miss` → `model:tree_response` → `model:root_ready` → `setup:prime_*` → `setup:grid_built` → `warm_images:*` / `setup:buttonset_*`.

## Measurement (2026-07-23, local DB, user `lingolinq`)

Rails runner mimicking `BoardsController#tree` (`as_lite: true`, `skip_subs: true`):

| Step | Time | Size |
|------|------|------|
| Root only (`vocal-flair-84`, 142 buttons) | **0.048 s** | ~1.5 MB |
| Full tree (root + **96** descendants) | **1.95 s** serialize | **~84 MB** JSON |
| Sample descendant boards | — | 1.5–4.0 MB each |

Earlier non-lite serialize was ~6.3 s / ~160 MB (wrong opts); lite path is what production uses.

### Critical path verification

[`routes/user/board-detail.js`](../../app/frontend/app/routes/user/board-detail.js) `model()`:

- Comment says resolve when **root** is ready and cache descendants in background.
- Implementation awaits the **full** `GET …/tree` response (root **and** all descendants) before `handleRoot` / `resolve`.
- Therefore a cold open of this home board cannot paint until ~2s+ server work **plus** transferring/parsing ~84 MB — even though paint only needs the ~1.5 MB root (~50 ms server).

Secondary (after model resolves):

- `_maybe_prime_caches()` gates `_finalize_board_display` / grid build (can add IndexedDB latency if not already `primed`).
- `load_button_set()` starts in parallel (find-a-button); not required for modern grid paint.
- `warm_images` runs ~100 ms after grid build (symbols can still look “loading”).
- Overlay: My Boards uses 150 ms min on cache hit / 700 ms otherwise; board-icon uses `paint_view_switch_overlay` (dismiss +150 ms after `routeDidChange`).

Button-set lookup for this board returned no URL in the runner (`for_user(..., allow_slow=false)`); not on the modern paint path.

## Root cause (verified)

**Cold / TTL-miss speak opens for large vocab trees block on downloading and parsing the entire `/tree` payload before the root grid can paint.** Session cache and prefetch help *after* that expensive warm; they do not remove the first-cost cliff. Prefetch of home itself pays the same ~84 MB cost in the background.

## Proposed fix (single, targeted) — IMPLEMENTED

**Two-phase board-detail load:**

1. On `boardDetailCache` miss: `GET /api/v1/boards/:key/tree?root_only=1` (lite root, empty descendants) → `handleRoot` → resolve → paint.
2. In background: `GET …/tree` (full) → `boardDetailCache.ingest_tree(..., { force: false, warm_root_images: false })`.
3. Fallback if root_only fails: `GET /boards/:key` (show), then the same background full tree.

**Code:**
- [`app/controllers/api/boards_controller.rb`](../../app/controllers/api/boards_controller.rb) `#tree` honors `root_only=1|true|yes`
- [`app/frontend/app/routes/user/board-detail.js`](../../app/frontend/app/routes/user/board-detail.js) `model()` two-phase path
- Spec: `spec/controllers/api/boards_controller_spec.rb` root_only example
- QUnit: `ingest_tree` preserves fresh root while caching descendants

Expected effect for this home board: time-to-grid ≈ root (~50 ms server + ~1.5 MB) instead of full tree (~2 s + ~84 MB). Folder taps stay cache-instant once background ingest finishes.

## Not covered / follow-ups

- Browser Network waterfall for this open (Rails/Ember HTTP stack was down during this pass; server serialize + payload size are the verified bottleneck via `rails runner` mirroring `#tree`).
- Prefetch cost for this account: **1539** owned boards — phase-3 owned prefetch can amplify `/tree` work; orthogonal to time-to-first-paint.
- Shrinking lite JSON per board (still 1.5–4 MB each) — separate payload-size work; related open remediations from tree-timeout RCA (#286 / punchlist #23).
- Making `paint_view_switch_overlay` / board-icon honor cache-hit short mins like `user/index`.
- Classic speak path soft-reload + button sets.

## Status

| Todo | Status |
|------|--------|
| Confirm UI + flags | Done |
| Measure open path | Done (server tree timing + code path proof) |
| Log findings | This file |
| Propose fix | Done → implemented two-phase root-then-tree |
| Implement two-phase | Done on `feat/melissa-speak-mode-two-phase-tree-load` |
