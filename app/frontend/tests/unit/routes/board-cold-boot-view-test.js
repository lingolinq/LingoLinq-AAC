import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/* routes/board.js#beforeModel — choosing the board shell on a COLD BOOT.
 *
 * The wildcard `board` route (`path: '/*key'`, router.js) redirects `/:owner/:board` to
 * either `user.board-alt` (classic) or `user.board-detail` (modern) based on
 * `preferences.board_view_style`. On a cold boot `appState.currentUser` is null there —
 * it is assigned inside `find_user`'s async `.then()`, reached from `setupController`,
 * which Ember runs after every route's beforeModel — so the preference was unreadable and
 * every classic user was sent to the modern shell.
 *
 * The record IS in flight by then: `global_transition` runs on `routeWillChange` (which
 * fires before any beforeModel) and calls `refresh_session_user()`, whose promise
 * app-state now stores as `session_user_promise`. This route waits on it, briefly.
 *
 * WHOSE preference (product decision, 2026-09-02): in speak mode the COMMUNICATOR's, not
 * the supporter's. It is the communicator's board and their AAC experience. That matches
 * the app's existing in-session rule, `referenced_user || currentUser`
 * (services/app-state.js:982). The communicator's id is readable synchronously from
 * stashes at boot (`speak_mode_user_id` / `referenced_speak_mode_user_id`, the same ids
 * app-state.js:556-559 uses), so the route resolves THAT record rather than the account
 * holder's.
 *
 * Two gates matter and are pinned below. The wait must engage ONLY when there is a session
 * AND no user yet — `access_token` alone is not enough, because in-app navigation reaches
 * this same wildcard route (8+ `transitionTo('board', key)` call sites; see
 * controllers/search.js:359-362) with a LOADED user, and waiting there would stall every
 * in-app board open.
 */
module('Unit | Route | board cold-boot view choice', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    window.LingoLinq = window.LingoLinq || {};
    this._realSession = window.LingoLinq.session;
  });
  hooks.afterEach(function() {
    window.LingoLinq.session = this._realSession;
  });

  function signedInAs(user_name, token) {
    window.LingoLinq.session = EmberObject.create({
      user_name: user_name,
      access_token: token === undefined ? 'tok' : token
    });
  }

  function userWith(style, name) {
    return EmberObject.create({
      user_name: name || 'someone',
      preferences: { board_view_style: style }
    });
  }

  function setup(context, opts) {
    var o = opts || {};
    var moved = [];
    var fetched = [];

    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: o.currentUser || null,
      session_user_promise: o.sessionUserPromise || null
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      replaceWith: function() { moved.push(Array.prototype.slice.call(arguments)); }
    }));
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({
      get: function(key) { return (o.stashes || {})[key]; }
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      findRecord: function(type, id) {
        fetched.push(type + ':' + id);
        var rec = (o.records || {})[id];
        return rec ? RSVP.resolve(rec) : RSVP.reject(new Error('not found'));
      }
    }));

    return { route: context.owner.lookup('route:board'), moved: moved, fetched: fetched };
  }

  function transitionTo(key) {
    return { to: { params: { key: key } } };
  }

  // ---- the regression this file exists for -------------------------------------

  test('REGRESSION: a classic user opening a board link cold lands on the classic board', async function(assert) {
    signedInAs('bethany');
    var t = setup(this, { sessionUserPromise: RSVP.resolve(userWith('classic', 'bethany')) });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-alt', 'bethany', 'keyboard']],
      'waits for the in-flight record and honours the real preference');
  });

  test('a modern user still lands on the modern board', async function(assert) {
    signedInAs('bethany');
    var t = setup(this, { sessionUserPromise: RSVP.resolve(userWith('modern', 'bethany')) });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-detail', 'bethany', 'keyboard']], 'modern is unchanged');
  });

  // ---- whose preference, in speak mode ------------------------------------------

  test('in speak-as mode the COMMUNICATOR\'s preference wins, not the supporter\'s', async function(assert) {
    signedInAs('amy');
    var t = setup(this, {
      // The supporter is modern; the communicator they are speaking as is classic.
      sessionUserPromise: RSVP.resolve(userWith('modern', 'amy')),
      stashes: { speak_mode_user_id: 'u-bethany' },
      records: { 'u-bethany': userWith('classic', 'bethany') }
    });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-alt', 'bethany', 'keyboard']],
      'the communicator gets their own shell on their own board');
    assert.deepEqual(t.fetched, ['user:u-bethany'],
      'resolved the communicator record, not the account holder');
  });

  test('a referenced (modelling) communicator is honoured the same way', async function(assert) {
    signedInAs('amy');
    var t = setup(this, {
      sessionUserPromise: RSVP.resolve(userWith('modern', 'amy')),
      stashes: { referenced_speak_mode_user_id: 'u-bethany' },
      records: { 'u-bethany': userWith('classic', 'bethany') }
    });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-alt', 'bethany', 'keyboard']],
      'same rule as services/app-state.js:982 (referenced_user || currentUser)');
  });

  // ---- the gates ------------------------------------------------------------------

  test('an already-loaded user redirects SYNCHRONOUSLY, with no wait', function(assert) {
    signedInAs('bethany');
    var t = setup(this, { currentUser: userWith('classic', 'bethany') });

    // Deliberately NOT awaited: in-app navigation reaches this same route with a loaded
    // user, and waiting there would stall every in-app board open.
    t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-alt', 'bethany', 'keyboard']],
      'decided before yielding to the runloop');
  });

  test('a logged-out visitor redirects synchronously and never waits', function(assert) {
    signedInAs('bethany', null);
    var t = setup(this, { sessionUserPromise: RSVP.resolve(userWith('classic', 'bethany')) });

    t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-detail', 'bethany', 'keyboard']],
      'no session, no preference to honour, no delay');
  });

  // ---- failure and edge behaviour ---------------------------------------------------

  test('falls back to modern when the record never arrives', async function(assert) {
    signedInAs('bethany');
    var never = new RSVP.Promise(function() {});
    var t = setup(this, { sessionUserPromise: never });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-detail', 'bethany', 'keyboard']],
      'bounded wait, then today\'s default');
  });

  test('falls back to modern when the communicator record cannot be fetched', async function(assert) {
    signedInAs('amy');
    var t = setup(this, {
      sessionUserPromise: RSVP.resolve(userWith('classic', 'amy')),
      stashes: { speak_mode_user_id: 'u-missing' },
      records: {}
    });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.deepEqual(t.moved, [['user.board-detail', 'bethany', 'keyboard']],
      'a rejected fetch must not throw out of beforeModel');
  });

  test('redirects exactly once', async function(assert) {
    signedInAs('bethany');
    var t = setup(this, { sessionUserPromise: RSVP.resolve(userWith('classic', 'bethany')) });

    await t.route.beforeModel(transitionTo('bethany/keyboard'));

    assert.strictEqual(t.moved.length, 1, 'one replaceWith, not two');
  });

  // ---- keys this route must NOT touch ------------------------------------------------

  test('obf/ and integrations/ keys are left alone', function(assert) {
    signedInAs('bethany');
    var t = setup(this, { sessionUserPromise: RSVP.resolve(userWith('classic', 'bethany')) });

    t.route.beforeModel(transitionTo('obf/abc123'));
    t.route.beforeModel(transitionTo('integrations/thing'));

    assert.deepEqual(t.moved, [], 'these are handled by the model hook, not redirected');
  });

  test('a key with no slash is left alone', function(assert) {
    signedInAs('bethany');
    var t = setup(this, { sessionUserPromise: RSVP.resolve(userWith('classic', 'bethany')) });

    t.route.beforeModel(transitionTo('somekey'));

    assert.deepEqual(t.moved, [], 'not a user/board key');
  });
});
