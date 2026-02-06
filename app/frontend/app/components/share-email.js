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
    const modalService = this.get('modal');
    const template = 'share-email';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
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
