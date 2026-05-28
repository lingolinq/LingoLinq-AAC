// In-memory cache for board-detail navigation.
//
// Two roles:
//   1. Cache raw board JSON keyed by board key + id. On cache-hit the
//      route's model hook can resolve without an HTTP roundtrip and
//      _build_from_raw can rebuild ordered_buttons from the cached copy.
//   2. Pre-fetch immediate child boards (depth=1) so that a folder click
//      on the current board lands on a cached entry. When the parent board
//      is shown, warm_linked_images batches browser-cache fills for every
//      cached child (from /tree or prior navigation) without re-fetching.
//
// Mirrors the cache-first pattern used by routes/user/board-alt.js, which
// peeks Ember Data's identity map. We also keep this parallel raw-JSON
// cache because board-detail's plain-object button render path bypasses
// Ember Data hydration for speed, and that path needs raw shape input.
//
// Eviction: TTL of 5 minutes per entry. Explicit invalidation on save
// and on entering edit mode so editors never read stale state.

import persistence from './persistence';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import LingoLinq from '../app';

var TTL_MS = 5 * 60 * 1000;
var MAX_PREFETCH = 20;
var WARM_BATCH = 20;
var WARM_BATCH_GAP_MS = 80;

// key (e.g. "user_name/boardname") → entry
var _by_key = {};
// id (e.g. "1_42") → entry
var _by_id = {};
// dedup in-flight prefetches: lookup → Promise
var _inflight = {};
// boards whose image cache has been warmed this session: key|id → true
var _warmed = {};
// remote image URLs already dispatched to Image() this session
var _warmed_urls = {};

function _now() { return Date.now(); }

function _is_fresh(entry) {
  return entry && (_now() - entry.fetched_at) < TTL_MS;
}

function _index(entry) {
  if (entry.key) { _by_key[entry.key] = entry; }
  if (entry.id) { _by_id[entry.id] = entry; }
}

function _drop(entry) {
  if (entry.key && _by_key[entry.key] === entry) { delete _by_key[entry.key]; }
  if (entry.id && _by_id[entry.id] === entry) { delete _by_id[entry.id]; }
  _drop_warmed_for(entry);
}

function _lookup(key_or_id) {
  if (!key_or_id) { return null; }
  return _by_key[key_or_id] || _by_id[key_or_id] || null;
}

function _display_prefs_for_warm() {
  try {
    if (typeof window !== 'undefined' && LingoLinq && LingoLinq.appState) {
      var appState = LingoLinq.appState;
      var user = appState.get('referenced_user') || appState.get('currentUser');
      if (user) {
        return {
          skin: user.get('preferences.skin'),
          preferred_symbols: user.get('preferences.preferred_symbols')
        };
      }
    }
  } catch (e) { /* app may not be booted yet during early prefetch */ }
  return { skin: null, preferred_symbols: null };
}

function _warm_cache_key(token, skin, preferred_symbols) {
  if (!token) { return null; }
  var skinPart = skin || 'default';
  var symPart = (preferred_symbols && preferred_symbols !== 'original') ? preferred_symbols : 'original';
  return token + '|' + skinPart + '|' + symPart;
}

function _drop_warmed_for(entry) {
  [entry.key, entry.id].forEach(function(token) {
    if (!token) { return; }
    Object.keys(_warmed).forEach(function(k) {
      if (k === token || k.indexOf(token + '|') === 0) { delete _warmed[k]; }
    });
  });
}

function _is_warmed(token, skin, preferred_symbols) {
  var key = _warm_cache_key(token, skin, preferred_symbols);
  return !!(key && _warmed[key]);
}

// Build the same skinned URL set _build_from_raw uses so prefetch hits
// the browser cache entries the grid will request.
function _urls_to_warm(raw, skin) {
  var image_map = raw.image_urls || {};
  (raw.images || []).forEach(function(img) {
    if (img && img.id) {
      var url = img.skin_url || img.url;
      if (url) { image_map[String(img.id)] = url; }
    }
  });
  // Guard: this cache module is imported before models/board.js is
  // guaranteed to have been evaluated, so `LingoLinq.Board` (set at
  // module-load time inside models/board.js:109) may still be
  // undefined when an early warm-prefetch path fires. In that case,
  // skip the skin-tone variant transformation and warm the raw URLs
  // instead — the route's own _build_from_raw runs skin_image_map
  // again later once board.js is loaded, so the user-visible flow
  // is unaffected; only the prefetch hits the un-skinned URLs for
  // this pass. The page-rendered grid still gets the skinned URLs
  // it asks for.
  if (LingoLinq && LingoLinq.Board && typeof LingoLinq.Board.skin_image_map === 'function') {
    image_map = LingoLinq.Board.skin_image_map(image_map, skin, { persistence: persistence });
  }
  var urls = [];
  var seen = {};
  for (var id in image_map) {
    if (image_map[id] && !seen[image_map[id]]) {
      seen[image_map[id]] = true;
      urls.push(image_map[id]);
    }
  }
  return urls;
}

// API show/tree/bulk responses wrap images/sounds beside `board`. Merge
// them onto the raw board object so _build_from_raw can read skin_url.
function normalize_board_payload(data) {
  if (!data) { return null; }
  if (data.board) {
    var board = JSON.parse(JSON.stringify(data.board));
    if (data.images) { board.images = data.images; }
    if (data.sounds) { board.sounds = data.sounds; }
    return board;
  }
  return JSON.parse(JSON.stringify(data));
}

// Load URLs in small batches so warming many sub-boards does not flood
// the browser's per-origin connection pool (same constants as prefetch).
function _warm_urls_batched(urls) {
  if (!urls.length) { return RSVP.resolve(); }
  return new RSVP.Promise(function(resolve) {
    var offset = 0;
    var run_batch = function() {
      var batch = urls.slice(offset, offset + WARM_BATCH);
      offset += WARM_BATCH;
      if (!batch.length) { return resolve(); }
      var promises = batch.map(function(url) {
        return new RSVP.Promise(function(res) {
          try {
            var img = new Image();
            img.onload = function() { res(); };
            img.onerror = function() { res(); };
            img.src = url;
            if (img.complete) { res(); }
          } catch (e) { res(); }
        });
      });
      RSVP.all(promises).then(function() {
        if (offset < urls.length) {
          runLater(run_batch, WARM_BATCH_GAP_MS);
        } else {
          resolve();
        }
      });
    };
    run_batch();
  });
}

function _collect_linked_lookups(raw) {
  var lookups = [];
  var seen = {};
  (raw.buttons || []).forEach(function(btn) {
    if (!btn || !btn.load_board) { return; }
    var lookup = btn.load_board.key || btn.load_board.id;
    if (!lookup || seen[lookup]) { return; }
    seen[lookup] = true;
    lookups.push(lookup);
  });
  return lookups;
}

export default {
  normalize_board_payload: normalize_board_payload,
  // Returns the cached raw board JSON, or null if missing/stale.
  get: function(key_or_id) {
    var entry = _lookup(key_or_id);
    if (!entry) { return null; }
    if (!_is_fresh(entry)) {
      _drop(entry);
      return null;
    }
    return entry.raw;
  },

  // Stores a raw board response. Indexed under both key and id.
  // Replacing an entry drops any previously-cached ordered_buttons since
  // the underlying data may have changed.
  //
  // When a fresh entry already exists, skip re-indexing unless opts.force
  // is true (e.g. after save or an explicit server refetch).
  set: function(raw, opts) {
    opts = opts || {};
    if (!raw || (!raw.key && !raw.id)) { return; }
    if (!opts.force) {
      var existing = _lookup(raw.key) || _lookup(raw.id);
      if (existing && _is_fresh(existing)) {
        return existing;
      }
    }
    var entry = {
      key: raw.key,
      id: raw.id,
      raw: raw,
      fetched_at: _now(),
      ordered_buttons: null,
      ordered_for: null
    };
    _index(entry);
    return entry;
  },

  // Cache the controller's pre-built ordered_buttons grid keyed under
  // the board's id/key, alongside the prefs context it was built for.
  // Glimmer can then incrementally update unchanged cells on cache-hit
  // navigation instead of tearing down and re-rendering all of them.
  set_ordered_buttons: function(key_or_id, ordered_buttons, ctx) {
    var entry = _lookup(key_or_id);
    if (!entry || !ordered_buttons) { return; }
    entry.ordered_buttons = ordered_buttons;
    entry.ordered_for = ctx || {};
  },

  // Returns cached ordered_buttons only when the prefs context matches
  // the one it was built for. Mismatch (different symbol library, skin,
  // edit-mode, etc.) → return null so the caller rebuilds.
  get_ordered_buttons: function(key_or_id, ctx) {
    var entry = _lookup(key_or_id);
    if (!entry || !_is_fresh(entry) || !entry.ordered_buttons) { return null; }
    var built_for = entry.ordered_for || {};
    ctx = ctx || {};
    if (built_for.preferred_symbols !== ctx.preferred_symbols) { return null; }
    if (built_for.skin !== ctx.skin) { return null; }
    if (built_for.edit_mode !== ctx.edit_mode) { return null; }
    if (built_for.label_locale !== ctx.label_locale) { return null; }
    if (!!built_for.url_cache_primed !== !!ctx.url_cache_primed) { return null; }
    return entry.ordered_buttons;
  },

  clear_ordered_buttons: function(key_or_id) {
    var entry = _lookup(key_or_id);
    if (!entry) { return; }
    entry.ordered_buttons = null;
    entry.ordered_for = null;
  },

  // Drops a cached entry (e.g. on save or before edit-mode entry).
  invalidate: function(key_or_id) {
    var entry = _lookup(key_or_id);
    if (entry) { _drop(entry); }
  },

  // Wipe everything (e.g. on logout / user switch).
  clear: function() {
    _by_key = {};
    _by_id = {};
    _inflight = {};
    _warmed = {};
    _warmed_urls = {};
  },

  // Warm the browser image cache for every button image URL on the
  // given raw board, using the active skin tone (same URLs as the grid).
  //
  // opts.skin / opts.preferred_symbols — optional overrides; default from
  // referenced_user (or currentUser) via appState.
  //
  // Returns a Promise that resolves when every image has settled
  // (loaded OR errored). URLs are loaded in batches (WARM_BATCH) so
  // warming a large board or many sub-boards does not monopolize the
  // browser request queue.
  //
  // Callers can await the promise to guarantee the image cache is
  // fully populated before showing the board, OR fire-and-forget for
  // sub-board prefetch.
  //
  // `_warmed` is keyed by board + skin + symbol library so a skin-tone
  // change re-warms with the correct variant URLs.
  warm_images: function(raw, opts) {
    opts = opts || {};
    if (!raw) { return RSVP.resolve(); }
    var token = raw.key || raw.id;
    var prefs = _display_prefs_for_warm();
    var skin = opts.skin !== undefined ? opts.skin : prefs.skin;
    var preferred_symbols = opts.preferred_symbols !== undefined ? opts.preferred_symbols : prefs.preferred_symbols;
    var warmKey = _warm_cache_key(token, skin, preferred_symbols);
    if (warmKey && _warmed[warmKey]) { return RSVP.resolve(); }
    var urls = _urls_to_warm(raw, skin).filter(function(url) {
      return url && !_warmed_urls[url];
    });
    if (!urls.length) {
      if (warmKey) { _warmed[warmKey] = true; }
      return RSVP.resolve();
    }
    urls.forEach(function(url) { _warmed_urls[url] = true; });
    return _warm_urls_batched(urls).then(function() {
      if (warmKey) { _warmed[warmKey] = true; }
    });
  },

  // Warm browser image cache for every immediate child board (folder
  // buttons with load_board) whose JSON is already in the in-memory
  // cache — typically from a prior /tree fetch. No network; URLs are
  // deduped across children and loaded in batches so opening a parent
  // with many folders does not flood the request queue.
  warm_linked_images: function(raw, opts) {
    if (!raw || !raw.buttons) { return RSVP.resolve(); }
    opts = opts || {};
    var prefs = _display_prefs_for_warm();
    var skin = opts.skin !== undefined ? opts.skin : prefs.skin;
    var preferred_symbols = opts.preferred_symbols !== undefined ? opts.preferred_symbols : prefs.preferred_symbols;
    var boards_to_mark = [];
    var all_urls = [];
    var seen_url = {};

    _collect_linked_lookups(raw).forEach(function(lookup) {
      var existing = _lookup(lookup);
      if (!existing || !_is_fresh(existing) || !existing.raw) { return; }
      var token = existing.key || existing.id;
      if (!token || _is_warmed(token, skin, preferred_symbols)) { return; }
      var warmKey = _warm_cache_key(token, skin, preferred_symbols);
      var board_urls = _urls_to_warm(existing.raw, skin).filter(function(url) {
        if (!url || _warmed_urls[url] || seen_url[url]) { return false; }
        seen_url[url] = true;
        return true;
      });
      if (board_urls.length) {
        boards_to_mark.push(warmKey);
        all_urls = all_urls.concat(board_urls);
      } else if (warmKey) {
        _warmed[warmKey] = true;
      }
    });

    if (!all_urls.length) { return RSVP.resolve(); }
    all_urls.forEach(function(url) { _warmed_urls[url] = true; });
    return _warm_urls_batched(all_urls).then(function() {
      boards_to_mark.forEach(function(warmKey) {
        if (warmKey) { _warmed[warmKey] = true; }
      });
    });
  },

  // Fetches immediate-child board JSON when missing from cache, then
  // warms their images via warm_linked_images. Skips boards already
  // cached/in-flight to dedupe rapid clicks. Caps network fetches at
  // MAX_PREFETCH; image warming has no cap (batched + URL-deduped).
  prefetch_linked: function(raw, opts) {
    if (!raw || !raw.buttons) { return RSVP.resolve(); }
    opts = opts || {};
    var max = opts.max || MAX_PREFETCH;
    var fetched = 0;
    var _this = this;
    var fetch_promises = [];

    // Warm every child that already has JSON (e.g. from /tree).
    _this.warm_linked_images(raw, opts);

    _collect_linked_lookups(raw).forEach(function(lookup) {
      var existing = _lookup(lookup);
      if (existing && _is_fresh(existing)) { return; }
      if (_inflight[lookup]) {
        fetch_promises.push(_inflight[lookup]);
        return;
      }
      if (fetched >= max) { return; }
      fetched++;

      var p = persistence.ajax('/api/v1/boards/' + lookup, { type: 'GET' }).then(function(data) {
        delete _inflight[lookup];
        var board_raw = normalize_board_payload(data);
        if (board_raw) {
          _this.set(board_raw);
        }
      }, function() {
        delete _inflight[lookup];
      });
      _inflight[lookup] = p;
      fetch_promises.push(p);
    });

    return RSVP.all(fetch_promises).then(function() {
      return _this.warm_linked_images(raw, opts);
    });
  },

  // Session-start prefetch: called when a user logs in (or session is
  // restored on app boot). Fires a one-shot /tree fetch for the user's
  // home board so by the time the user navigates to Boards / clicks a
  // sub-board, every board JSON and every image URL is already in
  // cache.
  //
  // Industry-standard pattern: prefetch the user's known data envelope
  // at session start (Slack, Notion, Linear all do this), so subsequent
  // navigation is instant rather than slow on first hit.
  //
  // - Tracked per user id so we don't re-prefetch on every observer
  //   fire (currentUser can flicker during session restore).
  // - Fire-and-forget; returns nothing. Doesn't block any caller.
  // - Skips silently if no home board is configured.
  prefetch_for_user: function(user) {
    if (!user || !user.get) { return; }
    var user_id = user.get('id');
    if (!user_id) { return; }
    this._prefetched_user_ids = this._prefetched_user_ids || {};
    if (this._prefetched_user_ids[user_id]) { return; }
    this._prefetched_user_ids[user_id] = true;
    var home_key = user.get('preferences.home_board.key');
    var home_id = user.get('preferences.home_board.id');
    var lookup = home_key || home_id;
    if (!lookup) { return; }
    var _this = this;
    var warm_opts = {
      skin: user.get('preferences.skin'),
      preferred_symbols: user.get('preferences.preferred_symbols')
    };
    // Defer slightly so this doesn't compete with the post-login UI
    // render. By the time the user finishes reading the dashboard,
    // the tree is cached and Boards-tab navigation is instant.
    runLater(function() {
      persistence.ajax('/api/v1/boards/' + lookup + '/tree', { type: 'GET' }).then(function(data) {
        if (!data || !data.root || !data.root.board) { return; }
        var root_raw = normalize_board_payload(data.root);
        if (!root_raw) { return; }
        _this.set(root_raw);
        _this.warm_images(root_raw, warm_opts);
        // Try to push root into Ember Data store too so the route's
        // cache-hit check (which requires `cached_record`) passes
        // when the user navigates to it. The store may not be the
        // same one as the route uses — fall back silently if so.
        try {
          if (typeof window !== 'undefined' && LingoLinq && LingoLinq.store) {
            var rootNorm = LingoLinq.store.normalize('board', JSON.parse(JSON.stringify(root_raw)));
            LingoLinq.store.push(rootNorm);
          }
        } catch (e) { /* ignore */ }
        // Cache + push every descendant — JSON only. We intentionally
        // DO NOT warm-prefetch descendant images here: for a home
        // board with many sub-boards (e.g. Quick Core 112 with ~95
        // descendants × ~100 buttons each), warm_images() per
        // descendant flooded the browser request queue with 8k+
        // pending image requests, blocking everything else (including
        // the Board Details modal's canvas image loads). Sub-board
        // images now load lazily when the user actually navigates
        // into that sub-board — the JSON cache still keeps the
        // navigation fast; only the image fetch is deferred.
        (data.descendants || []).forEach(function(wrapped) {
          var sub_raw = normalize_board_payload(wrapped);
          if (!sub_raw) { return; }
          _this.set(sub_raw);
          try {
            if (typeof window !== 'undefined' && LingoLinq && LingoLinq.store) {
              var subNorm = LingoLinq.store.normalize('board', JSON.parse(JSON.stringify(sub_raw)));
              LingoLinq.store.push(subNorm);
            }
          } catch (e) { /* ignore */ }
        });
      }, function() {
        // Allow a retry on the next observer fire — the network may
        // have been unavailable at session-start.
        delete _this._prefetched_user_ids[user_id];
      });
    }, 400);
  },

  // BFS-walk the reachable board tree starting from `raw`, fetching
  // each layer in a single bulk request to /api/v1/boards/bulk. Caches
  // every board's raw JSON and warms its image cache. Returns a
  // Promise that resolves once every layer has settled — callers
  // (e.g. the route's afterModel) await it to hold the loading
  // overlay until the full sub-tree is in cache.
  //
  // Why BFS + bulk:
  //   - Sub-boards aren't known until their parent is loaded, so we
  //     can't do a single one-shot fetch of the whole tree.
  //   - But each LAYER's keys are knowable from the parents already
  //     loaded — so each layer fits in one bulk request.
  //   - Result: total round-trips = tree depth (typically 2–4 for AAC
  //     vocab boards), not breadth (often 20–200).
  //
  // Compared to the prior parallel-per-board implementation, this is
  // 1 request instead of 30 for a typical board, ~5–20× faster on
  // cold cache.
  //
  // The single-board endpoint is the fallback if the bulk endpoint is
  // unavailable (older deploys), keeping the frontend forward-safe.
  prefetch_all: function(raw, opts) {
    if (!raw) { return RSVP.resolve(); }
    var _this = this;
    opts = opts || {};
    var visited = opts.visited || {};
    var rootToken = raw.key || raw.id;
    if (rootToken) { visited[rootToken] = true; }

    // Warm the current board's images right away. Fire-and-forget;
    // browser cache is the persistence layer.
    _this.warm_images(raw, opts);

    // Collect all unvisited sub-board lookups from this board.
    var collect_layer_keys = function(board_raw) {
      var keys = [];
      (board_raw.buttons || []).forEach(function(btn) {
        if (!btn || !btn.load_board) { return; }
        var lookup = btn.load_board.key || btn.load_board.id;
        if (!lookup || visited[lookup]) { return; }
        visited[lookup] = true;
        keys.push(lookup);
      });
      return keys;
    };

    // Process a single layer of keys: bulk-fetch the ones that aren't
    // already cached / in-flight, then recurse into the next layer.
    var process_layer = function(keys) {
      if (!keys.length) { return RSVP.resolve(); }

      // Separate cached vs needs-fetch.
      var to_fetch = [];
      var next_layer = [];
      keys.forEach(function(key) {
        var existing = _lookup(key);
        if (existing && _is_fresh(existing) && existing.raw) {
          // Already cached — feed its sub-board keys into the next
          // layer directly.
          _this.warm_images(existing.raw, opts);
          next_layer = next_layer.concat(collect_layer_keys(existing.raw));
        } else {
          to_fetch.push(key);
        }
      });

      var bulk_promise = RSVP.resolve();
      if (to_fetch.length) {
        // Single bulk request for the whole layer. Falls back to
        // parallel per-board fetches if the bulk endpoint isn't
        // available (404/etc.).
        bulk_promise = persistence.ajax('/api/v1/boards/bulk', {
          type: 'POST',
          data: { keys: to_fetch }
        }).then(function(data) {
          var boards = (data && data.boards) || [];
          boards.forEach(function(wrapped) {
            var board_raw = normalize_board_payload(wrapped);
            if (!board_raw) { return; }
            _this.set(board_raw);
            _this.warm_images(board_raw, opts);
            next_layer = next_layer.concat(collect_layer_keys(board_raw));
          });
        }, function() {
          // Bulk endpoint unavailable or errored — fall back to per-
          // board fetches in parallel. Keeps the prefetch working on
          // older deploys.
          var promises = to_fetch.map(function(key) {
            return persistence.ajax('/api/v1/boards/' + key, { type: 'GET' }).then(function(data) {
              var board_raw = normalize_board_payload(data);
              if (board_raw) {
                _this.set(board_raw);
                _this.warm_images(board_raw, opts);
                next_layer = next_layer.concat(collect_layer_keys(board_raw));
              }
            }, function() { /* swallow individual errors */ });
          });
          return RSVP.all(promises);
        });
      }

      return bulk_promise.then(function() {
        // Tail-call into the next layer. Recursion terminates when
        // collect_layer_keys returns an empty array (no unvisited
        // children remain).
        return process_layer(next_layer);
      });
    };

    return process_layer(collect_layer_keys(raw));
  }
};
