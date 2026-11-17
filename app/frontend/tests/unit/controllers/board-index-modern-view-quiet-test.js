import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { waitUntil, settled } from '@ember/test-helpers';
import BoardIndexController from 'frontend/controllers/board/index';
import word_suggestions from 'frontend/utils/word_suggestions';

/* KAN-159. The classic board controller is alive in the Modern view: routes/user/board-detail.js
   calls `controllerFor('board.index')` and mirrors the board onto it. Its `updateSuggestions`
   observer watches `appState.button_list` and never asked which view is on screen, so every tap in
   the Modern view also ran a classic lookup, for a prediction bar that is not rendered there. That
   lookup landed last and cancelled the Modern rail's AI request.

   The guard is "the Modern (board-detail) route is active", NOT "board.index is active": this
   controller also serves `user.board-alt.index` (routes/user/board-alt/index.js sets
   `controllerName: 'board.index'`), and the existing unit tests build it with no route at all.
   The last three tests hold those cases open.

   `lookup_with_ai` is replaced with a counter, so the assertion is on lookups ISSUED. */
module('Unit | Controller | board/index stays quiet in the Modern view', function(hooks) {
  setupTest(hooks);

  let original_lookup = null;

  hooks.beforeEach(function() {
    original_lookup = Object.getOwnPropertyDescriptor(word_suggestions, 'lookup_with_ai');
    const lookups = this.lookups = [];
    word_suggestions.lookup_with_ai = function(options) {
      lookups.push(options);
      return RSVP.resolve([{ word: 'to' }]);
    };
  });

  hooks.afterEach(async function() {
    /* The classic observer leaves a 200 ms follow-up timer behind each answered lookup. */
    await settled();
    Object.defineProperty(word_suggestions, 'lookup_with_ai', original_lookup);
    if(this.controller && !this.controller.isDestroyed) { this.controller.destroy(); }
    this.controller = null;
  });

  function svc(values) {
    return EmberObject.create(Object.assign({
      addObserver: function() {}, removeObserver: function() {}
    }, values || {}));
  }

  function build(route_fields) {
    const user = EmberObject.create({
      id: 'u-1',
      preferences: { word_suggestions: true, home_board: { id: '1_1', key: 'u/home' } }
    });
    return BoardIndexController.create({
      appState: EmberObject.create(Object.assign({
        speak_mode: true, eval_mode: false, label_locale: 'en', button_list: [],
        currentUser: user, referenced_user: user
      }, route_fields || {})),
      model: EmberObject.create({ locale: 'en', name: 'Quick Core', translations: null }),
      stashes: svc({ temporary_root_board_state: { id: '1_2' }, root_board_state: { id: '1_3' } }),
      persistence: svc(),
      router: svc()
    });
  }

  test('a tap in the Modern view starts no classic lookup', async function(assert) {
    assert.expect(2);
    this.controller = build({ router: { currentRouteName: 'user.board-detail.index' } });
    this.controller.appState.set('button_list', [{ label: 'i' }, { label: 'want' }]);
    await settled();

    assert.strictEqual(this.lookups.length, 0, 'no prediction lookup was issued');
    assert.notOk(this.controller.get('suggestions'), 'and the unused classic bar was not marked as loading');
  });

  test('the Modern view is recognised from current_route when the router has no route name yet', async function(assert) {
    assert.expect(1);
    this.controller = build({ router: {}, current_route: 'user.board-detail.index' });
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    await settled();

    assert.strictEqual(this.lookups.length, 0, 'no prediction lookup was issued');
  });

  test('a tap on the classic board route still looks up predictions', async function(assert) {
    assert.expect(2);
    this.controller = build({ router: { currentRouteName: 'board.index' } });
    this.controller.appState.set('button_list', [{ label: 'i' }, { label: 'want' }]);
    await waitUntil(() => this.lookups.length > 0, { timeout: 2000 });

    assert.strictEqual(this.lookups[0].sentence, 'i want', 'the lookup carries the sentence');
    await waitUntil(() => this.controller.get('suggestions.ready'), { timeout: 2000 });
    assert.deepEqual(this.controller.get('suggestions.list'), [{ word: 'to' }], 'and its words reach the classic bar');
  });

  test('a tap on the classic board under a user (board-alt) still looks up predictions', async function(assert) {
    assert.expect(1);
    this.controller = build({ router: { currentRouteName: 'user.board-alt.index' } });
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    await waitUntil(() => this.lookups.length > 0, { timeout: 2000 });

    assert.strictEqual(this.lookups[0].sentence, 'i', 'board-alt is served by this controller and keeps prediction');
  });

  test('the router\'s route name wins over a stale current_route', async function(assert) {
    assert.expect(1);
    this.controller = build({ router: { currentRouteName: 'user.board-alt.index' }, current_route: 'user.board-detail.index' });
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    await waitUntil(() => this.lookups.length > 0, { timeout: 2000 });

    assert.strictEqual(this.lookups[0].sentence, 'i', 'the classic board is on screen, so the lookup runs');
  });

  test('arriving on the classic board from the Modern view refreshes the classic bar', async function(assert) {
    assert.expect(2);
    this.controller = build({ router: { currentRouteName: 'user.board-detail.index' } });
    this.controller.appState.set('button_list', [{ label: 'i' }, { label: 'want' }]);
    await settled();
    assert.strictEqual(this.lookups.length, 0, 'guard: quiet while the Modern view is on screen');

    /* Same board, same sentence: nothing else the observer watches changes on this move. */
    this.controller.appState.set('router', { currentRouteName: 'user.board-alt.index' });
    await waitUntil(() => this.lookups.length > 0, { timeout: 2000 });

    assert.strictEqual(this.lookups[0].sentence, 'i want', 'the sentence already in the bar is looked up on arrival');
  });

  test('with no route known at all, the classic lookup still runs', async function(assert) {
    assert.expect(1);
    this.controller = build();
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    await waitUntil(() => this.lookups.length > 0, { timeout: 2000 });

    assert.strictEqual(this.lookups[0].sentence, 'i', 'an unknown route is not treated as the Modern view');
  });
});
