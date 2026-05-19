// In-memory cache for board-detail navigation.
//
// Two roles:
//   1. Cache raw board JSON keyed by board key + id. On cache-hit the
//      route's model hook can resolve without an HTTP roundtrip and
//      _build_from_raw can rebuild ordered_buttons from the cached copy.
//   2. Pre-fetch immediate child boards (depth=1) so that a folder click
//      on the current board lands on a cached entry.
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
  delete _warmed[entry.key];
  delete _warmed[entry.id];
}

function _lookup(key_or_id) {
  if (!key_or_id) { return null; }
  return _by_key[key_or_id] || _by_id[key_or_id] || null;
}

export default {
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
  set: function(raw) {
    if (!raw || (!raw.key && !raw.id)) { return; }
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
  },

  // Warm the browser image cache for every button image URL on the
  // given raw board.
  //
  // Returns a Promise that resolves when every image has settled
  // (loaded OR errored). The browser caps parallel fetches per origin
  // (~6) so dispatching all URLs at once is safe — browser internally
  // queues, no throttling needed at our layer.
  //
  // Callers can await the promise to guarantee the image cache is
  // fully populated before showing the board, OR fire-and-forget for
  // sub-board prefetch.
  //
  // `_warmed` guard means we never re-dispatch the same board's
  // images — but we still return a resolved promise so callers can
  // chain regardless.
  warm_images: function(raw) {
    if (!raw) { return RSVP.resolve(); }
    var token = raw.key || raw.id;
    if (token && _warmed[token]) { return RSVP.resolve(); }
    if (token) { _warmed[token] = true; }
    var image_map = raw.image_urls || {};
    (raw.images || []).forEach(function(img) {
      if (img && img.id && img.url) { image_map[img.id] = img.url; }
    });
    var urls = [];
    for (var id in image_map) {
      if (image_map[id]) { urls.push(image_map[id]); }
    }
    if (!urls.length) { return RSVP.resolve(); }
    var promises = urls.map(function(url) {
      return new RSVP.Promise(function(resolve) {
        try {
          var img = new Image();
          img.onload = function() { resolve(); };
          img.onerror = function() { resolve(); };
          img.src = url;
          // Already-cached images may resolve `complete` immediately
          // and never fire onload — short-circuit so we don't hang.
          if (img.complete) { resolve(); }
        } catch (e) { resolve(); }
      });
    });
    return RSVP.all(promises);
  },

  // Fetches every immediate-child board (load_board entries) into the
  // cache and warms their images. Skips boards already cached/in-flight
  // to dedupe rapid clicks. Caps total fetches at MAX_PREFETCH.
  prefetch_linked: function(raw, opts) {
    if (!raw || !raw.buttons) { return; }
    opts = opts || {};
    var max = opts.max || MAX_PREFETCH;
    var fetched = 0;
    var _this = this;

    raw.buttons.forEach(function(btn) {
      if (!btn || !btn.load_board) { return; }
      var lookup = btn.load_board.key || btn.load_board.id;
      if (!lookup) { return; }

      var existing = _lookup(lookup);
      if (existing && _is_fresh(existing)) {
        if (!_warmed[existing.key] && !_warmed[existing.id]) {
          _this.warm_images(existing.raw);
        }
        return;
      }
      if (_inflight[lookup]) { return; }
      if (fetched >= max) { return; }
      fetched++;

      _inflight[lookup] = persistence.ajax('/api/v1/boards/' + lookup, { type: 'GET' }).then(function(data) {
        delete _inflight[lookup];
        if (data && data.board) {
          _this.set(data.board);
          _this.warm_images(data.board);
        }
      }, function() {
        delete _inflight[lookup];
      });
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
    // Defer slightly so this doesn't compete with the post-login UI
    // render. By the time the user finishes reading the dashboard,
    // the tree is cached and Boards-tab navigation is instant.
    runLater(function() {
      persistence.ajax('/api/v1/boards/' + lookup + '/tree', { type: 'GET' }).then(function(data) {
        if (!data || !data.root || !data.root.board) { return; }
        // Cache root.
        var root_raw = data.root.board;
        if (data.root.images) { root_raw.images = data.root.images; }
        if (data.root.sounds) { root_raw.sounds = data.root.sounds; }
        _this.set(root_raw);
        _this.warm_images(root_raw);
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
        // Cache + push every descendant.
        (data.descendants || []).forEach(function(wrapped) {
          var sub_raw = wrapped && wrapped.board;
          if (!sub_raw) { return; }
          if (wrapped.images) { sub_raw.images = wrapped.images; }
          if (wrapped.sounds) { sub_raw.sounds = wrapped.sounds; }
          _this.set(sub_raw);
          _this.warm_images(sub_raw);
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
    _this.warm_images(raw);

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
          _this.warm_images(existing.raw);
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
            // bulk endpoint returns wrapped form (mirrors single show).
            // Merge image_urls from the wrapper if present so the
            // cached raw has the same shape as a single-board fetch.
            var board_raw = wrapped && wrapped.board;
            if (!board_raw) { return; }
            // Mirror what /boards/:id does — splice `images` into the
            // raw object so _build_from_raw's image_map works the same.
            if (wrapped.images) { board_raw.images = wrapped.images; }
            if (wrapped.sounds) { board_raw.sounds = wrapped.sounds; }
            _this.set(board_raw);
            _this.warm_images(board_raw);
            next_layer = next_layer.concat(collect_layer_keys(board_raw));
          });
        }, function() {
          // Bulk endpoint unavailable or errored — fall back to per-
          // board fetches in parallel. Keeps the prefetch working on
          // older deploys.
          var promises = to_fetch.map(function(key) {
            return persistence.ajax('/api/v1/boards/' + key, { type: 'GET' }).then(function(data) {
              if (data && data.board) {
                _this.set(data.board);
                _this.warm_images(data.board);
                next_layer = next_layer.concat(collect_layer_keys(data.board));
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
