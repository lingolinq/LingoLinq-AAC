import { setupApplicationTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { visit, settled } from '@ember/test-helpers';
import EmberObject, { notifyPropertyChange } from '@ember/object';
import * as QUnit from 'qunit';

/* The Speak Mode sidebar lists the user's sidebar boards and nothing else that navigates:
   it used to end with a Light or Dark item, a LinkTo between the classic board page
   (route `board.index`) and Board Alt (route `user.board-alt.index`). The item was built from
   the board key split on "/", which is why it also appeared on obf/ boards.

   This drives the REAL application controller and template: boot the app on board-detail
   (the render the sibling board-detail-global-header spec uses, because the classic board
   route does not settle under Mirage), then move app-state to Speak Mode on the page under
   test. Every item in the sidebar is an `a.sidebar_item`, and the removed item was one too,
   so the count of `#sidebar a.sidebar_item` must equal `sidebar_boards.length`. On develop
   the count is one higher on both pages, and the assertion on the count fails. */
QUnit.module('Acceptance | Speak Mode sidebar has no Light/Dark items', function(hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

  var sidebar_boards = [
    { name: 'Home board', key: 'tester/home', image: '' },
    { name: 'More words', key: 'tester/more', image: '' }
  ];
  var original_prefs;

  hooks.beforeEach(function() {
    original_prefs = window.user_preferences;
    window.user_preferences = { any_user: { default_sidebar_boards: sidebar_boards } };
  });

  hooks.afterEach(function() {
    window.user_preferences = original_prefs;
  });

  function make_board(server, user_name, key) {
    server.create('user', { user_name: user_name });
    server.create('board', {
      key: user_name + '/' + key,
      user_name: user_name,
      buttons: [],
      grid: {
        rows: 3,
        columns: 4,
        order: [
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null]
        ]
      },
      permissions: { view: true, edit: true }
    });
  }

  async function open_speak_mode(owner, route, key) {
    var app_state = owner.lookup('service:app-state');
    app_state.set('current_route', route);
    app_state.set('currentBoardState', EmberObject.create({ id: '1_2', key: key }));
    // speak_mode is a computed whose setter caches a forced value; set it last, because a
    // later change to currentBoardState would derive it again from stashes.current_mode.
    app_state.set('speak_mode', true);
    notifyPropertyChange(app_state, 'current_sidebar_boards');
    await settled();
    return app_state;
  }

  QUnit.test('board-alt has no Light or Dark item in the sidebar', async function(assert) {
    assert.timeout(60000);
    make_board(this.server, 'tester', 'empty');
    await visit('/tester/board-detail/empty');

    var app_state = await open_speak_mode(this.owner, 'user.board-alt.index', 'tester/empty');

    assert.true(app_state.get('sidebar_visible'), 'the Speak Mode sidebar is showing');
    assert.strictEqual(app_state.get('sidebar_boards').length, sidebar_boards.length,
      'the sidebar boards are the two this test supplies');
    assert.dom('#sidebar').exists('the sidebar rendered');
    assert.dom('#sidebar a.sidebar_item').exists({ count: sidebar_boards.length },
      'every sidebar item is a sidebar board, with no extra Light or Dark item');
    assert.dom('#sidebar .sidebar_item--board-alt').doesNotExist('no board-alt item');
  });

  QUnit.test('an obf board on the classic board page has no Light or Dark item in the sidebar', async function(assert) {
    assert.timeout(60000);
    make_board(this.server, 'tester', 'empty');
    await visit('/tester/board-detail/empty');

    var app_state = await open_speak_mode(this.owner, 'board.index', 'obf/stars');

    assert.true(app_state.get('sidebar_visible'), 'the Speak Mode sidebar is showing');
    assert.strictEqual(app_state.get('sidebar_boards').length, sidebar_boards.length,
      'the sidebar boards are the two this test supplies');
    assert.dom('#sidebar').exists('the sidebar rendered');
    assert.dom('#sidebar a.sidebar_item').exists({ count: sidebar_boards.length },
      'every sidebar item is a sidebar board, with no extra Light or Dark item');
    assert.dom('#sidebar .sidebar_item--board-alt').doesNotExist('no board-alt item');
  });
});
