import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import persistence from '../../utils/persistence';
import app_state from '../../utils/app_state';
import speecher from '../../utils/speecher';
import sync from '../../utils/sync';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/string';
import { set as emberSet, get as emberGet } from '@ember/object';
import LingoLinq from '../../app';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.set('working_vocalization', stashes.get('working_vocalization'));
    var voc = stashes.get('working_vocalization') || [];
    this.set('working_sentence', voc.map(function(v) { return v.label; }).join(' '));
    this.set('current', null);
    this.set('alerts', null);
    this.set('fetched_inbox', null);
    this.set('app_state', app_state);
    var user = app_state.get('referenced_user');
    if(user && user.get('unread_alerts')) {
      user.set('last_alert_access', (new Date()).getTime() / 1000);
      user.save().then(null, function() { });
    }
    this.update_list();
  },
  update_list: observer('app_state.referenced_user', function() {
    var _this = this;
    if(!_this.get('status.ready')) {
      _this.set('status', {loading: true});
    }
    persistence.fetch_inbox(app_state.get('referenced_user')).then(function(res) {
      _this.set('alerts', res.alert);
      _this.set('fetched_inbox', res);
      _this.set('status', {ready: true});
    }, function(err) {
      _this.set('status', {error: true});
    });
  }),
  update_inbox: function(updates) {
    var _this = this;
    stashes.push_log();
    var fetched_inbox = _this.get('fetched_inbox');
    if(updates.clears) {
      fetched_inbox.clears = (fetched_inbox.clears || []).concat(updates.clears);
    } 
    if(updates.reads) {
      fetched_inbox.reads = (fetched_inbox.reads || []).concat(updates.reads);
    }
    persistence.fetch_inbox(app_state.get('referenced_user'), {persist: fetched_inbox}).then(null, function(err) { debugger });
  },
  current_class: computed('current.text', function() {
    var str = this.get('current.text') || '';
    if(str.length < 25) {
      return htmlSafe('big');
    } else if(str.length < 140) {
      return htmlSafe('medium');
    }
  }),
  actions: {
    clear: function(which) {
      var alerts = [which];
      var _this = this;
      var clears = [];
      if(which == 'all') {
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
      }))
      _this.update_inbox({clears: clears});
    },
    view: function(alert) {
      if(alert.note) {
        this.set('current', alert);
        var _this = this;
        var text = alert.text;
        _this.set('current_with_images', null);
        var parts_list = text.split(/\b/).map(function(str) { return { str: str }; });
        var board_id = app_state.get('referenced_user.preferences.home_board.id');
        if(board_id && app_state.get('referenced_user.preferences.device.button_text') != 'text_only' && app_state.get('referenced_user.preferences.device.button_text_position') != 'text_only' && !app_state.get('referenced_user.preferences.device.utterance_text_only')) {
          // Make symbolated messages opt-in, see:
          // https://bit.ly/3d0xABA
          LingoLinq.Buttonset.load_button_set(board_id).then(function(button_set) {
            var search = button_set.find_sequence(text, board_id, app_state.get('referenced_user'), false);
            search.then(function(results) {
              var list = (results[0] || {}).steps || [];
              var found_any = false;
              list.forEach(function(step) {
                if(step.button && step.button.label) {
                  var parts = parts_list.filter(function(p) { return !p.image && p.str.toLowerCase() == step.button.label.toLowerCase() || p.str.toLowerCase() == (step.button.vocalization || '').toLowerCase(); });
                  parts.forEach(function(part) {
                    found_any = true;
                    part.image = step.button.image;
                  });
                }
              });
              if(found_any) {
                _this.set('current_with_images', parts_list);
              }
            });
          })
        }

        var _this = this;
        emberSet(alert, 'unread', false);
        // persist the updated version of the inbox results
        stashes.log_event({
          alert: {
            alert_id: emberGet(alert, 'id'),
            user_id: app_state.get('referenced_user.id'),
            read: true
          }
        }, app_state.get('referenced_user.id'));
        _this.update_inbox({reads: [emberGet(alert, 'id')]});
      }
    },
    back: function() {
      this.set('current', null);
    },
    speak: function() {
      var text = this.get('current.text');
      if(text) {
        var alt_voice = speecher.alternate_voice && speecher.alternate_voice.enabled && speecher.alternate_voice.for_messages != false;
        speecher.speak_text(text, false, {alternate_voice: alt_voice});
      }
    },
    reply: function() {
      app_state.set('reply_note', this.get('current'));
      modal.close();
      modal.notice(i18n.t('compose_and_return_to_reply', "Compose your message and go back to the Alerts view to send your message"), true);
      // close modal, but set a flag somewhere that says you're in
      // reply mode, and change the speak-menu button to Send Reply
      // instead of Alerts
    },
    compose: function() {
      if(stashes.get('working_vocalization.length')) {
        if(app_state.get('reply_note')) {
          var user = this.get('reply_note.author');
          if(user) {
            user.user_name = user.user_name || user.name;
            user.avatar_url = user.avatar_url || user.image_url;
            modal.open('confirm-notify-user', {user: user, reply_id: app_state.get('reply_note.id'), raw: stashes.get('working_vocalization'), sentence: this.get('working_sentence'), utterance: null});
          }
        } else {
          modal.open('share-utterance', {utterance: stashes.get('working_vocalization')});
        }
      }
    },
    accept_pair: function() {
      var req = app_state.get('sessionUser.request_alert');
      app_state.set('referenced_user.request_alert', null);
      if(req && req.pair && req.pair.pair_code) {
        sync.confirm_pair(req.pair.pair_code, req.pair.partner_id);
      } else {
        sync.allow_followers();
      }
      modal.close();
    },
    reject_pair: function() {
      var req = app_state.get('sessionUser.request_alert');
      app_state.set('referenced_user.request_alert', null);
      if(req && req.pair && req.pair.pair_code) {
        // Rejecting explicit pairing
        sync.send(app_state.get('sessionUser.id'), {
          type: 'reject',
          pair_code: req.pair.pair_code,
          partner_id: req.pair.partner_id
        });
      } else if(req && req.follow) {
        // Rejecting follow request, prevent re-requests for 5 minutes 
        var follow_stamps = app_state.get('followers') || {};
        follow_stamps.ignore_until = (new Date()).getTime() + (5 * 60 * 1000);
        app_state.set('followers', follow_stamps);
      }
      modal.close();
    }
  }
});
