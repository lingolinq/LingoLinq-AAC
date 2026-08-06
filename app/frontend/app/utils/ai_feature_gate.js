/**
 * Frontend mirror of FeatureFlags.user_pref_allows_ai? + flag AND pref.
 * Server remains the enforcement source of truth (ai_feature_enabled_for?).
 * Feature flags control rollout; preferences control user opt-in.
 *
 * Pref semantics (match lib/feature_flags.rb#user_pref_allows_ai?):
 * - Master (ai_features_enabled) ABSENT (null/undefined) => grandfather allow
 * - Master an explicit opt-out (false/'false'/0/'0') => block all AI
 * - Master PRESENT but unrecognized ('', 'maybe', an object) => block all AI
 * - Master an explicit opt-in => USER_PREF_AI_FEATURES require
 *   prefs[feature] == true; other AI features follow the master
 *
 * Unrecognized fails CLOSED, matching the server. Notably '' denies here, so
 * this file no longer needs a blank test at all — which also removes a real
 * divergence risk, since Ruby's String#strip and JS's String#trim disagree on
 * Unicode whitespace in BOTH directions (U+00A0 is blank to trim but not to
 * strip; NUL is blank to strip but not to trim). Any such split shows up in
 * production as the UI offering a control the server then refuses with 403.
 *
 * A blank per-feature CHILD key while the master is explicitly true stays
 * BLOCKED: that is an INCOMPLETE opt-in, and allowing it would manufacture
 * consent the user never gave.
 */

var USER_PREF_AI_FEATURES = {
  ai_board_generation: true,
  ai_word_prediction: true,
  ai_board_suggestions: true,
  ai_symbol_search: true
};

// The ONE boolean vocabulary for AI preference values, mirroring
// FeatureFlags::AI_PREF_TRUE_VALUES / AI_PREF_FALSE_VALUES. Keep in sync.
// These previously recognized only true/'true' and false/'false', which meant a
// stored 0 or '0' was read as neither an opt-out nor blank and fell through to
// "allowed" — an old numeric opt-out becoming AI egress.
var AI_PREF_TRUE_VALUES = [true, 'true', '1', 1];
var AI_PREF_FALSE_VALUES = [false, 'false', '0', 0];

// Returns true, false, or null when the value records no recognizable decision.
// indexOf compares with ===, so 1 never matches true and 0 never matches false;
// a numeric value can only match the list it is written in.
function aiPrefValue(val) {
  if(AI_PREF_TRUE_VALUES.indexOf(val) !== -1) { return true; }
  if(AI_PREF_FALSE_VALUES.indexOf(val) !== -1) { return false; }
  return null;
}

/**
 * @param {Object|null} user - Ember user model or plain object with preferences
 * @param {string} feature - AI feature key (e.g. 'ai_board_generation')
 * @returns {boolean}
 */
function prefAllowsAi(user, feature) {
  if(!user) { return true; }
  var prefs = null;
  if(typeof user.get === 'function') {
    prefs = user.get('preferences');
  } else {
    prefs = user.preferences;
  }
  if(!prefs || typeof prefs !== 'object') { return true; }

  var master = prefs.ai_features_enabled;
  // Absent master only. Note `prefs.ai_features_enabled` is undefined for a key
  // that was never written, and null for one explicitly stored as null; both are
  // the legacy grandfather case.
  if(master === undefined || master === null) { return true; }
  // Deny on an explicit opt-out AND on anything unrecognized, for every feature.
  if(aiPrefValue(master) !== true) { return false; }
  if(!USER_PREF_AI_FEATURES[feature]) { return true; }
  // The child must be an explicit opt-IN; null (absent, blank, or unrecognized)
  // is an INCOMPLETE opt-in and stays blocked.
  return aiPrefValue(prefs[feature]) === true;
}

/**
 * @param {Object} appState - app-state service (or stub with .get)
 * @param {string} feature - AI feature flag / pref key
 * @returns {boolean}
 */
function aiFeatureEnabled(appState, feature) {
  if(!appState || typeof appState.get !== 'function') { return false; }
  if(!appState.get('feature_flags.' + feature)) { return false; }
  var user = appState.get('currentUser');
  return prefAllowsAi(user, feature);
}

export default {
  USER_PREF_AI_FEATURES: USER_PREF_AI_FEATURES,
  aiPrefValue: aiPrefValue,
  prefAllowsAi: prefAllowsAi,
  aiFeatureEnabled: aiFeatureEnabled
};

export { USER_PREF_AI_FEATURES, aiPrefValue, prefAllowsAi, aiFeatureEnabled };
