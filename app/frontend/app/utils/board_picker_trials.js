/**
 * THE BOARD PICKER REMEMBERS TRIALS (2026-10-13; tablet report: "Back loses your place", and requested: "Try
 * another returns to the same spot in the picker, with 'Recently tried' chips").
 *
 * remember_trial runs when Try is pressed (components/board-preview-overlay.js#try_board):
 *   - `board_picker_return`: where the picker was, so "Try another" can bring it back (components/board-picker.js
 *     #_restorePickerPlace): the category last chosen (`board_picker_category`, recorded by set_category) and
 *     how far the page was scrolled. Recorded now, not when the picker is torn down, because the picker page
 *     rebuilds its picker during page changes and a teardown save records a fresh picker's defaults.
 *   - `board_picker_recent`: the boards tried this session, newest first, no repeats, at most RECENT_MAX, for
 *     the picker page's "Recently tried" chips (templates/board-picker.hbs).
 * Session state on app-state; nothing is saved to the account.
 */
export var RECENT_MAX = 6;

function attr(board, name) { return board && (board.get ? board.get(name) : board[name]); }

export function remember_trial(appState, board, scroller) {
  var key = attr(board, 'key');
  if (!appState || !key) { return; }
  var recent = (appState.get('board_picker_recent') || []).filter(function(r) { return r && r.key !== key; });
  recent.unshift({ key: key, name: attr(board, 'name') || key, image: attr(board, 'icon_url_with_fallback') || attr(board, 'image_url') || null });
  appState.set('board_picker_recent', recent.slice(0, RECENT_MAX));
  appState.set('board_picker_return', {
    category: appState.get('board_picker_category') || null,
    scrollTop: scroller ? Math.round(scroller.scrollTop || 0) : 0
  });
}
