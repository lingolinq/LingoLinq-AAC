import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import aiFeatureGate from '../../utils/ai_feature_gate';

// AI features are off until they are turned on for the account (product direction,
// 2026-09-30). Mirrors spec/lib/feature_flags_ai_default_off_spec.rb.
function userWithPrefs(prefs) {
  return {
    get: function(key) {
      if(key === 'preferences') { return prefs; }
      return null;
    },
    preferences: prefs
  };
}

describe('ai_feature_gate default off', function() {
  it('is off when the account never recorded an AI choice', function() {
    expect(aiFeatureGate.prefAllowsAi(userWithPrefs({}), 'ai_board_generation')).toEqual(false);
    expect(aiFeatureGate.prefAllowsAi(userWithPrefs({}), 'ai_word_prediction')).toEqual(false);
  });

  it('is off when the master choice is stored as null', function() {
    expect(aiFeatureGate.prefAllowsAi(userWithPrefs({ ai_features_enabled: null }), 'ai_word_prediction')).toEqual(false);
  });

  it('is off when there is no account or no preferences object', function() {
    expect(aiFeatureGate.prefAllowsAi(null, 'ai_word_prediction')).toEqual(false);
    expect(aiFeatureGate.prefAllowsAi(userWithPrefs(null), 'ai_word_prediction')).toEqual(false);
  });

  it('is on for a feature the account turned on', function() {
    var prefs = { ai_features_enabled: true, ai_word_prediction: true };
    expect(aiFeatureGate.prefAllowsAi(userWithPrefs(prefs), 'ai_word_prediction')).toEqual(true);
  });
});
