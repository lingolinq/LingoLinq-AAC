import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/*
 * The grid's empty state must not fire while a board is loading, and must not blame a
 * category for it.
 *
 * DEFECT 1 — it fires while loading. The block is gated on
 * `{{#unless this.orderedButtons.length}}` (components/board-detail-grid.hbs).
 * `orderedButtons` is a 2-D array of ROWS and is null for the whole window between
 * `routes/user/board-detail.js:363` (sets null) and `_build_from_raw`
 * (`controllers/user/board-detail.js:1928`). `null.length` is undefined — falsy exactly like
 * `[].length` — so a board that is merely being fetched tells the user it has no symbols.
 * For someone who cannot easily ask "is this broken or just slow?", and for a supporter
 * watching, those are very different statements.
 *
 * DEFECT 2 — the copy. Category filtering is real, but it works by flagging each button
 * `_filtered_out` (`controllers/user/board-detail.js:325-338`, `:5079-5090`) and DIMMING the
 * cell (`app.scss:83502-83506`, `opacity: 0.15`). Filtered cells stay in the DOM, so the row
 * count is untouched and this block structurally cannot fire for an empty category. The
 * `activeCategory` argument reaches the component only as a decorative `data-filter`
 * attribute — `data-filter` has no match anywhere in app.scss.
 *
 * WHERE THE MESSAGE CAN ACTUALLY FIRE. Not on board-detail in speak mode: `[]` requires
 * `grid.rows === 0`, which means no `grid.order` rows, which makes `nothing_visible` true
 * (`models/board.js:295` via `used_buttons`), and `templates/user/board-detail.hbs:2027`
 * then renders `.md-board-detail-empty-board` INSTEAD of the grid. It reaches this component
 * only in EDIT mode (where that gate is false by construction) and on
 * `templates/demo/speak.hbs`, whose grid is unconditional. Both are truthfully served by the
 * existing, already-translated `no_visible_buttons` string.
 *
 * FALSIFICATION, stated per test because they differ (rule #0.12):
 *  - test 2 goes red when the gate is reverted to `{{#unless orderedButtons.length}}`.
 *  - test 3 is an OVER-REACH GUARD, not coverage: reverting the gate cannot fail it. Its
 *    mutation is DELETING the empty block, which is the lazy way to satisfy test 2 and would
 *    leave the demo surface showing a heading over dead space. It is falsified that way.
 *
 * WEAKEST PASSING IMPLEMENTATION, acknowledged: plain truthiness
 * (`this.orderedButtons && !this.orderedButtons.length`) passes every test here — no
 * assertion distinguishes it from `Array.isArray`. That is acceptable because every writer
 * produces a native array (`_build_from_raw`'s `result`/`[buttons]`, every `ob.map(...)`
 * rebuild, and demo's `order.map(...)`), so the two are equivalent in practice; the
 * `Array.isArray` form is chosen for being explicit about the null-vs-empty distinction the
 * fix turns on, not because a test forces it.
 */
QUnit.module('Integration | board-detail-grid empty state', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.set('board', EmberObject.create({ id: '1_1', key: 'someone/board' }));
  });

  var EMPTY = '.md-board-detail-grid__empty';

  // CONTROL — proves the component renders here at all, so the assertions below cannot pass
  // for an unrelated reason.
  QUnit.test('a built grid with buttons shows no empty message', async function(assert) {
    this.set('ordered', [[{ id: 'b1', label: 'want' }, { id: 'b2', label: 'more' }]]);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    assert.dom(EMPTY).doesNotExist('a board with buttons is not empty');
  });

  QUnit.test('a board that is still loading says nothing about its contents', async function(assert) {
    // Exactly the state setupController leaves behind until the grid builds.
    this.set('ordered', null);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    assert.dom(EMPTY).doesNotExist('loading is not the same as empty');
  });

  QUnit.test('a built grid with no rows still reports itself, without blaming a category', async function(assert) {
    // OVER-REACH GUARD + copy check in one: `[]` is the state that reaches this component
    // from edit mode and from demo/speak, and it must keep a truthful message.
    this.set('ordered', []);
    await render(hbs`<BoardDetailGrid @board={{this.board}} @orderedButtons={{this.ordered}} />`);

    assert.dom(EMPTY).exists('a finished grid with no rows still reports it');
    var text = (document.querySelector(EMPTY) || {}).textContent || '';
    assert.notOk(/categor/i.test(text),
      'the message does not claim a category filtered anything: ' + JSON.stringify(text.trim()));
  });
});
