import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* "HELP ME CHOOSE" ON YOUR OWN CARD RUNS THE SELF FLOW (section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). The card's user and currentUser can be the records
 * keyed 'self' and by the real id of the same person; `homeBoardPickerUserId` must then be null (the picker's self
 * flow), and for someone else it is their BACKEND id, never 'self'. */
module('Unit | Component | dashboard-user-boards backend ids', function(hooks) {
  setupTest(hooks);

  function card(context, me, user) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ currentUser: me, sessionUser: me }));
    return context.owner.factoryFor('component:dashboard-user-boards').create({ user: user });
  }

  test('your own card is the self flow when the card holds the real-id record and currentUser is keyed self', function(assert) {
    var me_net = EmberObject.create({ id: 'self', global_id: '1_3' });
    assert.strictEqual(card(this, me_net, EmberObject.create({ id: '1_3', global_id: '1_3' })).get('homeBoardPickerUserId'), null);
  });

  test('your own card is the self flow when the card holds the record keyed self', function(assert) {
    var me_local = EmberObject.create({ id: '1_3', global_id: '1_3' });
    assert.strictEqual(card(this, me_local, EmberObject.create({ id: 'self', global_id: '1_3' })).get('homeBoardPickerUserId'), null);
  });

  test('a genuinely different person gets their backend id', function(assert) {
    var me_net = EmberObject.create({ id: 'self', global_id: '1_3' });
    assert.strictEqual(card(this, me_net, EmberObject.create({ id: '1_7', global_id: '1_7' })).get('homeBoardPickerUserId'), '1_7');
  });
});
