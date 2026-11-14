import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* YOUR OWN CARD IS YOUR OWN (section 24 of docs/task-management/2026-11-10_offline-followup-proposals.md). The
 * supporter (sessionUser) can be the record keyed 'self' while the card holds the real-id record of the same person;
 * `is_self` compares people by backend id (utils/backend_user_id.js same_person). */
module('Unit | Helper | remote-modeling-access backend ids', function(hooks) {
  setupTest(hooks);

  function compute(context, supporter, user) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ sessionUser: supporter }));
    return context.owner.factoryFor('helper:remote-modeling-access').create().compute([user]);
  }

  test('the real-id card is yourself while the supporter record is keyed self', function(assert) {
    var me_net = EmberObject.create({ id: 'self', global_id: '1_3' });
    assert.true(compute(this, me_net, EmberObject.create({ id: '1_3', global_id: '1_3' })).is_self);
  });

  test('a genuinely different communicator is not yourself', function(assert) {
    var me_net = EmberObject.create({ id: 'self', global_id: '1_3' });
    assert.false(compute(this, me_net, EmberObject.create({ id: '1_7', global_id: '1_7' })).is_self);
  });
});
