import { module, test } from 'qunit';
import { availableHomeSections, layoutPresentation, HOME_SECTIONS, gridLayoutState } from 'frontend/utils/dashboard_sections';

/* Create a Board and Edit Dashboard leave the Modern home on 2026-10-12 (requested: "remove create
 * board button from the home page (not the one on the boards div), and remove edit dashboard ->
 * these should also be removed from the possibilities for shown items on the display design").
 * Retired the way My Account and Reports were (dashboard-sections-retired-test.js): registry
 * `available()` false, entries kept. The checks are that file's three, for these two cards: not
 * offered in Display Design, not visible in either layout, entry still present. The Boards card's
 * own "+ Create" button is separate markup and is not affected. */
module('Unit | Utility | dashboard sections: Create a Board and Edit Dashboard retired', function() {
  function stubUser(props) {
    var p = props || {};
    return { get: function(k) { return p[k]; } };
  }
  var RETIRED = ['createboard', 'editdashboard'];

  test('not offered in Display Design for any user shape', function(assert) {
    assert.expect(6);
    var shapes = {
      'a plain communicator': stubUser({}),
      'a supporter': stubUser({ supporter_role: true, supervisees: [], supervised_units: [] }),
      'an org manager': stubUser({ supporter_role: true, organizations: [], supervised_units: [] })
    };
    Object.keys(shapes).forEach((label) => {
      var keys = availableHomeSections(shapes[label]).map((s) => s.key);
      RETIRED.forEach((k) => {
        assert.strictEqual(keys.indexOf(k), -1, k + ' is not offered to ' + label);
      });
    });
  });

  test('not visible on the home page in either layout', function(assert) {
    assert.expect(4);
    ['gentle', 'focused'].forEach((layout) => {
      var vis = layoutPresentation(stubUser({}), layout).vis;
      RETIRED.forEach((k) => {
        assert.notOk(vis[k], k + ' is not visible in ' + layout + ' view');
      });
    });
  });

  test('the registry entries are kept', function(assert) {
    assert.expect(2);
    RETIRED.forEach((k) => {
      assert.true(HOME_SECTIONS.some((s) => s.key === k), k + ' still has a registry entry (retired, not deleted)');
    });
  });
});

/* The org dashboard's My Caseload | Speak pair needed an EVEN count of utility cards to split its
 * row down the middle (focusedLayout's `pairKeys`). With Create a Board retired, Extras alone is
 * one card, and the pair fell apart into two full-width rows. The grid now doubles its columns
 * when it needs to, so the pair stays side by side (found 2026-10-12 while retiring the card). */
module('Unit | Utility | dashboard sections: org pair survives an odd utility row', function() {
  test('one utility card: Caseload and Speak still share the bottom row, half each', function(assert) {
    var vis = { org: true, caseload: true, speak: true, extras: true };
    var state = gridLayoutState(vis, null, 'focused', 'org');
    var pairRow = state.areas.filter(function(r) { return /\bcaseload\b/.test(r) && /\bspeak\b/.test(r); });
    assert.strictEqual(pairRow.length, 1, 'one row holds both');
    var cells = pairRow[0] ? pairRow[0].split(' ') : [];
    assert.strictEqual(cells.filter(function(c) { return c === 'caseload'; }).length, cells.length / 2, 'Caseload takes half');
    var extrasRow = state.areas.filter(function(r) { return /\bextras\b/.test(r); })[0] || '';
    assert.true(extrasRow.split(' ').every(function(c) { return c === 'extras'; }), 'Extras fills its own row: ' + extrasRow);
  });
});
