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
 * Unrecognized values fail CLOSED, matching the server. A blank per-feature
 * child while the master is explicitly true also stays blocked because it is
 * an incomplete opt-in.
 */

var USER_PREF_AI_FEATURES = {
  ai_board_generation: true,
  ai_word_prediction: true,
  ai_board_suggestions: true,
  ai_symbol_search: true
};

var AI_PREF_TRUE_VALUES = [true, 'true', '1', 1];
var AI_PREF_FALSE_VALUES = [false, 'false', '0', 0];

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
  if(master === undefined || master === null) { return true; }
  if(aiPrefValue(master) !== true) { return false; }
  if(!USER_PREF_AI_FEATURES[feature]) { return true; }
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
