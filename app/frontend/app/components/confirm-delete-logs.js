import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import actionLock from '../utils/action-lock';

/**
 * Confirm Delete Logs modal (Phase 2).
 */
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    const modalService = this.get('modal');
    const template = 'confirm-delete-logs';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
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
    const user = this.get('model.user');
    this.set('user', user);
    this.set('error', null);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    delete_logs() {
      if (this.get('user_name') !== this.get('user.user_name')) {
        this.set('error', i18n.t('wrong_user_name', "User name isn't correct"));
      } else {
        const _this = this;
        return actionLock.run('delete-logs:' + this.get('user.id'), function() {
          _this.set('deleting', true);
          return persistence.ajax('/api/v1/users/' + _this.get('user_name') + '/flush/logs', {
            type: 'POST',
            data: {
              confirm_user_id: _this.get('user.id'),
              user_name: _this.get('user_name')
            }
          }).then(function() {
            _this.set('deleting', false);
            modal.close();
            modal.success(i18n.t('logs_to_be_deleted', "Your logs will be deleted within approximately the next 24 hours."));
          }, function() {
            _this.set('deleting', false);
            _this.set('error', i18n.t('delete_failed', "Log delete failed unexpectedly"));
          });
        }, {timeout: 10000});
      }
    }
  }
});
