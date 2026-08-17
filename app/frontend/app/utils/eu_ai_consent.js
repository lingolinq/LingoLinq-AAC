/*
 * Pure defaulting / payload rules for the EU AI parental-consent modal.
 *
 * Extracted verbatim from components/eu-ai-parental-consent.js so they can be
 * asserted against directly. The unit test used to re-declare these rules
 * INLINE and assert on its own copy, so it passed no matter what the component
 * did -- it would have passed with the component deleted. Testing the real
 * rules previously meant `setupTest`, whose harness cost (~1.5s of IndexedDB
 * setup vs ~30ms for its neighbours) left the module closest to the 15s
 * QUnit ceiling and made it the suite's most frequent CI flake.
 *
 * Nothing here imports Ember, modal, or persistence ON PURPOSE: importing this
 * module must stay free, so the test needs no container and no database.
 */

export const FEATURE_KEYS = [
  'ai_board_generation',
  'ai_word_prediction',
  'ai_board_suggestions',
  'ai_symbol_search'
];

/*
 * Which features a freshly-opened consent modal proposes.
 *
 * The master pref opts into everything; a single named feature opts into just
 * that one; anything unrecognized falls back to everything. Branch shape is
 * kept exactly as it was in didInsertElement rather than condensed, so the
 * equivalence is checkable by eye.
 */
export function defaultRequestedFeatures(triggered) {
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

/*
 * Consent is only submitted when at least one feature is selected, so
 * `ai_features_enabled` rides along as true -- the server reads it as the
 * master opt-in. The per-feature flags are coerced so an absent key sends
 * false rather than undefined.
 */
export function consentPayload(features) {
  var f = features || {};
  var payload = { ai_features_enabled: true };
  FEATURE_KEYS.forEach(function(k) {
    payload[k] = !!f[k];
  });
  return payload;
}

export function anyFeatureSelected(features) {
  var f = features || {};
  return FEATURE_KEYS.some(function(k) { return !!f[k]; });
}
