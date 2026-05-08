import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import CopyingBoardController from 'frontend/controllers/copying-board';
import CopyingBoardComponent from 'frontend/components/copying-board';
import BoardHierarchy from 'frontend/utils/board_hierarchy';
import editManager from 'frontend/utils/edit_manager';
import modal from 'frontend/utils/modal';

const QUnit = window.QUnit;

QUnit.module('Unit | Controller | copying-board', function() {
  QUnit.test('users can select live linked boards when hierarchy loading fails', async function(assert) {
    assert.expect(7);

    const controller = CopyingBoardController.create();
    const originalLoader = BoardHierarchy.load_with_button_set;
    const board = EmberObject.create({
      id: 'root-board',
      global_id: 'root-board',
      linked_boards: [{ id: 'child-board', key: 'example/child' }],
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
      assert.false(controller.get('hierarchyLoadFailed'), 'does not show the hard error state when live links are available');
      assert.strictEqual(controller.get('error'), null, 'does not show the load error when live links are available');
      assert.true(controller.get('hierarchyRootOnlyWarning'), 'warns that the hierarchy is incomplete');
      assert.strictEqual(controller.get('hierarchy.root.children.length'), 1, 'shows the live linked board for selection');

      controller.send('copy_all');

      assert.true(controller.get('includeMissing'), 'copy all includes missing hierarchy links');
      assert.true(controller.get('copyAllStarted'), 'starts the full-board-set copy fallback');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoader;
      controller.destroy();
    }
  });

  QUnit.test('copy completion continues after the modal is closed', async function(assert) {
    assert.expect(2);

    const originalCopyBoard = editManager.copy_board;
    const originalNotice = modal.notice;
    const originalError = modal.error;
    const originalIsOpen = modal.is_open;
    let resolveCopy;
    let notice = null;
    let error = null;
    const board = EmberObject.create({
      id: 'source-board',
      key: 'example/source',
      locale: 'en',
      set: EmberObject.prototype.set,
      get: EmberObject.prototype.get
    });
    const copiedBoard = EmberObject.create({
      id: 'copied-board',
      key: 'example/copied',
      reload() {
        return RSVP.resolve();
      }
    });
    const modalService = EmberObject.create({
      isOpen() {
        return false;
      },
      close() {}
    });
    const appState = EmberObject.create({
      jump_to_board() {
        assert.ok(false, 'closed copying modal should not force navigation');
      }
    });

    editManager.copy_board = function() {
      return new RSVP.Promise(function(resolve) {
        resolveCopy = resolve;
      });
    };
    modal.notice = function(message) {
      notice = message;
    };
    modal.error = function(message) {
      error = message;
    };
    modal.is_open = function() {
      return false;
    };

    try {
      const component = CopyingBoardComponent.create({
        modal: modalService,
        appState: appState,
        model: {
          action: 'keep_links',
          board: board,
          user: EmberObject.create({ id: 'self' }),
          symbol_library: 'original'
        }
      });
      component.destroy();
      resolveCopy(copiedBoard);
      await new Promise(function(resolve) {
        setTimeout(resolve, 0);
      });

      assert.strictEqual(error, null, 'copy completion does not surface an error');
      assert.ok(notice, 'completion notice is shown after close');
    } finally {
      editManager.copy_board = originalCopyBoard;
      modal.notice = originalNotice;
      modal.error = originalError;
      modal.is_open = originalIsOpen;
    }
  });

  QUnit.test('closed copy modal can notify a copy-and-edit completion callback', async function(assert) {
    assert.expect(2);

    const originalCopyBoard = editManager.copy_board;
    const originalNotice = modal.notice;
    const originalIsOpen = modal.is_open;
    let resolveCopy;
    let completedBoard = null;
    let noticeShown = false;
    const board = EmberObject.create({
      id: 'source-board',
      key: 'example/source',
      locale: 'en'
    });
    const copiedBoard = EmberObject.create({
      id: 'copied-board',
      key: 'example/copied',
      reload() {
        return RSVP.resolve();
      }
    });

    editManager.copy_board = function() {
      return new RSVP.Promise(function(resolve) {
        resolveCopy = resolve;
      });
    };
    modal.notice = function() {
      noticeShown = true;
    };
    modal.is_open = function() {
      return false;
    };

    try {
      const component = CopyingBoardComponent.create({
        modal: EmberObject.create({
          isOpen() {
            return false;
          },
          close() {}
        }),
        appState: EmberObject.create({
          jump_to_board() {}
        }),
        model: {
          action: 'keep_links',
          board: board,
          user: EmberObject.create({ id: 'self' }),
          symbol_library: 'original',
          copy_finished(copied) {
            completedBoard = copied;
          }
        }
      });
      component.destroy();
      resolveCopy(copiedBoard);
      await new Promise(function(resolve) {
        setTimeout(resolve, 0);
      });

      assert.strictEqual(completedBoard, copiedBoard, 'completion callback receives copied board');
      assert.false(noticeShown, 'copy-and-edit callback replaces generic notice');
    } finally {
      editManager.copy_board = originalCopyBoard;
      modal.notice = originalNotice;
      modal.is_open = originalIsOpen;
    }
  });
});
