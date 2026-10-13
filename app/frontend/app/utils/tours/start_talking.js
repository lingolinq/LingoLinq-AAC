/**
 * "START TALKING NOW" (2026-10-12, tour redesign: docs/task-management/2026-10-12_tour-redesign.md).
 *
 * The communicator welcome's primary button: "We'll set up Vocal Flair 60. You can change it anytime."
 * Their own copy of Vocal Flair 60 (the signup provisioner already makes one, lib/system_board_sources.rb
 * SIGNUP_LIBRARY_SLUGS) becomes their home board, through the same copy-or-reuse as "Pick this Board"
 * (utils/board-copy.js), so an existing copy is reused rather than duplicated. Then Speak Mode opens on it
 * through app-state#home_in_speak_mode, which opens the board page for the user's view (Basic or Modern).
 *
 * `withTour` ("Take a quick tour (1 min)") also arms the communicator board tour for that board: Modern's
 * board-detail speak tour flag, or Basic's board-alt flag, both read by components/guided-tour.js.
 *
 * Every collaborator is injectable, so tests can observe each step.
 */
import RSVP from 'rsvp';
import i18n from '../i18n';
import modal from '../modal';
import { copy_or_reuse_as_home } from '../board-copy';
import { is_classic } from '../view_style';

export const STARTER_BOARD_KEY = 'lingolinq/vocal-flair-60';

export function start_talking_now(opts) {
  var appState = opts.appState;
  var user = opts.user || appState.get('currentUser');
  var findBoard = opts.findBoard || function(key) { return window.LingoLinq.store.findRecord('board', key); };
  var copyAsHome = opts.copyAsHome || copy_or_reuse_as_home;
  var showError = opts.showError || function(msg) { modal.error(msg); };
  if (!user) { return RSVP.resolve(null); }
  if (appState.show_loading_overlay) { appState.show_loading_overlay(i18n.t('loading_your_board', "Loading your board...")); }
  var hide = function() { if (appState.hide_loading_overlay) { appState.hide_loading_overlay(); } };
  return RSVP.resolve(findBoard(STARTER_BOARD_KEY)).then(function(board) {
    return copyAsHome(board, user, appState.get('label_locale'));
  }).then(function(home) {
    var key = home.get ? home.get('key') : home.key;
    var id = home.get ? home.get('id') : home.id;
    if (opts.withTour) {
      if (is_classic(appState.get('effective_view_user') || user)) {
        appState.set('board_alt_tour_pending', key);
      } else {
        // MANUAL: the person asked for it, so it runs even if a board tour auto-opened for them before.
        appState.set('board_detail_tour_speak_manual', true);
        appState.set('board_detail_tour_pending_speak', key);
      }
    }
    hide();
    appState.home_in_speak_mode({ user: user, force_board_state: { id: id, key: key } });
    return home;
  }, function(err) {
    hide();
    showError((typeof err === 'string' && err) ? err : i18n.t('start_talking_failed', "We couldn't set up your board. Please choose one."));
    if (opts.router) { opts.router.transitionTo('board-picker'); }
    return null;
  });
}
