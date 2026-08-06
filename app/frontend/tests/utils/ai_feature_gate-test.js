import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import aiFeatureGate from '../../utils/ai_feature_gate';
import gateCases from '../fixtures/ai_pref_gate_cases';

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

    // Legacy rows stored "" for the master pref. It records no readable
    // decision, so it fails CLOSED like any other unrecognized value rather than
    // being read as "never decided" and grandfathered.
    it('denies an unreadable master rather than grandfathering it', function() {
      ['', '   ', 'maybe', {}].forEach(function(bad) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: bad
        }), 'ai_board_generation')).toEqual(false);
      });
    });

    it('denies an unreadable master for features outside USER_PREF_AI_FEATURES', function() {
      ['', 'maybe'].forEach(function(bad) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: bad
        }), 'comprehensive_eval_ai')).toEqual(false);
      });
    });

    it('denies an unreadable master even when the child is an explicit opt-in', function() {
      expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
        ai_features_enabled: '',
        ai_board_generation: true
      }), 'ai_board_generation')).toEqual(false);
    });

    // Guards against a future refactor to a generic falsiness test, which would
    // reclassify an explicit opt-OUT as "never decided" and re-enable AI.
    it('keeps an explicit false blocking', function() {
      [false, 'false'].forEach(function(off) {
        expect(aiFeatureGate.prefAllowsAi(userWithPrefs({
          ai_features_enabled: off
        }), 'ai_board_generation')).toEqual(false);
      });
    });

    // Master true with a blank or missing child is an INCOMPLETE opt-in and must
    // stay blocked, or the UI would manufacture per-feature consent.
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

    // The shared behavior table, executed here against the client gate and in
    // spec/lib/feature_flags_ai_prefs_spec.rb against the server gate. Changing
    // one side's behavior without the other fails that side's own suite. A Ruby
    // spec asserts this fixture still matches the canonical
    // spec/fixtures/ai_pref_gate_cases.json byte-for-byte.
    describe('shared behavior table', function() {
      gateCases.cases.forEach(function(c) {
        it(c.name + ' (' + c.feature + ')', function() {
          expect(aiFeatureGate.prefAllowsAi(userWithPrefs(c.prefs), c.feature)).toBe(c.expected);
        });
      });
    });
  });

  // toBe (strict) throughout, not toEqual: this helper's whole job is to keep
  // false and null distinct, and toEqual would compare them loosely.
  describe('aiPrefValue', function() {
    it('maps the recognized true forms', function() {
      [true, 'true', '1', 1].forEach(function(v) {
        expect(aiFeatureGate.aiPrefValue(v)).toBe(true);
      });
    });

    it('maps the recognized false forms', function() {
      [false, 'false', '0', 0].forEach(function(v) {
        expect(aiFeatureGate.aiPrefValue(v)).toBe(false);
      });
    });

    it('returns null when no decision is recorded', function() {
      [null, undefined, '', '  ', 'maybe', 2].forEach(function(v) {
        expect(aiFeatureGate.aiPrefValue(v)).toBe(null);
      });
    });

    it('does not confuse the numeric and boolean forms', function() {
      expect(aiFeatureGate.aiPrefValue(1)).toBe(true);
      expect(aiFeatureGate.aiPrefValue(0)).toBe(false);
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
