import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* MODERN'S UPDATES ADDRESS OPENED DIRECTLY IN BASIC (requested 2026-09-30: "we should be routing to
 * the logs page but ensure that their messages are not marked as read").
 * `/<me>/logs?type=note&nav=home` (components/user-pill-nav.hbs) becomes Basic's own Logs page: no
 * messages filter, no Updates marker. Two things mark messages read on this page, and the page must
 * never be set up with either param:
 *  - routes/user/logs.js#setupController calls markUpdatesRead for a `nav=home` arrival;
 *  - controllers/user/logs.js#refresh saves `last_message_read` whenever the list loads with
 *    `type=note`.
 * So afterModel ABORTS the transition in flight and replaces it with the plain page. Without the
 * abort, a same-route replace is merged into the in-flight transition, which then re-applies its
 * own `type=note` after setupController (traced in the browser). Unit tests cannot see that merge,
 * so they pin the abort; the outcome was checked in the browser.
 */
module('Unit | Route | Basic logs landing', function(hooks) {
  setupTest(hooks);

  var PLAIN = ['replaceWith', 'user.logs', 'example', { queryParams: { nav: null, type: null } }];

  function setup(context, style, cold) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'example', read_notifications: false, preferences: { board_view_style: style },
      save: function() { calls.push(['save']); return Promise.resolve(); } });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(cold ? {
      effective_view_user: null, currentUser: null, session_user_promise: Promise.resolve(me)
    } : {
      effective_view_user: me, currentUser: me, sessionUser: me
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    var transition = { to: { queryParams: { type: 'note', nav: 'home' } }, abort: function() { calls.push(['abort']); } };
    return { calls: calls, me: me, transition: transition, route: context.owner.lookup('route:user/logs') };
  }

  function run(result) { return Promise.resolve(result).catch(function() {}); }

  test('Basic, own: the transition is aborted, then replaced by the plain Logs page', async function(assert) {
    var t = setup(this, 'classic');
    await run(t.route.afterModel(t.me, t.transition));
    assert.deepEqual(t.calls, [['abort'], PLAIN], 'aborted first, so the page is never set up with type=note or nav=home');
    assert.false(t.me.get('read_notifications'), 'updates not marked read');
  });

  test('Basic, own, cold load: decided from the session user, same outcome', async function(assert) {
    var t = setup(this, 'classic', true);
    await run(t.route.afterModel(EmberObject.create({ id: '1_3', user_name: 'example' }), t.transition));
    assert.deepEqual(t.calls, [['abort'], PLAIN]);
  });

  test('Modern, own: the Updates page as before (no redirect; setup marks updates read)', async function(assert) {
    var t = setup(this, 'modern');
    await run(t.route.afterModel(t.me, t.transition));
    assert.deepEqual(t.calls, [], 'no abort, no redirect');
    var controller = EmberObject.extend({ send: function() {} }).create({ type: 'note', nav: 'home' });
    t.route.setupController(controller, t.me);
    assert.true(t.me.get('read_notifications'), 'Modern\'s Updates arrival still retires the badge');
  });

  test('Basic, a communicator\'s log: left as it is', async function(assert) {
    var t = setup(this, 'classic');
    await run(t.route.afterModel(EmberObject.create({ id: '1_7', user_name: 'aiden_parker' }), t.transition));
    assert.deepEqual(t.calls, [], 'no abort, no redirect, nothing saved');
  });

  test('Basic, own, plain Logs (no nav=home): left as it is', async function(assert) {
    var t = setup(this, 'classic');
    t.transition.to.queryParams = { type: 'note' };
    await run(t.route.afterModel(t.me, t.transition));
    assert.deepEqual(t.calls, [], 'Basic\'s own Messages link keeps its filter');
  });
});
