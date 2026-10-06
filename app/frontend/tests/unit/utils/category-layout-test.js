import { module, test } from 'qunit';
import { resolve_category_layout } from 'frontend/utils/category_layout';

/* A board's saved category layout, resolved against the buttons the board page is showing
 * (2026-10-05; docs/task-management/2026-10-05_category-layout-on-board.md). The layout places
 * every button and names the outlined block each cell belongs to; outlines are drawn where the
 * block changes, so two blocks of the SAME category (the keyboard folder and the keys on
 * Vocal Flair 112) still get a line between them.
 */
module('Unit | Utility | category_layout', function() {
  function btn(id, label) { return { id: id, label: label }; }

  // The board's own grid: 2 rows x 3 columns.
  var rows = [
    [btn(1, 'I'), btn(2, 'go'), btn('3', 'big')],
    [btn(4, 'q'), btn(5, 'w'), { id: 'fake_1_2', label: '', empty: true }]
  ];

  var layout = {
    version: 1, rows: 2, columns: 3,
    order: [[1, 2, '3'], [4, 5, null]],
    cells: [[0, 1, 1], [2, 3, null]],
    blocks: [{ category: 'people' }, { category: 'actions' }, { category: 'keyboard' }, { category: 'keyboard' }]
  };

  function at(res, r, c) { return res.cells.find(function(cell) { return cell.row === r && cell.col === c; }); }

  test('places each button where the layout says, matching ids as strings or numbers', function(assert) {
    var swapped = Object.assign({}, layout, { order: [[2, 1, 3], [4, 5, null]] });
    var res = resolve_category_layout(swapped, rows);
    assert.strictEqual(at(res, 0, 0).btn.label, 'go');
    assert.strictEqual(at(res, 0, 1).btn.label, 'I');
    assert.strictEqual(at(res, 0, 2).btn.label, 'big', 'numeric 3 in the layout matches the string id "3"');
    assert.strictEqual(res.rows, 2);
    assert.strictEqual(res.columns, 3);
    assert.strictEqual(res.cells.length, 6, 'one cell per grid position');
  });

  test('cells come out in visual reading order (row by row), so DOM order matches what is seen', function(assert) {
    var res = resolve_category_layout(layout, rows);
    var positions = res.cells.map(function(cell) { return cell.row + ',' + cell.col; });
    assert.deepEqual(positions, ['0,0', '0,1', '0,2', '1,0', '1,1', '1,2']);
  });

  test('each cell takes its block category; a cell with no block is extra', function(assert) {
    var res = resolve_category_layout(layout, rows);
    assert.strictEqual(at(res, 0, 0).category, 'people');
    assert.strictEqual(at(res, 0, 1).category, 'actions');
    assert.strictEqual(at(res, 1, 0).category, 'keyboard');
    assert.strictEqual(at(res, 1, 2).category, 'extra');
  });

  test('outlines sit where the BLOCK changes, even between two blocks of the same category', function(assert) {
    var res = resolve_category_layout(layout, rows);
    var go = at(res, 0, 1);
    assert.deepEqual(go.edges, { top: true, right: false, bottom: true, left: true }, 'go: block 1 continues to its right only');
    var big = at(res, 0, 2);
    assert.deepEqual(big.edges, { top: true, right: true, bottom: true, left: false });
    var q = at(res, 1, 0);
    var w = at(res, 1, 1);
    assert.true(q.edges.right, 'q (block 2) is outlined against w (block 3), both keyboard');
    assert.true(w.edges.left);
  });

  test('a cell with no block is outlined on its own', function(assert) {
    var res = resolve_category_layout(layout, rows);
    assert.deepEqual(at(res, 1, 2).edges, { top: true, right: true, bottom: true, left: true });
  });

  test('a layout id the board no longer shows becomes an empty cell, never a fallback', function(assert) {
    var gone = Object.assign({}, layout, { order: [[1, 99, '3'], [4, 5, null]] });
    var res = resolve_category_layout(gone, rows);
    assert.true(at(res, 0, 1).btn.empty, 'empty cell where id 99 was');
    assert.strictEqual(at(res, 0, 1).category, 'actions', 'the cell keeps its block');
  });

  test('a button the layout does not place takes the first free cell, so nothing disappears', function(assert) {
    var missing_go = Object.assign({}, layout, { order: [[1, null, '3'], [4, 5, null]], cells: [[0, null, 1], [2, 3, null]] });
    var res = resolve_category_layout(missing_go, rows);
    assert.strictEqual(at(res, 0, 1).btn.label, 'go', 'go fills the first empty cell');
    assert.strictEqual(at(res, 0, 1).category, 'extra');
  });

  test('the scan order matrix is the visual placement, by button id', function(assert) {
    var res = resolve_category_layout(Object.assign({}, layout, { order: [[2, 1, 3], [4, 5, null]] }), rows);
    assert.deepEqual(res.order, [[2, 1, '3'], [4, 5, null]]);
  });

  test('works with Ember-style buttons that need get()', function(assert) {
    var ember_rows = rows.map(function(row) {
      return row.map(function(b) { return { get: function(k) { return b[k]; } }; });
    });
    var res = resolve_category_layout(layout, ember_rows);
    assert.strictEqual(at(res, 0, 0).btn.get('label'), 'I');
  });

  test('returns null for a missing or malformed layout, so the caller keeps its normal grid', function(assert) {
    assert.strictEqual(resolve_category_layout(null, rows), null);
    assert.strictEqual(resolve_category_layout({ rows: 0, columns: 3, order: [] }, rows), null);
    assert.strictEqual(resolve_category_layout({ rows: 2, columns: 3 }, rows), null);
  });
});
