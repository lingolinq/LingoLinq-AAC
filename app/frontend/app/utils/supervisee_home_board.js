// Resolve a supervisee entry's home-board key.
//
// Entries in `currentUser.known_supervisees` are RAW payload objects, not Ember
// Data records, and the key arrives under one of several shapes depending on
// which endpoint produced the entry. Reading `home_board_key` alone (as the
// pre-2020 dashboard did) silently misses the other three, which shows up as a
// supervisee whose Model/Speak actions look unavailable even though they have a
// board.
//
// Extracted from controllers/caseload.js so the caseload page and the classic
// home page resolve it identically — the two are the only surfaces that render
// per-supervisee board actions, and they must agree on who has a board.
export function resolveSuperviseeHomeBoardKey(s) {
  if (!s || typeof s !== 'object') {
    return null;
  }
  return (
    s.home_board_key ||
    s.homeBoardKey ||
    (s.home_board && typeof s.home_board === 'object' && s.home_board.key) ||
    (s.preferences && s.preferences.home_board && s.preferences.home_board.key) ||
    null
  );
}

export default resolveSuperviseeHomeBoardKey;
