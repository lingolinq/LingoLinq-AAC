import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';

/*
 * Customize Menu feature-flag gate — Scot #1 (Critical) + #3 (High)
 * pre-merge review coverage.
 *
 * The Customize Menu UI in board-detail.hbs (right panel) and its
 * mutating action `set_speak_menu_item_hidden` in board-detail.js are
 * BOTH gated behind `app_state.feature_flags.customize_menu`:
 *   - Template gate: hides the panel section when flag is off
 *   - JS action gate: short-circuits the action when flag is off
 *     (defense-in-depth — per LEARNINGS "Feature-flag-gated mutating
 *     actions need BOTH a template gate AND a JS action gate")
 *
 * These tests cover the JS action gate. The template gate is verified
 * by manual smoke test (see docs/task-management/...customize-menu...).
 *
 * See docs/task-management/2026-05-27-pr281-test-coverage.md.
 */
describe('UserBoardDetailController — Customize Menu flag gate', 'controller:user/board-detail', function() {
  var testOwner;
  var savedUser;

  beforeEach(function() {
    testOwner = this.owner;
  });

  function setupFlag(controller, enabled) {
    controller.set('app_state', EmberObject.create({
      feature_flags: { customize_menu: enabled },
      currentUser: savedUser
    }));
  }

  it('set_speak_menu_item_hidden is a no-op when feature_flags.customize_menu is OFF', function() {
    var controller = testOwner.lookup('controller:user/board-detail');
    var saved_called = false;
    savedUser = EmberObject.create({
      preferences: { speak_mode_hidden_menu_items: [] },
      save: function() { saved_called = true; return Promise.resolve(); }
    });
    setupFlag(controller, false);
    controller.set('speak_menu_hidden_items', []);

    controller.send('set_speak_menu_item_hidden', 'my_boards', true);

    // Flag is OFF → the action short-circuits BEFORE mutating the array
    // or calling save(). Verifies the JS guard added per Scot #1 review.
    expect(controller.get('speak_menu_hidden_items')).toEqual([]);
    expect(saved_called).toEqual(false);
  });

  it('set_speak_menu_item_hidden mutates state when feature_flags.customize_menu is ON', function() {
    var controller = testOwner.lookup('controller:user/board-detail');
    var saved_called = false;
    var saved_prefs = null;
    savedUser = EmberObject.create({
      preferences: { speak_mode_hidden_menu_items: [] },
      save: function() { saved_called = true; return Promise.resolve(); },
      set: function(key, value) {
        if(key === 'preferences.speak_mode_hidden_menu_items') {
          saved_prefs = value;
        }
        EmberObject.prototype.set.call(this, key, value);
      }
    });
    setupFlag(controller, true);
    controller.set('speak_menu_hidden_items', []);

    controller.send('set_speak_menu_item_hidden', 'my_boards', true);

    expect(controller.get('speak_menu_hidden_items')).toEqual(['my_boards']);
    expect(saved_called).toEqual(true);
    expect(saved_prefs).toEqual(['my_boards']);
  });

  it('set_speak_menu_item_hidden(id, false) un-hides a previously-hidden item when flag is ON', function() {
    var controller = testOwner.lookup('controller:user/board-detail');
    savedUser = EmberObject.create({
      preferences: { speak_mode_hidden_menu_items: ['find_boards'] },
      save: function() { return Promise.resolve(); }
    });
    setupFlag(controller, true);
    controller.set('speak_menu_hidden_items', ['find_boards']);

    controller.send('set_speak_menu_item_hidden', 'find_boards', false);

    expect(controller.get('speak_menu_hidden_items')).toEqual([]);
  });

  it('set_speak_menu_item_hidden is a no-op when state already matches the desired value', function() {
    var controller = testOwner.lookup('controller:user/board-detail');
    var saved_called = false;
    savedUser = EmberObject.create({
      preferences: { speak_mode_hidden_menu_items: ['my_boards'] },
      save: function() { saved_called = true; return Promise.resolve(); }
    });
    setupFlag(controller, true);
    controller.set('speak_menu_hidden_items', ['my_boards']);

    // Already hidden, asking to hide again — early return, no save.
    controller.send('set_speak_menu_item_hidden', 'my_boards', true);

    expect(saved_called).toEqual(false);
  });
});
