import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import {
  FOLDERS_EXPANDED_KEY,
  FOLDERS_EXPANDED_DEFAULT,
  readFoldersExpanded,
  writeFoldersExpanded
} from 'frontend/utils/folders_panel_state';

/*
 * The folders panel's expanded state has TWO readers that must never disagree:
 * components/available-boards-section (owns the live UI state) and the SINGLETON
 * controllers/user/index (whose `board_list` withholds foldered boards from the main
 * grid ONLY while the panel is presenting them).
 *
 * When they drifted apart, a board filed in a folder with no untagged twin vanished from
 * the Boards page entirely — held out of the grid by the controller while the panel that
 * was supposed to be showing it was collapsed. The mirror case rendered foldered boards
 * twice.
 *
 * The drift came from state changes that skipped the store: two viewport/layout syncs
 * used to force-expand and force-collapse `foldersExpanded` WITHOUT calling
 * writeFoldersExpanded, so the value the component adopted was invisible to the next
 * instance (which re-read localStorage) while the controller — which outlives the
 * component — kept it.
 *
 * Both of those syncs are gone (the panel now stays where the user left it), so the
 * invariant these tests pin is: THE STORE IS THE ONLY CHANNEL. Both sides seed from
 * readFoldersExpanded() at init, and the only writer is the user's toggle.
 */
module('Unit | Utility | folders_panel_state', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this._real = window.localStorage;
  });
  hooks.afterEach(function() {
    try {
      Object.defineProperty(window, 'localStorage', { value: this._real, configurable: true });
    } catch (e) { /* best-effort restore; every test stubs its own */ }
  });

  function stubStorage(store) {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function(k, v) { store[k] = String(v); }
      },
      configurable: true
    });
  }

  function throwingStorage() {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: function() { throw new Error('SecurityError'); },
        setItem: function() { throw new Error('SecurityError'); }
      },
      configurable: true
    });
  }

  test('round-trips both states through the store', function(assert) {
    var store = {};
    stubStorage(store);

    writeFoldersExpanded(true);
    assert.strictEqual(store[FOLDERS_EXPANDED_KEY], 'true', 'persisted as a string');
    assert.true(readFoldersExpanded(), 'reads back expanded');

    writeFoldersExpanded(false);
    assert.strictEqual(store[FOLDERS_EXPANDED_KEY], 'false', 'persisted as a string');
    assert.false(readFoldersExpanded(), 'reads back collapsed');
  });

  test('an absent or unrecognised value falls back to the declared default', function(assert) {
    stubStorage({});
    assert.strictEqual(readFoldersExpanded(), FOLDERS_EXPANDED_DEFAULT, 'absent -> default');

    stubStorage({ [FOLDERS_EXPANDED_KEY]: 'yes-please' });
    assert.strictEqual(readFoldersExpanded(), FOLDERS_EXPANDED_DEFAULT, 'garbage -> default, not truthy-string');
  });

  test('unavailable localStorage does not throw on either side', function(assert) {
    throwingStorage();
    assert.strictEqual(readFoldersExpanded(), FOLDERS_EXPANDED_DEFAULT, 'read falls back');
    writeFoldersExpanded(true);
    assert.ok(true, 'write swallowed the throw');
  });

  /* THE REGRESSION. The controller is a singleton that outlives the component, so it must
     seed from the store at INSTANTIATION -- not at module-eval, which froze whatever
     localStorage held at app boot and made a later instance disagree with the component. */
  test('controllers/user/index seeds mineFoldersPanelExpanded from the store at init', function(assert) {
    stubStorage({ [FOLDERS_EXPANDED_KEY]: 'true' });
    var ctrl = this.owner.factoryFor('controller:user/index').create();
    assert.true(ctrl.get('mineFoldersPanelExpanded'),
      'a stored TRUE reaches the controller that gates board_list');

    stubStorage({ [FOLDERS_EXPANDED_KEY]: 'false' });
    var ctrl2 = this.owner.factoryFor('controller:user/index').create();
    assert.false(ctrl2.get('mineFoldersPanelExpanded'),
      'a stored FALSE reaches a FRESH controller -- not a value frozen at module eval');
  });

  /* Pins the product decision (2026-08-26): the panel stays where the user left it. If a
     future change reintroduces a viewport/layout-driven expand or collapse, it MUST persist
     through writeFoldersExpanded -- otherwise the component and the singleton controller
     drift again and foldered boards disappear from the grid. */
  test('available-boards-section has no un-persisted auto expand/collapse', function(assert) {
    var proto = this.owner.factoryFor('component:available-boards-section').class.proto();
    assert.strictEqual(typeof proto._syncSideBySideFoldersExpand, 'undefined',
      'the side-by-side force-expand is gone; if you bring it back, call writeFoldersExpanded');
    assert.strictEqual(typeof proto._syncNarrowFoldersCollapse, 'undefined',
      'the narrow force-collapse is gone; if you bring it back, call writeFoldersExpanded');
  });
});
