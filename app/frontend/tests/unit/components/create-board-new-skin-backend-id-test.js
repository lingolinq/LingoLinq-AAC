import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* THE MIXED-SKIN SEED IS THE PERSON'S REAL ID (section 24 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). The session user can be the record keyed 'self'
 * (a network load); a seed of 'self' is the same for everyone, so the seed is the backend id
 * (utils/backend_user_id.js). Called on a stand-in context so the test does not render the whole modal. */
module('Unit | Component | create-board-new skin seed backend id', function(hooks) {
  setupTest(hooks);

  function rebuild(context, me, id) {
    var sent = [];
    var ctx = EmberObject.create({
      appState: EmberObject.create({ sessionUser: me }),
      skin_suboptions: [],
      send: function() { sent.push(Array.prototype.slice.call(arguments)); }
    });
    context.owner.factoryFor('component:create-board-new').class.proto()._rebuild_compound_skin.call(ctx, id);
    return sent;
  }

  test('the record keyed self seeds with the real id', function(assert) {
    assert.deepEqual(rebuild(this, EmberObject.create({ id: 'self', global_id: '1_3' }), 'mix'), [['set_display_pref', 'skin', 'mix::1_3']]);
  });

  test('a real-id record seeds with its id, as before', function(assert) {
    assert.deepEqual(rebuild(this, EmberObject.create({ id: '1_7', global_id: '1_7' }), 'mix'), [['set_display_pref', 'skin', 'mix::1_7']]);
  });
});
