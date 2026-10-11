// The home page Boards card's list, after it has been ordered (home board, starred, then the rest;
// components/dashboard/authenticated-view.js#previewBoards).
//
// UP TO 12, CRISIS VOCABULARY INCLUDED (requested 2026-10-10: "on full sized screens, show up to 12
// boards by default"). Crisis is always last and takes one of the 12, so a long library shows 11 of
// the user's boards and then Crisis. 1024px and below show up to 6: app.scss hides the boards past
// the fifth there and keeps Crisis (`.md-card--boards__item--crisis`).
var PREVIEW_BOARDS_MAX = 12;

function capPreviewBoards(ordered, crisis, max) {
  var limit = max || PREVIEW_BOARDS_MAX;
  var list = ordered || [];
  var hasCrisis = !!crisis && list.some(function(b) { return b.key === crisis.key; });
  if (!crisis || hasCrisis) { return list.slice(0, limit); }
  return list.slice(0, limit - 1).concat([crisis]);
}

// FULL-SIZE BOARD CARDS WHEN THERE ARE 5 OR FEWER (requested 2026-10-10): the Boards page's detailed
// cards instead of its compact rows. Counts the boards the card shows, Crisis included.
function previewUsesFullCards(count) {
  return count > 0 && count <= 5;
}

export { PREVIEW_BOARDS_MAX, capPreviewBoards, previewUsesFullCards };
