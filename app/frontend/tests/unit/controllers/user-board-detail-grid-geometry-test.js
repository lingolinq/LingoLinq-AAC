import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * Board geometry while the grid is still being built.
 *
 * THE DEFECT. setupController sets `ordered_buttons` to null
 * (routes/user/board-detail.js:334) and the real grid arrives later, off
 * _maybe_prime_caches().then() (:517/:525). In between, `current_grid` returns
 * {rows: 0, columns: 0} (controllers/user/board-detail.js:4812-4814), so `grid_style`
 * emits NOTHING (:4891-4893) and the grid element falls back to its stylesheet defaults
 * of --board-columns: 4 / --board-rows: 3 (app.scss:80815-80816). A 14-column board
 * therefore lays out as a 4x3 placeholder and then SNAPS to its real shape when the
 * buttons land -- every cell changing size and position at once.
 *
 * That matters here more than on an ordinary page: AAC users navigate by button POSITION
 * and muscle memory, and eye-gaze users may already be looking where they expect a button
 * to be when the reflow moves it.
 *
 * THE FIX UNDER TEST. `grid_style` falls back to the board's own saved grid
 * (`model.grid`), which the payload carries from model-resolve (lib/json_api/board.rb:22-27
 * keeps `grid` on show/tree; only the paginated list branch strips it). The two cannot
 * disagree: _build_from_raw iterates exactly grid.rows x grid.columns and pushes a
 * placeholder for every empty cell (:1901-1928).
 *
 * SCOPED TO grid_style DELIBERATELY, not to current_grid. `current_grid` has eleven other
 * consumers, and two of them -- :2964 and :3378 -- send `max_results`/`count` to the
 * SERVER. Widening the fallback there would change request payloads to fix a layout
 * problem. Consumer-level fallback is also the established pattern in this file already:
 * board_many_columns at :4288 is literally
 * `current_grid.columns || model.grid.columns`.
 *
 * WEAKEST PASSING STATE THIS FILE MUST BEAT (rule #0.14.2): a single test that sets the
 * model first and then reads grid_style once passes on the fallback alone even if the
 * computed's dependent keys are left untouched -- and a missing `model.grid` key caches
 * {rows:0,columns:0}'s empty string for any read that happens before the model is
 * attached, which on a real transition is the common order. Test 3 exists for exactly
 * that and is the one that goes red on an incomplete fix.
 */
module('Unit | Controller | user/board-detail grid geometry', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  /* Writing ordered_buttons wakes observers that walk into the board record, so a bare
     {grid: ...} stub dies on `board.contextualized_buttons is not a function` -- a failure
     that looks nothing like the geometry defect under test. Give every model the seam. */
  var boardStub = function(grid) {
    return EmberObject.create({
      grid: grid,
      contextualized_buttons: function() { return []; }
    });
  };

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  // CONTROL. Proves the built grid still wins and the setup genuinely drives grid_style,
  // so the two tests below cannot pass for an unrelated reason.
  test('a built grid still supplies the geometry', function(assert) {
    this.controller.set('model', boardStub({ rows: 6, columns: 8, order: [[]] }));
    // Two rows of three -> current_grid wins over the model's 6x8.
    this.controller.set('ordered_buttons', [[{}, {}, {}], [{}, {}, {}]]);

    var style = this.controller.get('grid_style');
    assert.ok(style.includes('--board-columns: 3'), 'columns come from the built grid: ' + style);
    assert.ok(style.includes('--board-rows: 2'), 'rows come from the built grid: ' + style);
  });

  test('an unbuilt grid falls back to the board\'s own shape instead of emitting nothing', function(assert) {
    this.controller.set('model', boardStub({ rows: 6, columns: 8, order: [[]] }));
    this.controller.set('ordered_buttons', null);

    var style = this.controller.get('grid_style');
    // RED before the fix: current_grid is {0,0} so grid_style returns '' and the element
    // silently takes the stylesheet's 4x3.
    assert.ok(style.includes('--board-columns: 8'), 'columns fall back to model.grid: ' + style);
    assert.ok(style.includes('--board-rows: 6'), 'rows fall back to model.grid: ' + style);
  });

  test('the fallback still applies when the model arrives AFTER grid_style was first read', function(assert) {
    // The real ordering on a transition: something reads grid_style before the model is
    // attached, caching a value. Ember will not recompute unless model.grid is a declared
    // dependent key -- so a fallback added without one is dead on exactly the path it was
    // written for.
    this.controller.set('ordered_buttons', null);
    assert.strictEqual(this.controller.get('grid_style'), '', 'nothing to emit before the model exists');

    this.controller.set('model', boardStub({ rows: 5, columns: 9, order: [[]] }));

    var style = this.controller.get('grid_style');
    assert.ok(style.includes('--board-columns: 9'), 'recomputed once the model landed: ' + style);
    assert.ok(style.includes('--board-rows: 5'), 'recomputed once the model landed: ' + style);
  });

  test('a board with no usable saved grid emits nothing, exactly as today', function(assert) {
    // The gridless branch of _build_from_raw (:1885-1894) renders one row of N buttons and
    // model.grid is absent. The fallback must not invent geometry there.
    this.controller.set('model', boardStub(null));
    this.controller.set('ordered_buttons', null);

    assert.strictEqual(this.controller.get('grid_style'), '', 'no saved grid -> no inline geometry');
  });
});
