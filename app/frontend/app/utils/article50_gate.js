import RSVP from 'rsvp';
import modal from './modal';
import i18n from './i18n';

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
 * EU AI Act Article 50(1) transparency notice version, kept in sync with the
 * backend's LingoLinq::Article50Disclosures::CURRENT_VERSION. Single-sourced
 * here so the modal (components/ai-disclosure.js) and the passive Preferences
 * link (controllers/user/preferences.js) cannot drift to different versions --
 * a bump is one edit, in one place.
 */
export var ART50_CURRENT_VERSION = 1;
export var ART50_DISCLOSURE_URL = '/ai_consent/disclosures/art50_v' + ART50_CURRENT_VERSION;

/**
 * The notice URL with the reader's current locale attached. ALWAYS use this
 * rather than the bare ART50_DISCLOSURE_URL constant for anything a user
 * actually reads.
 *
 * config/locales/es.yml carries a full Spanish translation of the notice and
 * disclosures_controller#show_art50 wraps the render in I18n.with_locale, but
 * that branch reads params[:locale] -- so a request without one always resolved
 * to I18n.default_locale and served ENGLISH. The Spanish notice shipped and was
 * unreachable. For an EU-facing Article 50 transparency notice, delivering it in
 * a language the reader may not speak defeats the point of the disclosure.
 *
 * Sends i18n.langs.preferred (the full navigator tag, e.g. 'es-ES'); the server
 * allowlists it and falls back through the primary subtag ('es-ES' -> 'es') and
 * then to the default, so an unrecognized value degrades to English rather than
 * erroring.
 */
export function art50DisclosureUrl() {
  var preferred = i18n.langs && i18n.langs.preferred;
  if (!preferred || preferred === 'backwards') { return ART50_DISCLOSURE_URL; }
  return ART50_DISCLOSURE_URL + '?locale=' + encodeURIComponent(preferred);
}

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
 * Rejection reason handed to a caller whose gate was bumped by another modal
 * before the user acknowledged. Exported so callers can tell "the user declined
 * / never saw it" apart from a genuine error and surface an explanation instead
 * of failing silently.
 */
export var GATE_NOT_ACKNOWLEDGED = 'art50_gate_not_acknowledged';

/**
 * BLOCK-mode gate for board generation / eval narration (D-03). Resolves
 * immediately with no modal when no acknowledgement is needed. Otherwise opens
 * ai-disclosure with scannable:true (03-UI-SPEC.md 6.1) and resolves ONLY on a
 * genuine resolution -- a bumped modal resolving with {replaced: true} is not
 * an acknowledgement (T-03-03-02) and must never let the gated action proceed.
 *
 * A bump REJECTS with GATE_NOT_ACKNOWLEDGED rather than leaving the promise
 * pending forever. Fail-closed is right; silent is not -- an unsettled promise
 * gives the caller no way to tell the user why their button did nothing, and
 * retains the whole chain. Callers must attach a rejection handler.
 *
 * IMPORTANT for callers: do NOT call this from inside a component that is
 * itself hosted in a modal. modal.open() REPLACES the current modal, so the
 * gate would destroy its own host and discard whatever the user had entered.
 * Gate at the point that OPENS the modal instead -- see new-board.js#generateWithAi.
 *
 * The modal.open() options object below never includes an auto-close-after-
 * inactivity setting (03-UI-SPEC.md 6.6): this modal must not self-dismiss
 * without recording an acknowledgement.
 */
export function presentBlockingGate(appState) {
  if (!needsAcknowledgement(appState)) {
    return RSVP.resolve();
  }
  return new RSVP.Promise(function(resolve, reject) {
    modal.open('ai-disclosure', { scannable: true }).then(function(result) {
      if (result && result.replaced) {
        // Bumped by another modal, not a genuine acknowledgement. The caller's
        // gated action must not proceed, but it DOES need to know why.
        reject({ art50_gate: GATE_NOT_ACKNOWLEDGED });
      } else if (needsAcknowledgement(appState)) {
        /* Resolved WITHOUT an acknowledgement being recorded. This branch used to
           resolve positively on any non-`replaced` result, including `resolve(null)` —
           and utils/modal.js#close resolves the pending promise with its `success`
           argument, so a bare `modal.close()` anywhere (e.g. app-state#check_scanning,
           which closes whatever modal is open) satisfied the gate and let an AI request
           proceed for an EU user with no Art.50(1) acknowledgement on record.
           Only `@uncloseable` on the disclosure template was holding that shut; the gate
           now verifies the outcome itself, against the same predicate it entered on. */
        reject({ art50_gate: GATE_NOT_ACKNOWLEDGED });
      } else {
        resolve(result);
      }
    }, function(err) {
      reject(err);
    });
  });
}

/**
 * Wraps a user model as the appState-shaped argument needsAcknowledgement wants
 * (D-02: one shared implementation). article_50_disclosure_* and feature_flags
 * both live directly on the user model, so this is not a parallel/forked check,
 * just a different caller shape.
 */
function asAppState(model) {
  return {
    get: function(key) {
      if (key === 'currentUser') { return model; }
      return model.get(key);
    }
  };
}

/**
 * True when maybeShowSessionEntryGate() below would actually open the modal:
 * the model is really_fresh AND acknowledgement is genuinely needed.
 *
 * Exported as a read-only companion so a caller that is about to redirect AWAY
 * from one of the two gate-hosting routes (routes/index.js, routes/bento.js) can
 * tell whether doing so would silently skip a pending disclosure — see
 * routes/index.js#_land_on_default, which defers a supporter's caseload landing
 * while a gate is outstanding. Shares this module's single implementation rather
 * than forking the predicate at the call site.
 */
export function sessionEntryGatePending(model) {
  if (!model || typeof model.get !== 'function') { return false; }
  if (!model.get('really_fresh')) { return false; }
  return needsAcknowledgement(asAppState(model));
}

/**
 * Session-entry presentation opportunity (03-UI-SPEC.md 7.1). Opens the modal
 * only when the model is really_fresh AND acknowledgement is genuinely needed;
 * no-ops on a stale model (safety for the offline/stale case, 7.1 Case 2).
 */
export function maybeShowSessionEntryGate(model) {
  if (!sessionEntryGatePending(model)) { return; }
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
  ART50_CURRENT_VERSION: ART50_CURRENT_VERSION,
  ART50_DISCLOSURE_URL: ART50_DISCLOSURE_URL,
  art50DisclosureUrl: art50DisclosureUrl,
  GATE_NOT_ACKNOWLEDGED: GATE_NOT_ACKNOWLEDGED,
  needsAcknowledgement: needsAcknowledgement,
  presentBlockingGate: presentBlockingGate,
  sessionEntryGatePending: sessionEntryGatePending,
  maybeShowSessionEntryGate: maybeShowSessionEntryGate,
  onlyIfGenuinelyResolved: onlyIfGenuinelyResolved
};
