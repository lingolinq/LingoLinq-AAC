import { module, test } from 'qunit';
import { analyze_grid } from 'frontend/utils/board_grid';

/* Geometry behind the Save Board completeness guard.
 *
 * The one fact this file exists to pin down is that `analyze_grid` lays cells out with the
 * SAME index mapping the live preview uses -- `components/create-board-new.js:1126`:
 *
 *     idx = (order === 'columns') ? (c * rows + r) : (r * cols + c)
 *
 * If the two ever drift, the dialog would tell someone a row is empty while the grid in
 * front of them shows it full, which is worse than not warning at all. The column-major
 * cases below are the ones that would catch that drift. */
module('Unit | Utility | board_grid', function() {
  test('an empty label string reads as an empty board, not a partial one', function(assert) {
    var res = analyze_grid({ labels: '', rows: 3, columns: 3 });
    assert.strictEqual(res.filled, 0);
    assert.strictEqual(res.total, 9);
    assert.true(res.is_empty);
    assert.false(res.is_partial);
    assert.false(res.can_trim);
  });

  test('a whitespace-only label string still reads as empty', function(assert) {
    var res = analyze_grid({ labels: '  ,  \n ', rows: 2, columns: 2 });
    assert.strictEqual(res.filled, 0);
    assert.true(res.is_empty);
  });

  test('a completely filled grid is neither empty nor partial', function(assert) {
    var res = analyze_grid({ labels: 'a,b,c,d', rows: 2, columns: 2 });
    assert.strictEqual(res.filled, 4);
    assert.false(res.is_empty);
    assert.false(res.is_partial);
    assert.false(res.can_trim);
    assert.deepEqual(res.empty_rows, []);
    assert.deepEqual(res.empty_columns, []);
  });

  test('trailing blank cells that do not clear a whole row are partial but not trimmable', function(assert) {
    // 2x2, three labels: the last cell is blank but row 1 still holds "c".
    var res = analyze_grid({ labels: 'a,b,c', rows: 2, columns: 2 });
    assert.strictEqual(res.filled, 3);
    assert.true(res.is_partial);
    assert.strictEqual(res.empty_count, 1);
    assert.false(res.can_trim);
  });

  test('a trailing empty row is detected and trimmed away', function(assert) {
    // 3x3 row-major, six labels: row 2 is untouched.
    var res = analyze_grid({ labels: 'a,b,c,d,e,f', rows: 3, columns: 3 });
    assert.true(res.is_partial);
    assert.deepEqual(res.empty_rows, [2]);
    assert.deepEqual(res.empty_columns, []);
    assert.true(res.can_trim);
    assert.strictEqual(res.trimmed.rows, 2);
    assert.strictEqual(res.trimmed.columns, 3);
    assert.strictEqual(res.trimmed.labels, 'a,b,c,d,e,f');
  });

  test('an interior empty row is removed and the labels below it move up', function(assert) {
    // 3x2 row-major: row 1 ("" , "") is blank, row 2 holds e/f.
    var res = analyze_grid({ labels: 'a,b,,,e,f', rows: 3, columns: 2 });
    assert.deepEqual(res.empty_rows, [1]);
    assert.true(res.can_trim);
    assert.strictEqual(res.trimmed.rows, 2);
    assert.strictEqual(res.trimmed.columns, 2);
    assert.strictEqual(res.trimmed.labels, 'a,b,e,f');
  });

  test('an empty column is detected and removed independently of rows', function(assert) {
    // 2x3 row-major: column 2 is blank in both rows.
    var res = analyze_grid({ labels: 'a,b,,d,e,', rows: 2, columns: 3 });
    assert.deepEqual(res.empty_rows, []);
    assert.deepEqual(res.empty_columns, [2]);
    assert.true(res.can_trim);
    assert.strictEqual(res.trimmed.rows, 2);
    assert.strictEqual(res.trimmed.columns, 2);
    assert.strictEqual(res.trimmed.labels, 'a,b,d,e');
  });

  test('an empty row and an empty column are trimmed together', function(assert) {
    // 3x3 row-major: row 2 blank, column 1 blank.
    var res = analyze_grid({ labels: 'a,,c,d,,f,,,', rows: 3, columns: 3 });
    assert.deepEqual(res.empty_rows, [2]);
    assert.deepEqual(res.empty_columns, [1]);
    assert.strictEqual(res.trimmed.rows, 2);
    assert.strictEqual(res.trimmed.columns, 2);
    assert.strictEqual(res.trimmed.labels, 'a,c,d,f');
  });

  test('column-major order lays cells out down the columns', function(assert) {
    // 2x3 column-major: indices 0,1 are column 0; 2,3 column 1; 4,5 column 2.
    // Blanking indices 4 and 5 empties COLUMN 2, not a row.
    var res = analyze_grid({ labels: 'a,b,c,d,,', rows: 2, columns: 3, order: 'columns' });
    assert.deepEqual(res.empty_columns, [2]);
    assert.deepEqual(res.empty_rows, []);
    assert.strictEqual(res.trimmed.columns, 2);
    assert.strictEqual(res.trimmed.rows, 2);
    assert.strictEqual(res.trimmed.labels, 'a,b,c,d');
  });

  test('column-major trimming re-serialises in column-major order', function(assert) {
    // 3x2 column-major: column 0 = a,b,c; column 1 = d,"",f. Row 1 is NOT empty (b is there).
    // Blank row 1 entirely: indices 1 and 4.
    var res = analyze_grid({ labels: 'a,,c,d,,f', rows: 3, columns: 2, order: 'columns' });
    assert.deepEqual(res.empty_rows, [1]);
    assert.strictEqual(res.trimmed.rows, 2);
    assert.strictEqual(res.trimmed.columns, 2);
    // Retained cells, read column-major: (0,0)=a (1,0)=c (0,1)=d (1,1)=f
    assert.strictEqual(res.trimmed.labels, 'a,c,d,f');
  });

  test('a board with a single label in one corner is trimmable down to 1x1', function(assert) {
    var res = analyze_grid({ labels: 'a', rows: 3, columns: 3 });
    assert.true(res.can_trim);
    assert.strictEqual(res.trimmed.rows, 1);
    assert.strictEqual(res.trimmed.columns, 1);
    assert.strictEqual(res.trimmed.labels, 'a');
  });

  test('an all-blank grid is never offered for trimming', function(assert) {
    // Trimming every row and column would leave a 0x0 board, so `is_empty` owns this case
    // and the trim path stays out of it.
    var res = analyze_grid({ labels: ',,,', rows: 2, columns: 2 });
    assert.true(res.is_empty);
    assert.false(res.can_trim);
  });

  test('rows and columns arriving as strings are coerced, not treated as zero', function(assert) {
    var res = analyze_grid({ labels: 'a,b,c,d', rows: '2', columns: '2' });
    assert.strictEqual(res.total, 4);
    assert.strictEqual(res.filled, 4);
    assert.false(res.is_partial);
  });

  test('labels past the end of the grid do not count toward the cells', function(assert) {
    // Six labels in a 2x2: only the first four occupy cells. The overflow is the existing
    // `too_many_labels` warning's business, not this guard's.
    var res = analyze_grid({ labels: 'a,b,c,d,e,f', rows: 2, columns: 2 });
    assert.strictEqual(res.total, 4);
    assert.strictEqual(res.filled, 4);
    assert.false(res.is_partial);
  });

  test('a zero-sized grid degrades to empty without throwing', function(assert) {
    var res = analyze_grid({ labels: '', rows: 0, columns: 0 });
    assert.strictEqual(res.total, 0);
    assert.true(res.is_empty);
    assert.false(res.can_trim);
  });

  test('null and undefined inputs degrade to an empty grid', function(assert) {
    assert.true(analyze_grid().is_empty);
    assert.true(analyze_grid({ labels: null, rows: null, columns: null }).is_empty);
  });

  test('newline-separated labels are parsed like comma-separated ones', function(assert) {
    var res = analyze_grid({ labels: 'a\nb\nc\nd', rows: 2, columns: 2 });
    assert.strictEqual(res.filled, 4);
    assert.false(res.is_partial);
  });
});
