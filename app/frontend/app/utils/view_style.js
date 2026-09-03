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
  if(!user || typeof user.get !== 'function') { return false; }
  return user.get('preferences.board_view_style') === 'classic';
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
  user.set('preferences.board_view_style', next);
  if(user.save) {
    user.set('preferences.device.updated', true);
    user.save().then(null, function() { });
  }
  return true;
}

export default is_classic;
