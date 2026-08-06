/**
 * Frontend mirror of FeatureFlags.user_pref_allows_ai? + flag AND pref.
 * Server remains the enforcement source of truth (ai_feature_enabled_for?).
 * Feature flags control rollout; preferences control user opt-in.
 *
 * Pref semantics (match lib/feature_flags.rb#user_pref_allows_ai?):
 * - Master (ai_features_enabled) nil or blank => grandfather allow
 * - Master false => block all AI
 * - Master true => USER_PREF_AI_FEATURES require prefs[feature] == true;
 *   other AI features follow the master (allowed)
 *
 * The blank-master case is a LEGACY-DATA policy scoped to the MASTER key only.
 * A blank per-feature child key while the master is explicitly true stays
 * BLOCKED: that is an INCOMPLETE opt-in, and allowing it would manufacture
 * consent the user never gave. Keep this file and
 * FeatureFlags.blank_ai_master_pref? in lockstep; a divergence shows up as the
 * UI offering a control the server then refuses with 403.
 */

var USER_PREF_AI_FEATURES = {
  ai_board_generation: true,
  ai_word_prediction: true,
  ai_board_suggestions: true,
  ai_symbol_search: true
};

function truthy(val) {
  return val === true || val === 'true';
}

function falsy(val) {
  return val === false || val === 'false';
}

// Mirror of FeatureFlags.blank_ai_master_pref?. Only null/undefined and a
// whitespace-only string count as "no decision recorded". Deliberately does NOT
// use a generic falsiness test: `false` and `0` are real opt-out values and must
// keep flowing to the falsy() branch rather than being read as "never set".
function blankMasterPref(master) {
  if(master === undefined || master === null) { return true; }
  return typeof master === 'string' && master.trim() === '';
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
  if(blankMasterPref(master)) { return true; }
  if(falsy(master)) { return false; }
  if(!USER_PREF_AI_FEATURES[feature]) { return true; }
  return truthy(prefs[feature]);
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
  blankMasterPref: blankMasterPref,
  prefAllowsAi: prefAllowsAi,
  aiFeatureEnabled: aiFeatureEnabled
};

export { USER_PREF_AI_FEATURES, blankMasterPref, prefAllowsAi, aiFeatureEnabled };
