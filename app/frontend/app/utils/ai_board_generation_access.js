import RSVP from 'rsvp';
import modalUtil from './modal';
import aiFeatureGate from './ai_feature_gate';

/**
 * The step a person goes through before AI board generation, shared by every
 * "Generate with AI" entry (create-board-new, new-board). Uses the module modal
 * util, not a component-bound service, so a caller whose own modal is replaced
 * by the one opened here can still continue.
 *
 * - allowed: proceed.
 * - eu_consent: the EU parental-consent modal.
 * - needs_opt_in: one "turn on AI features for this account?" step.
 * - no_permission / blocked_coppa / blocked_flag: a short reason, no dead end.
 *
 * Resolves { proceed: true } when generation may continue.
 */
export function ensureAiBoardGenerationAccess(appState) {
  var user = appState && appState.get && appState.get('currentUser');
  var entry = aiFeatureGate.boardGenerationEntry(appState);
  var stay = function() { return { proceed: false }; };

  if(entry === 'allowed') {
    return RSVP.resolve({ proceed: true });
  }

  if(entry === 'eu_consent') {
    var parentEmail = '';
    if(user && user.get) {
      parentEmail = user.get('eu_ai_parental_consent_parent_email') || '';
    }
    return modalUtil.open('eu-ai-parental-consent', {
      user: user,
      triggeredPref: 'ai_board_generation',
      parentEmail: parentEmail
    }).then(stay, stay);
  }

  if(entry === 'blocked_flag' || entry === 'blocked_coppa' || entry === 'no_permission') {
    var reason = { blocked_coppa: 'coppa', no_permission: 'permission' }[entry] || 'flag';
    return modalUtil.open('enable-ai-features', {
      blocked: true,
      blockedReason: reason,
      triggeredPref: 'ai_board_generation'
    }).then(stay, stay);
  }

  return modalUtil.open('enable-ai-features', {
    user: user,
    triggeredPref: 'ai_board_generation'
  }).then(function(result) {
    var features = result && result.requested_features;
    var boardGenOn = !!(features && features.ai_board_generation);
    return { proceed: !!(result && result.saved && boardGenOn) };
  }, stay);
}

export default { ensureAiBoardGenerationAccess: ensureAiBoardGenerationAccess };
