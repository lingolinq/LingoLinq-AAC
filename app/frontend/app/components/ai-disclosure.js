import Component from '@ember/component';
import { inject as service } from '@ember/service';
import persistence from '../utils/persistence';
// EU AI Act Article 50(1) transparency notice (VPC Phase 3, F1). The version and
// URL live in utils/article50_gate so this modal and the passive Preferences link
// cannot drift apart; that constant tracks the backend's
// LingoLinq::Article50Disclosures::CURRENT_VERSION (Plan 03-01).
import { art50DisclosureUrl, art50Subject } from '../utils/article50_gate';

/**
 * The one shared, accessible "you are about to use AI" modal (F1). Composes
 * modal-dialog in BLOCK mode: uncloseable, no Escape, no backdrop-click, exactly
 * one scan/keyboard-reachable exit (Acknowledge, or Try Again on a failed write).
 * Cloned from terms-agree.js's shape per 03-CONTEXT.md/03-UI-SPEC.md.
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
     */
    acknowledge() {
      var _this = this;
      if (this.get('acknowledging')) { return; }
      var user = art50Subject(this.get('appState'));
      if (!user || !user.get('id')) {
        this.set('ack_error', true);
        return;
      }
      this.set('acknowledging', true);
      this.set('ack_error', false);
      persistence.ajax('/api/v1/users/' + user.get('id') + '/article_50_disclosure_ack', {
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
