import { module, test } from 'qunit';
import {
  defaultRequestedFeatures,
  consentPayload,
  anyFeatureSelected
} from 'frontend/utils/eu_ai_consent';

/**
 * Unit coverage for EU AI parental-consent modal defaults.
 * The modal POSTs parent_email + allowlisted requested_features; grant applies those prefs.
 *
 * These assert against the REAL rules, imported from utils/eu_ai_consent. They
 * used to re-declare the rules inline and assert on that copy, which passed
 * regardless of what the component did. No `setupTest`: nothing here needs the
 * container, and its ~1.5s of unused harness setup against the 15s QUnit
 * timeout was what made this module the suite's most frequent CI flake.
 */
module('Unit | Component | eu-ai-parental-consent', function() {
  test('FEATURE_KEYS defaults: master trigger selects all four features', function(assert) {
    var all = defaultRequestedFeatures('ai_features_enabled');
    assert.true(all.ai_board_generation);
    assert.true(all.ai_word_prediction);
    assert.true(all.ai_board_suggestions);
    assert.true(all.ai_symbol_search);

    var one = defaultRequestedFeatures('ai_word_prediction');
    assert.true(one.ai_word_prediction);
    assert.false(one.ai_board_generation);
  });

  test('an unrecognized trigger falls back to selecting every feature', function(assert) {
    var all = defaultRequestedFeatures('not_a_real_pref');
    assert.true(all.ai_board_generation);
    assert.true(all.ai_word_prediction);
    assert.true(all.ai_board_suggestions);
    assert.true(all.ai_symbol_search);
  });

  test('send payload always includes ai_features_enabled when any feature is selected', function(assert) {
    var payload = consentPayload({
      ai_board_generation: false,
      ai_word_prediction: true,
      ai_board_suggestions: false,
      ai_symbol_search: false
    });
    assert.true(payload.ai_features_enabled);
    assert.true(payload.ai_word_prediction);
    assert.false(payload.ai_board_generation);
  });

  test('payload coerces absent keys to false rather than undefined', function(assert) {
    var payload = consentPayload({ ai_word_prediction: true });
    assert.false(payload.ai_board_generation);
    assert.false(payload.ai_symbol_search);
  });

  test('anyFeatureSelected gates submission', function(assert) {
    assert.true(anyFeatureSelected({ ai_symbol_search: true }));
    assert.false(anyFeatureSelected({}));
    assert.false(anyFeatureSelected(null));
  });
});
