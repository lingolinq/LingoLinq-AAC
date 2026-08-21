import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import BoardHierarchy from 'frontend/utils/board_hierarchy';

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

async function waitForCopyBoardReady(component) {
  var start = Date.now();
  await settled();
  while (!(component.get('_copyBoardInitialized') && component.get('hierarchy_loading') === false)) {
    if (Date.now() - start >= 10000) {
      throw new Error('copy-board hierarchy did not finish loading');
    }
    await new Promise(function(resolve) { setTimeout(resolve, 10); });
    await settled();
  }
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
      const component = this.owner.factoryFor('component:copy-board').create({
        earlyLiveLinksDelayMs: 0,
        model: { board: linkedBoard() }
      });

      await waitForCopyBoardReady(component);

      assert.strictEqual(component.get('hierarchy'), hierarchy, 'shows the hierarchy on the first modal');
      assert.true(component.get('show_copy_hierarchy'), 'renders the choose-boards expander');

      component.send('tweakBoard', 'links_copy');
      await settled();

      assert.deepEqual(closedWith.board_ids_to_copy, ['root-board', 'child-board'], 'full-set copy sends the selected board ids');
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
      const component = this.owner.factoryFor('component:copy-board').create({
        earlyLiveLinksDelayMs: 0,
        model: { board: linkedBoard() }
      });

      await waitForCopyBoardReady(component);

      component.send('tweakBoard', 'keep_links');
      await settled();

      assert.notOk(closedWith.skip_hierarchy_picker, 'copy-just-this-board does not skip hierarchy handling');
      assert.strictEqual(closedWith.board_ids_to_copy, undefined, 'does not send a subset include-list');
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
      const component = this.owner.factoryFor('component:copy-board').create({
        earlyLiveLinksDelayMs: 0,
        model: { board: linkedBoard() }
      });

      await waitForCopyBoardReady(component);

      component.send('tweakBoard', 'links_copy');
      await settled();

      assert.true(closedWith.skip_hierarchy_picker, 'tells the progress modal to skip its picker');
      assert.deepEqual(closedWith.board_ids_to_copy, ['root-board', 'child-board'], 'includes the selected ids');
      assert.true(closedWith.expand_selected_board_ids_to_copy, 'forwards the incomplete-links expand flag');
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
      const component = this.owner.factoryFor('component:copy-board').create({
        earlyLiveLinksDelayMs: 0,
        model: { board: linkedBoard() }
      });

      await waitForCopyBoardReady(component);

      component.set('loading', false);
      component.set('error', false);
      component.set('set_as_home', true);
      await settled();

      assert.true(component.get('show_linked_copy_hint'), 'linked-boards hint stays visible when set-as-home is checked');
      assert.true(component.get('show_copy_hierarchy'), 'board picker stays visible when set-as-home is checked');
      assert.false(component.get('copy_full_set_disabled'), 'full-set copy stays enabled while the picker is collapsed');

      component.send('tweakBoard', 'keep_links');
      await settled();
      assert.strictEqual(closedWith.action, 'keep_links', 'copy-just-this-board still closes the modal');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });

  test('treats linked_boards as linked even without downstream_boards', async function(assert) {
    assert.expect(1);

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
      const component = this.owner.factoryFor('component:copy-board').create({
        earlyLiveLinksDelayMs: 0,
        model: {
          board: EmberObject.create({
            buttons: [],
            linked_boards: [{ id: 'child-board', key: 'example/child' }]
          })
        }
      });
      await settled();
      assert.true(component.get('linked'), 'linked_boards alone marks the board as linked');
    } finally {
      BoardHierarchy.load_with_button_set = originalLoadButtonSet;
      BoardHierarchy.load_from_live_links = originalLoadLiveLinks;
    }
  });
});
