import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { set as emberSet, get as emberGet } from '@ember/object';
import modal from '../utils/modal';
import stashes from '../utils/_stashes';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import speecher from '../utils/speecher';
import sync from '../utils/sync';
import i18n from '../utils/i18n';
import LingoLinq from '../app';

/**
 * Inbox Modal Component
 *
 * Converted from modals/inbox template/controller to component.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    this.set('app_state', app_state);
    const modalService = this.get('modal');
    const template = 'modals/inbox';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  update_list: observer('app_state.referenced_user', function() {
    const _this = this;
    const loadId = (_this.get('_inbox_load_seq') || 0) + 1;
    _this.set('_inbox_load_seq', loadId);
    if (!_this.get('status.ready')) {
      _this.set('status', { loading: true });
    }
    persistence.fetch_inbox(app_state.get('referenced_user')).then(function(res) {
      if (_this.get('_inbox_load_seq') !== loadId) { return; }
      _this.set('alerts', res.alert);
      _this.set('fetched_inbox', res);
      _this.set('status', { ready: true });
    }, function() {
      if (_this.get('_inbox_load_seq') !== loadId) { return; }
      _this.set('status', { error: true });
    });
  }),

  update_inbox(updates) {
    const _this = this;
    stashes.push_log();
    const fetched_inbox = _this.get('fetched_inbox');
    if (updates.clears) {
      fetched_inbox.clears = (fetched_inbox.clears || []).concat(updates.clears);
    }
    if (updates.reads) {
      fetched_inbox.reads = (fetched_inbox.reads || []).concat(updates.reads);
    }
    persistence.fetch_inbox(app_state.get('referenced_user'), { persist: fetched_inbox }).then(null, function() {});
  },

  current_class: computed('current.text', function() {
    const str = this.get('current.text') || '';
    if (str.length < 25) {
      return htmlSafe('big');
    } else if (str.length < 140) {
      return htmlSafe('medium');
    }
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('working_vocalization', stashes.get('working_vocalization'));
      const voc = stashes.get('working_vocalization') || [];
      this.set('working_sentence', voc.map(function(v) { return v.label; }).join(' '));
      this.set('current', null);
      this.set('alerts', null);
      this.set('fetched_inbox', null);
      const user = app_state.get('referenced_user');
      if (user && user.get('unread_alerts')) {
        user.set('last_alert_access', (new Date()).getTime() / 1000);
        user.save().then(null, function() {});
      }
      this.update_list();
    },
    closing() {},
    clear(which) {
      let alerts = [which];
      const _this = this;
      const clears = [];
      if (which === 'all') {
        alerts = _this.get('alerts') || [];
      }
      alerts.forEach(function(a) {
        stashes.log_event({
          alert: {
            alert_id: emberGet(a, 'id'),
            user_id: app_state.get('referenced_user.id'),
            cleared: true
          }
        }, app_state.get('referenced_user.id'));
        emberSet(a, 'cleared', true);
        clears.push(emberGet(a, 'id'));
      });
      _this.set('alerts', _this.get('alerts').filter(function(a) {
        return !emberGet(a, 'cleared');
      }));
      _this.update_inbox({ clears: clears });
    },
    view(alert) {
      if (alert.note) {
        this.set('current', alert);
        const _this = this;
        const text = alert.text;
        _this.set('current_with_images', null);
        const parts_list = text.split(/\b/).map(function(str) { return { str: str }; });
        const board_id = app_state.get('referenced_user.preferences.home_board.id');
        if (board_id && app_state.get('referenced_user.preferences.device.button_text') !== 'text_only' && app_state.get('referenced_user.preferences.device.button_text_position') !== 'text_only' && !app_state.get('referenced_user.preferences.device.utterance_text_only')) {
          LingoLinq.Buttonset.load_button_set(board_id).then(function(button_set) {
            const search = button_set.find_sequence(text, board_id, app_state.get('referenced_user'), false);
            search.then(function(results) {
              const list = (results[0] || {}).steps || [];
              let found_any = false;
              list.forEach(function(step) {
                if (step.button && step.button.label) {
                  const parts = parts_list.filter(function(p) { return !p.image && p.str.toLowerCase() === step.button.label.toLowerCase() || p.str.toLowerCase() === (step.button.vocalization || '').toLowerCase(); });
                  parts.forEach(function(part) {
                    found_any = true;
                    part.image = step.button.image;
                  });
                }
              });
              if (found_any) {
                _this.set('current_with_images', parts_list);
              }
            });
          });
        }
        emberSet(alert, 'unread', false);
        stashes.log_event({
          alert: {
            alert_id: emberGet(alert, 'id'),
            user_id: app_state.get('referenced_user.id'),
            read: true
          }
        }, app_state.get('referenced_user.id'));
        this.update_inbox({ reads: [emberGet(alert, 'id')] });
      }
    },
    back() {
      this.set('current', null);
    },
    speak() {
      const text = this.get('current.text');
      if (text) {
        const alt_voice = speecher.alternate_voice && speecher.alternate_voice.enabled && speecher.alternate_voice.for_messages !== false;
        speecher.speak_text(text, false, { alternate_voice: alt_voice });
      }
    },
    reply() {
      app_state.set('reply_note', this.get('current'));
      this.get('modal').close();
      modal.notice(i18n.t('compose_and_return_to_reply', "Compose your message and go back to the Alerts view to send your message"), true);
    },
    compose() {
      if (stashes.get('working_vocalization.length')) {
        if (app_state.get('reply_note')) {
          const user = this.get('reply_note.author');
          if (user) {
            user.user_name = user.user_name || user.name;
            user.avatar_url = user.avatar_url || user.image_url;
            modal.open('confirm-notify-user', { user: user, reply_id: app_state.get('reply_note.id'), raw: stashes.get('working_vocalization'), sentence: this.get('working_sentence'), utterance: null });
          }
        } else {
          modal.open('share-utterance', { utterance: stashes.get('working_vocalization') });
        }
      }
    },
    accept_pair() {
      const req = app_state.get('sessionUser.request_alert');
      app_state.set('referenced_user.request_alert', null);
      if (req && req.pair && req.pair.pair_code) {
        sync.confirm_pair(req.pair.pair_code, req.pair.partner_id);
      } else {
        sync.allow_followers();
      }
      this.get('modal').close();
    },
    reject_pair() {
      const req = app_state.get('sessionUser.request_alert');
      app_state.set('referenced_user.request_alert', null);
      if (req && req.pair && req.pair.pair_code) {
        sync.send(app_state.get('sessionUser.id'), {
          type: 'reject',
          pair_code: req.pair.pair_code,
          partner_id: req.pair.partner_id
        });
      } else if (req && req.follow) {
        const follow_stamps = app_state.get('followers') || {};
        follow_stamps.ignore_until = (new Date()).getTime() + (5 * 60 * 1000);
        app_state.set('followers', follow_stamps);
      }
      this.get('modal').close();
    }
  }
});
