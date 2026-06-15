import LingoLinq from '../app';
import RSVP from 'rsvp';
import app_state from './app_state';
import persistence from './persistence';

/* Pre-warm a board's PREVIEW so that opening it in the board-preview modal
   (board-icon → modal.board_preview → board-preview → board-preview-canvas)
   renders its symbol images near-instantly instead of cold-fetching dozens of
   S3/CloudFront symbols while the loading overlay's 4s safety net
   (board-preview-canvas.js#render_canvas) trips and lifts the spinner early.

   Two cold costs are paid on a real preview, and warming preempts both:
     1. The full board record (buttons + image_urls), which a board list/search
        query does NOT ship — board-preview reloads to get it. We load/reload it
        here so the modal's findRecord resolves from the store instantly.
     2. The per-symbol image fetches. We dispatch `new Image().src = url` for the
        SAME URLs the canvas will request, warming the browser HTTP cache; the
        canvas's `resolve_url_sync` remote-URL fallback then hits that cache.

   Called on hover/focus/touch of a board card (opt-in via board-icon's
   `prefetchPreview` attr — see board-picker.hbs), so only boards the user shows
   intent on are warmed, with lead time before the Preview click. Best-effort:
   every failure path is swallowed; warming never blocks or breaks the click. */

// key/id → true once the record is loaded and image preloads dispatched.
var warmed = {};
// key/id → true while the record load is in flight (dedup concurrent hovers).
var inflight = {};

/* Cap boards warming at once so a hover-storm across a dense grid can't
   saturate the browser's ~6-per-host connection pool and starve the actual
   preview the user finally clicks. Boards over the cap are simply skipped and
   re-attempted on the next hover. */
var MAX_BOARDS_INFLIGHT = 4;

function board_ref(board) {
  if (!board) { return null; }
  if (board.get) { return board.get('id') || board.get('key'); }
  return board.id || board.key;
}

/* Mirror board-preview.js#imageUrlsMissing: a cached record can have
   image_urls absent OR set to an empty {} (a list query that filled the field
   but not its entries). Either way the canvas has nothing to draw, so reload. */
function image_urls_missing(board) {
  var urls = board.get('image_urls');
  if (!urls || typeof urls !== 'object') { return true; }
  return Object.keys(urls).length === 0;
}

/* Collect the symbol-image URLs a board's preview/grid will request. Reproduces
   board-preview-canvas.js#render_canvas URL selection EXACTLY so the warmed URLs
   are byte-identical to the ones the canvas/grid request:
   - skin = currentUser.preferences.skin (canvas line ~375)
   - preferred_symbols = referenced_user.preferences.preferred_symbols || 'original'
   - url = variant_urls[id + '-' + preferred] || variant_urls[id]
   Skips URLs already held as a local data-uri in persistence.url_cache. */
function _collect_image_urls(board) {
  var preferred = app_state.get('referenced_user.preferences.preferred_symbols') || 'original';
  var skin = app_state.get('currentUser.preferences.skin');
  var variant_urls = board.variant_image_urls(skin) || {};
  var image_urls = board.get('image_urls') || {};
  var buttons = board.get('buttons') || [];
  var urls = [];
  var seen = {};
  buttons.forEach(function(button) {
    if (!button || button.hidden || !button.image_id) { return; }
    if (!image_urls[button.image_id]) { return; }
    var url = variant_urls[button.image_id + '-' + preferred] || variant_urls[button.image_id];
    if (!url || seen[url]) { return; }
    seen[url] = true;
    if (persistence.url_cache && persistence.url_cache[url]) { return; } // already a local data-uri
    urls.push(url);
  });
  return urls;
}

function warm_images(board) {
  _collect_image_urls(board).forEach(function(url) {
    var img = new Image();
    img.src = url; // dispatch only — the browser caches the response for the canvas
  });
}

/* Resolve once every symbol image for `board` has SETTLED (loaded or errored) in
   the browser cache, so a caller can reveal the board-detail grid fully-loaded
   with no late image pop-in — the same readiness guarantee the preview canvas
   gives. Used by board-preview "Pick this Board" before routing into the board.
   Best-effort: always resolves (never rejects), resolves immediately when nothing
   needs loading, and is bounded by a safety timeout so a dead/slow CDN link can't
   trap the user behind the loading overlay. */
export function preload_board_images(board) {
  return new RSVP.Promise(function(resolve) {
    try {
      if (!board || !board.variant_image_urls) { resolve(); return; }
      var urls = _collect_image_urls(board);
      if (!urls.length) { resolve(); return; }
      var remaining = urls.length;
      var done = false;
      var finish = function() { if (!done) { done = true; resolve(); } };
      // Safety net: never block the flow more than a few seconds.
      if (typeof window !== 'undefined') { window.setTimeout(finish, 6000); }
      urls.forEach(function(url) {
        var img = new Image();
        var settle = function() { remaining--; if (remaining <= 0) { finish(); } };
        img.onload = settle;
        img.onerror = settle;
        img.src = url;
      });
    } catch (e) { resolve(); }
  });
}

/* Warm one board's preview. `board` is an Ember Data Board record (or a record
   ref carrying key/id), e.g. board-icon's `board_record`. No-op + safe on any
   missing/offline/error condition. */
export default function warm_board_preview(board) {
  try {
    if (!board || !board.variant_image_urls) { return; }
    if (persistence && persistence.get && persistence.get('online') === false) { return; }
    var key = board_ref(board);
    if (!key) { return; }
    if (warmed[key] || inflight[key]) { return; }
    if (Object.keys(inflight).length >= MAX_BOARDS_INFLIGHT) { return; }

    inflight[key] = true;
    var release = function() { delete inflight[key]; };
    var finish = function(rec) {
      warmed[key] = true;
      release();
      if (rec && rec.variant_image_urls) {
        try { warm_images(rec); } catch (e) { /* best-effort */ }
      }
    };

    LingoLinq.store.findRecord('board', key).then(function(rec) {
      if (image_urls_missing(rec)) {
        rec.reload().then(finish, release);
      } else {
        finish(rec);
      }
    }, release);
  } catch (e) { /* best-effort — warming must never throw into a hover handler */ }
}
