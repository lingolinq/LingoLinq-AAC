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
export function board_view_route(user) {
  var pref = user && user.get && user.get('preferences.board_view_style');
  return (pref === 'classic') ? 'user.board-alt' : 'user.board-detail';
}

export default board_view_route;
