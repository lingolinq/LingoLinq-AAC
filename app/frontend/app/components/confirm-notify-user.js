import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';
import backend_user_id from '../utils/backend_user_id';

/**
 * Confirm Notify User modal (Phase 2).
 */
function share_http_status(err) {
  if (!err) { return 0; }
  if (typeof err.status === 'number') { return err.status; }
  if (err.result && typeof err.result.status === 'number') { return err.result.status; }
  return 0;
}

function alive(obj) {
  return !!(obj && !obj.isDestroyed && !obj.isDestroying);
}

export default Component.extend({
  modal: service('modal'),
  store: service('store'),
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
    const template = 'confirm-notify-user';
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
      if (_this._seconds_timer) {
        clearTimeout(_this._seconds_timer);
        _this._seconds_timer = null;
      }
    });
    const again = function() {
      if (canceled || !alive(_this)) { return; }
      const now = (new Date()).getTime();
      const diff = Math.round((end - now) / 1000);
      if (diff < 0) {
        _this.send('confirm');
        return;
      }
      _this.set('seconds', diff);
      _this._seconds_timer = setTimeout(again, 200);
    };
    this._seconds_timer = setTimeout(again, 200);
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
      if (!alive(_this)) { return; }
      _this.set('loading', true);
      const sharer = _this.get('model.sharer') || app_state.get('referenced_user');
      if (!sharer) { return; }
      sharer.set('last_share', (new Date()).getTime());
      const recipient_id = backend_user_id(_this.get('model.user')) || _this.get('model.user.id');
      const sharer_id = backend_user_id(sharer);
      const fallback = function() {
        if (_this.get('model.raw')) {
          stashes.log_event({
            share: true,
            utterance: _this.get('model.raw'),
            message_uid: Math.random() + ':' + (new Date()).getTime(),
            private_only: _this.get('model.private_only'),
            text_only: !!(app_state.get('text_only_shares') || stashes.get('text_only_shares')),
            sentence: _this.get('model.sentence'),
            recipient_id: recipient_id,
            reply_id: _this.get('model.reply_id')
          }, sharer_id);
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
      const post_share = function(utterance) {
        persistence.ajax('/api/v1/utterances/' + utterance.get('id') + '/share', {
          type: 'POST',
          data: {
            sharer_id: sharer_id,
            text_only: !!(app_state.get('text_only_shares') || stashes.get('text_only_shares')),
            user_id: recipient_id,
            reply_id: _this.get('model.reply_id')
          }
        }).then(function() {
          if (alive(_this)) { _this.set('loading', false); }
          modal.close('confirm-notify-user');
          modal.success(i18n.t('message_sent_excl', "Message sent!"));
        }, function(err) {
          if (!alive(_this)) { return; }
          _this.set('loading', false);
          if (share_http_status(err) >= 400) {
            _this.set('error', true);
          } else if (!persistence.get('online')) {
            fallback();
          } else {
            _this.set('error', true);
          }
        });
      };
      const utterance = this.get('model.utterance');
      if (utterance) {
        post_share(utterance);
      } else if (this.get('model.raw') && persistence.get('online')) {
        const store = this.get('store');
        if (!store || typeof store.createRecord !== 'function') {
          _this.set('loading', false);
          _this.set('error', true);
          return;
        }
        const rec = store.createRecord('utterance', {
          button_list: this.get('model.raw'),
          timestamp: (new Date()).getTime() / 1000,
          sentence: this.get('model.sentence'),
          user_id: sharer_id
        });
        if (rec.assert_remote_urls) { rec.assert_remote_urls(); }
        rec.save().then(function(saved) {
          if (!alive(_this)) { return; }
          _this.set('model.utterance', saved);
          post_share(saved);
        }, function() {
          if (!alive(_this)) { return; }
          _this.set('loading', false);
          _this.set('error', true);
        });
      } else if (this.get('model.raw')) {
        fallback();
      } else {
        _this.set('loading', false);
        _this.set('error', true);
      }
    }
  }
});
