import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import aiFeatureGate from '../../utils/ai_feature_gate';

// With AI features off by default (2026-09-30), board generation is OFFERED
// whenever the feature is available, and the entry step decides what happens:
// a one-step opt-in for someone who can change the account's settings, or a
// plain reason for someone who cannot.
function entryState(opts) {
  var user = {
    get: function(key) {
      if(key === 'preferences') { return opts.prefs; }
      if(key === 'permissions') { return opts.permissions; }
      if(key === 'eu_under_16') { return !!opts.eu_under_16; }
      if(key === 'coppa_parental_consent_pending') { return !!opts.coppa_pending; }
      return null;
    },
    preferences: opts.prefs,
    permissions: opts.permissions
  };
  return {
    get: function(key) {
      if(key === 'feature_flags.ai_board_generation') { return opts.flagOn !== false; }
      if(key === 'currentUser' || key === 'sessionUser') { return user; }
      return null;
    }
  };
}

describe('ai_feature_gate board generation offer', function() {
  describe('boardGenerationEntry', function() {
    it('asks to turn AI on when the signed-in person can edit the account', function() {
      expect(aiFeatureGate.boardGenerationEntry(entryState({
        prefs: {}, permissions: { view: true, edit: true }
      }))).toEqual('needs_opt_in');
    });

    it('gives a reason instead when the signed-in person cannot edit the account', function() {
      expect(aiFeatureGate.boardGenerationEntry(entryState({
        prefs: {}, permissions: { view: true }
      }))).toEqual('no_permission');
    });

    it('is allowed once the account turned board generation on, whatever the viewer can edit', function() {
      expect(aiFeatureGate.boardGenerationEntry(entryState({
        prefs: { ai_features_enabled: true, ai_board_generation: true }, permissions: { view: true }
      }))).toEqual('allowed');
    });
  });

  // Board generation is an authoring feature: it follows the signed-in person,
  // as the server does (@api_user), not the communicator a supporter is
  // speaking for (app-state set_current_user points currentUser there).
  describe('boardGenerationEntry follows the signed-in person', function() {
    function prefsUser(prefs) {
      return {
        get: function(key) {
          if(key === 'preferences') { return prefs; }
          if(key === 'permissions') { return { view: true, edit: true }; }
          return null;
        },
        preferences: prefs
      };
    }
    function twoUserState(sessionPrefs, communicatorPrefs) {
      var sessionUser = prefsUser(sessionPrefs);
      var communicator = prefsUser(communicatorPrefs);
      return {
        get: function(key) {
          if(key === 'feature_flags.ai_board_generation') { return true; }
          if(key === 'sessionUser') { return sessionUser; }
          if(key === 'currentUser') { return communicator; }
          return null;
        }
      };
    }
    var on = { ai_features_enabled: true, ai_board_generation: true };

    it('is allowed when the signed-in person turned it on, though the communicator did not', function() {
      expect(aiFeatureGate.boardGenerationEntry(twoUserState(on, {}))).toEqual('allowed');
    });

    it('asks to turn it on when the communicator turned it on but the signed-in person did not', function() {
      expect(aiFeatureGate.boardGenerationEntry(twoUserState({}, on))).toEqual('needs_opt_in');
    });
  });

  describe('boardGenerationOffered', function() {
    it('is offered for an account that never recorded an AI choice', function() {
      expect(aiFeatureGate.boardGenerationOffered(entryState({ prefs: {} }))).toEqual(true);
    });

    it('is offered when the viewer cannot change the setting, so a reason can be shown', function() {
      expect(aiFeatureGate.boardGenerationOffered(entryState({ prefs: {}, permissions: { view: true } }))).toEqual(true);
    });

    it('is offered while COPPA consent is pending, so a reason can be shown', function() {
      expect(aiFeatureGate.boardGenerationOffered(entryState({ prefs: {}, coppa_pending: true }))).toEqual(true);
    });

    it('is not offered when the feature is not available for the account', function() {
      expect(aiFeatureGate.boardGenerationOffered(entryState({ prefs: {}, flagOn: false }))).toEqual(false);
    });

    it('is not offered to an EU under-16 account without consent when the feature is not available', function() {
      expect(aiFeatureGate.boardGenerationOffered(entryState({ prefs: {}, eu_under_16: true, flagOn: false }))).toEqual(false);
    });

    it('is offered to an EU under-16 account without consent when the feature is available, so consent can be asked', function() {
      expect(aiFeatureGate.boardGenerationOffered(entryState({ prefs: {}, eu_under_16: true }))).toEqual(true);
    });
  });
});
