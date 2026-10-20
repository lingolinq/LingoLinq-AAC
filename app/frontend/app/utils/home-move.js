/* FOLLOW THE HOME BOARD TO THE TOP OF MY BOARDS (requested 2026-10-11).
 * Setting a home board from the Boards page re-sorts My Boards at once (home first,
 * controllers/user/index.js, the Mine-tab sort), behind the "open your new home board?" dialog.
 * When the user says Not now, this replays that re-sort as movement so the board doesn't seem to
 * vanish from where they clicked it:
 *   snapshotTiles(grid)   -- before the save: where every tile is, by data-board-key, in page coords.
 *   playHomeMove(grid, snapshot, homeKey, opts)
 *                         -- after: each tile that moved starts at its old place and glides to its
 *                            new one (FLIP); the home tile is highlighted, or, if it wasn't on screen
 *                            before (a new copy), arrives with an entrance highlight; the page
 *                            scrolls smoothly to where it ends up (#content on the boards page).
 * Reduced motion (the OS setting, or opts.reducedMotion): no gliding, an instant scroll, and the
 * highlight only. The highlight classes are styled in app.scss next to `.ub-boards-page__board-item`.
 */
var TILE = '[data-board-key]';
var GLIDE_MS = 700;
var HIGHLIGHT_MS = 2200;

function pageRect(el) {
  var r = el.getBoundingClientRect();
  return { left: r.left + window.scrollX, top: r.top + window.scrollY };
}

export function snapshotTiles(grid) {
  var snap = {};
  if (!grid) { return snap; }
  grid.querySelectorAll(TILE).forEach(function(el) {
    if (el.getBoundingClientRect().height > 0) { snap[el.getAttribute('data-board-key')] = pageRect(el); }
  });
  return snap;
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* The element that actually scrolls the board into view: on the boards page that is #content, not
 * the window (the window's scrollY stays 0 there). Null means the window. */
function scrollParent(el) {
  for (var n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    var oy = window.getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) { return n; }
  }
  return null;
}

/* Scroll so the home board's FINAL place (`rect`, measured before any FLIP transform) is centred,
 * when it is not already comfortably on screen. Measured before the glide on purpose: once the
 * transforms are applied the board is still drawn at its old place, and both a visibility check and
 * scrollIntoView would then aim at where it WAS. */
function scaleOf(sc) {
  if (!sc || !sc.offsetHeight) { return 1; }
  return (sc.getBoundingClientRect().height / sc.offsetHeight) || 1;
}

function scrollToFinal(home, rect, reduced) {
  var sc = scrollParent(home);
  var viewTop = sc ? sc.getBoundingClientRect().top : 0;
  var viewH = sc ? sc.clientHeight : window.innerHeight;
  // 80px: the fixed navbar covers the top of the viewport.
  if (rect.top >= Math.max(viewTop, 0) + 80 && rect.bottom <= viewTop + viewH * scaleOf(sc)) { return; }
  var delta = rect.top - viewTop - (viewH * scaleOf(sc) - rect.height) / 2;
  delta = delta / scaleOf(sc); // on-screen pixels -> scroll pixels (differ only under a CSS scale)
  var behavior = reduced ? 'auto' : 'smooth';
  if (sc) {
    sc.scrollTo({ top: Math.max(0, sc.scrollTop + delta), behavior: behavior });
  } else {
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: behavior });
  }
}

function highlight(el, cls) {
  el.classList.add(cls);
  window.setTimeout(function() { el.classList.remove(cls); }, HIGHLIGHT_MS);
}

export function playHomeMove(grid, snapshot, homeKey, opts) {
  opts = opts || {};
  if (!grid) { return; }
  var reduced = opts.reducedMotion === undefined ? prefersReducedMotion() : opts.reducedMotion;
  var home = null;
  var homeRect = null;
  var moved = [];
  grid.querySelectorAll(TILE).forEach(function(el) {
    var key = el.getAttribute('data-board-key');
    if (key === homeKey) { home = el; homeRect = el.getBoundingClientRect(); }
    var was = snapshot && snapshot[key];
    if (reduced || !was || el.getBoundingClientRect().height === 0) { return; }
    var now = pageRect(el);
    var dx = was.left - now.left;
    var dy = was.top - now.top;
    if (dx || dy) { moved.push({ el: el, dx: dx, dy: dy }); }
  });
  // FLIP: put every moved tile back where it was, then release them together.
  moved.forEach(function(m) {
    m.el.style.transition = 'none';
    m.el.style.transform = 'translate(' + m.dx + 'px, ' + m.dy + 'px)';
  });
  if (moved.length) {
    void grid.offsetHeight; // commit the starting positions before the transition starts
    moved.forEach(function(m) {
      m.el.style.transition = 'transform ' + GLIDE_MS + 'ms cubic-bezier(0.2, 0.7, 0.2, 1)';
      m.el.style.transform = '';
    });
    window.setTimeout(function() {
      moved.forEach(function(m) { m.el.style.transition = ''; });
    }, GLIDE_MS + 50);
  }
  if (!home) { return; }
  var arrived = !(snapshot && snapshot[homeKey]);
  highlight(home, arrived && !reduced ? 'ub-boards-page__board-item--home-arrived' : 'ub-boards-page__board-item--home-moved');
  if (opts.scroll !== false && homeRect) { scrollToFinal(home, homeRect, reduced); }
}

/* Calls back with the grid once a tile with `key` is rendered there and passes `ready(el)` (after a
 * tab switch or a reload the list renders a little later), or with null after `timeoutMs`. */
export function whenTile(selector, key, timeoutMs, ready, callback) {
  var start = Date.now();
  var tick = function() {
    var grid = document.querySelector(selector);
    var el = grid && grid.querySelector('[data-board-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
    if (el && el.getBoundingClientRect().height > 0 && (!ready || ready(el))) { callback(grid); return; }
    if (Date.now() - start > timeoutMs) { callback(null); return; }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}
