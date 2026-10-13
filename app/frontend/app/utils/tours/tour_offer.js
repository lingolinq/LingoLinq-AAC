/**
 * THE TOUR OFFER (2026-10-12, tour redesign: docs/task-management/2026-10-12_tour-redesign.md).
 *
 * Requested: "Offer the tour after the person has talked once." After a communicator's first spoken
 * message, a small one-time "Take a quick tour (1 min)?" prompt (components/tour-offer) with Start and
 * Not now. maybe_offer_tour is called by utils/utterance.js#vocalize_list (Basic's and Modern's usual
 * speak path) and by Modern's fallback for a bar of quick phrases, which skips vocalize_list
 * (controllers/user/board-detail.js#_speak_current_sentence).
 *
 * Shown once: preferences.progress.guided_tours_autoshown.tour_offer is written when it shows, and also
 * when the person already chose "Take a quick tour" on the welcome (utils/tours/start_talking.js). That
 * map, not a new progress key, because the server keeps only the progress keys it lists
 * (app/models/user.rb PROGRESS_PARAMS) and already keeps this one. Never for a supporter, outside Speak
 * Mode, or for someone who has finished a board tour.
 *
 * Start arms the communicator board tour on the board on screen through arm_board_tour, the same flags
 * "Take a quick tour" sets, which components/guided-tour.js already consumes.
 */
import { is_classic } from '../view_style';

var OFFER_KEY = 'tour_offer';
var BOARD_TOUR_KEY = /^(board_alt_speak|board_detail_speak_)/;

// Fresh copies at every level, so ember-data sees the change and saves it (as guided-tour.js#_markTourCompleted).
export function mark_tour_offered(user) {
  if (!user || !user.get || user.get('preferences.progress.guided_tours_autoshown.' + OFFER_KEY)) { return; }
  var prefs = Object.assign({}, user.get('preferences') || {});
  var progress = Object.assign({}, prefs.progress || {});
  var shown = Object.assign({}, progress.guided_tours_autoshown || {});
  shown[OFFER_KEY] = true;
  progress.guided_tours_autoshown = shown;
  prefs.progress = progress;
  user.set('preferences', prefs);
  if (user.save) { user.save().then(null, function() { /* best-effort */ }); }
}

// The communicator board tour on `key`: Basic's board-alt flag, or Modern's board-detail speak flags.
// MANUAL on Modern: the person asked for it, so it runs even if a board tour auto-opened for them before.
export function arm_board_tour(appState, user, key) {
  if (is_classic(appState.get('effective_view_user') || user)) {
    appState.set('board_alt_tour_pending', key);
  } else {
    appState.set('board_detail_tour_speak_manual', true);
    appState.set('board_detail_tour_pending_speak', key);
  }
}

export function maybe_offer_tour(appState) {
  if (!appState || !appState.get) { return false; }
  var user = appState.get('currentUser');
  if (!user || !user.get || user.get('supporter_role')) { return false; }
  // Switch-scanning and eye-gaze/dwell users cannot reach the card (it is no scanner target and in no dwell
  // region) and it would cover bottom-row buttons, so it is not offered to them (final review, 2026-10-13).
  if (user.get('preferences.device.scanning') || user.get('preferences.device.dwell')) { return false; }
  // Speaking as someone else: in Speak Mode `currentUser` is the Speak Mode user, not the person signed in.
  var session = appState.get('sessionUser');
  if (session && session !== user && (session.get ? session.get('id') : session.id) !== user.get('id')) { return false; }
  if (!appState.get('speak_mode') || !appState.get('currentBoardState.key')) { return false; }
  var progress = user.get('preferences.progress') || {};
  if ((progress.guided_tours_autoshown || {})[OFFER_KEY]) { return false; }
  var finished = Object.keys(progress.guided_tours_completed || {}).some(function(k) { return BOARD_TOUR_KEY.test(k); });
  if (finished) { return false; }
  mark_tour_offered(user);
  appState.set('tour_offer_user', user.get('id'));
  appState.set('tour_offer_visible', true);
  return true;
}

export function accept_tour_offer(appState) {
  appState.set('tour_offer_visible', false);
  var key = appState.get('currentBoardState.key');
  if (key) { arm_board_tour(appState, appState.get('currentUser'), key); }
}

export function dismiss_tour_offer(appState) {
  appState.set('tour_offer_visible', false);
}

// They left Speak Mode: the offer ends (it is shown once), and a Basic board tour that never started is
// dropped, so it cannot hold back the Speak Mode intro or start later, unasked (services/app-state.js).
export function end_speak_mode_tour_state(appState) {
  appState.set('tour_offer_visible', false);
  appState.set('tour_offer_user', null);
  appState.set('board_alt_tour_pending', null);
}
