import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/* "Boards on This Device" (Traci, 2026-11-16; docs/task-management/2026-11-16_offline-boards-page.md): offline, the
 * boards page shows one list of the boards on the device instead of its tabs, in the same tile markup, with nothing
 * that needs a server. Only templates/user/boards.hbs passes @offlineView; the account page keeps its normal UI. */
QUnit.module('Integration | boards on this device', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    var opened = this.opened = [];
    var board = EmberObject.create({ key: 'tester/one', name: 'One' });
    this.set('boardsCtrl', EmberObject.create({
      board_list: EmberObject.create({ results: [EmberObject.create({ board: board })], filtered_results: [EmberObject.create({ board: board })] }),
      mineFoldersEnabled: true,
      mine_selected: true,
      model: EmberObject.create({ permissions: { edit: true }, preferences: { home_board: { key: 'tester/home' } } }),
      send: function(action, arg) { opened.push([action, arg]); }
    }));
    // Board records, as utils/offline_board_list.js device_board_list hands them over (peekRecord or store.push).
    var store = this.owner.lookup('service:store');
    var device = [
      store.push({ data: { id: '1_1', type: 'board', attributes: { key: 'tester/home', name: 'Tester Home Board' } } }),
      store.push({ data: { id: '1_2', type: 'board', attributes: { key: 'lingolinq/crisis-vocabulary', name: 'Crisis Vocabulary' } } })
    ];
    device.done = true;
    device.from_device = true;
    this.set('device', device);
  });

  QUnit.test('offline: the heading, the device\'s boards as tiles, and none of the online controls', async function(assert) {
    assert.timeout(30000);
    await render(hbs`<BoardsBrowser @boardsCtrl={{this.boardsCtrl}} @offlineView={{true}} @offlineBoards={{this.device}} />`);
    assert.dom('.ub-boards-page__boards-title-primary').hasText('Boards on This Device');
    assert.dom('.ub-boards-page__boards-title').exists({ count: 1 }, 'one heading, the section\'s own h2');
    assert.dom('.ub-boards-page__board-item').exists({ count: 2 });
    assert.dom('.ub-boards-page__board-item--home').exists({ count: 1 }, 'the home board is marked');
    assert.dom('[data-board-key="tester/home"]').containsText('Tester Home Board', 'each tile shows its board\'s name, not a loading placeholder');
    assert.dom('[data-board-key="lingolinq/crisis-vocabulary"]').containsText('Crisis Vocabulary');
    assert.dom('.ub-boards-page__board-item[draggable="true"]').doesNotExist('nothing to drag');
    assert.dom('.ub-boards-page__tabs').doesNotExist('no tab row');
    assert.dom('.ub-boards-page__tabs-mobile-picker').doesNotExist('no phone tab picker');
    assert.dom('.ub-boards-page__new-board-btn').doesNotExist('no New Board');
    assert.dom('.ub-boards-page__folders-section').doesNotExist('no folders panel');
  });

  QUnit.test('offline: a tile opens its board', async function(assert) {
    assert.timeout(30000);
    await render(hbs`<BoardsBrowser @boardsCtrl={{this.boardsCtrl}} @offlineView={{true}} @offlineBoards={{this.device}} />`);
    await click('[data-board-key="tester/home"] div[role="button"]');
    var open = this.opened.filter((o) => o[0] === 'open_board_in_user_view');
    assert.strictEqual(open.length, 1);
    var picked = open[0][1];
    assert.strictEqual((picked.board || picked).get('key'), 'tester/home', 'the same argument the online grid passes on');
  });

  QUnit.test('offline with nothing on the device: says so, and how to fix it', async function(assert) {
    assert.timeout(30000);
    var none = [];
    none.done = true;
    this.set('none', none);
    await render(hbs`<BoardsBrowser @boardsCtrl={{this.boardsCtrl}} @offlineView={{true}} @offlineBoards={{this.none}} />`);
    assert.dom('.ub-boards-page__empty-title').hasText('No boards are saved on this device yet');
    assert.dom('.ub-boards-page__empty-title').doesNotHaveTextContaining('Create', 'not the online "create your first board"');
  });

  QUnit.test('without @offlineView (the account page, or online): the normal boards UI', async function(assert) {
    assert.timeout(30000);
    await render(hbs`<BoardsBrowser @boardsCtrl={{this.boardsCtrl}} @offlineBoards={{this.device}} />`);
    assert.dom('.ub-boards-page__boards-title-primary').hasText('Boards');
    assert.dom('.ub-boards-page__new-board-btn').exists();
    assert.dom('.ub-boards-page__folders-section').exists('the normal list section');
  });

  QUnit.test('offline, a device read that failed: says the boards cannot be shown, not that none are saved', async function(assert) {
    assert.timeout(30000);
    var failed = [];
    failed.done = true;
    failed.read_failed = true;
    this.set('failed', failed);
    await render(hbs`<BoardsBrowser @boardsCtrl={{this.boardsCtrl}} @offlineView={{true}} @offlineBoards={{this.failed}} />`);
    assert.dom('[role="status"]').includesText("Your boards can't be shown right now.");
    assert.dom('.ub-boards-page__empty-title').doesNotExist('not "No boards are saved on this device yet"');
  });

  // Review round 3: the liked heart's name was on a role-less span, which screen readers skip (a generic element cannot
  // be named, ARIA 1.2). As an image it is announced as "Liked".
  QUnit.test('offline: a liked board\'s heart is announced as "Liked"', async function(assert) {
    assert.timeout(30000);
    var store = this.owner.lookup('service:store');
    var liked = [store.push({ data: { id: '1_3', type: 'board', attributes: { key: 'other/liked', name: 'Liked One', starred: true } } })];
    liked.done = true;
    liked.from_device = true;
    this.set('liked', liked);
    await render(hbs`<BoardsBrowser @boardsCtrl={{this.boardsCtrl}} @offlineView={{true}} @offlineBoards={{this.liked}} />`);
    assert.dom('.ub-boards-page__board-item-heart').exists({ count: 1 });
    assert.dom('.ub-boards-page__board-item-heart').hasAttribute('role', 'img');
    assert.dom('.ub-boards-page__board-item-heart').hasAttribute('aria-label', 'Liked');
  });
});
