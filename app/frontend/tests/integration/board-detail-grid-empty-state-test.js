import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/*
 * "No symbols found for this category" must not be shown to someone whose board is
 * simply still loading.
 *
 * THE DEFECT. The empty state is gated on `{{#unless this.orderedButtons.length}}`
 * (components/board-detail-grid.hbs:315). `orderedButtons` is a 2-D array of ROWS, and it
 * is null for the whole window between setupController
 * (routes/user/board-detail.js:334 sets it null) and _build_from_raw writing the real grid
 * (controllers/user/board-detail.js:1928, reached via routes:517/:525). `null.length` is
 * undefined -> falsy -> the message renders. So a cold board tells the user their
 * vocabulary is gone at exactly the moment it is being fetched.
 *
 * For someone who cannot easily ask "is this broken or just slow?", and for a supporter
 * watching over their shoulder, those are very different messages.
 *
 * The wording is independently wrong -- `activeCategory` is only ever a `data-filter`
 * attribute (board-detail-grid.hbs:5) and filters nothing, so the message is not
 * category-scoped in the first place. NOT fixed here: changing user-facing copy means
 * re-keying across 13 locales, which is its own unit (rule #0.15).
 *
 * THE DISTINCTION THE FIX USES. No new flag is needed -- the information is already in
 * the value. `null`/undefined means "not built yet"; an ARRAY means _build_from_raw has
 * run. Every writer agrees: the null writes are routes/user/board-detail.js:334 and :596,
 * controllers:4685 and :9476, and edit_manager.js:2192; every other writer sets an array.
 *
 * WEAKEST PASSING STATE THIS FILE MUST BEAT (rule #0.14.2): a test that only asserts "no
 * message while loading" is satisfied by DELETING the empty state altogether, which would
 * silently remove a real signal from genuinely empty boards. Test 3 is that guard, and it
 * must stay green both before and after the fix.
 */
QUnit.module('Integration | board-detail-grid empty state', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.set('board', EmberObject.create({ id: '1_1', key: 'someone/board' }));
  });

  var EMPTY = '.md-board-detail-grid__empty';

  // CONTROL. A built grid with content shows no empty state -- proves the component
  // renders at all here, so the assertions below cannot pass for an unrelated reason.
  QUnit.test('a built grid with buttons shows no empty message', async function(assert) {
    this.set('ordered', [[{ id: 'b1', label: 'want' }, { id: 'b2', label: 'more' }]]);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    assert.dom(EMPTY).doesNotExist('a board with buttons is not empty');
  });

  QUnit.test('a board that is still loading does NOT claim to have no symbols', async function(assert) {
    // Exactly the state routes/user/board-detail.js:334 leaves behind until the grid builds.
    this.set('ordered', null);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    // RED before the fix: `null.length` is falsy, so the message renders and tells the user
    // their vocabulary is missing while it is in fact being fetched.
    assert.dom(EMPTY).doesNotExist('loading is not the same as empty');
  });

  QUnit.test('a genuinely empty built grid still says so', async function(assert) {
    // The over-reach guard. _build_from_raw always writes an ARRAY, so an array with no
    // rows is a real, finished, empty board -- the one case the message is correct for.
    // This must be green BEFORE and AFTER the fix; if it ever goes red the fix has
    // suppressed a legitimate signal rather than corrected a false one.
    this.set('ordered', []);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    assert.dom(EMPTY).exists('a finished, genuinely empty board still reports it');
  });
});
