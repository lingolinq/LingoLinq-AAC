import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import aiFeatureGate from '../../utils/ai_feature_gate';

function userWithPrefs(prefs) {
  return {
    get: function(key) {
      if(key === 'preferences') { return prefs; }
      return null;
    },
    preferences: prefs
  };
}

function appStateStub(flagOn, prefs) {
  var user = prefs === undefined ? null : userWithPrefs(prefs);
  return {
    get: function(key) {
      if(key.indexOf('feature_flags.') === 0) {
        return flagOn;
      }
      if(key === 'currentUser') { return user; }
      return null;
    }
  };
}

describe('ai_feature_gate', function() {
  describe('prefAllowsAi', function() {
    it('allows when user is missing (flag layer still gates)', function() {
      expect(aiFeatureGate.prefAllowsAi(null, 'ai_board_generation')).toEqual(true);
    });

    it('grandfathers when master is nil', function() {
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({}), 'ai_board_generation')).toEqual(true);
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({ ai_features_enabled: null }), 'ai_word_prediction')).toEqual(true);
    });

    it('blocks all when master is false', function() {
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: false,
        ai_board_generation: true
      }), 'ai_board_generation')).toEqual(false);
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: 'false'
      }), 'ai_word_prediction')).toEqual(false);
    });

    it('requires per-feature true when master is true', function() {
      var userOn = userWithPrefs({
        ai_features_enabled: true,
        ai_board_generation: true,
        ai_word_prediction: false
      });
      expect(aiFeatureGate.prefAllowsAi(userOn, 'ai_board_generation')).toEqual(true);
      expect(aiFeatureGate.prefAllowsAi(userOn, 'ai_word_prediction')).toEqual(false);
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: true
      }), 'ai_board_generation')).toEqual(false);
    });

    it('allows non-USER_PREF AI features when master is true', function() {
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: true
      }), 'comprehensive_eval_ai')).toEqual(true);
    });

    it('fails closed on an unrecognized master value', function() {
      ['', '   ', 'maybe', {}].forEach(function(value) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: value
        }), 'ai_board_generation')).toEqual(false);
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: value
        }), 'comprehensive_eval_ai')).toEqual(false);
      });
    });

    it('recognizes numeric boolean forms consistently', function() {
      [0, '0'].forEach(function(off) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: off
        }), 'ai_board_generation')).toEqual(false);
      });
      [1, '1'].forEach(function(on) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: on,
          ai_board_generation: on
        }), 'ai_board_generation')).toEqual(true);
      });
    });
  });

  describe('aiPrefValue', function() {
    it('maps recognized values and rejects everything else', function() {
      [true, 'true', 1, '1'].forEach(function(value) {
        expect(aiFeatureGate.aiPrefValue(value)).toEqual(true);
      });
      [false, 'false', 0, '0'].forEach(function(value) {
        expect(aiFeatureGate.aiPrefValue(value)).toEqual(false);
      });
      ['', 'maybe', null, undefined, {}].forEach(function(value) {
        expect(aiFeatureGate.aiPrefValue(value)).toEqual(null);
      });
    });
  });

  describe('aiFeatureEnabled', function() {
    it('is false when the feature flag is off', function() {
      expect(aiFeatureGate.aiFeatureEnabled(
        appStateStub(false, { ai_features_enabled: true, ai_board_generation: true }),
        'ai_board_generation'
      )).toEqual(false);
    });

    it('is true when flag is on and prefs are grandfathered', function() {
      expect(aiFeatureGate.aiFeatureEnabled(
        appStateStub(true, {}),
        'ai_board_generation'
      )).toEqual(true);
    });

    it('is false when flag is on but master pref is false', function() {
      expect(aiFeatureGate.aiFeatureEnabled(
        appStateStub(true, { ai_features_enabled: false }),
        'ai_word_prediction'
      )).toEqual(false);
    });

    it('is false when flag is on, master true, but per-feature false', function() {
      expect(aiFeatureGate.aiFeatureEnabled(
        appStateStub(true, { ai_features_enabled: true, ai_board_generation: false }),
        'ai_board_generation'
      )).toEqual(false);
    });

    it('is true when flag is on, master true, and per-feature true', function() {
      expect(aiFeatureGate.aiFeatureEnabled(
        appStateStub(true, { ai_features_enabled: true, ai_word_prediction: true }),
        'ai_word_prediction'
      )).toEqual(true);
    });
  });
});
