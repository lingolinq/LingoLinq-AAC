import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* #1063: `school_handoff_ai_blocked` comes from the server (lib/json_api/user.rb) and is read by
 * the AI gate and the preferences page. Like the other consent flags it is response-only.
 */
module('Unit | Serializer | user school_handoff_ai_blocked', function(hooks) {
  setupTest(hooks);

  test('the user record reads the flag from the server payload', function(assert) {
    var store = this.owner.lookup('service:store');
    var payload = { user: { id: '1_1063', user_name: 'handed_back', school_handoff_ai_blocked: true } };
    store.push(store.serializerFor('user').normalizeSingleResponse(store, store.modelFor('user'), payload, '1_1063', 'findRecord'));
    assert.true(store.peekRecord('user', '1_1063').get('school_handoff_ai_blocked'));
  });

  test('the flag is never sent back to the server', function(assert) {
    var store = this.owner.lookup('service:store');
    var record = store.createRecord('user', { user_name: 'handed_back', school_handoff_ai_blocked: true });
    var json = store.serializerFor('user').serialize(record._createSnapshot(), { includeId: true });
    assert.false('school_handoff_ai_blocked' in json);
  });

  // Offline, persistence#convert_model_to_json stores the serialized user (localCopy) as the whole
  // local record, so a copy without the flag would bring the AI turn-on step back offline.
  test('the offline local copy keeps the flag', function(assert) {
    var store = this.owner.lookup('service:store');
    var record = store.createRecord('user', { user_name: 'handed_back', school_handoff_ai_blocked: true });
    var json = store.serializerFor('user').serialize(record._createSnapshot(), { includeId: true, localCopy: true });
    assert.true(json.school_handoff_ai_blocked);
  });

  // The same holds for the other response-only consent flags: an EU under-16 restored offline
  // without eu_under_16 would get the AI turn-on step instead of the EU consent step.
  test('the offline copy keeps every response-only consent flag, and requests carry none', function(assert) {
    var attrs = {
      coppa_parental_consent_pending: true,
      school_handoff_ai_blocked: true,
      eu_under_16: true,
      eu_ai_parental_consent_pending: true,
      eu_ai_parental_consent_active: true,
      eu_ai_parental_consent_parent_email: 'parent@example.com'
    };
    var keys = Object.keys(attrs);
    assert.expect(keys.length * 2);
    var store = this.owner.lookup('service:store');
    var record = store.createRecord('user', Object.assign({ user_name: 'flags_offline' }, attrs));
    var serializer = store.serializerFor('user');
    var local = serializer.serialize(record._createSnapshot(), { includeId: true, localCopy: true });
    var sent = serializer.serialize(record._createSnapshot(), { includeId: true });
    keys.forEach(function(key) {
      assert.strictEqual(local[key], attrs[key], key + ' is kept in the offline copy');
      assert.false(key in sent, key + ' is not sent');
    });
  });
});
