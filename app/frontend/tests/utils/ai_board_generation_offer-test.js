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
      if(key === 'currentUser') { return user; }
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
  });
});
