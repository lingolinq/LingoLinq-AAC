import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import CopyingBoardController from 'frontend/controllers/copying-board';
import BoardHierarchy from 'frontend/utils/board_hierarchy';

const QUnit = window.QUnit;

QUnit.module('Unit | Controller | copying-board', function() {
  QUnit.test('users can copy all boards when hierarchy loading fails', async function(assert) {
    assert.expect(5);

    const controller = CopyingBoardController.create();
    const originalLoader = BoardHierarchy.load_with_button_set;
    const board = EmberObject.create({
      linked_boards: [{ id: 'child-board' }],
      downstream_boards: 1,
      downstream_board_ids: ['child-board'],
      key: 'example/board'
    });

    BoardHierarchy.load_with_button_set = function() {
      return RSVP.reject('Failed loading board links for copying');
    };
    controller.start_copying = function() {
      controller.set('copyAllStarted', true);
    };

    try {
      controller.set('model', {
        action: 'links_copy',
        board: board
      });
      controller.opening();
      await new Promise(function(resolve) {
        setTimeout(resolve, 0);
      });

      assert.false(controller.get('loading'), 'stops loading after hierarchy failure');
      assert.true(controller.get('hierarchyLoadFailed'), 'marks hierarchy load failure as recoverable');
      assert.strictEqual(controller.get('error'), 'Failed loading board links for copying');

      controller.send('copy_all');

      assert.true(controller.get('includeMissing'), 'copy all includes missing hierarchy links');
      assert.true(controller.get('copyAllStarted'), 'starts the full-board-set copy fallback');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoader;
      controller.destroy();
    }
  });
});
