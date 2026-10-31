import { module, test } from 'qunit';
import ai_word_predictor from 'frontend/utils/ai_word_predictor';
import aiFeatureGate from 'frontend/utils/ai_feature_gate';

/* #1063: prediction sends the current user's words. When a supervisor speaks as a child, the
 * child's own AI block applies too: the client gate checks it, and the request names the child
 * (user_id) so the server can check it (ApplicationController#ai_blocked_for_communicator?).
 */
module('Unit | Utility | ai_word_predictor communicator block', function() {
  var on = { ai_features_enabled: true, ai_word_prediction: true };
  var flags = { ai_word_prediction: true };

  function person(id, extra) {
    var attrs = Object.assign({ id: id, feature_flags: flags, preferences: on }, extra || {});
    return { get: function(key) { return attrs[key]; } };
  }

  function state(signedIn, current) {
    return {
      get: function(key) {
        if(key === 'feature_flags.ai_word_prediction') { return true; }
        if(key === 'sessionUser') { return signedIn; }
        if(key === 'currentUser') { return current; }
        // Article 50 acknowledgement is not needed for these people.
        return null;
      }
    };
  }

  test('a handed-back child spoken for stops prediction even with stored prefs on', function(assert) {
    var supervisor = person('1_1');
    assert.true(ai_word_predictor.is_enabled(state(supervisor, person('1_2'))), 'unblocked child: on');
    assert.false(ai_word_predictor.is_enabled(state(supervisor, person('1_2', { school_handoff_ai_blocked: true }))));
  });

  test('pending COPPA consent or a missing EU consent on the child also stops it', function(assert) {
    var supervisor = person('1_1');
    assert.false(ai_word_predictor.is_enabled(state(supervisor, person('1_2', { coppa_parental_consent_pending: true }))));
    assert.false(ai_word_predictor.is_enabled(state(supervisor, person('1_2', { eu_under_16: true }))));
    assert.true(ai_word_predictor.is_enabled(state(supervisor, person('1_2', { eu_under_16: true, eu_ai_parental_consent_active: true }))),
      'EU consent given: on');
  });

  test('the request names the communicator only when speaking as someone else', function(assert) {
    var supervisor = person('1_1');
    assert.strictEqual(aiFeatureGate.predictionCommunicatorId(state(supervisor, person('1_2'))), '1_2');
    assert.strictEqual(aiFeatureGate.predictionCommunicatorId(state(supervisor, supervisor)), null, 'own words: no user_id');
    assert.strictEqual(aiFeatureGate.predictionCommunicatorId(state(supervisor, person('self'))), null, "the offline 'self' copy is not an id");

    assert.deepEqual(ai_word_predictor._request_data('i want', 'en', 4, state(supervisor, person('1_2'))),
      { sentence: 'i want', locale: 'en', count: 4, user_id: '1_2' });
    assert.deepEqual(ai_word_predictor._request_data('i want', 'en', 4, state(supervisor, supervisor)),
      { sentence: 'i want', locale: 'en', count: 4 });
  });
});
