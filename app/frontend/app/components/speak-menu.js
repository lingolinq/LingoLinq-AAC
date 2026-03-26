import Component from '@ember/component';
import { getOwner } from '@ember/application';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { alias } from '@ember/object/computed';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import modalUtil from '../utils/modal';
import utterance from '../utils/utterance';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';

/**
 * Speak Menu Modal Component
 *
 * Converted from speak-menu template/controller to component for the
 * service-based modal system. Avoids route.render() so main content stays visible.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  stashes: service('stashes'),
  app_state: alias('appState'),
  tagName: '',

  init() {
    this._super(...arguments);
    // Components cannot use inject.controller; owner lookup is the supported pattern.
    this.set('applicationController', getOwner(this).lookup('controller:application'));
  },

  sharing_allowed: computed(
    'appState.currentUser',
    'appState.currentUser.preferences.sharing',
    function() {
      return (!this.get('appState.currentUser') && window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.sharing) || this.get('appState.currentUser.preferences.sharing');
    }
  ),
  working_vocalization_text: computed('stashes.working_vocalization', function() {
    var buttons = this.stashes.get('working_vocalization') || [{ label: 'no text' }];
    return buttons.map(function(b) { return b.label; }).join(' ');
  }),
  contraction: computed('working_vocalization_text', function() {
    var res = utterance.contraction();
    return res || { clearback: 0, label: "don't" };
  }),

  localeBoardModel: computed('appState.controller.model', 'applicationController.board.model', function() {
    var c = this.get('appState.controller');
    if (c && c.get && c.get('model')) {
      var m = c.get('model');
      var locs = m.get('readable_locales');
      if (locs && locs.length) { return m; }
    }
    var app = this.get('applicationController');
    if (app && app.get('board.model')) {
      var bm = app.get('board.model');
      if (bm && bm.get('readable_locales') && bm.get('readable_locales').length) {
        return bm;
      }
    }
    return null;
  }),

  showSpeakLocaleSection: computed(
    'app_state.speak_mode_possible',
    'app_state.currentBoardState.translatable',
    'localeBoardModel',
    function() {
      var sm = this.get('app_state.speak_mode_possible');
      var loc = this.get('app_state.currentBoardState.translatable') && this.get('localeBoardModel');
      return !!(sm || loc);
    }
  ),

  actions: {
    opening() {
      this.get('modal').setComponent(this);
      var utterances = this.stashes.get('remembered_vocalizations') || [];
      if (this.appState.get('currentUser')) {
        utterances = utterances.filter(function(u) { return u.stash; }).slice(0, 2);
        (this.appState.get('currentUser.vocalizations') || []).filter(function(v) { return !v.category || v.category === 'default'; }).forEach(function(u) {
          utterances.push({
            sentence: u.list.map(function(v) { return v.label; }).join(' '),
            vocalizations: u.list,
            stash: false
          });
        });
      }
      this.set('model', {});
      this.set('punctuation_menu', false);
      this.set('repeat_menu', false);
      this.set('rememberedUtterances', utterances.slice(0, 7));
      var height = this.appState.get('header_height');
      runLater(() => {
        var $el = $('#speak_menu').closest('.modal-dialog');
        if ($el.length) { $el.css('top', (height - 40) + 'px'); }
      }, 0);
      runLater(() => {
        var $el = $('#speak_menu').closest('.modal-dialog');
        if ($el.length) { $el.css('top', (height - 40) + 'px'); }
      }, 100);
    },
    closing() {},
    selectButton(button) {
      this.get('modal').close();
      if (button === 'remember') {
        this.appState.save_phrase(this.stashes.get('working_vocalization'));
      } else if (button === 'share') {
        if (this.stashes.get('working_vocalization.length')) {
          modalUtil.open('share-utterance', { utterance: this.stashes.get('working_vocalization') });
        }
      } else if (button === 'sayLouder') {
        this.appState.say_louder();
      } else {
        var existing = [].concat(this.stashes.get('working_vocalization') || []);
        var ids = existing.map(function(b) { return b.button_id + ':' + (b.board || {}).id; }).join('::');
        var already_there = (this.stashes.get('remembered_vocalizations') || []).find(function(list) {
          return ids === (list.vocalizations || []).map(function(b) { return b.button_id + ':' + (b.board || {}).id; }).join('::');
        });
        if (button.stash) {
          utterance.set('rawButtonList', button.vocalizations);
          utterance.set('list_vocalized', false);
          var list = (this.stashes.get('remembered_vocalizations') || []).filter(function(v) { return !v.stash && v.sentence !== button.sentence; });
          this.stashes.persist('remembered_vocalizations', list);
          if (existing.length > 0 && !already_there) {
            this.stashes.remember({ override: existing, stash: true });
          }
        } else {
          if (existing.length > 0 && !(this.stashes.get('remembered_vocalizations') || []).find(function(v) { return v.stash; })) {
            this.stashes.remember({ override: existing, stash: true });
          }
          this.appState.set_and_say_buttons(button.vocalizations);
        }
      }
    },
    end_insertion() {
      this.appState.set('insertion', null);
      this.get('modal').close();
    },
    reply_note() {
      if (this.appState.get('reply_note')) {
        var user = this.appState.get('reply_note.author');
        if (user) {
          emberSet(user, 'user_name', user.user_name || user.name);
          emberSet(user, 'avatar_url', user.avatar_url || user.image_url);
          var voc = this.stashes.get('working_vocalization') || [];
          var sentence = voc.map(function(v) { return v.label; }).join(' ');
          modalUtil.open('confirm-notify-user', { user: user, reply_id: this.appState.get('reply_note.id'), raw: this.stashes.get('working_vocalization'), sentence: sentence, utterance: null, scannable: true });
        }
      }
    },
    flip_text() {
      this.appState.flip_text();
      this.get('modal').close();
    },
    button_event(event, button, full_event) {
      if (event === 'speakMenuSelect') {
        var _this = this;
        var click = function() {
          if (_this.appState.get('currentUser.preferences.click_buttons') && _this.appState.get('speak_mode')) {
            speecher.click();
          }
          if (_this.appState.get('currentUser.preferences.vibrate_buttons') && _this.appState.get('speak_mode')) {
            capabilities.vibrate();
          }
        };
        if (button !== 'menu_repeat_button' && button !== 'menu_punctuation_button') {
          _this.get('modal').close();
        }
        if (button === 'menu_share_button') {
          modalUtil.open('share-utterance', { utterance: _this.stashes.get('working_vocalization'), inactivity_timeout: true, scannable: true });
          click();
        } else if (button === 'menu_repeat_button') {
          if (full_event.swipe_direction) {
            _this.get('modal').close();
            if (full_event.swipe_direction === 'e') {
              _this.appState.say_louder();
            } else if (full_event.swipe_direction === 'w') {
              _this.appState.say_louder(0.3);
            } else if (full_event.swipe_direction === 'n') {
              click();
              _this.appState.flip_text();
            } else if (full_event.swipe_direction === 's') {
              click();
              modalUtil.open('modals/big-button', { text: _this.get('working_vocalization_text'), text_only: _this.appState.get('referenced_user.preferences.device.button_text_position') === 'text_only' });
            }
          } else {
            _this.set('repeat_menu', !_this.get('repeat_menu'));
          }
        } else if (button === 'menu_repeat_louder') {
          _this.appState.say_louder();
        } else if (button === 'menu_repeat_quieter') {
          _this.appState.say_louder(0.3);
        } else if (button === 'menu_repeat_text') {
          click();
          modalUtil.open('modals/big-button', { text: _this.get('working_vocalization_text'), text_only: _this.appState.get('referenced_user.preferences.device.button_text_position') === 'text_only' });
        } else if (button === 'menu_repeat_flip') {
          click();
          _this.appState.flip_text();
        } else if (button === 'menu_repeat_gif') {
          click();
          modalUtil.open('modals/gif');
        } else if (button === 'menu_hold_thought_button') {
          _this.stashes.remember({ stash: true });
          utterance.clear();
          click();
        } else if (button === 'menu_phrases_button') {
          modalUtil.open('modals/phrases', { inactivity_timeout: true, scannable: true });
          click();
        } else if (button === 'menu_inbox_button') {
          modalUtil.open('modals/inbox', { inactivity_timeout: true, scannable: true });
          click();
        } else if (button === 'menu_repair_button') {
          if (full_event.swipe_direction) {
            _this.get('modal').close();
            if (full_event.swipe_direction === 'n') {
              speecher.oops();
            }
          } else {
            modalUtil.open('modals/repairs', { inactivity_timeout: true, scannable: true });
            click();
          }
        } else if (button === 'menu_contraction_button') {
          var contraction = _this.get('contraction');
          if (contraction) {
            utterance.apply_contraction(contraction);
          }
        } else if (button === 'menu_quote_button') {
          _this.appState.activate_button({ vocalization: '+"' }, { label: ',', vocalization: '+"', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_colon_button') {
          _this.appState.activate_button({ vocalization: '+:' }, { label: ',', vocalization: '+:', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_exclamation_button') {
          _this.appState.activate_button({ vocalization: '+!' }, { label: '!', vocalization: '+!', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_comma_button') {
          _this.appState.activate_button({ vocalization: '+,' }, { label: ',', vocalization: '+,', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_question_button') {
          _this.appState.activate_button({ vocalization: '+?' }, { label: '?', vocalization: '+?', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
        } else if (button === 'menu_period_button') {
          if (full_event.swipe_direction === 'e') {
            _this.appState.activate_button({ vocalization: '+!' }, { label: '!', vocalization: '+!', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          } else if (full_event.swipe_direction === 'w') {
            _this.appState.activate_button({ vocalization: '+,' }, { label: ',', vocalization: '+,', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          } else if (full_event.swipe_direction === 'n') {
            _this.appState.activate_button({ vocalization: '+?' }, { label: '?', vocalization: '+?', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          } else {
            _this.appState.activate_button({ vocalization: '+.' }, { label: '.', vocalization: '+.', prevent_return: true, button_id: null, source: 'speak_menu', board: { id: 'speak_menu', key: 'core/speak_menu' }, type: 'speak' });
          }
        } else if (button === 'menu_punctuation_button') {
          _this.set('ref', Math.random());
          _this.set('repeat_menu', false);
          _this.set('punctuation_menu', !_this.get('punctuation_menu'));
          click();
        } else {
          console.error('unrecognized button', button);
        }
      }
    },
    close() {
      modalUtil.set('speak_menu_last_closed', Date.now());
      this.get('modal').close();
    },

    set_board_locale(locale) {
      this.get('applicationController').send('set_locale', locale);
    },

    speak_mode_toggle(decision) {
      this.get('applicationController').send('toggleSpeakMode', decision);
      this.get('modal').close();
    },

    set_speak_mode_user(id, type) {
      this.get('applicationController').send('setSpeakModeUser', id, type);
      this.get('modal').close();
    },

    pick_speak_mode_user(type) {
      this.get('applicationController').send('pickSpeakModeUser', type);
      this.get('modal').close();
    }
  }
});
