import { is_classic } from './view_style';

// Which route to open a board in, honoring the user's `board_view_style`
// preference:
//   'classic'                  -> 'user.board-alt'     (classic speak grid)
//   anything else, incl. unset -> 'user.board-detail'  (modern panelled view)
//
// The modern board-detail view is the DEFAULT — i.e. before the user has chosen,
// or whenever the preference is missing/garbage. Use this wherever the app
// navigates a user TO a board so the choice is honored consistently. The catch-all
// `board` route (routes/board.js) applies the same rule for canonical `/key` URLs.
//
// `user` is the (referenced/current) user record; pass null safely.
// The classic/modern decision itself lives in utils/view_style.js — this module
// only maps that decision onto a board ROUTE, so the preference key has one reader.
export function board_view_route(user) {
  return is_classic(user) ? 'user.board-alt' : 'user.board-detail';
}

/* WHICH BOARD KEYS LIVE IN THE TWO VIEW ROUTES AT ALL (2026-10-02). A user's board is
   `<owner>/<name>` and opens in board-alt (Basic) or board-detail (Modern). Keys under `obf/`
   (Liked Boards, eval, emergency boards) and `integrations/` are not owned by a user: the catch-all
   board route keeps them on the legacy board page in either view (routes/board.js), and the View
   menu must leave them there too -- splitting one made "obf" a user name and stranded the page
   (components/view-switcher.js; scripts/view-switch-obf-board-qa.mjs). */
export function opens_in_view_route(key) {
  if(!key || typeof key !== 'string' || key.indexOf('/') === -1) { return false; }
  return !key.match(/^integrations\//) && !key.match(/^obf\//);
}

export default board_view_route;

// Where to send a user who should land on a board IN EDIT MODE.
//
// The two shells differ structurally here: board-detail has a dedicated `/edit`
// subroute, while the classic board has NO edit route at all (router.js: the
// `board-alt` block declares only `index`). Classic editing is a MODE on the
// same page, entered through `app_state.toggle_edit_mode` — so the classic
// answer is the board itself, and the caller enters edit mode there.
//
// Returns the route name only; `wants_edit_mode(user)` tells the caller whether
// it still has to flip edit mode on after arriving.
export function board_edit_route(user) {
  return is_classic(user) ? 'user.board-alt.index' : 'user.board-detail.edit';
}

// True when board_edit_route() returned a plain board route, meaning edit mode
// is the caller's responsibility rather than the route's.
export function board_edit_needs_mode(user) {
  return is_classic(user);
}
