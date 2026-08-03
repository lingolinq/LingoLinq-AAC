import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import session from '../utils/session';
import modalUtil from '../utils/modal';
import actionLock from '../utils/action-lock';

/**
 * Confirm Delete User Modal Component
 *
 * Converted from modals/confirm-delete-user template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
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
    const template = 'modals/confirm-delete-user';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('user_name', '');
    this.set('error', null);
    this.set('user', null);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('user', this.get('model.user'));
      this.set('error', null);
      this.set('user_name', '');
    },
    closing() {},
    delete_user() {
      const user = this.get('user');
      const user_name = this.get('user_name');
      if (!user) {
        this.set('error', i18n.t('user_delete_failed', "User account delete failed unexpectedly"));
        return;
      }
      if (user_name !== this.get('user.user_name')) {
        this.set('error', i18n.t('wrong_user_name', "User name isn't correct"));
      } else {
        return actionLock.run('delete-user:' + this.get('user.id'), () => {
          this.set('deleting', true);
          return this.persistence.ajax('/api/v1/users/' + user_name + '/flush/user', {
            type: 'POST',
            data: {
              confirm_user_id: this.get('user.id'),
              user_name: user_name
            }
          }).then(() => {
            this.set('deleting', false);
            this.get('modal').close();
            modalUtil.success(i18n.t('user_to_be_deleted', "Your user account will be deleted within approximately the next 24 hours."), false, true);
            runLater(function() {
              session.invalidate();
            }, 10000);
          }, () => {
            this.set('deleting', false);
            this.set('error', i18n.t('user_delete_failed', "User account delete failed unexpectedly"));
          });
        }, {timeout: 10000});
      }
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    // Ember 5.12 modal migration: the service-based modal system does not
    // auto-invoke opening() (this.onOpening is vestigial), so build modal state
    // here on insert. Without this, opening() never runs and user stays null
    // → delete_user throws "Cannot read properties of null (reading 'user_name')".
    // See assessment-settings / confirm-delete-board (Class 4).
    self.send('opening');
},

});
