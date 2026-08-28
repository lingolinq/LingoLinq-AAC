import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';
import { DEFAULT_CATEGORY_ORDER, swatch_for_category } from 'frontend/utils/board_categories';

/* AUTHORING A CATEGORY LAYOUT.
 *
 * `board.settings['category_layout']` shipped with storage, rendering and an ownership gate
 * but nothing that WROTE it. These are the three writers: the button move, the reorder
 * arrows, and Reset.
 *
 * The move is the interesting one. It used to be performed by PAINTING the button with the
 * target category's colour, because the categoriser reads a button's category back off its
 * colour — which made a category with no colour unreachable. Seven of the seventeen registry
 * entries have `types: []`, so `swatch_for_category` returns null for them and they were
 * filtered out of the picker entirely. Recording the assignment on the board instead makes
 * every category a destination.
 */
module('Unit | Controller | board-detail category authoring', function(hooks) {
  setupTest(hooks);

  function ctrl(owner, layout) {
    var c = owner.factoryFor('controller:user/board-detail').create();
    c.set('model', EmberObject.create({ user_name: 'sam', category_layout: layout }));
    c.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: true },
      referenced_user: EmberObject.create({
        user_name: 'sam',
        preferences: { board_category_grouping: { enabled: true } }
      })
    }));
    return c;
  }

  /* THE RULE THE WHOLE FEATURE RESTS ON. `board_category_layout` is a computed on
     `model.category_layout`, and `edit_session_has_changes` reads
     `model.changedAttributes()`. An in-place mutation would regroup nothing AND leave the
     board reading as clean, so the edit could be discarded on exit with no prompt. */
  test('a write replaces the layout with a NEW object (POSITIVE CONTROL)', function(assert) {
    var original = { order: ['people', 'actions'] };
    var c = ctrl(this.owner, original);

    c._write_category_layout({ buttons: { '72': 'yes' } });

    assert.notStrictEqual(c.get('model.category_layout'), original,
      'a different object, so the computed and dirty-tracking both notice');
    assert.deepEqual(c.get('model.category_layout').order, ['people', 'actions'],
      'and the sub-key it did not name survived');
  });

  /* An empty sub-key is DROPPED, never written. Stamping today's default order onto a board
     whose author only moved a button would freeze that default into the board, and it would
     stop following the registry if the default ever changed. */
  test('an untouched sub-key stays absent rather than being materialized', function(assert) {
    var c = ctrl(this.owner, undefined);

    c._write_category_layout({ buttons: { '72': 'yes' } });

    assert.deepEqual(Object.keys(c.get('model.category_layout')), ['buttons'],
      'no `order` key invented for a board that has never been reordered');
  });

  // ── the button move ─────────────────────────────────────────────────────────

  test('moving a button records a STRING-keyed assignment on the board', function(assert) {
    var c = ctrl(this.owner, undefined);
    // ids arrive from the server as JSON object keys (always strings) but btn.id is a number
    c.set('category_move_button', { id: 72, label: 'yes' });

    c.send('move_button_to_category', 'questions');

    assert.deepEqual(c.get('model.category_layout').buttons, { '72': 'questions' },
      'keyed the way group_buttons looks it up');
    assert.strictEqual(c.get('category_move_button'), null, 'and the picker closed');
  });

  /* THE REGRESSION THIS CHANGE EXISTS FOR. */
  test('a category with NO colour is a valid destination', function(assert) {
    assert.strictEqual(swatch_for_category('keyboard'), null,
      'PRECONDITION: keyboard has no paintable swatch, so the old paint move could not reach it');

    var c = ctrl(this.owner, undefined);
    c.set('category_move_button', { id: 5 });
    c.send('move_button_to_category', 'keyboard');

    assert.deepEqual(c.get('model.category_layout').buttons, { '5': 'keyboard' },
      'recorded as data, so colour is irrelevant');
  });

  test('the move does not repaint the button', function(assert) {
    var c = ctrl(this.owner, undefined);
    var btn = { id: 9, background_color: '#fff', border_color: '#000' };
    c.set('category_move_button', btn);

    c.send('move_button_to_category', 'actions');

    assert.strictEqual(btn.background_color, '#fff', 'colour untouched');
    assert.strictEqual(btn.border_color, '#000', 'border untouched');
  });

  test('the picker offers every category, not just the paintable ones', function(assert) {
    var c = ctrl(this.owner, undefined);
    var keys = (c.get('category_order_list') || []).map(function(cat) { return cat.key; });

    assert.strictEqual(keys.length, DEFAULT_CATEGORY_ORDER.length, 'all of them');
    assert.true(keys.indexOf('keyboard') >= 0, 'including a colourless one');
  });

  test('a button move with no resolvable id closes the picker without writing', function(assert) {
    var c = ctrl(this.owner, { order: ['people'] });
    c.set('category_move_button', { label: 'no id here' });

    c.send('move_button_to_category', 'people');

    assert.deepEqual(c.get('model.category_layout'), { order: ['people'] }, 'layout untouched');
    assert.strictEqual(c.get('category_move_button'), null, 'picker still closed');
  });

  // ── reordering ──────────────────────────────────────────────────────────────

  test('move_category writes the new sequence to the BOARD', function(assert) {
    var c = ctrl(this.owner, undefined);
    var before = c.get('category_order').slice();

    c.send('move_category', before[1], 'up');

    var after = c.get('model.category_layout').order;
    assert.strictEqual(after[0], before[1], 'the moved category is now first');
    assert.strictEqual(after[1], before[0], 'and the one it passed is second');
  });

  test('a category cannot be walked off either end of the list', function(assert) {
    var c = ctrl(this.owner, undefined);
    var order = c.get('category_order').slice();

    c.send('move_category', order[0], 'up');
    assert.strictEqual(c.get('model.category_layout'), undefined, 'nothing written at the top');

    c.send('move_category', order[order.length - 1], 'down');
    assert.strictEqual(c.get('model.category_layout'), undefined, 'nothing written at the bottom');
  });

  /* Each writer names ONLY the sub-key it changes, so the two cannot clobber each other. */
  test('reordering keeps the button assignments, and vice versa', function(assert) {
    var c = ctrl(this.owner, undefined);
    c.set('category_move_button', { id: 72 });
    c.send('move_button_to_category', 'yes');
    var order = c.get('category_order').slice();

    c.send('move_category', order[1], 'up');

    assert.deepEqual(c.get('model.category_layout').buttons, { '72': 'yes' },
      'the reorder did not drop the assignment');
    assert.strictEqual(c.get('model.category_layout').order[0], order[1],
      'and the reorder still happened');
  });

  // ── reset ───────────────────────────────────────────────────────────────────

  module('reset', function(inner) {
    inner.beforeEach(function() {
      this.prior_open = modal.open;
    });
    inner.afterEach(function() {
      modal.open = this.prior_open;
    });

    test('confirmed, it clears the order AND the button assignments', async function(assert) {
      var opened = null;
      var answer = RSVP.resolve('reset');
      modal.open = function(template) { opened = template; return answer; };
      var c = ctrl(this.owner, { order: ['actions', 'people'], buttons: { '72': 'yes' } });

      c.send('reset_category_layout');
      // our continuation is queued behind the action's, so the write has landed by now
      await answer;

      assert.strictEqual(opened, 'confirm-reset-categories', 'it confirmed first');
      assert.deepEqual(c.get('model.category_layout'), {},
        'both halves gone — an empty layout, not a null the server would ignore');
    });

    test('dismissed, it changes nothing', async function(assert) {
      var answer = RSVP.resolve(undefined);
      modal.open = function() { return answer; };
      var layout = { order: ['actions', 'people'], buttons: { '72': 'yes' } };
      var c = ctrl(this.owner, layout);

      c.send('reset_category_layout');
      await answer;

      assert.deepEqual(c.get('model.category_layout'), layout, 'untouched');
    });
  });

  /* Reset is gated on this. Gating on the ORDER alone would hide the only control that can
     undo a board whose sole customization is per-button assignments. */
  test('a board customized only by button assignments still offers Reset', function(assert) {
    var c = ctrl(this.owner, { buttons: { '72': 'yes' } });

    assert.false(c.get('category_order_changed'), 'PRECONDITION: the order is the default');
    assert.true(c.get('category_layout_customized'), 'and Reset is still reachable');
  });

  test('an uncurated board offers no Reset', function(assert) {
    var c = ctrl(this.owner, undefined);
    assert.false(c.get('category_layout_customized'), 'nothing to reset');
  });
});
