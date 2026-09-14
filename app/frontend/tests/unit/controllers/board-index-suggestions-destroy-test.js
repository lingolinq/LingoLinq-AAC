import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { waitUntil, setupOnerror, resetOnerror } from '@ember/test-helpers';
import BoardIndexController from 'frontend/controllers/board/index';
import word_suggestions from 'frontend/utils/word_suggestions';

/* `updateSuggestions` has FOUR asynchronous boundaries, and a guard that covers some of them looks
 * complete and is not (#0.13(a)). Enumerated:
 *   1. the OUTER `runLater(fn)` at controllers/board/index.js:181 — the whole observer body runs
 *      here, reading `model`, `stashes` and the `appState.referenced_user` computed at :229, and
 *      ISSUING the lookup;
 *   2. the `.then` of `word_suggestions.lookup_with_ai` (:238);
 *   3. the follow-up `runLater(fn, 200)` (:235-237);
 *   4. the rejection handler (:240).
 * Boundaries 2-4 all write through `set_suggestions` (:95), whose `this.set('suggestions', ...)`
 * Ember ASSERTS against a destroyed object. Boundary 1 writes nothing — it runs BEFORE any
 * `set_suggestions` call — so a guard in that helper cannot cover it, which is exactly why it gets
 * its own test and its own guard.
 *
 * SEVERITY, stated accurately because an earlier version of this comment overstated it: this
 * assertion does NOT fire in production. Ember controllers are container singletons
 * (nothing in app/ registers them otherwise) and route teardown does not destroy them —
 * `routes/board/index.js:284` `resetController` only nulls `editManager.controller`. And the
 * message is an `isDevelopingApp()`-gated assertion: `grep -c "calling set on destroyed"` is 1 in
 * ember.debug.js and 0 in ember.prod.js. What the guards actually buy in production is
 * (a) not issuing prediction lookups — measured at 2, including a POST on the AI path — for a
 * board the user has already left, and (b) not merging a stale board's suggestions into the live
 * singleton, since `set_suggestions` `Object.assign`s onto whatever is currently there.
 * In tests the assertion is real and was surfacing as a global failure charged to an unrelated
 * test, which is how it was found.
 *
 * `lookup_with_ai` is stubbed to hand back a promise this file resolves BY HAND, so "destroyed
 * before it resolves" is deterministic rather than a race against a timer. Tests 1 and 3 assert on
 * the ERROR CHANNEL rather than on `suggestions`, because a guard inside `set_suggestions` still
 * calls it and returns early — the property is byte-identical whether the write was guarded or
 * threw, so asserting on state would be hollow. Test 2 asserts on the lookup COUNT instead,
 * because boundary 1 raises no error at all; it silently does work for a dead controller.
 */
module('Unit | Controller | board/index suggestions write after destroy', function(hooks) {
  setupTest(hooks);

  function svc(values) {
    return EmberObject.create(Object.assign({
      addObserver: function() {}, removeObserver: function() {}
    }, values || {}));
  }

  function delay(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  hooks.beforeEach(function() {
    this.errors = [];
    setupOnerror((err) => { this.errors.push(err); });
    this.original_lookup = word_suggestions.lookup_with_ai;
    this.pending = [];
    word_suggestions.lookup_with_ai = () => {
      var d = {};
      d.promise = new RSVP.Promise(function(resolve, reject) { d.resolve = resolve; d.reject = reject; });
      this.pending.push(d);
      return d.promise;
    };
  });

  hooks.afterEach(function() {
    word_suggestions.lookup_with_ai = this.original_lookup;
    resetOnerror();
    if(this.controller && !this.controller.isDestroyed) { this.controller.destroy(); }
    this.controller = null;
  });

  function build() {
    var user = EmberObject.create({
      id: 'u-1',
      preferences: { word_suggestions: true, home_board: { id: '1_1', key: 'u/home' } }
    });
    return BoardIndexController.create({
      appState: EmberObject.create({
        speak_mode: true, eval_mode: false, label_locale: 'en', button_list: [],
        currentUser: user, referenced_user: user
      }),
      model: EmberObject.create({ locale: 'en', name: 'Quick Core', translations: null }),
      stashes: svc({ temporary_root_board_state: { id: '1_2' }, root_board_state: { id: '1_3' } }),
      persistence: svc(),
      router: svc()
    });
  }

  function messages(errors) {
    return errors.map(function(e) { return String((e && e.message) || e); });
  }

  test('a lookup that resolves AFTER the controller is destroyed does not write to it', async function(assert) {
    assert.expect(2);
    this.controller = build();
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    await waitUntil(() => this.pending.length > 0, { timeout: 3000 });

    this.controller.destroy();
    this.pending[0].resolve([{ word: 'is' }]);
    await delay(400);

    assert.true(this.controller.isDestroyed, 'the controller was destroyed before the lookup resolved');
    assert.deepEqual(messages(this.errors), [], 'the late `.then` write raised no error');
  });

  /* BOUNDARY 1 — the OUTER `runLater(fn)` at :175, which the other two tests cannot reach: both
     wait for `pending.length > 0`, and that only becomes true once the outer timer has ALREADY
     fired. Everything from :176 to :230 runs inside it, including reads of `_this.stashes` and the
     `appState.referenced_user` computed at :217 — which happen BEFORE any `set_suggestions` call
     and so cannot be covered by a guard inside that helper. Destroying before the first runloop
     flush is the only way to exercise it. */
  test('the observer body running after destroy does not touch the controller', async function(assert) {
    assert.expect(3);
    this.controller = build();
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    this.controller.destroy();
    await delay(400);

    assert.true(this.controller.isDestroyed, 'destroyed before the outer runLater flushed');
    assert.strictEqual(this.pending.length, 0, 'the lookup was never issued for a dead controller');
    assert.deepEqual(messages(this.errors), [], 'the outer runLater body raised no error');
  });

  test('the 200ms follow-up timer firing after destroy does not write to it', async function(assert) {
    assert.expect(2);
    this.controller = build();
    this.controller.appState.set('button_list', [{ label: 'i' }]);
    await waitUntil(() => this.pending.length > 0, { timeout: 3000 });

    /* Resolve while still ALIVE so the `.then` write succeeds normally; only the follow-up timer
       is left pending. That is what isolates :223-225 from :226. */
    this.pending[0].resolve([{ word: 'is' }]);
    await delay(20);
    this.controller.destroy();
    await delay(400);

    assert.true(this.controller.isDestroyed, 'the controller was destroyed before the follow-up timer fired');
    assert.deepEqual(messages(this.errors), [], 'the follow-up timer raised no error');
  });
});
