import { module, test } from 'qunit';
import { capPreviewBoards, previewUsesFullCards, PREVIEW_BOARDS_MAX } from 'frontend/utils/preview-boards';

/* THE HOME BOARDS CARD'S LIST (2026-10-10, requested: "on full sized screens, show up to 12 boards by
 * default", Crisis Vocabulary counted among them, and "if there are 5 or fewer boards ... show the
 * full-sized board cards ... instead of the compressed versions"). Up to 6 below 1025px is CSS
 * (app.scss), which hides the boards past the fifth and keeps Crisis.
 */
module('Unit | Utility | preview-boards', function() {
  function items(n) { var out = []; for (var i = 1; i <= n; i++) { out.push({ key: 'u/b' + i }); } return out; }
  var crisis = { key: 'example/crisis-vocabulary', isEmergency: true };
  function keys(list) { return list.map(function(b) { return b.key; }); }

  test('the limit is 12', function(assert) {
    assert.strictEqual(PREVIEW_BOARDS_MAX, 12);
  });

  test('a long library: 11 boards, then Crisis Vocabulary last (12 in all)', function(assert) {
    var out = capPreviewBoards(items(20), crisis);
    assert.strictEqual(out.length, 12);
    assert.deepEqual(keys(out).slice(0, 11), keys(items(11)), 'the first 11 in their order');
    assert.strictEqual(out[11], crisis, 'Crisis is the twelfth');
  });

  test('a short library: every board, then Crisis', function(assert) {
    assert.deepEqual(keys(capPreviewBoards(items(3), crisis)), ['u/b1', 'u/b2', 'u/b3', crisis.key]);
  });

  test('Crisis already in the list is not added twice, and does not cost a slot', function(assert) {
    var list = items(20); list.splice(2, 0, { key: crisis.key });
    var out = capPreviewBoards(list, crisis);
    assert.strictEqual(out.length, 12);
    assert.strictEqual(keys(out).filter(function(k) { return k === crisis.key; }).length, 1);
  });

  test('no Crisis board available: up to 12 of the user\'s boards', function(assert) {
    assert.strictEqual(capPreviewBoards(items(20), null).length, 12);
  });

  test('full-size cards for 5 or fewer boards shown, compact rows above that', function(assert) {
    assert.true(previewUsesFullCards(1));
    assert.true(previewUsesFullCards(5));
    assert.false(previewUsesFullCards(6));
    assert.false(previewUsesFullCards(0), 'nothing to show is not a card layout');
  });
});
