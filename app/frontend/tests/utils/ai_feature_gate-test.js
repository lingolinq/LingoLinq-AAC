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

    // Legacy rows stored "" for the master pref, which is neither an opt-in nor
    // an opt-out. It must follow the same path as an absent master.
    it('treats a blank master exactly like an absent master', function() {
      ['', '   '].forEach(function(blank) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: blank
        }), 'ai_board_generation')).toEqual(true);
      });
    });

    it('allows a blank master even when the child pref is also blank', function() {
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: '',
        ai_board_generation: ''
      }), 'ai_board_generation')).toEqual(true);
    });

    // Guards against a future refactor to a generic falsiness test, which would
    // reclassify an explicit opt-OUT as "never decided" and re-enable AI.
    it('keeps an explicit false blocking, and does not confuse it with blank', function() {
      [false, 'false'].forEach(function(off) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: off
        }), 'ai_board_generation')).toEqual(false);
      });
    });

    // The blank allowance is scoped to the MASTER key. Master true with a blank
    // or missing child is an INCOMPLETE opt-in and must stay blocked, or the UI
    // would manufacture per-feature consent the user never gave.
    it('still blocks when master is true but the child pref is blank or missing', function() {
      ['', '   '].forEach(function(child) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: true,
          ai_board_generation: child
        }), 'ai_board_generation')).toEqual(false);
      });
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: true
      }), 'ai_board_generation')).toEqual(false);
    });
  });

    // A stored 0 / '0' is an explicit opt-OUT the write path accepts. It is not
    // blank and does not === false, so it previously fell through to "allowed",
    // and for features outside USER_PREF_AI_FEATURES it was allowed outright.
    it('blocks on a numeric master opt-out for per-feature AI', function() {
      [0, '0'].forEach(function(off) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: off,
          ai_board_generation: true
        }), 'ai_board_generation')).toEqual(false);
      });
    });

    it('blocks on a numeric master opt-out for non-per-feature AI', function() {
      [0, '0'].forEach(function(off) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: off
        }), 'comprehensive_eval_ai')).toEqual(false);
      });
    });

    it('accepts the numeric opt-in forms for master and child', function() {
      [1, '1'].forEach(function(on) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: on,
          ai_board_generation: on
        }), 'ai_board_generation')).toEqual(true);
      });
    });

    it('blocks a numeric child opt-out under an enabled master', function() {
      [0, '0'].forEach(function(off) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: true,
          ai_board_generation: off
        }), 'ai_board_generation')).toEqual(false);
      });
    });

    it('leaves an unrecognized master on the strict per-feature path', function() {
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: 'maybe'
      }), 'ai_board_generation')).toEqual(false);
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: 'maybe',
        ai_board_generation: true
      }), 'ai_board_generation')).toEqual(true);
    });
  });

  describe('aiPrefValue', function() {
    it('maps the recognized true forms', function() {
      [true, 'true', '1', 1].forEach(function(v) {
        expect(aiFeatureGate.aiPrefValue(v)).toEqual(true);
      });
    });

    it('maps the recognized false forms', function() {
      [false, 'false', '0', 0].forEach(function(v) {
        expect(aiFeatureGate.aiPrefValue(v)).toEqual(false);
      });
    });

    it('returns null when no decision is recorded', function() {
      [null, undefined, '', '  ', 'maybe', 2].forEach(function(v) {
        expect(aiFeatureGate.aiPrefValue(v)).toEqual(null);
      });
    });

    it('does not confuse the numeric and boolean forms', function() {
      expect(aiFeatureGate.aiPrefValue(1)).toEqual(true);
      expect(aiFeatureGate.aiPrefValue(0)).toEqual(false);
    });
  });

  describe('blankMasterPref', function() {
    it('counts only null, undefined, and whitespace-only strings as absent', function() {
      [null, undefined, '', ' ', '\t'].forEach(function(v) {
        expect(aiFeatureGate.blankMasterPref(v)).toEqual(true);
      });
    });

    it('does not treat falsey non-string values as absent', function() {
      [false, 0, '0', 'false'].forEach(function(v) {
        expect(aiFeatureGate.blankMasterPref(v)).toEqual(false);
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
