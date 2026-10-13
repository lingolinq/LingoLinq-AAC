import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* AN OFFLINE SAVE KEEPS A SUPPORTER'S SUPERVISEE LIST (2026-10-01; adversarial review M3).
 * Offline, persistence#convert_model_to_json stores the SERIALIZED user as the whole local record
 * (services/persistence.js updateRecord -> store). `supervisees` was dropped from serialization
 * (`serialize: false`) because its entries can carry a materialised `current_badge` whose store
 * reference is circular, so the payload could not be turned into JSON. Dropping it meant every
 * offline preference save erased the supervisee list from the local copy; `known_supervisees`
 * (models/user.js) derives from it, so the caseload and speak-as lists came back empty offline.
 * The serializer now keeps the list as plain data and leaves out live objects.
 */
module('Unit | Serializer | user supervisees offline', function(hooks) {
  setupTest(hooks);

  function serialized(context, supervisees, options) {
    var store = context.owner.lookup('service:store');
    var record = store.createRecord('user', { user_name: 'example', supervisees: supervisees });
    return store.serializerFor('user').serialize(record._createSnapshot(), options);
  }

  test('the list survives in the offline local copy as plain data', function(assert) {
    var badge = EmberObject.create({ name: 'Talker' });
    badge.set('self_ref', badge); // a live object with a cycle, like a record holding the store
    var json = serialized(this, [{ id: '1_7', user_name: 'aiden_parker', org_status: { state: 'hourglass' }, home_board: { key: 'a/b' }, current_badge: badge }], { includeId: true, localCopy: true });
    assert.strictEqual((json.supervisees || []).length, 1, 'the entry is kept in the local copy');
    var entry = (json.supervisees || [])[0] || {};
    assert.strictEqual(entry.user_name, 'aiden_parker');
    assert.deepEqual(entry.org_status, { state: 'hourglass' }, 'nested plain data kept');
    assert.deepEqual(entry.home_board, { key: 'a/b' });
    assert.false('current_badge' in entry, 'the live badge is left out');
    var threw = false;
    try { JSON.stringify(json); } catch (e) { threw = true; }
    assert.false(threw, 'the payload can be turned into JSON');
  });

  test('the network payload still leaves the list out (minimisation; the server ignores it)', function(assert) {
    var json = serialized(this, [{ id: '1_7', user_name: 'aiden_parker' }], { includeId: true });
    assert.false('supervisees' in json, 'not sent');
  });

  test('a user with no supervisees serializes as before', function(assert) {
    var json = serialized(this, undefined, { includeId: true, localCopy: true });
    var count = Array.isArray(json.supervisees) ? json.supervisees.length : 0;
    assert.strictEqual(count, 0, 'nothing invented');
  });
});
