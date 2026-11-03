import { module, test } from 'qunit';
import { csvCell, csvRow } from 'frontend/utils/csv';

module('Unit | Utility | csv', function() {
  test('quotes every cell and doubles internal quotes', function(assert) {
    assert.strictEqual(csvCell('hello'), '"hello"');
    assert.strictEqual(csvCell('a,"b'), '"a,""b"');
    assert.strictEqual(csvCell('a\nb'), '"a\nb"');
    assert.strictEqual(csvCell(null), '""');
    assert.strictEqual(csvCell(undefined), '""');
    assert.strictEqual(csvCell(12), '"12"');
  });

  test('prefixes a single quote on formula starters', function(assert) {
    assert.strictEqual(csvCell('=1+1'), '"\'=1+1"');
    assert.strictEqual(csvCell('+1'), '"\'+1"');
    assert.strictEqual(csvCell('-1'), '"\'-1"');
    assert.strictEqual(csvCell('@SUM(1)'), '"\'@SUM(1)"');
    assert.strictEqual(csvCell('\t=1+1'), '"\'\t=1+1"');
    assert.strictEqual(csvCell('\r=1+1'), '"\'\r=1+1"');
  });

  test('does not prefix an ordinary date or a later equals', function(assert) {
    assert.strictEqual(csvCell('2026-01-01T00:00:00Z'), '"2026-01-01T00:00:00Z"');
    assert.strictEqual(csvCell('say =1+1'), '"say =1+1"');
  });

  test('csvRow joins guarded cells', function(assert) {
    assert.strictEqual(csvRow(['=1+1', 'hello,"x', null]), '"\'=1+1","hello,""x",""');
  });
});
