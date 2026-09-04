import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import {
  defaultRequestedFeatures,
  consentPayload,
  anyFeatureSelected as anySelected
} from '../utils/eu_ai_consent';

export default Component.extend({
  modal: service('modal'),
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

    var modalService = this.get('modal');
    var template = 'eu-ai-parental-consent';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };

    var triggered = this.get('model.triggeredPref') || 'ai_features_enabled';
    this.set('requested_features', defaultRequestedFeatures(triggered));
    this.set('parent_email', (this.get('model.parentEmail') || '').trim());
    this.set('email_missing', false);
    this.set('features_missing', false);
    this.set('send_error', false);
    this.set('sending', false);
  },

  willDestroyElement() {
    this._super(...arguments);
    this.onClose = null;
    this.onOpening = null;
    this.onClosing = null;
  },

  anyFeatureSelected: computed(
    'requested_features.ai_board_generation',
    'requested_features.ai_word_prediction',
    'requested_features.ai_board_suggestions',
    'requested_features.ai_symbol_search',
    function() {
      return anySelected(this.get('requested_features'));
    }
  ),

  actions: {
    close() {
      modal.close(false);
    },
    opening() {},
    closing() {},
    send() {
      var _this = this;
      var email = (this.get('parent_email') || '').trim();
      var features = this.get('requested_features') || {};
      this.set('email_missing', !email);
      this.set('features_missing', !this.get('anyFeatureSelected'));
      this.set('send_error', false);
      if(!email || !this.get('anyFeatureSelected')) { return; }

      var payload = consentPayload(features);

      var user = this.get('model.user');
      if(!user || !user.get('id')) {
        this.set('send_error', true);
        return;
      }

      this.set('sending', true);
      persistence.ajax('/api/v1/users/' + user.get('id') + '/eu_ai_parental_consent', {
        type: 'POST',
        data: {
          parent_email: email,
          requested_features: payload
        }
      }).then(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('sending', false);
        modal.close({
          sent: true,
          parent_email: email,
          requested_features: payload
        });
      }, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('sending', false);
        _this.set('send_error', true);
      });
    }
  }
});
