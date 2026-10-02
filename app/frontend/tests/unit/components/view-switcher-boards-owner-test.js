import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { basic_landing_for } from 'frontend/utils/basic_landing';

/* SWITCHING VIEW ON SOMEONE ELSE'S BOARDS PAGE STAYS WITH THAT USER (requested 2026-10-01: "if you
 * switch the view, you still stay on that user's board ... so that if they are trying to show a
 * user what their view could look like when switched to, it will properly show that user's view").
 * Basic has no boards library page; the landing for `user.boards` was the viewer's OWN home page's
 * Boards tab, whoever's library was on screen, so an SLP on /<communicator>/boards switching to
 * Basic landed on their own home. Someone else's library goes to that user's account page, which
 * lists the same boards -- the rule routes/user/boards.js already applies on arrival.
 */
module('Unit | Component | view-switcher boards owner', function(hooks) {
  setupTest(hooks);

  function setup(context, pageUser, me) {
    var calls = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      current_route: 'user.boards', effective_view_user: me, currentUser: me, sessionUser: me, page_user: pageUser
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentURL: '/' + pageUser.get('user_name') + '/boards',
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    return calls;
  }

  function user(id, name) {
    return EmberObject.create({ id: id, user_name: name, preferences: { board_view_style: 'modern', device: {} },
      save: function() { return Promise.resolve(); } });
  }

  test('on a communicator\'s boards page, Basic shows that communicator\'s account page', function(assert) {
    var slp = user('1_3', 'slp_ana');
    var calls = setup(this, user('1_7', 'aiden_parker'), slp);
    this.owner.factoryFor('component:view-switcher').create().send('_apply_view', slp, 'classic');
    assert.deepEqual(calls, [['transitionTo', 'user.index', 'aiden_parker']]);
    assert.notOk(this.owner.lookup('service:app-state').get('pending_index_nav'), 'no home-page tab handed off');
  });

  test('on your own boards page, Basic still opens your home page on the Boards tab', function(assert) {
    var slp = user('1_3', 'slp_ana');
    var calls = setup(this, user('self', 'slp_ana'), slp);
    this.owner.factoryFor('component:view-switcher').create().send('_apply_view', slp, 'classic');
    assert.deepEqual(calls, [['transitionTo', 'index']]);
    assert.strictEqual(this.owner.lookup('service:app-state').get('pending_index_nav'), 'boards');
  });

  test('the landing map: someone else\'s library -> their account; unknown owner -> as before', function(assert) {
    assert.deepEqual(basic_landing_for('user.boards', '/aiden_parker/boards', { own: false, user_name: 'aiden_parker' }),
      { route: 'user.index', models: ['aiden_parker'] });
    assert.strictEqual(basic_landing_for('user.boards', '/x/boards', { own: true, user_name: 'x' }).index_nav, 'boards');
    assert.strictEqual(basic_landing_for('user.boards', '/x/boards').index_nav, 'boards', 'no owner given: unchanged');
  });
});
