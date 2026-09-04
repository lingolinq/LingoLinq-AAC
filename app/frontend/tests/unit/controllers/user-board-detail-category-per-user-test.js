import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * Category grouping is a per-USER setting, not a per-board one.
 *
 * It used to resolve per board with the account-wide value only as a FALLBACK
 * (controllers/user/board-detail.js#board_category_settings), and the Categorize switch
 * only ever wrote the per-board slot while copying the top level through verbatim. So a
 * stray account-wide `enabled: true` was UNREACHABLE: turning the switch off on the board
 * in front of you wrote `boards[<key>] = {enabled:false}` and left the top level alone,
 * and every board without an entry of its own kept falling back to it and coming up
 * grouped. That is the "categories keep coming back, sporadically" report.
 *
 * `enabled` now resolves from, and writes to, the account-wide value only. The DISPLAY
 * sub-preferences (`show_category_names`, `vertical_scroll`) deliberately stay per-board,
 * which is why two of these five are controls asserting they did NOT collapse.
 */
module('Unit | Controller | user/board-detail category grouping is per-user', function(hooks) {
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

  /* `grouping` is the whole stored hash, top level plus its `boards` map, exactly as it
     sits in preferences. The board on screen is always `user/a` so the per-board entry
     under test is the one that would be resolved. */
  function on_board(controller, grouping) {
    var user = EmberObject.create({
      preferences: { board_category_grouping: grouping }
    });
    user.save = function() { return { then: function() { return this; } }; };
    controller.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: true },
      referenced_user: user
    }));
    controller.set('model', EmberObject.create({ id: '1_1', key: 'user/a' }));
    return user;
  }

  test('the account-wide flag wins over a per-board entry that disagrees', function(assert) {
    on_board(this.controller, {
      enabled: true,
      boards: { 'user/a': { enabled: false } }
    });
    assert.true(this.controller.get('categorize_enabled'),
      'the account says on, so the board is grouped whatever its own stale entry says');
  });

  test('a per-board entry cannot switch grouping on for an account that has it off', function(assert) {
    on_board(this.controller, {
      enabled: false,
      boards: { 'user/a': { enabled: true } }
    });
    assert.false(this.controller.get('categorize_enabled'),
      'off for the user means off for every board');
  });

  test('CONTROL: a board with no entry of its own reads the account default', function(assert) {
    on_board(this.controller, { enabled: true, boards: {} });
    assert.true(this.controller.get('categorize_enabled'),
      'unchanged behaviour -- this passed before the change and must keep passing');
  });

  test('CONTROL: display sub-preferences stay per-board', function(assert) {
    on_board(this.controller, {
      enabled: true,
      show_category_names: true,
      vertical_scroll: true,
      boards: { 'user/a': { enabled: true, show_category_names: false, vertical_scroll: false } }
    });
    assert.false(this.controller.get('category_names_visible'),
      'the board entry still decides whether category headers render');
    assert.false(this.controller.get('category_vertical_scroll'),
      'and whether the grid scrolls');
  });

  /* The save used to REFUSE outright when it could not tell which board it was on
     (`board_key || board_id` both null mid-transition, inside the double rAF). That guard
     existed because the write TARGET depended on the board: a mistimed toggle rewrote the
     account-wide default when the user meant one board. `enabled` no longer has a
     per-board target, so the refusal now only loses a legitimate account-wide toggle --
     while the sub-preferences, which DO still need a board, must keep refusing. */
  test('a Categorize toggle with no board reference still reaches the account-wide flag', function(assert) {
    var user = on_board(this.controller, { enabled: true, boards: {} });
    this.controller.set('model', EmberObject.create({ id: null, key: null }));
    this.controller._save_category_grouping({ enabled: false });
    assert.false(user.get('preferences.board_category_grouping').enabled,
      'the account-wide flag has no per-board target, so there is nothing to be unsure of');
  });

  test('CONTROL: a sub-preference change with no board reference is still refused', function(assert) {
    var user = on_board(this.controller, {
      enabled: true, show_category_names: true, boards: {}
    });
    this.controller.set('model', EmberObject.create({ id: null, key: null }));
    this.controller._save_category_grouping({ show_category_names: false });
    assert.notStrictEqual(user.get('preferences.board_category_grouping').show_category_names, false,
      'a per-board setting with no board to write it to must still write nothing');
  });

  test('a saved board entry carries no enabled key at all', function(assert) {
    var user = on_board(this.controller, {
      enabled: true,
      show_category_names: true,
      boards: { 'user/a': { enabled: true, show_category_names: true } }
    });
    this.controller._save_category_grouping({ show_category_names: false });
    var entry = user.get('preferences.board_category_grouping').boards['user/a'];
    assert.notOk(Object.prototype.hasOwnProperty.call(entry, 'enabled'),
      'grouping on/off lives at the top level only -- an entry describing it too is a ' +
      'second, contradictory answer, and is what made a stray account-wide true unreachable');
    assert.false(entry.show_category_names,
      'the display settings the entry DOES own still save');
  });

  test('turning Categorize off writes the account-wide flag, not the board slot', function(assert) {
    var user = on_board(this.controller, {
      enabled: true,
      boards: { 'user/a': { enabled: true } }
    });
    this.controller._save_category_grouping({ enabled: false });
    var written = user.get('preferences.board_category_grouping');
    assert.false(written.enabled,
      'the switch reaches the account-wide value -- this is what made the old bug unfixable');
    assert.notOk((written.boards || {})['user/a'] && written.boards['user/a'].enabled === true,
      'and does not leave a per-board true behind to contradict it');
  });
});
