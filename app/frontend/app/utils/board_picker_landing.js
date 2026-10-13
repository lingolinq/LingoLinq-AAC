/**
 * WHERE THE BOARD PICKER SENDS YOU, BY VIEW (2026-09-30).
 *
 * Requested: in Basic, "Try this Board" and "Pick this Board" open the board on the Basic board
 * page (`board-alt`) in normal mode, and picking for a communicator opens their new home board;
 * Modern keeps the Modern board page (board-detail) and the communicator's boards list. The
 * decisions live here, apart from components/board-preview-overlay.js, which also paints the
 * transition overlay and so is hard to test as a whole.
 *
 * Basic goes through the `board` route rather than naming `user.board-alt`: routes/board.js
 * already resolves the board page for the viewer's view (utils/board_view.js), so there is one
 * place that decides it.
 */
import { is_classic } from './view_style';

export function open_picked_board(router, key, viewUser) {
  if(is_classic(viewUser)) { return router.transitionTo('board', key); }
  var parts = key.split('/');
  // Speak (use) mode = the board-detail INDEX route.
  return router.transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
}

export function after_pick_for_other(router, key, userName, viewUser) {
  if(is_classic(viewUser)) { return router.transitionTo('board', key); }
  return router.transitionTo('user.boards', userName);
}

/* A "Try" in Basic: the board tried and the user it would become home for (the communicator when
   the picker was opened for one). Read by components/basic-try-home-button.js on the Basic board
   page; kept in app state because the picker forgets its user when it is left. */
export function mark_basic_try(appState, key, user) {
  appState.set('basic_try_home', { key: key, user_id: user && user.get('id'), user_name: user && user.get('user_name') });
}

export function basic_try_for(appState, key) {
  var mark = appState.get('basic_try_home');
  return (mark && key && mark.key === key) ? mark : null;
}

export function clear_basic_try(appState) {
  appState.set('basic_try_home', null);
}

/* WHOSE TRY IS ON SCREEN (2026-10-01): 'other' when the board was tried for someone else (an SLP
   choosing for a communicator), 'self' when for the signed-in user (or no user was recorded), null
   when the board on screen was not tried. The board header shows ONE home button from this: the
   blue "Set as Home Board for X" (components/basic-try-home-button.js) for 'other', the grey "Set
   as Home" (templates/application.hbs, via helpers/basic-try-home.js) for 'self'. */
export function basic_try_target(appState) {
  var mark = basic_try_for(appState, appState.get('currentBoardState.key'));
  if(!mark) { return null; }
  return (mark.user_id && mark.user_id !== appState.get('currentUser.id')) ? 'other' : 'self';
}
