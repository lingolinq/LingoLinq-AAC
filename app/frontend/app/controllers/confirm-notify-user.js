import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  stashes: service(),
  modal: service(),

  opening: function() {
    this.set('loading', false);
    this.set('error', false);
    var end = (new Date()).getTime() + 5000;
    var _this = this;
    var canceled = false;
    if(this.get('model.reply_id')) {
      this.appState.set('reply_note', null);
    }
    this.set('cancel', function() {
      canceled = true;
    })
    var again = function() {
      var now = (new Date()).getTime();
      var diff = Math.round((end - now) / 1000);
      if(diff < 0) {
        diff = 0;
        _this.send('confirm');
      } else if(!canceled) {
        setTimeout(again, 200);
      }
      _this.set('seconds', diff)
    };
    setTimeout(again, 200);
  },
  closing: function() {
    if(this.get('cancel')) {
      this.get('cancel')();
    }
  },
  actions: {
    confirm: function() {
      if(this.get('cancel')) {
        this.get('cancel')();
      }
      var _this = this;
      _this.set('loading', true);
      var sharer = _this.get('model.sharer') || this.appState.get('referenced_user');
      if(!sharer) { return; }
      // We set this so app_state knows to check
      // more often for replies for a little while
      sharer.set('last_share', (new Date()).getTime());
      var fallback = function() {
        if(_this.get('model.raw')) {
          this.stashes.log_event({
            share: true,
            utterance: _this.get('model.raw'),
            message_uid: Math.random() + ":" + (new Date()).getTime(),
            private_only: _this.get('model.private_only'),
            text_only: !!(this.appState.get('text_only_shares') || this.stashes.get('text_only_shares')),
            sentence: _this.get('model.sentence'),
            recipient_id: _this.get('model.user.id'),
            reply_id: _this.get('model.reply_id')
          }, sharer.get('id'));
          this.modal.close('confirm-notify-user');
          if(this.persistence.get('online')) {
            this.stashes.push_log();
            modal.success(i18n.t('user_notified', "Message will be sent with logs or next sync."));
          } else {
            modal.success(i18n.t('message_queued', "Message queued to be sent when online."));
          }
        } else {
          this.set('error', true);
        }
      };
      if(!this.get('model.utterance') && this.get('model.raw')) {
        fallback();
      } else {
        this.persistence.ajax('/api/v1/utterances/' + this.get('model.utterance.id') + '/share', {
          type: 'POST',
          data: {
            sharer_id: sharer.get('id'),
            text_only: !!(this.appState.get('text_only_shares') || this.stashes.get('text_only_shares')),
            user_id: _this.get('model.user.id'),
            reply_id: _this.get('model.reply_id')
          }
        }).then(function(data) {
          _this.set('loading', false);
          this.modal.close('confirm-notify-user');
          modal.success(i18n.t('message_sent_excl', "Message sent!"));
        }, function(err) {
          _this.set('loading', false);
          if(err && err.result && err.result.status >= 400) {
            _this.set('error', true);
          } else {
            fallback();
          }
        });
      }
    }
  }
});
