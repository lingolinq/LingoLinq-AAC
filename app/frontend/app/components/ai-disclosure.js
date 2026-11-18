import Component from '@ember/component';
import { inject as service } from '@ember/service';
import persistence from '../utils/persistence';
// EU AI Act Article 50(1) transparency notice (VPC Phase 3, F1). The version and
// URL live in utils/article50_gate so this modal and the passive Preferences link
// cannot drift apart; that constant tracks the backend's
// LingoLinq::Article50Disclosures::CURRENT_VERSION (Plan 03-01).
import {
  art50DisclosureUrl,
  art50Subject,
  art50UserId,
  needsAcknowledgement,
  needsAiConsent,
  aiConsentDisclosureUrl,
  deferAiConsent,
  clearAiConsentDeferral
} from '../utils/article50_gate';
import RSVP from 'rsvp';

/**
 * The one shared, accessible "you are about to use AI" modal (F1). Composes
 * modal-dialog in BLOCK mode: uncloseable, no Escape, no backdrop-click, exactly
 * one scan/keyboard-reachable exit (Acknowledge, or Try Again on a failed write).
 * Cloned from terms-agree.js's shape per 03-CONTEXT.md/03-UI-SPEC.md.
 *
 * It also asks for AI data-sharing consent (#1136) when the account holder has none
 * on record (utils/article50_gate.js#needsAiConsent), unless it was opened with the
 * skipAiConsent option. ONLY when consent is asked there is a
 * second button, "Not now", and the primary button reads "Agree and Continue"; with
 * only the Article 50 acknowledgement outstanding the modal is exactly as before.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.set('loading', true);
    this.set('disclosure_html', null);
    this.set('ack_error', false);
    this.set('acknowledging', false);
    // Locale-aware: drives BOTH the in-modal fetch below and the "Read the Full
    // Notice" link, so a Spanish reader gets the Spanish notice in both places.
    this.set('disclosureLinkUrl', art50DisclosureUrl());
    // AI data-sharing consent (#1136). The same notice also asks the account holder
    // to agree to the AI data-sharing disclosure. consent_pending is what is still
    // being asked (it turns false once the agreement is recorded); consent_only means
    // the Article 50 notice is not needed, so its text is not fetched or shown.
    // `skipAiConsent` arrives through the modal options (presentBlockingGate passes it
    // when the caller's AI call does not depend on this account's consent), or as an
    // argument. In that mode this is the Article 50 notice alone, exactly as before.
    var appState = this.get('appState');
    var modalService = this.get('modal');
    var openedWith = modalService && typeof modalService.getSettingsFor === 'function' ? modalService.getSettingsFor('ai-disclosure') : null;
    var skipConsent = !!(this.get('skipAiConsent') || (openedWith && openedWith.skipAiConsent));
    var consentPending = !skipConsent && needsAiConsent(appState);
    this.set('consent_pending', consentPending);
    this.set('consent_only', consentPending && !needsAcknowledgement(appState));
    this.set('consent_error', false);
    this.set('consentDisclosureUrl', aiConsentDisclosureUrl(art50Subject(appState)));
  },

  didInsertElement() {
    this._super(...arguments);
    this.fetchDisclosure();
  },

  /**
   * Fetches the Article 50(1) notice fragment and renders it as the modal's
   * summary. Never leaves the modal empty: offline or a failed fetch falls back
   * to the compiled-in ai_disclosure_offline_fallback string (T-03-03-04/05).
   */
  fetchDisclosure() {
    var _this = this;
    if (this.get('consent_only')) {
      // Only the consent is being asked: no Article 50 notice to load.
      this.set('disclosure_html', null);
      this.set('loading', false);
      return;
    }
    if (persistence && typeof persistence.get === 'function' && !persistence.get('online')) {
      this.showOfflineFallback();
      return;
    }
    persistence.ajax(this.get('disclosureLinkUrl'), { type: 'GET', dataType: 'html' }).then(function(html) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      // extras.js wraps every string AJAX body as {text: html, meta: ...} so
      // Ember Data always receives an object. persistence.ajax JSON callers already
      // expect that shape; this HTML fetch must unwrap .text or {{safe}} stringifies
      // the object to "[object Object]". A raw string is still accepted for tests
      // / the unpatched $.ajax path.
      var htmlString = null;
      if (typeof html === 'string') {
        htmlString = html;
      } else if (html && typeof html.text === 'string') {
        htmlString = html.text;
      }
      if (htmlString) {
        _this.set('disclosure_html', htmlString);
        _this.set('loading', false);
      } else {
        _this.showOfflineFallback();
      }
    }, function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.showOfflineFallback();
    });
  },

  showOfflineFallback() {
    if (this.isDestroyed || this.isDestroying) { return; }
    this.set('disclosure_html', null);
    this.set('loading', false);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    /**
     * POSTs the acknowledgement (D-06: source/version are server constants,
     * never sent from here). Success updates the local user record so the gate
     * stops firing without a reload, then closes the modal so the caller's
     * blocked action proceeds. A failed write NEVER closes the modal -- closing
     * would resolve the caller's promise and let a gated AI action proceed with
     * no recorded acknowledgement (T-03-03-06).
     *
     * The ack is recorded against art50Subject (the AUTHENTICATED account), the
     * same account needsAcknowledgement gated on and the same one the server's
     * backstop evaluates. Reading `currentUser` here meant that in speak mode a
     * supporter's acknowledgement was POSTed to the COMMUNICATOR's id: the
     * endpoint takes params['user_id'] and a supporter usually passes
     * allowed?(user, 'edit'), so it wrote an audited Article 50 record for a
     * person who never saw the notice while the supporter stayed ungated. The
     * audit trail has to name the human who actually read it.
     *
     * The URL uses art50UserId (global_id / _actual_id), never `.id` alone.
     * findRecord('user', 'self') leaves `.id` as the literal 'self', and
     * User.find_by_path treats a non-digit path as a username, so POSTing
     * /users/self/article_50_disclosure_ack 404s and the supporter cannot
     * acknowledge.
     */
    /**
     * "Agree and Continue" when AI data-sharing consent is being asked. Records the
     * consent (POST /users/:id/ai_consent, source and version are server constants),
     * then the Article 50 acknowledgement if that is ALSO needed, then closes. A failed
     * write of either step never closes the modal, for the same reason as acknowledge
     * below: closing resolves the caller's promise. Each step is skipped when it is
     * already recorded, so "Try Again" after a half-done pass repeats only what is left.
     * The id rule is the same as acknowledge's: art50UserId, never the 'self' sentinel.
     */
    agree() {
      var _this = this;
      if (this.get('acknowledging')) { return; }
      var appState = this.get('appState');
      var user = art50Subject(appState);
      var userId = art50UserId(user);
      if (!user || !userId) {
        this.set('consent_error', true);
        return;
      }
      this.set('acknowledging', true);
      this.set('consent_error', false);
      this.set('ack_error', false);
      var consentStep = RSVP.resolve();
      if (needsAiConsent(appState)) {
        consentStep = persistence.ajax('/api/v1/users/' + userId + '/ai_consent', {
          type: 'POST'
        }).then(function() {
          user.set('ai_consent_required', false);
          clearAiConsentDeferral(user);
          if (!_this.isDestroyed && !_this.isDestroying) { _this.set('consent_pending', false); }
        });
      }
      consentStep.then(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (needsAcknowledgement(appState)) {
          return persistence.ajax('/api/v1/users/' + userId + '/article_50_disclosure_ack', {
            type: 'POST'
          }).then(function() {
            user.set('article_50_disclosure_shown', true);
          });
        }
      }).then(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('acknowledging', false);
        _this.get('modal').close();
      }, function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('acknowledging', false);
        // consent_pending is still true only when the consent write itself failed.
        if (_this.get('consent_pending')) {
          _this.set('consent_error', true);
        } else {
          _this.set('ack_error', true);
        }
      });
    },
    /**
     * "Not now": close WITHOUT recording anything. A blocking caller's promise rejects
     * (presentBlockingGate re-checks needsAiConsent), so the gated AI action does not
     * run. Remembered per user on this device so the session-entry notice does not
     * re-open on every page load; the next blocking AI action asks again.
     */
    notNow() {
      if (this.get('acknowledging')) { return; }
      deferAiConsent(art50Subject(this.get('appState')));
      this.get('modal').close();
    },
    acknowledge() {
      var _this = this;
      if (this.get('acknowledging')) { return; }
      var user = art50Subject(this.get('appState'));
      var userId = art50UserId(user);
      if (!user || !userId) {
        this.set('ack_error', true);
        return;
      }
      this.set('acknowledging', true);
      this.set('ack_error', false);
      persistence.ajax('/api/v1/users/' + userId + '/article_50_disclosure_ack', {
        type: 'POST'
      }).then(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        user.set('article_50_disclosure_shown', true);
        _this.set('acknowledging', false);
        _this.get('modal').close();
      }, function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('acknowledging', false);
        _this.set('ack_error', true);
      });
    }
  }
});
