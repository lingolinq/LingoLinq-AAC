// Per-user, per-device session continuity.
//
// This is the single owner of the "where was this user last?" storage. It is
// deliberately NOT kept in `stashes`: `session.invalidate()` calls
// `stashes.flush()` (services/session.js), which deletes every
// `lingolinqStash-` key, so nothing stashed survives a logout. These keys sit
// outside that prefix on purpose so they can be read back on the NEXT login.
//
// Two records are kept, both keyed by `user_name` so a shared device keeps each
// user's continuity separate:
//   ll_last_board_<user_name>    {name, key}      - last root board (dashboard cards)
//   ll_last_location_<user_name> {url, route, at} - last meaningful page (login landing)
var BOARD_PREFIX = 'll_last_board_';
var LOCATION_PREFIX = 'll_last_location_';

// Routes that must never be recorded as "where the user left off". Restoring
// any of these on login is either wrong (marketing pages, the login flow
// itself), destructive (one-shot wizards and purchase flows re-entered from the
// top), or unsafe (single-use, token-bearing URLs). Leaf route names, matched
// as prefixes so child routes are covered too.
var SKIP_ROUTES = [
  // the landing decision itself, and the auth flow around it
  'index', 'login', 'register', 'forgot_password', 'forgot_login',
  // single-use / token-bearing URLs
  'consent-response', 'lesson', 'utterance-reply', 'user.confirm_registration',
  'user.password_reset', 'redeem', 'redeem_with_code', 'gift_purchase',
  'bulk_purchase', 'start_codes',
  // one-shot onboarding and pickers
  'intro', 'setup', 'board-picker', 'beta-welcome', 'beta-welcome-message',
  // an in-progress evaluation must be started deliberately, never resumed by a login
  'eval',
  // editing is an explicit action, not a place to be dropped into on login;
  // the board-detail page underneath it stays recorded instead
  'user.board-detail.edit',
  // logged-out marketing / static content
  'about', 'landing-alt', 'download', 'terms', 'privacy', 'privacy-practices',
  'jobs', 'pricing', 'features', 'contact', 'partners', 'compare',
  'ambassadors', 'faq', 'bento',
  // test + demo harnesses
  'jasmine', 'demo'
];

var session_history = {
  // A route is recordable if it is a real destination the user chose to be on.
  recordable_route: function(route_name) {
    if(!route_name) { return false; }
    return !SKIP_ROUTES.find(function(skip) {
      return route_name === skip || route_name.indexOf(skip + '.') === 0;
    });
  },

  // --- last board (pre-existing behavior, now owned here) --------------------

  // Synthetic OBF boards (eval intro screens, emergency, stars, ...) live under
  // `obf/` and are minted in utils/obf.js with throwaway ids. Recording one as
  // the user's "last board" surfaces a dashboard card with a useless synthetic
  // name, so they are skipped.
  record_board: function(user_name, state) {
    if(!user_name || !state || !state.name) { return; }
    if(state.key && /^obf\//.test(state.key)) { return; }
    try {
      localStorage[BOARD_PREFIX + user_name] = JSON.stringify({name: state.name, key: state.key});
    } catch(e) { }
  },

  last_board: function(user_name) {
    if(!user_name) { return null; }
    try {
      var stored = localStorage[BOARD_PREFIX + user_name];
      return stored ? JSON.parse(stored) : null;
    } catch(e) {
      return null;
    }
  },

  clear_board: function(user_name) {
    if(!user_name) { return; }
    try { delete localStorage[BOARD_PREFIX + user_name]; } catch(e) { }
  },

  // --- last location --------------------------------------------------------

  record_location: function(user_name, route_name, url) {
    if(!user_name || !url) { return; }
    if(!session_history.recordable_route(route_name)) { return; }
    try {
      localStorage[LOCATION_PREFIX + user_name] = JSON.stringify({
        url: url,
        route: route_name,
        at: (new Date()).getTime()
      });
    } catch(e) { }
  },

  last_location: function(user_name) {
    if(!user_name) { return null; }
    try {
      var stored = localStorage[LOCATION_PREFIX + user_name];
      if(!stored) { return null; }
      var res = JSON.parse(stored);
      // A record written before a route joined SKIP_ROUTES must not be restored.
      if(!res || !res.url || !session_history.recordable_route(res.route)) { return null; }
      return res;
    } catch(e) {
      return null;
    }
  },

  clear_location: function(user_name) {
    if(!user_name) { return; }
    try { delete localStorage[LOCATION_PREFIX + user_name]; } catch(e) { }
  }
};

export default session_history;
