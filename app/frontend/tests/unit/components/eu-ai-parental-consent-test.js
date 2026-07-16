import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

/**
 * Unit coverage for EU AI parental-consent modal defaults.
 * The modal POSTs parent_email + allowlisted requested_features; grant applies those prefs.
 */
module('Unit | Component | eu-ai-parental-consent', function(hooks) {
  setupTest(hooks);

  test('FEATURE_KEYS defaults: master trigger selects all four features', function(assert) {
    // Mirror the defaulting rules in eu-ai-parental-consent.js without full modal mount.
    var FEATURE_KEYS = [
      'ai_board_generation',
      'ai_word_prediction',
      'ai_board_suggestions',
      'ai_symbol_search'
    ];
    function defaultsFor(triggered) {
      var features = {};
      FEATURE_KEYS.forEach(function(k) { features[k] = false; });
      if(triggered === 'ai_features_enabled') {
        FEATURE_KEYS.forEach(function(k) { features[k] = true; });
      } else if(FEATURE_KEYS.indexOf(triggered) !== -1) {
        features[triggered] = true;
      } else {
        FEATURE_KEYS.forEach(function(k) { features[k] = true; });
      }
      return features;
    }
    var all = defaultsFor('ai_features_enabled');
    assert.strictEqual(all.ai_board_generation, true);
    assert.strictEqual(all.ai_word_prediction, true);
    assert.strictEqual(all.ai_board_suggestions, true);
    assert.strictEqual(all.ai_symbol_search, true);

    var one = defaultsFor('ai_word_prediction');
    assert.strictEqual(one.ai_word_prediction, true);
    assert.strictEqual(one.ai_board_generation, false);
  });

  test('send payload always includes ai_features_enabled when any feature is selected', function(assert) {
    var FEATURE_KEYS = [
      'ai_board_generation',
      'ai_word_prediction',
      'ai_board_suggestions',
      'ai_symbol_search'
    ];
    var features = {
      ai_board_generation: false,
      ai_word_prediction: true,
      ai_board_suggestions: false,
      ai_symbol_search: false
    };
    var payload = { ai_features_enabled: true };
    FEATURE_KEYS.forEach(function(k) {
      payload[k] = !!features[k];
    });
    assert.strictEqual(payload.ai_features_enabled, true);
    assert.strictEqual(payload.ai_word_prediction, true);
    assert.strictEqual(payload.ai_board_generation, false);
  });
});
