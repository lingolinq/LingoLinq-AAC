import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import aiFeatureGate from '../utils/ai_feature_gate';

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

    var modalService = this.get('modal');
    var template = 'enable-ai-features';
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

    this.set('save_error', false);
    this.set('saving', false);
  },

  willDestroyElement() {
    this._super(...arguments);
    this.onClose = null;
    this.onOpening = null;
    this.onClosing = null;
  },

  blocked: computed('model.blocked', function() {
    return !!this.get('model.blocked');
  }),

  blockedCoppa: computed('model.blockedReason', function() {
    return this.get('model.blockedReason') === 'coppa';
  }),

  _user: function() {
    return this.get('model.user') || this.get('appState.currentUser');
  },

  _rollback: function() {
    aiFeatureGate.rollbackAiFeaturePrefs(this._user());
  },

  actions: {
    close() {
      if(this.get('saving') || this.get('_saved')) { return; }
      this._rollback();
      modal.close(false);
    },
    opening() {},
    closing() {},
    enable() {
      var _this = this;
      if(this.get('blocked')) { return; }
      this.set('save_error', false);

      var user = this._user();
      if(!user || typeof user.save !== 'function') {
        this.set('save_error', true);
        return;
      }
      if(persistence && persistence.get && !persistence.get('online')) {
        this.set('save_error', true);
        return;
      }

      var triggered = this.get('model.triggeredPref') || 'ai_board_generation';
      var features = {};
      features[triggered] = true;
      var payload = aiFeatureGate.applyAiFeaturePrefs(user, features);
      this.set('saving', true);

      var savePromise = null;
      try {
        savePromise = user.save();
      } catch(e) {
        this.set('saving', false);
        this.set('save_error', true);
        this._rollback();
        return;
      }

      return savePromise.then(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('_saved', true);
        _this.set('saving', false);
        modal.close({
          saved: true,
          requested_features: payload
        });
      }, function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('saving', false);
        _this.set('save_error', true);
        _this._rollback();
      });
    }
  }
});
