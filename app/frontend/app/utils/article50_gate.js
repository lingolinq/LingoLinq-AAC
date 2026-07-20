import RSVP from 'rsvp';
import modal from './modal';

/**
 * Shared EU AI Act Article 50(1) first-AI-use gate helper (F1/F2, D-02: ONE
 * shared source of gate logic for every call site in this phase -- board
 * generation and eval narration (BLOCK, Plan 03-04/03-05), and the
 * session-entry presentation opportunity (Plan 03-05), all import this module
 * rather than reimplementing any of these checks inline).
 *
 * FEATURE FLAG SCOPE (important): this module only READS
 * feature_flags.article_50_disclosure. Registering that flag in
 * AVAILABLE_FRONTEND_FEATURES is Phase 5 (RLL-01), out of scope here. Because
 * the flag is not registered yet on this branch, needsAcknowledgement returns
 * false everywhere -- the intended inert state until the 2026-08-02 enable gate.
 */

/**
 * True only when the article_50_disclosure feature flag is on AND there is a
 * current user AND that user's article_50_disclosure_required is true AND
 * article_50_disclosure_shown is false. Fail-safe direction per D-04: gates on
 * EuJurisdiction.disclosure_required? (already true for :eu and :unknown), not
 * on the retention-column jurisdiction stamp.
 */
export function needsAcknowledgement(appState) {
  if (!appState || typeof appState.get !== 'function') { return false; }
  if (!appState.get('feature_flags.article_50_disclosure')) { return false; }
  var user = appState.get('currentUser');
  if (!user || typeof user.get !== 'function') { return false; }
  if (!user.get('article_50_disclosure_required')) { return false; }
  if (user.get('article_50_disclosure_shown')) { return false; }
  return true;
}

/**
 * BLOCK-mode gate for board generation / eval narration (D-03). Resolves
 * immediately with no modal when no acknowledgement is needed. Otherwise opens
 * ai-disclosure with scannable:true (03-UI-SPEC.md 6.1) and resolves ONLY on a
 * genuine resolution -- a bumped modal resolving with {replaced: true} is not
 * an acknowledgement (T-03-03-02) and must never let the gated action proceed,
 * so the returned promise is deliberately left pending in that case rather than
 * resolved or rejected. Never passes inactivity_timeout (03-UI-SPEC.md 6.6):
 * this modal must not self-dismiss without recording an acknowledgement.
 */
export function presentBlockingGate(appState) {
  if (!needsAcknowledgement(appState)) {
    return RSVP.resolve();
  }
  return new RSVP.Promise(function(resolve) {
    modal.open('ai-disclosure', { scannable: true }).then(function(result) {
      if (!result || !result.replaced) {
        resolve(result);
      }
      // else: bumped by another modal, not a genuine acknowledgement. Leave
      // this promise pending -- the caller's gated action must not proceed.
    });
  });
}

/**
 * Session-entry presentation opportunity (03-UI-SPEC.md 7.1). Opens the modal
 * only when the model is really_fresh AND acknowledgement is genuinely needed;
 * no-ops on a stale model (safety for the offline/stale case, 7.1 Case 2).
 * Reuses needsAcknowledgement (D-02: one shared implementation) by wrapping
 * `model` itself as the appState-shaped argument: article_50_disclosure_* and
 * feature_flags both live directly on the user model, so this is not a
 * parallel/forked check, just a different caller shape.
 */
export function maybeShowSessionEntryGate(model) {
  if (!model || typeof model.get !== 'function') { return; }
  if (!model.get('really_fresh')) { return; }
  var pseudoAppState = {
    get: function(key) {
      if (key === 'currentUser') { return model; }
      return model.get(key);
    }
  };
  if (!needsAcknowledgement(pseudoAppState)) { return; }
  modal.open('ai-disclosure', { scannable: true });
}

/**
 * Guard used at every chained `.then()` site in routes/index.js and
 * routes/bento.js (03-UI-SPEC.md 7.1): a resolved `.then()` is not the same
 * thing as "the user acknowledged" -- utils/modal.js#open() resolves the
 * currently-showing modal's promise with {replaced: true} whenever a new modal
 * bumps it. Only call maybeShowSessionEntryGate when the prior modal was
 * genuinely resolved (falsy result, or a result without a truthy `replaced`).
 */
export function onlyIfGenuinelyResolved(result, model) {
  if (!result || !result.replaced) {
    maybeShowSessionEntryGate(model);
  }
}

export default {
  needsAcknowledgement: needsAcknowledgement,
  presentBlockingGate: presentBlockingGate,
  maybeShowSessionEntryGate: maybeShowSessionEntryGate,
  onlyIfGenuinelyResolved: onlyIfGenuinelyResolved
};
