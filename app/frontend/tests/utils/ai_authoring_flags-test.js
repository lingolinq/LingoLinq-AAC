import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import aiFeatureGate from '../../utils/ai_feature_gate';

// Authoring features follow the signed-in person for the feature flag too, as
// the server does (FeatureFlags.ai_feature_enabled_for? -> feature_enabled_for?
// on @api_user, from the same frontend_flags_for that serializes
// user.feature_flags). appState.feature_flags is the current user's, plus the
// build's enabled list, so it can differ from the signed-in person's.
function person(flags, prefs) {
  return {
    get: function(key) {
      if(key === 'feature_flags') { return flags; }
      if(key === 'preferences') { return prefs; }
      if(key === 'permissions') { return { view: true, edit: true }; }
      return null;
    },
    feature_flags: flags,
    preferences: prefs
  };
}

function state(sessionUser, appFlags, currentUser) {
  return {
    get: function(key) {
      if(key.indexOf('feature_flags.') === 0) { return (appFlags || {})[key.slice('feature_flags.'.length)]; }
      if(key === 'sessionUser') { return sessionUser; }
      if(key === 'currentUser') { return currentUser || sessionUser; }
      return null;
    }
  };
}

var on = { ai_features_enabled: true, ai_board_generation: true };

describe('ai_feature_gate authoring flags follow the signed-in person', function() {
  describe('authoringFlagEnabled', function() {
    it('is on when the signed-in person has the flag, though app state does not', function() {
      expect(aiFeatureGate.authoringFlagEnabled(state(person({ ai_board_generation: true }, {}), {}), 'ai_board_generation')).toEqual(true);
    });

    it('is off when app state has the flag but the signed-in person does not', function() {
      expect(aiFeatureGate.authoringFlagEnabled(state(person({}, {}), { ai_board_generation: true }), 'ai_board_generation')).toEqual(false);
    });

    it('is off when the signed-in person has no flags', function() {
      expect(aiFeatureGate.authoringFlagEnabled(state(person(null, {}), { ai_board_generation: true }), 'ai_board_generation')).toEqual(false);
      expect(aiFeatureGate.authoringFlagEnabled(state(person(undefined, {}), { ai_board_generation: true }), 'ai_board_generation')).toEqual(false);
    });

    it('is off when no one is signed in', function() {
      expect(aiFeatureGate.authoringFlagEnabled(state(null, { ai_board_generation: true }), 'ai_board_generation')).toEqual(false);
    });

    it('is off for a flag value that is not exactly true', function() {
      expect(aiFeatureGate.authoringFlagEnabled(state(person({ ai_board_generation: 'true' }, {}), {}), 'ai_board_generation')).toEqual(false);
    });
  });

  describe('boardGenerationEntry and boardGenerationOffered', function() {
    it('follow the signed-in person\'s flag on, though the current user\'s flag is off', function() {
      var s = state(person({ ai_board_generation: true }, on), { ai_board_generation: false }, person({}, {}));
      expect(aiFeatureGate.boardGenerationEntry(s)).toEqual('allowed');
      expect(aiFeatureGate.boardGenerationOffered(s)).toEqual(true);
    });

    it('follow the signed-in person\'s flag off, though the current user\'s flag is on', function() {
      var s = state(person({}, on), { ai_board_generation: true }, person({ ai_board_generation: true }, on));
      expect(aiFeatureGate.boardGenerationEntry(s)).toEqual('blocked_flag');
      expect(aiFeatureGate.boardGenerationOffered(s)).toEqual(false);
    });
  });

  describe('authoringFeatureEnabled', function() {
    it('is on with the signed-in person\'s flag and setting, whatever app state says', function() {
      var s = state(person({ comprehensive_eval_ai: true }, { ai_features_enabled: true }), {});
      expect(aiFeatureGate.authoringFeatureEnabled(s, 'comprehensive_eval_ai')).toEqual(true);
    });

    it('is off without the signed-in person\'s flag, though app state has it', function() {
      var s = state(person({}, { ai_features_enabled: true }), { comprehensive_eval_ai: true });
      expect(aiFeatureGate.authoringFeatureEnabled(s, 'comprehensive_eval_ai')).toEqual(false);
    });
  });
});
