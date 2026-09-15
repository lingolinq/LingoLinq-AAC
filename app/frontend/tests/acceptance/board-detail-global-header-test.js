import { setupApplicationTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { visit, settled } from '@ember/test-helpers';
import * as QUnit from 'qunit';

/* templates/application.hbs opens its <header> with no conditional, so every route renders
   it and board-detail only translates it off screen (app.scss, #within_ember.board-detail-view
   > header). Signed in that header is <AppNavbar>: measured 104 nodes, and walking the tab
   order lands on 3 of them, all at negative rectTop -- focus moving somewhere invisible.

   The board-detail spec pairs "no global header" with two positive assertions on the same
   render, so it cannot pass against an app that failed to reach board-detail at all. The
   second spec is the other half of that guard -- it moves current_route off board-detail in
   the already-booted app and watches the header come back, which is what separates "the
   wrapper is conditional" from "the header was deleted outright".

   That second spec started out as a visit to the classic board route with the same fixture.
   It does not work: `/classic/plain` never settles under Mirage and the spec died on QUnit's
   60s ceiling after 120s of wall clock. Re-using the booted app avoids a second boot
   entirely. */
QUnit.module('Acceptance | board-detail global header', function(hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

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

  QUnit.test('board-detail does not render the global header', async function(assert) {
    // Booting the whole app costs more than QUnit's 15s default; see the sibling
    // board-detail-empty-state test for why.
    assert.timeout(60000);
    make_board(this.server, 'tester', 'empty');

    await visit('/tester/board-detail/empty');

    assert.dom('#within_ember.board-detail-view').exists(
      'the route resolved to board-detail — on_board_detail is true for this render');
    assert.dom('.md-board-detail-empty-board').exists(
      'board-detail content actually rendered, so the header assertion is about a real page');
    assert.dom('#within_ember > header').doesNotExist(
      'the global header is not in the DOM on board-detail');
  });

  QUnit.test('the global header returns when the route is no longer board-detail', async function(assert) {
    assert.timeout(60000);
    make_board(this.server, 'tester', 'empty');

    await visit('/tester/board-detail/empty');
    assert.dom('#within_ember > header').doesNotExist('header absent while on board-detail');

    // on_board_detail is computed('appState.current_route') (controllers/application.js:173),
    // so moving current_route off board-detail is what the wrapper actually keys on.
    this.owner.lookup('service:app-state').set('current_route', 'user.home');
    await settled();

    assert.dom('#within_ember').doesNotHaveClass('board-detail-view',
      'the body class cleared too — both read the same source');
    assert.dom('#within_ember > header').exists(
      'the header comes back off board-detail — the wrapper is conditional, not a deletion');
  });
});
