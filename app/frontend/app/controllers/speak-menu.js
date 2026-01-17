import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import { inject as service } from '@ember/service';
import $ from 'jquery';
import stashes from '../utils/_stashes';
import app_state from '../utils/app_state';
import utterance from '../utils/utterance';
import speecher from '../utils/speecher';
import { set as emberSet } from '@ember/object';
import capabilities from '../utils/capabilities';
import LingoLinq from '../app';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

export default modal.ModalController.extend({
  appState: service('app-state'),
  stashes: service(),
  modal: service(),

  opening: function() {
    var utterances = this.stashes.get('remembered_vocalizations') || [];
    if(this.appState.get('currentUser')) {
      utterances = utterances.filter(function(u) { return u.stash; }).slice(0, 2);
      (this.appState.get('currentUser.vocalizations') || []).filter(function(v) { return !v.category || v.category == 'default'; }).forEach(function(u) {
        utterances.push({
          sentence: u.list.map(function(v) { return v.label; }).join(" "),
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
    $("#speak_menu").closest(".modal-dialog").css('top', (height - 40) + 'px');
    runLater(function() {
      $("#speak_menu").closest(".modal-dialog").css('top', (height - 40) + 'px');
    }, 100);
  },
  sharing_allowed: computed(
    'app_state.currentUser',
    'app_state.currentUser.preferences.sharing',
    function() {
      return (!this.get('app_state.currentUser') && window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.sharing) || this.get('app_state.currentUser.preferences.sharing');
    }
  ),
  working_vocalization_text: computed('stashes.working_vocalization', function() {
    var buttons = this.stashes.get('working_vocalization') || [{label: "no text"}];
    return buttons.map(function(b) { return b.label; }).join(" ");
  }),
  contraction: computed('working_vocalization_text', function() {
    var res = utterance.contraction();
    return res || {clearback: 0, label: "don't"};
  }),
  actions: {
    selectButton: function(button) {
      this.modal.close(true);
      if(button == 'remember') {
        app_state.save_phrase(this.stashes.get('working_vocalization'));
      } else if(button == 'share') {
        if(this.stashes.get('working_vocalization.length')) {
          this.modal.open('share-utterance', {utterance: this.stashes.get('working_vocalization')});
        }
      } else if(button == 'sayLouder') {
        app_state.say_louder();
      } else {
        var existing = [].concat(this.stashes.get('working_vocalization') || []);
        var ids = existing.map(function(b){ return b.button_id + ":" + (b.board || {}).id}).join('::');
        var already_there = (this.stashes.get('remembered_vocalizations') || []).find(function(list) { 
          return ids == (list.vocalizations || []).map(function(b) { return b.button_id + ":" + (b.board || {}).id}).join('::');
        });
        if(button.stash) {
          // If there is a working vocalization, swap it into the stash
          // when you swap this one out
          utterance.set('rawButtonList', button.vocalizations);
          utterance.set('list_vocalized', false);
          var list = (this.stashes.get('remembered_vocalizations') || []).filter(function(v) { return !v.stash && v.sentence != button.sentence; });
          this.stashes.persist('remembered_vocalizations', list);
          if(existing.length > 0 && !already_there) {
            stashes.remember({override: existing, stash: true});
          }
        } else {
          // If there is nothing in the held thought,
          // but there is a working vocalization, stash it
          if(existing.length > 0 && !(this.stashes.get('remembered_vocalizations') || []).find(function(v) { return v.stash; })) {
            stashes.remember({override: existing, stash: true});
          }
          app_state.set_and_say_buttons(button.vocalizations);
        }
      }
    },
    end_insertion: function() {
      this.appState.set('insertion', null);
      this.modal.close();
    },
    reply_note: function() {
      if(this.appState.get('reply_note')) {
        var user = this.appState.get('reply_note.author');
        if(user) {
          emberSet(user, 'user_name', user.user_name || user.name);
          emberSet(user, 'avatar_url', user.avatar_url || user.image_url);
          var voc = this.stashes.get('working_vocalization') || [];
          var sentence = voc.map(function(v) { return v.label; }).join(' ');
          this.modal.open('confirm-notify-user', {user: user, reply_id: this.appState.get('reply_note.id'), raw: this.stashes.get('working_vocalization'), sentence: sentence, utterance: null, scannable: true});
        }
      }
    },
    flip_text: function() {
      app_state.flip_text();
      this.modal.close(true);
    },
    button_event: function(event, button, full_event) {
      if(event == 'speakMenuSelect') {
        var click = function() {
          if(this.appState.get('currentUser.preferences.click_buttons') && this.appState.get('speak_mode')) {
            speecher.click();
          }
          if(this.appState.get('currentUser.preferences.vibrate_buttons') && this.appState.get('speak_mode')) {
            capabilities.vibrate();
          }
        };
        if(button != 'menu_repeat_button' && button != 'menu_punctuation_button') {
          this.modal.close(true);
        }
        if(button == 'menu_share_button') {
          this.modal.open('share-utterance', {utterance: this.stashes.get('working_vocalization'), inactivity_timeout: true, scannable: true});
          click();
        } else if(button == 'menu_repeat_button') {
          if(full_event.swipe_direction) {
            this.modal.close(true);
            if(full_event.swipe_direction == 'e') {
              app_state.say_louder();
            } else if(full_event.swipe_direction == 'w') {
              app_state.say_louder(0.3);
            } else if(full_event.swipe_direction == 'n') {
              click();
              app_state.flip_text();
            } else if(full_event.swipe_direction == 's') {
              click();
              this.modal.open('modals/big-button', {text: this.get('working_vocalization_text'), text_only: this.appState.get('referenced_user.preferences.device.button_text_position') == 'text_only'});
            }
          } else {
            this.set('repeat_menu', !this.get('repeat_menu'));
          }

          // right for louder, left for quieter, down for big button target, up for flip text
        } else if(button == 'menu_repeat_louder') {
          app_state.say_louder();
        } else if(button == 'menu_repeat_quieter') {
          app_state.say_louder(0.3);
        } else if(button == 'menu_repeat_text') {
          click();
          this.modal.open('modals/big-button', {text: this.get('working_vocalization_text'), text_only: this.appState.get('referenced_user.preferences.device.button_text_position') == 'text_only'});
        } else if(button == 'menu_repeat_flip') {
          click();
          app_state.flip_text();
        } else if(button == 'menu_repeat_gif') {
          click();
          this.modal.open('modals/gif');
        } else if(button == 'menu_hold_thought_button') {
          stashes.remember({stash: true});
          utterance.clear();
          click();
        } else if(button == 'menu_phrases_button') {
          this.modal.open('modals/phrases', {inactivity_timeout: true, scannable: true});
          click();
        } else if(button == 'menu_inbox_button') {
          this.modal.open('modals/inbox', {inactivity_timeout: true, scannable: true});
          click();
        } else if(button == 'menu_repair_button') {
          if(full_event.swipe_direction) {
            this.modal.close(true);
            if(full_event.swipe_direction == 'n') {
              speecher.oops();
            }
          } else {
            this.modal.open('modals/repairs', {inactivity_timeout: true, scannable: true});
            click();  
          }
        } else if(button == 'menu_contraction_button') {
          var contraction = this.get('contraction');
          if(contraction) {
            utterance.apply_contraction(contraction);
          }
        } else if(button == 'menu_quote_button') {
          app_state.activate_button({vocalization: '+"'}, {
            label: ',',
            vocalization: '+"',
            prevent_return: true,
            button_id: null,
            source: 'speak_menu',
            board: {id: 'speak_menu', key: 'core/speak_menu'},
            type: 'speak'
          });
        } else if(button == 'menu_colon_button') {
          app_state.activate_button({vocalization: '+:'}, {
            label: ',',
            vocalization: '+:',
            prevent_return: true,
            button_id: null,
            source: 'speak_menu',
            board: {id: 'speak_menu', key: 'core/speak_menu'},
            type: 'speak'
          });
        } else if(button == 'menu_exclamation_button') {
          app_state.activate_button({vocalization: '+!'}, {
            label: '!',
            vocalization: '+!',
            prevent_return: true,
            button_id: null,
            source: 'speak_menu',
            board: {id: 'speak_menu', key: 'core/speak_menu'},
            type: 'speak'
          });
        } else if(button == 'menu_comma_button') {
          app_state.activate_button({vocalization: '+,'}, {
            label: ',',
            vocalization: '+,',
            prevent_return: true,
            button_id: null,
            source: 'speak_menu',
            board: {id: 'speak_menu', key: 'core/speak_menu'},
            type: 'speak'
          });
        } else if(button == 'menu_question_button') {
          app_state.activate_button({vocalization: '+?'}, {
            label: '?',
            vocalization: '+?',
            prevent_return: true,
            button_id: null,
            source: 'speak_menu',
            board: {id: 'speak_menu', key: 'core/speak_menu'},
            type: 'speak'
          });
        } else if(button == 'menu_period_button') {
          if(full_event.swipe_direction == 'e') {
            app_state.activate_button({vocalization: '+!'}, {
              label: '!',
              vocalization: '+!',
              prevent_return: true,
              button_id: null,
              source: 'speak_menu',
              board: {id: 'speak_menu', key: 'core/speak_menu'},
              type: 'speak'
            });
          } else if(full_event.swipe_direction == 'w') {
            app_state.activate_button({vocalization: '+,'}, {
              label: ',',
              vocalization: '+,',
              prevent_return: true,
              button_id: null,
              source: 'speak_menu',
              board: {id: 'speak_menu', key: 'core/speak_menu'},
              type: 'speak'
            });
          } else if(full_event.swipe_direction == 'n') {
            app_state.activate_button({vocalization: '+?'}, {
              label: '?',
              vocalization: '+?',
              prevent_return: true,
              button_id: null,
              source: 'speak_menu',
              board: {id: 'speak_menu', key: 'core/speak_menu'},
              type: 'speak'
            });
          } else {
            app_state.activate_button({vocalization: '+.'}, {
              label: '.',
              vocalization: '+.',
              prevent_return: true,
              button_id: null,
              source: 'speak_menu',
              board: {id: 'speak_menu', key: 'core/speak_menu'},
              type: 'speak'
            });
          }
        } else if(button == 'menu_punctuation_button') {
          this.set('ref', Math.random());
          this.set('repeat_menu', false);
          this.set('punctuation_menu', !this.get('punctuation_menu'));
          click();
        } else {
          console.error("unrecognized button", button);
        }
      }
    },
    close: function() {
      modal.set('speak_menu_last_closed', Date.now());
      this.modal.close();
    }
  },
});
