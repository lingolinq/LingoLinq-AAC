import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { run, later } from '@ember/runloop';
import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import BoardHierarchy from 'frontend/utils/board_hierarchy';
import editManager from 'frontend/utils/edit_manager';
import modal from 'frontend/utils/modal';
import { stubPersistenceAjax } from '../../helpers/persistence-stub';

// copy_hierarchy_loader uses runloop later(); native setTimeout does not advance
// those timers or flush Ember async in tests. settled()/waitUntil() hang when
// hung buttonset stubs leave orphan RSVP promises — poll with run.later instead.
function pollUntil(condition, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  return new RSVP.Promise(function(resolve, reject) {
    var start = Date.now();
    function tick() {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('pollUntil timed out after ' + timeoutMs + 'ms'));
        return;
      }
      later(tick, 10);
    }
    run(tick);
  });
}

function openCopyModal(controller, attrs) {
  run(function() {
    Object.keys(attrs).forEach(function(key) {
      controller.set(key, attrs[key]);
    });
    controller.opening();
  });
}

function waitForCopyModalReady(controller, timeoutMs) {
  return pollUntil(function() {
    return controller.isDestroyed || controller.get('loading') === false;
  }, timeoutMs);
}

function liveLinksHierarchy(childIds) {
  return EmberObject.create({
    root: EmberObject.create({
      children: (childIds || ['child-board']).map(function(id) {
        return EmberObject.create({ id: id });
      })
    }),
    selected_board_ids: function() { return childIds || ['child-board']; }
  });
}

function hangButtonsetLoader(testContext) {
  return function() {
    return new RSVP.Promise(function(_resolve, reject) {
      testContext._rejectHungButtonset = reject;
    });
  };
}

module('Unit | Controller | copying-board', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this._rejectHungButtonset = null;
    this._restorePersistenceAjax = stubPersistenceAjax(function() {
      return RSVP.reject({ error: 'offline in test' });
    });
  });

  hooks.afterEach(function() {
    if(this._restorePersistenceAjax) {
      this._restorePersistenceAjax();
    }
    if(this._rejectHungButtonset) {
      run(function() {
        this._rejectHungButtonset(new Error('test cleanup'));
      }.bind(this));
      this._rejectHungButtonset = null;
    }
  });

  test('users can select live linked boards when hierarchy loading fails', async function(assert) {
    assert.expect(7);

    const controller = this.owner.factoryFor('controller:copying-board').create();
    const originalLoader = BoardHierarchy.load_with_button_set;
    const originalLiveLinks = BoardHierarchy.load_from_live_links;
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
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(liveLinksHierarchy(['child-board']));
    };
    controller.start_copying = function() {
      controller.set('copyAllStarted', true);
    };

    try {
      openCopyModal(controller, {
        earlyLiveLinksDelayMs: 0,
        model: {
          action: 'links_copy',
          board: board
        }
      });
      await waitForCopyModalReady(controller);

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
      BoardHierarchy.load_from_live_links = originalLiveLinks;
      controller.destroy();
    }
  });

  test('falls back to live links after the early-fire delay when buttonset hangs', async function(assert) {
    assert.expect(5);

    const controller = this.owner.factoryFor('controller:copying-board').create();
    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const board = EmberObject.create({
      id: 'root-board',
      global_id: 'root-board',
      linked_boards: [{ id: 'child-board', key: 'example/child' }],
      downstream_boards: 1,
      downstream_board_ids: ['child-board'],
      key: 'example/board'
    });

    let buttonsetSettled = false;
    let liveLinksCalled = false;
    BoardHierarchy.load_with_button_set = hangButtonsetLoader(this);
    BoardHierarchy.load_from_live_links = function() {
      liveLinksCalled = true;
      return RSVP.resolve(liveLinksHierarchy(['child-board']));
    };
    controller.start_copying = function() {
      controller.set('startCopyingCalled', true);
    };

    try {
      openCopyModal(controller, {
        earlyLiveLinksDelayMs: 5,
        model: {
          action: 'links_copy',
          board: board
        }
      });
      await waitForCopyModalReady(controller);

      assert.true(liveLinksCalled, 'live-links fallback is invoked after the early-fire delay');
      assert.false(controller.get('loading'), 'loading flag clears once live-links resolves');
      assert.strictEqual(controller.get('hierarchy.root.children.length'), 1, 'live-links hierarchy is shown');
      assert.true(controller.get('hierarchyRootOnlyWarning'), 'warns that the hierarchy is incomplete');
      assert.notOk(buttonsetSettled, 'buttonset never had to settle for the modal to be usable');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
      controller.destroy();
    }
  });

  test('uses buttonset hierarchy when it returns before the early-fire delay', async function(assert) {
    assert.expect(4);

    const controller = this.owner.factoryFor('controller:copying-board').create();
    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const board = EmberObject.create({
      id: 'root-board',
      global_id: 'root-board',
      linked_boards: [{ id: 'child-board', key: 'example/child' }],
      downstream_boards: 1,
      downstream_board_ids: ['child-board'],
      key: 'example/board'
    });

    let liveLinksCalled = false;
    BoardHierarchy.load_with_button_set = function() {
      return RSVP.resolve(EmberObject.create({
        root: EmberObject.create({
          children: [
            EmberObject.create({ id: 'child-board' }),
            EmberObject.create({ id: 'grandchild-board' })
          ]
        }),
        selected_board_ids: function() { return ['child-board', 'grandchild-board']; }
      }));
    };
    BoardHierarchy.load_from_live_links = function() {
      liveLinksCalled = true;
      return RSVP.resolve(null);
    };
    controller.start_copying = function() {
      controller.set('startCopyingCalled', true);
    };

    try {
      openCopyModal(controller, {
        earlyLiveLinksDelayMs: 200,
        model: {
          action: 'links_copy',
          board: board
        }
      });
      await waitForCopyModalReady(controller);

      assert.false(controller.get('loading'), 'stops loading after buttonset resolves');
      assert.strictEqual(controller.get('hierarchy.root.children.length'), 2, 'shows the full buttonset hierarchy');
      assert.false(controller.get('hierarchyRootOnlyWarning'), 'no incomplete-hierarchy warning when buttonset wins');
      assert.false(liveLinksCalled, 'does not invoke live-links when buttonset wins fast');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
      controller.destroy();
    }
  });

  test('component falls back to live links after the early-fire delay when buttonset hangs', async function(assert) {
    assert.expect(4);

    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const board = EmberObject.create({
      id: 'root-board',
      global_id: 'root-board',
      linked_boards: [{ id: 'child-board', key: 'example/child' }],
      downstream_boards: 1,
      downstream_board_ids: ['child-board'],
      key: 'example/board'
    });
    let liveLinksCalled = false;
    let component = null;

    BoardHierarchy.load_with_button_set = hangButtonsetLoader(this);
    BoardHierarchy.load_from_live_links = function() {
      liveLinksCalled = true;
      return RSVP.resolve(liveLinksHierarchy(['child-board']));
    };

    try {
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() {
          return null;
        },
        isOpen() {
          return true;
        },
        close() {}
      }));
      this.owner.register('service:app-state', Service.extend({
        jump_to_board() {}
      }));
      run(function() {
        component = this.owner.factoryFor('component:copying-board').create({
          earlyLiveLinksDelayMs: 5,
          model: {
            action: 'links_copy',
            board: board
          }
        });
      }.bind(this));
      await waitForCopyModalReady(component);

      assert.true(liveLinksCalled, 'component invokes live-links fallback after the early-fire delay');
      assert.false(component.get('loading'), 'component clears loading once live-links resolves');
      assert.strictEqual(component.get('hierarchy.root.children.length'), 1, 'component shows the live-links hierarchy');
      assert.true(component.get('hierarchyRootOnlyWarning'), 'component warns that the hierarchy came from live links');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
      if(component) {
        component.destroy();
      }
    }
  });

  test('shows the timeout error when both buttonset and live-links fail', async function(assert) {
    assert.expect(4);

    const controller = this.owner.factoryFor('controller:copying-board').create();
    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const board = EmberObject.create({
      id: 'root-board',
      global_id: 'root-board',
      linked_boards: [],
      downstream_boards: 0,
      downstream_board_ids: [],
      key: 'example/board'
    });

    BoardHierarchy.load_with_button_set = function() {
      return RSVP.reject({ error: 'buttonset load timed out', board_id: 'root-board' });
    };
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(null);
    };

    try {
      openCopyModal(controller, {
        earlyLiveLinksDelayMs: 200,
        model: {
          action: 'links_copy',
          board: board
        }
      });
      await waitForCopyModalReady(controller);

      assert.false(controller.get('loading'), 'stops loading after both paths fail');
      assert.true(controller.get('hierarchyLoadFailed'), 'shows the hard-error UI state');
      assert.true(controller.get('isTimeoutError'), 'flags the failure as a timeout');
      assert.strictEqual(controller.get('error.error'), 'buttonset load timed out', 'preserves the buttonset error for display');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
      controller.destroy();
    }
  });

  test('copy completion continues after the modal is closed', async function(assert) {
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
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() {
          return null;
        },
        isOpen() {
          return false;
        },
        close() {}
      }));
      this.owner.register('service:app-state', Service.extend({
        jump_to_board() {
          assert.ok(false, 'closed copying modal should not force navigation');
        }
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copying-board').create({
          model: {
            action: 'keep_links',
            board: board,
            user: EmberObject.create({ id: 'self' }),
            symbol_library: 'original'
          }
        });
        component.destroy();
        resolveCopy(copiedBoard);
      }.bind(this));
      await pollUntil(function() {
        return notice !== null;
      }, 2000);

      assert.strictEqual(error, null, 'copy completion does not surface an error');
      assert.ok(notice, 'completion notice is shown after close');
    } finally {
      editManager.copy_board = originalCopyBoard;
      modal.notice = originalNotice;
      modal.error = originalError;
      modal.is_open = originalIsOpen;
    }
  });

  test('closed copy modal can notify a copy-and-edit completion callback', async function(assert) {
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
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() {
          return null;
        },
        isOpen() {
          return false;
        },
        close() {}
      }));
      this.owner.register('service:app-state', Service.extend({
        jump_to_board() {}
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copying-board').create({
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
      }.bind(this));
      await pollUntil(function() {
        return completedBoard !== null;
      }, 2000);

      assert.strictEqual(completedBoard, copiedBoard, 'completion callback receives copied board');
      assert.false(noticeShown, 'copy-and-edit callback replaces generic notice');
    } finally {
      editManager.copy_board = originalCopyBoard;
      modal.notice = originalNotice;
      modal.is_open = originalIsOpen;
    }
  });

  test('skip_hierarchy_picker starts copying without loading the picker', async function(assert) {
    assert.expect(4);

    const originalCopyBoard = editManager.copy_board;
    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    let buttonsetCalled = false;
    const selectedIds = ['root-board', 'child-board'];
    const board = EmberObject.create({
      id: 'root-board',
      key: 'example/board',
      locale: 'en',
      linked_boards: [{ id: 'child-board', key: 'example/child' }]
    });

    BoardHierarchy.load_with_button_set = function() {
      buttonsetCalled = true;
      return RSVP.reject('picker should not load when skip_hierarchy_picker is set');
    };
    BoardHierarchy.load_from_live_links = function() {
      buttonsetCalled = true;
      return RSVP.reject('picker should not load when skip_hierarchy_picker is set');
    };
    editManager.copy_board = function() {
      return new RSVP.Promise(function() { /* leave pending */ });
    };

    try {
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() { return null; },
        isOpen() { return true; },
        close() {}
      }));
      this.owner.register('service:app-state', Service.extend({
        jump_to_board() {}
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copying-board').create({
          model: {
            action: 'links_copy',
            skip_hierarchy_picker: true,
            board_ids_to_copy: selectedIds,
            expand_selected_board_ids_to_copy: true,
            board: board,
            user: EmberObject.create({ id: 'self' }),
            symbol_library: 'original'
          }
        });
      }.bind(this));

      assert.false(buttonsetCalled, 'does not load hierarchy when the first modal already chose boards');
      assert.deepEqual(board.get('downstream_board_ids_to_copy'), selectedIds, 'passes the selected board ids into the copy');
      assert.true(board.get('expand_selected_board_ids_to_copy'), 'keeps the live-links expand flag from the first modal');
      assert.notOk(component.get('hierarchy'), 'does not show the second-screen picker');
      component.destroy();
    } finally {
      editManager.copy_board = originalCopyBoard;
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });
});
