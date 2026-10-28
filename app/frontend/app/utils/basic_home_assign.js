import RSVP from 'rsvp';
import i18n from './i18n';
import modal from './modal';
import { copy_or_reuse_as_home } from './board-copy';

/* BASIC HOME PAGE, Boards view: "Assign Home Board" / "Change Home Board" (requested 2026-10-12).
 *
 * The same flow as Modern's Boards page Set Home Board mode (components/available-boards-section.js,
 * `_assignHomeBoard`), wired SEPARATELY for Basic on request ("their functionality should not
 * overlap each other as they are different views"). It shares only the view-neutral pieces: the
 * confirm-home-board-copy dialog and utils/board-copy.js#copy_or_reuse_as_home. Modern's code is not
 * touched by this file, and this file is used only by components/dashboard/classic-view.js.
 *
 *   - A board the user owns (key `<user_name>/...`): set as home (copy_or_reuse_as_home resolves an
 *     owned board without copying), then the dialog opens at its last step to ask whether to open it.
 *   - Anyone else's board: the dialog asks to copy it, copies with progress (messages every 30s,
 *     Cancel), then offers to open it.
 * Basic's lists do not sort the home board first, so there is no "follow it to the top" movement
 * here (that is Modern's utils/home-move.js).
 *
 * `deps`: { copyAsHome?, openDialog?, onAssigned(home), openBoard(home), showError? }; the
 * defaults are the real helpers, so tests can observe each step.
 */
export function basic_home_button_label(hasHome) {
  return hasHome ?
    i18n.t('change_home_board', "Change Home Board") :
    i18n.t('assign_home_board', "Assign Home Board");
}

export function assign_home_board_basic(board, user, deps) {
  deps = deps || {};
  var copyAsHome = deps.copyAsHome || copy_or_reuse_as_home;
  var openDialog = deps.openDialog || function(template, opts) { return modal.open(template, opts); };
  var showError = deps.showError || function(msg) { modal.error(msg); };
  var key = board && (board.get ? board.get('key') : board.key);
  var userName = user && user.get && user.get('user_name');
  if (!key || !userName) { return RSVP.resolve(); }
  var dialog = {
    board: board,
    user: user,
    copyAsHome: copyAsHome,
    onDone: function(home) { if (deps.onAssigned) { deps.onAssigned(home); } },
    onOpenBoard: function(home) { if (deps.openBoard) { deps.openBoard(home); } }
  };
  if (key.indexOf(userName + '/') === 0) {
    return copyAsHome(board, user).then(function(home) {
      home = home || board;
      if (deps.onAssigned) { deps.onAssigned(home); }
      return openDialog('confirm-home-board-copy', Object.assign(dialog, { stage: 'done', copied: false, home: home }));
    }, function(err) {
      showError((typeof err === 'string' && err) ? err : i18n.t('set_as_home_failed', "Home board update failed unexpectedly"));
    });
  }
  return openDialog('confirm-home-board-copy', dialog);
}

/* The tile pointer while the mode is on: a house. Same picture as Modern's Boards page cursor
   (components/available-boards-section.js, HOME_CURSOR), kept as Basic's own copy so the two views
   stay independent; the `copy` keyword is the fallback where SVG cursors are not supported. */
export const BASIC_HOME_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24'%3E%3Cpath d='M12 3L2 12h3v8h6v-6h2v6h6v-8h3z' fill='%231B365D' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E\") 14 14, copy";
