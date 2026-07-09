import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';

/**
 * Share Email modal (Phase 2).
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
    const template = 'share-email';
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
    this.set('subject', this.get('model.text'));
    this.set('message', this.get('model.text') + '\n\n' + this.get('model.url'));
    this.set('loading', false);
    this.set('error', false);
  },

  no_email: computed('email', function() {
    return !(this.get('email') && this.get('email').match(/.+@.+/));
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      if (this.get('no_email')) { return; }
      const _this = this;
      _this.set('loading', true);
      persistence.ajax('/api/v1/utterances/' + this.get('model.utterance_id') + '/share', {
        type: 'POST',
        data: {
          email: this.get('email'),
          subject: this.get('subject'),
          message: this.get('message')
        }
      }).then(function() {
        _this.set('loading', false);
        modal.close('share-email');
        modal.success(i18n.t('email_send', "Email sent!"));
      }, function() {
        _this.set('loading', false);
        _this.set('error', true);
      });
    }
  }
});
