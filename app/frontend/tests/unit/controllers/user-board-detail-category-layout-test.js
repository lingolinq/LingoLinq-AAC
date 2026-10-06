import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * `category_layout_grid`: the placement switch scanning follows while a board's saved category
 * layout is on screen (2026-10-05; utils/scanner.js scan_content). It must be present exactly
 * when the grid shows the layout (BoardDetailGrid#savedLayout) and absent otherwise, or the
 * scanner walks one arrangement while the user sees another.
 */
module('Unit | Controller | user/board-detail category layout grid', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  var layout = {
    version: 1, rows: 1, columns: 3,
    order: [[3, 1, 2]], cells: [[0, 0, 0]], blocks: [{ category: 'people' }]
  };

  function setup(controller, opts) {
    controller.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: opts.flag !== false },
      referenced_user: EmberObject.create({
        preferences: { board_category_grouping: { enabled: opts.enabled !== false } }
      })
    }));
    controller.set('model', EmberObject.create({
      id: '1_1', key: opts.key || 'someone/vocal-flair-112',
      category_layout: opts.layout === undefined ? layout : opts.layout,
      // Setting ordered_buttons runs the shift-label observer, which reads this.
      contextualized_buttons: function() { return []; }
    }));
    controller.set('ordered_buttons', [[{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }]]);
    controller.set('edit_mode', !!opts.edit);
  }

  test('while the layout shows, the scan grid is its displayed placement', function(assert) {
    setup(this.controller, {});
    assert.deepEqual(this.controller.get('category_layout_grid'), { rows: 1, columns: 3, order: [[3, 1, 2]] });
  });

  test('absent in edit mode, which shows the board without categories', function(assert) {
    setup(this.controller, { edit: true });
    assert.strictEqual(this.controller.get('category_layout_grid'), null);
  });

  test('absent when categories are off, the flag is off, or the board has no layout', function(assert) {
    setup(this.controller, { enabled: false });
    assert.strictEqual(this.controller.get('category_layout_grid'), null, 'categories off');
    setup(this.controller, { flag: false });
    assert.strictEqual(this.controller.get('category_layout_grid'), null, 'flag off');
    setup(this.controller, { layout: null });
    assert.strictEqual(this.controller.get('category_layout_grid'), null, 'no layout');
  });

  test('absent on a keyboard board, which is never categorized', function(assert) {
    setup(this.controller, { key: 'someone/vocal-flair-112-keyboard' });
    assert.strictEqual(this.controller.get('category_layout_grid'), null);
  });
});
