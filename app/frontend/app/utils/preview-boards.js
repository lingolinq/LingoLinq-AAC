// The home page Boards card's list, after it has been ordered (home board, starred, then the rest;
// components/dashboard/authenticated-view.js#previewBoards).
//
// UP TO 12, CRISIS VOCABULARY INCLUDED (requested 2026-10-10: "on full sized screens, show up to 12
// boards by default"). Crisis takes one of the 12 and comes last (first when it is the home board),
// so a long library shows 11 of the user's boards and Crisis. 1024px and below show up to 6: app.scss
// hides the boards past the fifth there and keeps Crisis (`.md-card--boards__item--crisis`).
var PREVIEW_BOARDS_MAX = 12;

// When Crisis is also in the list (the user's home board, or a board the user owns), that entry is
// used instead, keeping its loaded record and gaining the Crisis flag. As the HOME board it stays
// first, since home always leads (dashboard/authenticated-view.js#previewBoards); otherwise it
// moves to the end.
function capPreviewBoards(ordered, crisis, max) {
  var limit = max || PREVIEW_BOARDS_MAX;
  var list = ordered || [];
  if (!crisis) { return list.slice(0, limit); }
  var own = list.find(function(b) { return b.key === crisis.key; });
  if (own && own.isHome) {
    return list.map(function(b) { return b === own ? Object.assign({}, own, { isEmergency: true }) : b; }).slice(0, limit);
  }
  var others = list.filter(function(b) { return b.key !== crisis.key; });
  var last = own ? Object.assign({}, own, { isEmergency: true }) : crisis;
  return others.slice(0, limit - 1).concat([last]);
}

// FULL-SIZE BOARD CARDS WHEN THERE ARE 5 OR FEWER (requested 2026-10-10): the Boards page's detailed
// cards instead of its compact rows. Counts the boards the card shows, Crisis included.
function previewUsesFullCards(count) {
  return count > 0 && count <= 5;
}

export { PREVIEW_BOARDS_MAX, capPreviewBoards, previewUsesFullCards };
