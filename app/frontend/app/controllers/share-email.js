import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  persistence: service(),
  modal: service(),

  opening: function() {
    this.set('subject', this.get('model.text'));
    this.set('message', this.get('model.text') + "\n\n" + this.get('model.url'));
    this.set('loading', false);
    this.set('error', false);
  },
  no_email: computed('email', function() {
    return !(this.get('email') && this.get('email').match(/.+@.+/));
  }),
  actions: {
    confirm: function() {
      if(this.get('no_email')) { return; }
      var _this = this;
      _this.set('loading', true);
      this.persistence.ajax('/api/v1/utterances/' + this.get('model.utterance_id') + '/share', {
        type: 'POST',
        data: {
          email: this.get('email'),
          subject: this.get('subject'),
          message: this.get('message')
        }
      }).then(function(data) {
        _this.set('loading', false);
        this.modal.close('share-email');
        modal.success(i18n.t('email_send', "Email sent!"));
      }, function(err) {
        _this.set('loading', false);
        _this.set('error', true);
      });
    }
  }
});
