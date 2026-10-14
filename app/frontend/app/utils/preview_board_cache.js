// Cross-navigation cache of a user's Boards-card previews (stale-while-revalidate), keyed by user
// global_id and holding { preview, full } record lists. It lives OUTSIDE the dashboard component so
// it survives navigation between the dashboard and other tabs, and it is cleared by
// app-state.js#clear_user_state on logout (alongside boardDetailCache) so a user's board names and
// image urls do not linger in memory on a shared device (FERPA/HIPAA/COPPA data teardown). See
// components/dashboard/authenticated-view.js (_loadPreviewBoards / _fetchRemainingForCount).
//
// Mirrors the standalone-module pattern of utils/board_detail_cache.js: a plain in-memory cache a
// component reads/writes and clear_user_state empties, with no Ember object or service wiring.

var _cache = {};

// The cached entry for a user, or undefined when nothing is cached yet.
function get(userId) {
  return _cache[userId];
}

// The cached entry for a user, created empty if absent. Always returns an object to assign into.
function ensure(userId) {
  _cache[userId] = _cache[userId] || {};
  return _cache[userId];
}

// Drop every user's cached previews. Called on logout so board names/urls do not survive into the
// next account on a shared device.
function reset() {
  _cache = {};
}

export { get, ensure, reset };
export default { get: get, ensure: ensure, reset: reset };
