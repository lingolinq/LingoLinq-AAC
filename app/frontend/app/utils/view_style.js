import RSVP from 'rsvp';
import modal from './modal';
import { get as emberGet } from '@ember/object';
// The app-wide Classic/Modern view style.
//
// ONE preference governs the whole app — every page and the board — so a user
// who chooses Classic stays in Classic everywhere. It is stored on
// `preferences.board_view_style` for historical reasons: that key already
// existed, is already server-permitted (app/models/user.rb:2300) with a
// 'modern' default (:1774), and already drove the board route, so reusing it
// means no backend change and no migration for users who had already chosen
// Classic on a board.
//
// Read it THROUGH THIS MODULE rather than reaching for the key directly. The
// name is now narrower than the meaning (it governs far more than boards), so
// keeping every reader behind one function means renaming the key later is a
// change here instead of a change in ~18 files.
//
// Modern is the default: unset, missing, or any unrecognized value is modern.

export function is_classic(user) {
  if(!user) { return false; }
  /* emberGet, NOT `user.get(...)`. This used to bail to false for anything without a
     `.get` method, which silently answered "modern" for a user record held as a PLAIN
     OBJECT -- and `services/app-state.js:5166-5171` states that `currentUser` IS assigned
     a plain object in several places, which is why `effective_view_user` resolves with
     `emberGet` too. A wrong SHAPE became a wrong ANSWER rather than an error, so nothing
     surfaced: `board_view_route` (utils/board_view.js) decides where a user lands after
     creating, importing or picking a board, and a Basic user was pushed into the Modern
     board shell -- the exact outcome the comment at that call site says must not happen.
     emberGet reads a path through both shapes, so an Ember record behaves as before. */
  return emberGet(user, 'preferences.board_view_style') === 'classic';
}

// The style as a string, for writing back or for display.
export function view_style(user) {
  return is_classic(user) ? 'classic' : 'modern';
}

// The opposite of what the user is on now — what the View switcher offers.
export function other_view_style(user) {
  return is_classic(user) ? 'modern' : 'classic';
}

// Persist a new style on the user record. Sets `preferences.device.updated` the
// same way the board's Modern/Classic toggle does
// (controllers/board/index.js#go_to_modern) so the change syncs like any other
// preference edit. Save failures are swallowed: the in-memory preference has
// already flipped, so the UI is correct for this session either way.
export function set_view_style(user, style) {
  if(!user || typeof user.set !== 'function') { return false; }
  var next = (style === 'classic') ? 'classic' : 'modern';
  /* CREATE THE CONTAINERS FIRST — BEFORE the writes below, not between them. A nested
     `set()` THROWS ("object in path could not be found") on a record whose `preferences`
     carry no such container, and it throws from inside the caller's click handler: the
     style would flip in memory at best, the save would never run, and the caller's overlay
     and transition after this call would never execute, so the choice silently failed to
     persist. Both writes need the guard — `preferences` for the style itself and
     `preferences.device` for the dirty bit. components/boards-layout-toggle.js hit this and
     guards the same way; this helper was one of the "other call sites" its comment says
     assume the containers exist. */
  if(!user.get('preferences')) { user.set('preferences', {}); }
  user.set('preferences.board_view_style', next);
  if(user.save) {
    if(!user.get('preferences.device')) { user.set('preferences.device', {}); }
    user.set('preferences.device.updated', true);
    /* THE REJECTION IS LOGGED, NOT SWALLOWED (2026-09-24). This was `.then(null, function() { })`,
       and that empty handler is why a real bug hid here for weeks: `save()` was rejecting before
       it issued any request -- "Converting circular structure to JSON" out of the `supervisees`
       attribute (see serializers/user.js) -- so the view flipped in memory and silently reverted
       on the next page that refreshed the record. Two separate reports of "it switched my view"
       traced back to this one silent catch.
       Still non-fatal: the in-memory preference has already flipped and the UI is correct for
       this session either way, which is why the promise is absorbed rather than rethrown. But it
       says so now, so the next failure of this kind shows up in the console instead of as a
       mystery. */
    user.save().then(null, function(err) {
      console.error('LingoLinq: view style did not persist', err);
    });
  }
  return true;
}

/* A view change writes a PREFERENCE ON A USER RECORD, and that user is not always the person
 * clicking. `app_state.effective_view_user` resolves to the communicator while a supervisor
 * models for them, or while the supervisor is on that communicator's pages, so the same
 * control that changes your own view changes SOMEONE ELSE'S default when it is pointed at
 * them: stored on their record, synced to every device they use, and persisting long after
 * the modelling session ends.
 *
 * Every write path therefore goes through here first. It resolves TRUE when it is safe to
 * proceed and FALSE when the person cancelled, so a caller's navigation, overlay and save all
 * stay inside the `.then` and none of them run on a cancel.
 *
 * Changing your OWN view resolves immediately with no modal: the warning would be noise, and
 * the whole point is to flag the case where the consequence lands on someone else.
 */
export function confirm_view_style_change(app_state, next) {
  var target = app_state && app_state.get && app_state.get('effective_view_user');
  var current = app_state && app_state.get && app_state.get('currentUser');
  if(!target || !current) { return RSVP.resolve(true); }
  var target_id = emberGet(target, 'id');
  var current_id = emberGet(current, 'id');
  /* Unknown ids resolve to "same person" rather than prompting. A spurious warning about
     changing somebody else's settings is worse than none: it teaches people to click through
     the dialog, which is exactly what stops the real one from working. */
  if(!target_id || !current_id || target_id == current_id) { return RSVP.resolve(true); }
  return modal.open('confirm-view-style-change', {
    user_name: emberGet(target, 'user_name'),
    style: next
  }).then(function(result) {
    return result === 'change_view';
  }, function() {
    return false;
  });
}

export default is_classic;
