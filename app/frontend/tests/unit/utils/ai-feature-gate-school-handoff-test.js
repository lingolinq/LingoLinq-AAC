import { module, test } from 'qunit';
import aiFeatureGate from 'frontend/utils/ai_feature_gate';

/* #1063: a school handed this child back and no parent has consented yet. The server keeps AI
 * off for the account (User#school_handoff_blocks_ai?, read by FeatureFlags.coppa_blocks_ai_for?)
 * and stores any AI "on" save as off (User#process_params), and says so in the user JSON
 * (`school_handoff_ai_blocked`, lib/json_api/user.rb). The board-generation entry must show the
 * consent reason instead of a turn-on step whose save the server would turn back off.
 */
module('Unit | Utility | ai_feature_gate school hand-back', function() {
  function entryState(opts) {
    var user = {
      get: function(key) {
        if(key === 'preferences') { return opts.prefs; }
        if(key === 'feature_flags') { return { ai_board_generation: true }; }
        if(key === 'eu_under_16') { return !!opts.eu_under_16; }
        if(key === 'eu_ai_parental_consent_active') { return false; }
        if(key === 'coppa_parental_consent_pending') { return false; }
        if(key === 'school_handoff_ai_blocked') { return !!opts.handoff; }
        return null;
      }
    };
    return {
      get: function(key) {
        if(key === 'feature_flags.ai_board_generation') { return true; }
        if(key === 'currentUser' || key === 'sessionUser') { return user; }
        return null;
      }
    };
  }

  test('a handed-back account counts as blocked for AI', function(assert) {
    assert.true(aiFeatureGate.coppaAiBlocked({ school_handoff_ai_blocked: true }));
    assert.false(aiFeatureGate.coppaAiBlocked({}), 'an account with neither flag is not blocked');
  });

  test('board generation gives the consent reason, not the turn-on step', function(assert) {
    assert.strictEqual(aiFeatureGate.boardGenerationEntry(entryState({ handoff: true, prefs: {} })), 'blocked_coppa');
    assert.strictEqual(aiFeatureGate.boardGenerationEntry(entryState({ handoff: false, prefs: {} })), 'needs_opt_in',
      'without the hand-back block the same account gets the turn-on step');
  });

  test('stored "on" preferences do not get past the block', function(assert) {
    var on = { ai_features_enabled: true, ai_board_generation: true };
    assert.strictEqual(aiFeatureGate.boardGenerationEntry(entryState({ handoff: true, prefs: on })), 'blocked_coppa');
  });

  test('an EU under-16 still gets the EU consent request first, as on the server', function(assert) {
    // User#process_params applies the EU rule first and the hand-back rule only when it does not.
    assert.strictEqual(aiFeatureGate.boardGenerationEntry(entryState({ handoff: true, eu_under_16: true, prefs: {} })), 'eu_consent');
  });
});
