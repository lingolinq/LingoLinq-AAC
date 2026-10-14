import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* "Run Evaluation" on a Basic Communicators card (classic-view.hbs, the card's Extras panel)
 * passes the SUPERVISEE ENTRY: a plain object from `known_supervisees` (models/user.js, from the
 * raw `supervisees` attribute), not a user record. `run_eval` (authenticated-view.js) handed it
 * straight to `appState.check_for_currently_premium`, which reads `user.get('currently_premium')`
 * -- a TypeError on a plain object, so the eval never started. Those fields are computeds on the
 * user record, so the record has to be loaded first (as controllers/caseload.js#run_eval does).
 *
 * The app-state stub reads `user.get` exactly as the real check does, so a plain object reaching
 * it fails here the way it fails in the app.
 */
module('Unit | Component | classic-view run evaluation', function(hooks) {
  setupTest(hooks);

  function setup(context) {
    var calls = { findRecord: [], premium: [], speak: [] };
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ preferences: {} }),
      check_for_currently_premium: function(user, action) {
        calls.premium.push({ user: user, action: action, premium: user.get('currently_premium') });
        return Promise.resolve({ dialog: false });
      },
      set_speak_mode_user: function(id, jump, keep, board) {
        calls.speak.push({ id: id, board: board });
      }
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      findRecord: function(type, id) {
        calls.findRecord.push({ type: type, id: id });
        return Promise.resolve(EmberObject.create({ id: id, user_name: 'aiden_parker', currently_premium: true }));
      }
    }));
    var model = EmberObject.create({ id: '1_1', supporter_role: true, load_word_activities: function() {} });
    var component = context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
    return { component: component, calls: calls };
  }

  function settle() { return new Promise(function(resolve) { setTimeout(resolve, 10); }); }

  test('a plain supervisee entry is loaded as a user record before the premium check, and the eval starts', async function(assert) {
    var t = setup(this);
    var supervisee = { id: '1_7', user_name: 'aiden_parker', premium: true };

    t.component.send('run_eval', supervisee);
    await settle();

    assert.deepEqual(t.calls.findRecord, [{ type: 'user', id: '1_7' }], 'the supervisee is loaded by id');
    assert.strictEqual(t.calls.premium.length, 1, 'the premium check ran once');
    assert.strictEqual(t.calls.premium[0].action, 'eval', 'for the eval action');
    assert.true(t.calls.premium[0].premium, 'on the loaded record, whose premium field it could read');
    assert.deepEqual(t.calls.speak, [{ id: '1_7', board: 'obf/eval' }], 'speak mode starts on the eval board for that communicator');
  });

  test('a user record is used as it is, with no extra load', async function(assert) {
    var t = setup(this);
    var record = EmberObject.create({ id: '1_9', user_name: 'bella_martinez', currently_premium: true });

    t.component.send('run_eval', record);
    await settle();

    assert.deepEqual(t.calls.findRecord, [], 'no load for a record');
    assert.strictEqual(t.calls.premium[0].user, record, 'the record itself is checked');
    assert.deepEqual(t.calls.speak, [{ id: '1_9', board: 'obf/eval' }], 'and the eval starts for it');
  });
});
