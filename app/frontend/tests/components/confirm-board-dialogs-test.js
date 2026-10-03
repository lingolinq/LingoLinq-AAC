import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

/* The Save Board completeness dialogs.
 *
 * These cover the text the dialogs assemble in JS rather than in the template: the grid
 * label and, on the partial dialog, the plain-language summary of which rows and columns are
 * empty. Both are built in code because they interpolate numbers into translated strings, so
 * a regression in either shows up as a sentence that reads wrongly rather than as an
 * exception -- exactly the kind of thing no other check would catch.
 *
 * The model is set AFTER construction on purpose. `init` resolves its options from the modal
 * service and only falls back to an already-set `model`, so a model handed to `create()` is
 * replaced by the service's (empty) settings before any test could read it.
 */
module('Integration | Component | confirm board dialogs', function(hooks) {
  setupTest(hooks);

  function build(owner, name, model) {
    var c = owner.factoryFor('component:' + name).create();
    c.set('model', model);
    return c;
  }

  test('the blank-board dialog names the grid it is about to save', function(assert) {
    var c = build(this.owner, 'confirm-blank-board', { rows: 6, columns: 7 });
    assert.strictEqual(c.get('grid_label'), '6 × 7');
  });

  test('a missing grid size degrades to zeroes rather than "undefined × undefined"', function(assert) {
    var c = build(this.owner, 'confirm-blank-board', {});
    assert.strictEqual(c.get('grid_label'), '0 × 0');
  });

  test('the partial dialog reports the chosen size and the trimmed one separately', function(assert) {
    var c = build(this.owner, 'confirm-partial-board', {
      rows: 3, columns: 3, filled: 5, total: 9,
      can_trim: true, trim_rows: 2, trim_columns: 5
    });
    assert.strictEqual(c.get('grid_label'), '3 × 3', 'the size the person chose');
    assert.strictEqual(c.get('trim_label'), '2 × 5', 'the size trimming would produce');
  });

  test('one empty row is described in the singular', function(assert) {
    var c = build(this.owner, 'confirm-partial-board', { empty_rows_count: 1, empty_columns_count: 0 });
    assert.strictEqual(c.get('empty_summary'), '1 empty row');
  });

  test('several empty rows are described in the plural', function(assert) {
    var c = build(this.owner, 'confirm-partial-board', { empty_rows_count: 3, empty_columns_count: 0 });
    assert.strictEqual(c.get('empty_summary'), '3 empty rows');
  });

  test('empty columns are described on their own when no row is empty', function(assert) {
    var c = build(this.owner, 'confirm-partial-board', { empty_rows_count: 0, empty_columns_count: 4 });
    assert.strictEqual(c.get('empty_summary'), '4 empty columns');
  });

  test('empty rows and columns are joined into one phrase, each pluralised on its own', function(assert) {
    var c = build(this.owner, 'confirm-partial-board', { empty_rows_count: 2, empty_columns_count: 1 });
    assert.strictEqual(c.get('empty_summary'), '2 empty rows and 1 empty column');
  });

  test('nothing empty produces an empty summary rather than a stray "and"', function(assert) {
    var c = build(this.owner, 'confirm-partial-board', { empty_rows_count: 0, empty_columns_count: 0 });
    assert.strictEqual(c.get('empty_summary'), '');
  });
});
