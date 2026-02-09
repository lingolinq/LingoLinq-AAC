import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';

/**
 * Confirm Notify User modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'confirm-notify-user';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('loading', false);
    this.set('error', false);
    const end = (new Date()).getTime() + 5000;
    const _this = this;
    let canceled = false;
    if (this.get('model.reply_id')) {
      app_state.set('reply_note', null);
    }
    this.set('cancel', function() {
      canceled = true;
    });
    const again = function() {
      const now = (new Date()).getTime();
      let diff = Math.round((end - now) / 1000);
      if (diff < 0) {
        diff = 0;
        _this.send('confirm');
      } else if (!canceled) {
        setTimeout(again, 200);
      }
      _this.set('seconds', diff);
    };
    setTimeout(again, 200);
  },

  willDestroyElement() {
    if (this.get('cancel')) {
      this.get('cancel')();
    }
    this._super(...arguments);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {
      if (this.get('cancel')) {
        this.get('cancel')();
      }
    },
    confirm() {
      if (this.get('cancel')) {
        this.get('cancel')();
      }
      const _this = this;
      _this.set('loading', true);
      const sharer = _this.get('model.sharer') || app_state.get('referenced_user');
      if (!sharer) { return; }
      sharer.set('last_share', (new Date()).getTime());
      const fallback = function() {
        if (_this.get('model.raw')) {
          stashes.log_event({
            share: true,
            utterance: _this.get('model.raw'),
            message_uid: Math.random() + ':' + (new Date()).getTime(),
            private_only: _this.get('model.private_only'),
            text_only: !!(app_state.get('text_only_shares') || stashes.get('text_only_shares')),
            sentence: _this.get('model.sentence'),
            recipient_id: _this.get('model.user.id'),
            reply_id: _this.get('model.reply_id')
          }, sharer.get('id'));
          modal.close('confirm-notify-user');
          if (persistence.get('online')) {
            stashes.push_log();
            modal.success(i18n.t('user_notified', "Message will be sent with logs or next sync."));
          } else {
            modal.success(i18n.t('message_queued', "Message queued to be sent when online."));
          }
        } else {
          _this.set('error', true);
        }
      };
      if (!this.get('model.utterance') && this.get('model.raw')) {
        fallback();
      } else {
        persistence.ajax('/api/v1/utterances/' + this.get('model.utterance.id') + '/share', {
          type: 'POST',
          data: {
            sharer_id: sharer.get('id'),
            text_only: !!(app_state.get('text_only_shares') || stashes.get('text_only_shares')),
            user_id: _this.get('model.user.id'),
            reply_id: _this.get('model.reply_id')
          }
        }).then(function() {
          _this.set('loading', false);
          modal.close('confirm-notify-user');
          modal.success(i18n.t('message_sent_excl', "Message sent!"));
        }, function(err) {
          _this.set('loading', false);
          if (err && err.result && err.result.status >= 400) {
            _this.set('error', true);
          } else {
            fallback();
          }
        });
      }
    }
  }
});
