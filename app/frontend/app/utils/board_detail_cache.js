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
  // given raw board. Fire-and-forget; staggered to avoid saturating the
  // connection pool on boards with hundreds of buttons.
  warm_images: function(raw) {
    if (!raw) { return; }
    var token = raw.key || raw.id;
    if (!token || _warmed[token]) { return; }
    _warmed[token] = true;
    var image_map = raw.image_urls || {};
    (raw.images || []).forEach(function(img) {
      if (img && img.id && img.url) { image_map[img.id] = img.url; }
    });
    var urls = [];
    for (var id in image_map) {
      if (image_map[id]) { urls.push(image_map[id]); }
    }
    if (!urls.length) { return; }
    var i = 0;
    var kick = function() {
      var limit = Math.min(i + WARM_BATCH, urls.length);
      while (i < limit) {
        try {
          var img = new Image();
          img.src = urls[i];
        } catch (e) { /* ignore */ }
        i++;
      }
      if (i < urls.length) { runLater(kick, WARM_BATCH_GAP_MS); }
    };
    runLater(kick, 100);
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
  }
};
