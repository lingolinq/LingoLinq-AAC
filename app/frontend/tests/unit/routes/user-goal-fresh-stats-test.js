import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/*
 * The goal page fetches its goal again while online (#1196). Only the goal's own request
 * returns stats grouped at the viewer's midnight (adapters/goal.js); a goal the goals list
 * loaded holds the stored UTC grouping, and findRecord would hand that back and draw it.
 * Offline there is nothing to fetch, so the stored record is used as before.
 */
module('Unit | Route | user goal fresh stats', function(hooks) {
  setupTest(hooks);

  function setup(context, online) {
    var calls = [];
    var goal = EmberObject.create({ id: '1_2' });
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      findRecord: function(type, id, options) {
        calls.push({ type: type, id: id, options: options });
        return RSVP.resolve(goal);
      }
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: online }));
    var route = context.owner.lookup('route:user/goal');
    route.modelFor = function() { return EmberObject.create(); };
    return { route: route, goal: goal, calls: calls };
  }

  test('online, the goal is fetched again rather than taken from the store', async function(assert) {
    var t = setup(this, true);
    var model = await t.route.model({ goal_id: '1_2' });
    assert.strictEqual(model, t.goal);
    assert.strictEqual(t.calls.length, 1);
    assert.strictEqual(t.calls[0].id, '1_2');
    assert.true(!!(t.calls[0].options && t.calls[0].options.reload), 'findRecord is asked to reload');
  });

  test('offline, the stored goal is used', async function(assert) {
    var t = setup(this, false);
    var model = await t.route.model({ goal_id: '1_2' });
    assert.strictEqual(model, t.goal);
    assert.false(!!(t.calls[0].options && t.calls[0].options.reload), 'no forced reload');
  });
});
