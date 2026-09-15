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
import boardPrefetchPlanner from './board_prefetch_planner';
import boardsPageListCache from './boards_page_list_cache';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import LingoLinq from '../app';

var TTL_MS = 5 * 60 * 1000;
var MAX_PREFETCH = 20;
var WARM_BATCH = 20;
var WARM_BATCH_GAP_MS = 80;
var TREE_GAP_MS = 400;
var CASELOAD_PREFETCH_CAP = 10;
var CASELOAD_PREFETCH_GAP_MS = 1000;

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

function _push_board_to_store(raw) {
  try {
    if (typeof window !== 'undefined' && LingoLinq && LingoLinq.store) {
      var norm = LingoLinq.store.normalize('board', JSON.parse(JSON.stringify(raw)));
      LingoLinq.store.push(norm);
    }
  } catch (e) { /* ignore */ }
}

function _is_online() {
  try {
    if (!persistence) { return false; }
    if (typeof persistence.get === 'function') {
      return !!persistence.get('online');
    }
    return !!persistence.online;
  } catch (e) { return false; }
}

function _document_hidden() {
  return typeof document !== 'undefined' && document.hidden;
}

function _complete_phase_if_done(phaseDone, phaseKey, completed) {
  if (completed === true) {
    phaseDone[phaseKey] = true;
  } else if (completed === false) {
    delete phaseDone[phaseKey];
  }
}

function _prefetch_pipeline_complete(user, phaseDone) {
  if (!phaseDone.phase1) { return false; }
  if (boardPrefetchPlanner.backgroundBoardPrefetchEnabled(user) && (!phaseDone.phase2 || !phaseDone.phase3)) {
    return false;
  }
  if (boardPrefetchPlanner.publicPrefetchEnabled(user) && !phaseDone.phase4) {
    return false;
  }
  return true;
}

/* Wait out a foreground Mine-list fetch so catalog /tree warm does not
   starve boards-page pagination. Caps wait so a stuck busy flag cannot
   block prefetch forever. */
function _wait_while_mine_list_busy(maxWaitMs) {
  maxWaitMs = maxWaitMs === undefined ? 120000 : maxWaitMs;
  var started = _now();
  var check = function() {
    if (!boardsPageListCache.isMineListBusy()) {
      return RSVP.resolve();
    }
    if ((_now() - started) >= maxWaitMs) {
      return RSVP.resolve();
    }
    return _later_promise(200).then(check);
  };
  return check();
}

/* Wait while the boards page is the visible route so prefetch does not
   compete with Mine pagination and tile images. No wall-clock resume:
   resolving while the page is still open restarts the catalog flood.
   deactivate / clearAll clear the flag. Tests may pass maxWaitMs. */
function _wait_while_boards_page_active(maxWaitMs) {
  var started = _now();
  var check = function() {
    if (!boardsPageListCache.isBoardsPageActive()) {
      return RSVP.resolve();
    }
    if (maxWaitMs !== undefined && (_now() - started) >= maxWaitMs) {
      return RSVP.resolve();
    }
    return _later_promise(200).then(check);
  };
  return check();
}

function _later_promise(ms) {
  if (!ms) {
    return RSVP.resolve();
  }
  return new RSVP.Promise(function(resolve) {
    runLater(resolve, ms);
  });
}

function _raw_get(object, path) {
  if (!object || !path) { return null; }
  var direct = object[path];
  if (direct !== undefined) { return direct; }
  var parts = path.split('.');
  var value = object;
  for (var idx = 0; idx < parts.length; idx++) {
    if (!value) { return null; }
    value = value[parts[idx]];
  }
  return value === undefined ? null : value;
}

function _supervisee_id(supervisee) {
  if (!supervisee) { return null; }
  if (supervisee.get) { return supervisee.get('id'); }
  return supervisee.id || supervisee.user_id || supervisee.global_id || null;
}

function _summary_as_user(supervisee) {
  return {
    get: function(path) {
      if (path === 'id') { return _supervisee_id(supervisee); }
      if (path === 'preferences.skin') {
        return _raw_get(supervisee, path) || supervisee.skin || null;
      }
      if (path === 'preferences.preferred_symbols') {
        return _raw_get(supervisee, path) || supervisee.symbols || supervisee.preferred_symbols || null;
      }
      return _raw_get(supervisee, path);
    }
  };
}

function _load_prefetch_user(supervisee) {
  if (!supervisee) { return RSVP.reject({ error: 'missing supervisee' }); }
  if (supervisee.get) { return RSVP.resolve(supervisee); }
  var id = _supervisee_id(supervisee);
  if (!id) { return RSVP.reject({ error: 'missing supervisee id' }); }
  if (LingoLinq && LingoLinq.store) {
    var existing = LingoLinq.store.peekRecord && LingoLinq.store.peekRecord('user', id);
    if (existing) { return RSVP.resolve(existing); }
    if (LingoLinq.store.findRecord) {
      return LingoLinq.store.findRecord('user', id).then(null, function() {
        return _summary_as_user(supervisee);
      });
    }
  }
  return RSVP.resolve(_summary_as_user(supervisee));
}

function _schedule_sequential_step(processNext, gapMs) {
  if (!gapMs) {
    return processNext();
  }
  return new RSVP.Promise(function(resolve) {
    runLater(function() {
      processNext().then(resolve, resolve);
    }, gapMs);
  });
}

function _process_roots_sequentially(cache, rootKeys, warm_opts, gapMs, seq_opts) {
  if (!rootKeys || !rootKeys.length) { return RSVP.resolve(true); }
  seq_opts = seq_opts || {};
  var index = 0;

  var processNext = function() {
    if (index >= rootKeys.length) {
      return RSVP.resolve(true);
    }
    if (_document_hidden() || !_is_online()) {
      return RSVP.resolve(false);
    }
    if (seq_opts.respectBoardsPage && boardsPageListCache.isBoardsPageActive()) {
      return _wait_while_boards_page_active().then(function() {
        if (_document_hidden() || !_is_online()) {
          return RSVP.resolve(false);
        }
        return processNext();
      });
    }
    var key = rootKeys[index++];
    var existing = _lookup(key);
    if (existing && _is_fresh(existing) && existing.raw) {
      return _schedule_sequential_step(processNext, gapMs);
    }
    // Dedup concurrent warm passes for the same board: a caseload warm and a
    // board-route warm can request the same /tree at once, and (unlike the
    // sibling SHOW fetch above) this GET otherwise skips the _inflight map, so
    // both fire. Share the in-flight request so identical concurrent fetches
    // collapse to one network call; each pass still ingests the shared response
    // into its own cache with its own warm_opts. Namespaced key ('tree:') so it
    // can't collide with the bare-lookup SHOW entries in _inflight.
    var tree_lookup = 'tree:' + key;
    var tree_req = _inflight[tree_lookup];
    if (!tree_req) {
      /* Prefetch uses root_only so speak-mode can two-phase load the
         full tree on open. Board-detail still fetches the full /tree. */
      tree_req = persistence.ajax('/api/v1/boards/' + key + '/tree?root_only=1', { type: 'GET' });
      _inflight[tree_lookup] = tree_req;
      var _clear_tree_inflight = function() {
        if (_inflight[tree_lookup] === tree_req) { delete _inflight[tree_lookup]; }
      };
      tree_req.then(_clear_tree_inflight, _clear_tree_inflight);
    }
    return tree_req.then(function(data) {
      _ingest_tree_response(cache, data, warm_opts, {
        warm_root_images: !boardsPageListCache.isBoardsPageActive(),
        root_only: true
      });
    }, function() {
      /* swallow per-board errors */
    }).then(function() {
      return _schedule_sequential_step(processNext, gapMs);
    });
  };

  return processNext();
}

function _ingest_tree_response(cache, data, warm_opts, options) {
  options = options || {};
  if (!data || !data.root || !data.root.board) { return false; }
  var root_raw = normalize_board_payload(data.root);
  if (!root_raw) { return false; }
  // options.force lets a caller that fetched a fresh /tree (e.g. the speak
  // handoff waiting on a just-copied board) make its root authoritative even
  // when a staler entry is still within TTL — so the route's cache-first read
  // and the store record agree on the newest server response. Prefetch callers
  // pass no options, so their non-forcing behavior is unchanged.
  cache.set(root_raw, {
    force: !!options.force,
    root_only: !!options.root_only
  });
  if (options.warm_root_images !== false) {
    cache.warm_images(root_raw, warm_opts);
  }
  _push_board_to_store(root_raw);
  (data.descendants || []).forEach(function(wrapped) {
    var sub_raw = normalize_board_payload(wrapped);
    if (!sub_raw) { return; }
    cache.set(sub_raw);
    _push_board_to_store(sub_raw);
  });
  return true;
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

  // Ingest a /api/v1/boards/:id/tree response (root + descendants) into the
  // cache AND the Ember Data store, exactly as the route's own model hook and
  // the prefetch pipeline do. Callers that fetch a tree ahead of navigation
  // (e.g. the guided-tour speak handoff waiting for a freshly-copied board)
  // use this to prime the cache so the subsequent board-detail transition is
  // a cache HIT. Prefetch uses options.root_only so speak still background-
  // loads the full tree on that hit; a full-tree ingest clears the mark.
  // Returns true when the root was ingested, false when the payload has no
  // usable root (board not materialized yet), so the caller can keep polling.
  ingest_tree: function(data, warm_opts, options) {
    return _ingest_tree_response(this, data, warm_opts, options);
  },

  // True when the cached entry came from /tree?root_only=1 and descendants
  // have not been ingested yet. Speak cache-hits must still warm the full
  // tree in the background or folder taps stay cold.
  is_root_only: function(key_or_id) {
    var entry = _lookup(key_or_id);
    if (!entry || !_is_fresh(entry)) { return false; }
    return !!entry.root_only;
  },

  // If the entry is a root-only prefetch/lite load, fetch the full /tree
  // (no root_only) and ingest descendants. No-ops when the cache is already
  // a full tree. Shares in-flight full-tree requests. Resolves
  // { warmed, descendant_count } and never rejects.
  warm_full_tree_if_root_only: function(key_or_id) {
    var _this = this;
    if (!this.is_root_only(key_or_id)) {
      return RSVP.resolve({ warmed: false });
    }
    var entry = _lookup(key_or_id);
    var key = (entry && entry.key) || key_or_id;
    if (!key) {
      return RSVP.resolve({ warmed: false });
    }
    /* Distinct from prefetch 'tree:' inflight, which is the root_only GET. */
    var inflight_key = 'full-tree:' + key;
    var req = _inflight[inflight_key];
    if (!req) {
      req = persistence.ajax('/api/v1/boards/' + key + '/tree', { type: 'GET' });
      _inflight[inflight_key] = req;
      var _clear = function() {
        if (_inflight[inflight_key] === req) { delete _inflight[inflight_key]; }
      };
      req.then(_clear, _clear);
    }
    return req.then(function(data) {
      if (!data || !data.root || !data.root.board) {
        return { warmed: false };
      }
      _this.ingest_tree(data, null, {
        force: false,
        warm_root_images: false,
        root_only: false
      });
      return {
        warmed: true,
        descendant_count: (data.descendants && data.descendants.length) || 0
      };
    }, function() {
      return { warmed: false };
    });
  },

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
        /* Full-tree ingest must clear the root_only mark even when it
           keeps the painted root payload. A bare set() (no root_only
           key) must not clear it — that would hide the need to warm. */
        if (opts.root_only === false) {
          existing.root_only = false;
        }
        return existing;
      }
    }
    var entry = {
      key: raw.key,
      id: raw.id,
      raw: raw,
      fetched_at: _now(),
      ordered_buttons: null,
      ordered_for: null,
      root_only: !!opts.root_only
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
    this._prefetched_user_ids = {};
    this._prefetched_catalog_user_ids = {};
    this._prefetched_caseload_supervisee_ids = {};
    this._caseload_prefetch_running = {};
    this._prefetch_phase_done = {};
    this._prefetch_pipeline_running = {};
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
    if (boardsPageListCache.isBoardsPageActive()) {
      return RSVP.resolve();
    }
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

  /* Prefetch + warm an EXPLICIT list of boards: the ones offered in the Board Collection
     drawer. prefetch_linked already covers the folder targets reachable from the current
     board, which is why opening a folder is instant — but the drawer lists a DIFFERENT set
     (My Boards, Quick Core, brand rows), and that is where a board SWITCH comes from. Nothing
     warmed those, so every switch paid full network latency for every symbol and the grid
     popped in tile by tile.
     Deliberately the same pipeline as prefetch_linked rather than a parallel one: same
     freshness check, same _inflight de-dupe (so it cannot double-fetch a board the linked
     prefetch is already pulling), same MAX_PREFETCH bound, same batched warm. Best-effort —
     never rejects, and a board already fresh in the cache is warmed without a refetch. */
  prefetch_boards: function(lookups, opts) {
    opts = opts || {};
    var _this = this;
    if (persistence && persistence.get && persistence.get('online') === false) {
      return RSVP.resolve();
    }
    var max = opts.max || MAX_PREFETCH;
    var fetched = 0;
    var promises = [];
    (lookups || []).forEach(function(lookup) {
      if (!lookup) { return; }
      var existing = _lookup(lookup);
      if (existing && _is_fresh(existing)) {
        if (existing.raw) { _this.warm_images(existing.raw, opts); }
        return;
      }
      if (_inflight[lookup]) { promises.push(_inflight[lookup]); return; }
      if (fetched >= max) { return; }
      fetched++;
      var p = persistence.ajax('/api/v1/boards/' + lookup, { type: 'GET' }).then(function(data) {
        delete _inflight[lookup];
        var board_raw = normalize_board_payload(data);
        if (board_raw) {
          _this.set(board_raw);
          _this.warm_images(board_raw, opts);
        }
      }, function() {
        delete _inflight[lookup];
      });
      _inflight[lookup] = p;
      promises.push(p);
    });
    return RSVP.all(promises).then(function() { }, function() { });
  },

  _run_prefetch_pipeline: function(user, warm_opts, pipeline_opts) {
    var _this = this;
    var user_id = user.get('id');
    pipeline_opts = pipeline_opts || {};
    var gapMs = pipeline_opts.gapMs !== undefined ? pipeline_opts.gapMs : TREE_GAP_MS;
    warm_opts = warm_opts || {
      skin: user.get('preferences.skin'),
      preferred_symbols: user.get('preferences.preferred_symbols')
    };
    _this._prefetch_phase_done = _this._prefetch_phase_done || {};
    var phaseDone = _this._prefetch_phase_done[user_id] || {};
    _this._prefetch_phase_done[user_id] = phaseDone;

    var chain = RSVP.resolve();

    if (!phaseDone.phase1) {
      chain = chain.then(function() {
        if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
        return _wait_while_boards_page_active().then(function() {
          if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
          var lookups = boardPrefetchPlanner.collectHomeLookups(user);
          if (!lookups.length) {
            phaseDone.phase1 = true;
            return RSVP.resolve();
          }
          return _process_roots_sequentially(_this, lookups, warm_opts, gapMs, { respectBoardsPage: true }).then(function(completed) {
            _complete_phase_if_done(phaseDone, 'phase1', completed);
          }, function() {
            delete phaseDone.phase1;
          });
        });
      });
    }

    if (boardPrefetchPlanner.backgroundBoardPrefetchEnabled(user)) {
      if (!phaseDone.phase2) {
        chain = chain.then(function() {
          if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
          return _wait_while_boards_page_active().then(function() {
            if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
            var seen = {};
            boardPrefetchPlanner.collectHomeLookups(user).forEach(function(l) { seen[l] = true; });
            var lookups = boardPrefetchPlanner.collectLikedLookups(user, seen);
            if (!lookups.length) {
              phaseDone.phase2 = true;
              return RSVP.resolve();
            }
            return _process_roots_sequentially(_this, lookups, warm_opts, gapMs, { respectBoardsPage: true }).then(function(completed) {
              _complete_phase_if_done(phaseDone, 'phase2', completed);
            }, function() {
              delete phaseDone.phase2;
            });
          });
        });
      }

      if (!phaseDone.phase3) {
        chain = chain.then(function() {
          if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
          /* Wait before the duplicate owned-list fetch, not only before
             /tree, so Mine pagination is not raced. */
          return _wait_while_boards_page_active().then(function() {
            if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
            return boardPrefetchPlanner.fetchBoardListsForPrefetch(
              persistence.ajax.bind(persistence),
              user,
              { includeOwned: true, includePublic: false }
            ).then(function(listData) {
              var phased = boardPrefetchPlanner.buildPhasedLookups(user, {
                ownedBoards: listData.ownedBoards,
                includeLiked: false
              });
              if (!phased.phase3.length) {
                phaseDone.phase3 = true;
                return RSVP.resolve();
              }
              return _process_roots_sequentially(_this, phased.phase3, warm_opts, gapMs, { respectBoardsPage: true }).then(function(completed) {
                _complete_phase_if_done(phaseDone, 'phase3', completed);
              }, function() {
                delete phaseDone.phase3;
              });
            }, function() {
              delete phaseDone.phase3;
            });
          });
        });
      }
    }

    if (boardPrefetchPlanner.publicPrefetchEnabled(user) && !phaseDone.phase4) {
      chain = chain.then(function() {
        if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
        /* Defer catalog/global /tree flood until the boards page is
           not the visible route and Mine list is not fetching. */
        return _wait_while_boards_page_active().then(function() {
          return _wait_while_mine_list_busy();
        }).then(function() {
          if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
          return boardPrefetchPlanner.fetchBoardListsForPrefetch(
            persistence.ajax.bind(persistence),
            user,
            { includeOwned: false, includePublic: true }
          ).then(function(listData) {
            var seen = {};
            var phased = boardPrefetchPlanner.buildPhasedLookups(user, {
              catalogBoards: listData.catalogBoards,
              globalBoards: listData.globalBoards,
              includeLiked: false
            });
            phased.phase1.concat(phased.phase2, phased.phase3).forEach(function(l) { seen[l] = true; });
            var publicLookups = boardPrefetchPlanner.collectPublicLookups(
              user,
              listData.catalogBoards,
              listData.globalBoards,
              seen
            );
            if (!publicLookups.length) {
              phaseDone.phase4 = true;
              return RSVP.resolve();
            }
            return _process_roots_sequentially(_this, publicLookups, warm_opts, gapMs, { respectBoardsPage: true }).then(function(completed) {
              _complete_phase_if_done(phaseDone, 'phase4', completed);
            }, function() {
              delete phaseDone.phase4;
            });
          }, function() {
            delete phaseDone.phase4;
          });
        });
      });
    }

    return chain.then(function() {
      return _prefetch_pipeline_complete(user, phaseDone);
    });
  },

  // Session-start prefetch: called when a user logs in (or session is
  // restored on app boot). Runs a phased pipeline — home board first,
  // then liked boards, all owned roots, and public boards when the
  // background_board_prefetch flag is enabled.
  //
  // - Phase completion tracked per user so reconnect resumes incomplete
  //   phases without re-fetching finished work.
  // - Fire-and-forget; returns nothing. Doesn't block any caller.
  prefetch_for_user: function(user) {
    if (!user || !user.get) { return; }
    var user_id = user.get('id');
    if (!user_id) { return; }
    if (!_is_online()) { return; }
    if (_document_hidden()) { return; }

    var _this = this;
    _this._prefetch_pipeline_running = _this._prefetch_pipeline_running || {};
    if (_this._prefetch_pipeline_running[user_id]) { return; }
    _this._prefetch_pipeline_running[user_id] = true;

    var warm_opts = {
      skin: user.get('preferences.skin'),
      preferred_symbols: user.get('preferences.preferred_symbols')
    };

    runLater(function() {
      _this._run_prefetch_pipeline(user, warm_opts).then(function() {
        delete _this._prefetch_pipeline_running[user_id];
      }, function() {
        delete _this._prefetch_pipeline_running[user_id];
      });
    }, 400);
  },

  prefetch_caseload_for_user: function(user, opts) {
    opts = opts || {};
    if (!user || !user.get) { return RSVP.resolve(); }
    var supervisor_id = user.get('id');
    if (!supervisor_id) { return RSVP.resolve(); }
    if (!_is_online()) { return RSVP.resolve(); }
    if (_document_hidden()) { return RSVP.resolve(); }

    this._caseload_prefetch_running = this._caseload_prefetch_running || {};
    if (this._caseload_prefetch_running[supervisor_id]) {
      return this._caseload_prefetch_running[supervisor_id];
    }

    var supervisees = user.get('supervisees') || [];
    if (!supervisees.length) { return RSVP.resolve(); }

    var _this = this;
    var seen = {};
    var candidates = [];
    var cap = opts.cap || CASELOAD_PREFETCH_CAP;
    supervisees.forEach(function(supervisee) {
      var id = _supervisee_id(supervisee);
      if (!id || seen[id] || candidates.length >= cap) { return; }
      seen[id] = true;
      candidates.push(supervisee);
    });

    _this._prefetched_caseload_supervisee_ids = _this._prefetched_caseload_supervisee_ids || {};
    var chain = RSVP.resolve();
    candidates.forEach(function(supervisee) {
      var supervisee_id = _supervisee_id(supervisee);
      var key = supervisor_id + ':' + supervisee_id;
      chain = chain.then(function() {
        if (_document_hidden() || !_is_online()) { return RSVP.resolve(); }
        if (_this._prefetched_caseload_supervisee_ids[key]) { return RSVP.resolve(); }
          return _load_prefetch_user(supervisee).then(function(prefetchUser) {
            if (!prefetchUser || !prefetchUser.get || !prefetchUser.get('id')) {
              return RSVP.resolve();
            }
            var warm_opts = {
              skin: prefetchUser.get('preferences.skin'),
              preferred_symbols: prefetchUser.get('preferences.preferred_symbols')
            };
            var pipeline_opts = opts.pipelineGapMs !== undefined ? { gapMs: opts.pipelineGapMs } : null;
            return _this._run_prefetch_pipeline(prefetchUser, warm_opts, pipeline_opts).then(function(completed) {
            if (completed) {
              _this._prefetched_caseload_supervisee_ids[key] = true;
            }
          });
        }, function() {
          return RSVP.resolve();
        }).then(function() {
          return _later_promise(opts.gapMs !== undefined ? opts.gapMs : CASELOAD_PREFETCH_GAP_MS);
        });
      });
    });

    _this._caseload_prefetch_running[supervisor_id] = chain.then(function() {
      delete _this._caseload_prefetch_running[supervisor_id];
    }, function(err) {
      delete _this._caseload_prefetch_running[supervisor_id];
      return RSVP.reject(err);
    });
    return _this._caseload_prefetch_running[supervisor_id];
  },

  // Legacy entry point kept for tests. Prefetches LingoLinq catalog +
  // global public roots when public prefetch is enabled.
  prefetch_lingolinq_catalog: function(user, warm_opts, prefetch_opts) {
    if (!user || !user.get) { return RSVP.resolve(); }
    if (!boardPrefetchPlanner.publicPrefetchEnabled(user)) { return RSVP.resolve(); }
    prefetch_opts = prefetch_opts || {};
    var gapMs = prefetch_opts.gapMs !== undefined ? prefetch_opts.gapMs : TREE_GAP_MS;
    var user_id = user.get('id');
    if (!user_id) { return RSVP.resolve(); }
    if (!_is_online()) { return RSVP.resolve(); }

    var _this = this;
    _this._prefetched_catalog_user_ids = _this._prefetched_catalog_user_ids || {};
    if (_this._prefetched_catalog_user_ids[user_id]) { return RSVP.resolve(); }
    _this._prefetched_catalog_user_ids[user_id] = true;

    warm_opts = warm_opts || {
      skin: user.get('preferences.skin'),
      preferred_symbols: user.get('preferences.preferred_symbols')
    };

    return boardPrefetchPlanner.fetchBoardListsForPrefetch(
      persistence.ajax.bind(persistence),
      user,
      { includeOwned: false, includePublic: true }
    ).then(function(listData) {
      var seen = {};
      var publicLookups = boardPrefetchPlanner.collectPublicLookups(
        user,
        listData.catalogBoards,
        listData.globalBoards,
        seen
      );
      if (!publicLookups.length) {
        delete _this._prefetched_catalog_user_ids[user_id];
        return RSVP.resolve();
      }
      return _process_roots_sequentially(_this, publicLookups, warm_opts, gapMs, { respectBoardsPage: true }).then(function() {
        /* done */
      }, function() {
        delete _this._prefetched_catalog_user_ids[user_id];
      });
    }, function() {
      delete _this._prefetched_catalog_user_ids[user_id];
    });
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
