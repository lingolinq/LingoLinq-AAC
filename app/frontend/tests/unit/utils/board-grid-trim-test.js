import { module, test } from 'qunit';
import { analyze_grid } from 'frontend/utils/board_grid';

/* "SAVE TRIMMED" NEVER DROPS A LABEL (2026-10-02, adversarial review, requested: "fix the label
 * drop"). The trim removes empty rows and columns. It rebuilt the labels from the cells inside the
 * grid only, so labels typed past the last cell -- which the board's "too many labels" warning is
 * about -- were silently deleted on save. They are now kept, in order, after the trimmed grid's.
 */
module('Unit | Utility | board_grid trim keeps overflow', function() {
  test('row order: labels past the grid survive the trim', function(assert) {
    assert.expect(3);
    // 2 x 3: a b c / _ _ _ , then x and y past the end.
    var g = analyze_grid({ labels: 'a,b,c,,,,x,y', rows: 2, columns: 3 });
    assert.true(g.can_trim);
    assert.deepEqual([g.trimmed.rows, g.trimmed.columns], [1, 3], 'the empty row goes');
    assert.strictEqual(g.trimmed.labels, 'a,b,c,x,y', 'x and y are kept after the grid');
  });

  test('column order: the same', function(assert) {
    assert.expect(2);
    // 3 x 2 column-major: column 0 = a b c, column 1 empty, then z past the end.
    var g = analyze_grid({ labels: 'a,b,c,,,,z', rows: 3, columns: 2, order: 'columns' });
    assert.deepEqual([g.trimmed.rows, g.trimmed.columns], [3, 1], 'the empty column goes');
    assert.strictEqual(g.trimmed.labels, 'a,b,c,z');
  });

  test('no overflow: unchanged', function(assert) {
    assert.expect(1);
    var g = analyze_grid({ labels: 'a,b,c,,,', rows: 2, columns: 3 });
    assert.strictEqual(g.trimmed.labels, 'a,b,c');
  });
});
