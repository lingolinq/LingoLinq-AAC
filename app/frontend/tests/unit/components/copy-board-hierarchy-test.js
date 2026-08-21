import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { run, later } from '@ember/runloop';
import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import BoardHierarchy from 'frontend/utils/board_hierarchy';

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

function selectableHierarchy(ids) {
  ids = ids || ['root-board', 'child-board'];
  return EmberObject.create({
    root: EmberObject.create({
      selected: true,
      children: ids.slice(1).map(function(id) {
        return EmberObject.create({ id: id });
      })
    }),
    selected_board_ids: function() { return ids; },
    live_links_incomplete: false
  });
}

function linkedBoard() {
  return EmberObject.create({
    id: 'root-board',
    name: 'Social Pages',
    prefix: null,
    locale: 'en',
    buttons: [],
    linked_boards: [{ id: 'child-board', key: 'example/child' }],
    downstream_boards: 1,
    downstream_board_ids: ['child-board']
  });
}

module('Unit | Component | copy-board hierarchy picker', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    var store = this.owner.lookup('service:store');
    store.findRecord = function() {
      return RSVP.resolve(EmberObject.create({
        stats: { board_set_ids: [] },
        preferences: {
          preferred_symbols: 'original',
          sidebar_boards: [],
          home_board: {}
        }
      }));
    };
    this.owner.register('service:app-state', Service.extend({
      sessionUser: EmberObject.create({
        supervisees: [],
        known_supervisees: [],
        managed_orgs: []
      }),
      currentUser: EmberObject.create({ id: 'self' }),
      label_locale: 'en'
    }));
  });

  test('loads the linked-board hierarchy for the first copy modal', async function(assert) {
    assert.expect(3);

    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const hierarchy = selectableHierarchy(['root-board', 'child-board']);
    let closedWith = null;

    BoardHierarchy.load_with_button_set = function() {
      return RSVP.resolve(hierarchy);
    };
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(null);
    };

    try {
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() { return null; },
        close(payload) { closedWith = payload; }
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copy-board').create({
          earlyLiveLinksDelayMs: 0,
          model: { board: linkedBoard() }
        });
      }.bind(this));

      await pollUntil(function() {
        return component.get('_copyBoardInitialized') && component.get('hierarchy_loading') === false;
      });

      assert.strictEqual(component.get('hierarchy'), hierarchy, 'shows the hierarchy on the first modal');
      assert.true(component.get('show_copy_hierarchy'), 'renders the choose-boards expander');

      run(function() {
        component.send('tweakBoard', 'links_copy');
      });

      assert.deepEqual(closedWith && closedWith.board_ids_to_copy, ['root-board', 'child-board'], 'full-set copy sends the selected board ids');
      component.destroy();
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });

  test('copy-just-this-board does not skip the second-modal picker', async function(assert) {
    assert.expect(2);

    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const hierarchy = selectableHierarchy(['root-board', 'child-board']);
    let closedWith = null;

    BoardHierarchy.load_with_button_set = function() {
      return RSVP.resolve(hierarchy);
    };
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(null);
    };

    try {
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() { return null; },
        close(payload) { closedWith = payload; }
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copy-board').create({
          earlyLiveLinksDelayMs: 0,
          model: { board: linkedBoard() }
        });
      }.bind(this));

      await pollUntil(function() {
        return component.get('_copyBoardInitialized') && component.get('hierarchy_loading') === false;
      });

      run(function() {
        component.send('tweakBoard', 'keep_links');
      });

      assert.notOk(closedWith && closedWith.skip_hierarchy_picker, 'copy-just-this-board does not skip hierarchy handling');
      assert.strictEqual(closedWith && closedWith.board_ids_to_copy, undefined, 'does not send a subset include-list');
      component.destroy();
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });

  test('full-set copy skips the second picker once hierarchy is loaded', async function(assert) {
    assert.expect(3);

    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const hierarchy = selectableHierarchy(['root-board', 'child-board']);
    hierarchy.set('live_links_incomplete', true);
    let closedWith = null;

    BoardHierarchy.load_with_button_set = function() {
      return RSVP.resolve(hierarchy);
    };
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(null);
    };

    try {
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() { return null; },
        close(payload) { closedWith = payload; }
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copy-board').create({
          earlyLiveLinksDelayMs: 0,
          model: { board: linkedBoard() }
        });
      }.bind(this));

      await pollUntil(function() {
        return component.get('_copyBoardInitialized') && component.get('hierarchy_loading') === false;
      });

      run(function() {
        component.send('tweakBoard', 'links_copy');
      });

      assert.true(closedWith && closedWith.skip_hierarchy_picker, 'tells the progress modal to skip its picker');
      assert.deepEqual(closedWith && closedWith.board_ids_to_copy, ['root-board', 'child-board'], 'includes the selected ids');
      assert.true(closedWith && closedWith.expand_selected_board_ids_to_copy, 'forwards the incomplete-links expand flag');
      component.destroy();
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });

  test('set-as-home keeps the linked-boards hint and a working copy action', async function(assert) {
    assert.expect(4);

    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    const hierarchy = selectableHierarchy(['root-board', 'child-board']);
    let closedWith = null;

    BoardHierarchy.load_with_button_set = function() {
      return RSVP.resolve(hierarchy);
    };
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(null);
    };

    try {
      this.owner.register('service:modal', Service.extend({
        getSettingsFor() { return null; },
        close(payload) { closedWith = payload; }
      }));
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copy-board').create({
          earlyLiveLinksDelayMs: 0,
          model: { board: linkedBoard() }
        });
      }.bind(this));

      await pollUntil(function() {
        return component.get('_copyBoardInitialized') && component.get('hierarchy_loading') === false;
      });

      run(function() {
        component.set('loading', false);
        component.set('error', false);
        component.set('set_as_home', true);
      });

      assert.true(component.get('show_linked_copy_hint'), 'linked-boards hint stays visible when set-as-home is checked');
      assert.true(component.get('show_copy_hierarchy'), 'board picker stays visible when set-as-home is checked');
      assert.false(component.get('copy_full_set_disabled'), 'full-set copy stays enabled while the picker is collapsed');

      run(function() {
        component.send('tweakBoard', 'keep_links');
      });
      assert.strictEqual(closedWith && closedWith.action, 'keep_links', 'copy-just-this-board still closes the modal');
      component.destroy();
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });

  test('treats linked_boards as linked even without downstream_boards', function(assert) {
    this.owner.register('service:modal', Service.extend({
      getSettingsFor() { return null; },
      close() {}
    }));
    const originalLoadButtonSet = BoardHierarchy.load_with_button_set;
    const originalLoadLiveLinks = BoardHierarchy.load_from_live_links;
    BoardHierarchy.load_with_button_set = function() {
      return RSVP.resolve(null);
    };
    BoardHierarchy.load_from_live_links = function() {
      return RSVP.resolve(null);
    };
    try {
      let component;
      run(function() {
        component = this.owner.factoryFor('component:copy-board').create({
          earlyLiveLinksDelayMs: 0,
          model: {
            board: EmberObject.create({
              buttons: [],
              linked_boards: [{ id: 'child-board', key: 'example/child' }]
            })
          }
        });
      }.bind(this));
      assert.true(component.get('linked'), 'linked_boards alone marks the board as linked');
      component.destroy();
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });
});
