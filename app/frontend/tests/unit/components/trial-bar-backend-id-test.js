import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* "USE THIS BOARD FOR <NAME>" NAMES SOMEONE ELSE ONLY FOR SOMEONE ELSE (section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). The trial's user_id is a backend id (or 'self' on a
 * marker stored before that), and currentUser can be the record keyed 'self' (a network load) for the same person, so
 * `forUserName` compares people (utils/backend_user_id.js same_person), not `id` strings. */
module('Unit | Component | trial-bar backend ids', function(hooks) {
  setupTest(hooks);

  function bar(context, me, trial) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ currentUser: me, sessionUser: me }));
    return context.owner.factoryFor('component:trial-bar').create({ view: 'modern', mark: trial });
  }
  var me_net = function() { return EmberObject.create({ id: 'self', global_id: '1_3', user_name: 'example' }); };
  var me_local = function() { return EmberObject.create({ id: '1_3', global_id: '1_3', user_name: 'example' }); };

  test('a trial for your real id is your own while currentUser is the record keyed self', function(assert) {
    var component = bar(this, me_net(), { key: 'example/core-60', user_id: '1_3', user_name: 'example' });
    assert.strictEqual(component.get('forUserName'), null);
  });

  test('an older trial holding self is your own while currentUser is the real-id record', function(assert) {
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({ currentUser: me_local(), sessionUser: me_net() }));
    var component = this.owner.factoryFor('component:trial-bar').create({ view: 'modern', mark: { key: 'example/core-60', user_id: 'self', user_name: 'example' } });
    assert.strictEqual(component.get('forUserName'), null);
  });

  test('a trial for a genuinely different person names them', function(assert) {
    var component = bar(this, me_net(), { key: 'aiden_parker/core-60', user_id: '1_7', user_name: 'aiden_parker' });
    assert.strictEqual(component.get('forUserName'), 'aiden_parker');
  });
});
