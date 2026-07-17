import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import app_state from '../../utils/app_state';

export default Controller.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  store: service('store'),
  load_badges: function() {
    var _this = this;
    this.set('badges', {loading: true});
    this.store.query('badge', {user_id: this.get('model.id')}).then(function(badges) {
      badges = badges.slice();
      _this.set('badges', badges);
    }, function(err) {
      _this.set('badges', {error: true});
    });
  },
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    highlight_badge: function(badge, do_highlight) {
      var _this = this;
      badge.set('highlighted', !!do_highlight);
      badge.save().then(function() {
        _this.load_badges();
      }, function() {
        modal.error(i18n.t('badge_update_failed', "Badge Update Failed"));
      });
    },
    delete_badge: function(badge) {
      var _this = this;
      badge.set('disabled', true);
      badge.save().then(function() {
        _this.load_badges();
      }, function() {
        modal.error(i18n.t('badge_update_failed', "Badge Update Failed"));
      });
    },
    badge_popup: function(badge) {
      modal.open('badge-awarded', {badge: badge});
    }
  }
});
