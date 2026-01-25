import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import Utils from '../utils/misc';
import persistence from '../utils/persistence';
import word_suggestions from '../utils/word_suggestions';
import LingoLinq from '../app';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    var supervisees = [];
    this.set('phrase', null);
    this.set('category', null);
    this.set('supervisees', supervisees);
    this.set('custom_phrase', null);
    this.set('for_user_id', this.get('model.user.id'));
    if(supervisees.length === 0 && !this.get('model.user')) {
      this.set('model.user', app_state.get('currentUser'));
      this.set('for_user_id', 'self');
    }
    this.load_recordings();
    var _this = this;
    if(this.get('model.board')) {
      var repo = {
        id: 'board_buttons',
        name: i18n.t('board_buttons', "Board Buttons"),
        description: i18n.t('select_buttons_to_record', "Browse through this board and its linked boards to find phrases that haven't been recorded yet"),
        categories: [],
        loading: true
      };
      var user_name = this.get('model.board.user_name');
      this.get('model.board').load_button_set(true).then(function(bs) {
        var categories = [];
        var cats_hash = {};
        bs.redepth(_this.get('model.board.id')).forEach(function(button) {
          if(button.board_key.split(/\//)[0] == user_name) {
            if(button && button.label && !button.hidden) {
              if(categories.indexOf(button.board_key) == -1) {
                categories.push(button.board_key);
                cats_hash[button.board_key] = [];
              }
              var phrase = {
                id: button.id.toString(),
                board_id: button.board_id,
                button_id: button.id,
                text: button.label || button.vocalization
              };
              if(button.sound_id) {
                phrase.sound = {
                  id: button.sound_id,
                  unloaded: true,
                };
              }
              cats_hash[button.board_key].push(phrase);
            }
          }
        });
        categories.forEach(function(name) {
          repo.categories.pushObject({
            id: name,
            name: name,
            phrases: cats_hash[name]
          });
        });
        _this.set('repository.loading', false);
      }, function() {
        emberSet(repo, 'error', true);
      });
      this.set('repository', repo);
    } else {
      this.set('repository', {loading: true});
      persistence.ajax('/api/v1/users/' + this.get('model.user.id') + '/message_bank_suggestions', {type: 'GET'}).then(function(res) {
        _this.set('repository', res[0]);
      }, function(err) {
        _this.set('repository', {error: true});
      });
    }
  },
  load_recordings: function(force) {
    if(this.get('model.user.id') && (!this.get('model.recordings') || force)) {
      var _this = this;
      Utils.all_pages('sound', {user_id: this.get('model.user.id')}, function(res) {
      }).then(function(res) {
        _this.set('model.recordings', res);
        _this.set('recordings', res);
      }, function(err) {
        modal.error(i18n.t('error_loading_user_recordings', "There was an unexpected error loading user recordings"));
      });
    } else {
      this.set('recordings', this.get('model.recordings'));
    }
  },
  align_repository: observer(
    'recordings',
    'repository.id',
    'repository.categories.length',
    function() {
      if(this.get('repository.id') && this.get('recordings')) {
        var sounds = this.get('recordings') || [];
        var sounds_hash = {};
        sounds.forEach(function(s) {
          (s.get('tags') || []).forEach(function(tag) {
            sounds_hash[tag] = s;
          });
        });
        var rep = this.get('repository');
        // iterate through categories
        (rep.categories || []).forEach(function(cat) {
          emberSet(cat, 'pending_sound', false);
          // check existing categories for matching sounds
          (cat.phrases || []).forEach(function(phrase) {
            if(emberGet(phrase, 'pending_sound')) {
              emberSet(phrase, 'sound', false);
              emberSet(phrase, 'pending_sound', false);
            }
            var tag = rep.id + ":" + cat.id + ":" + phrase.id;
            if(sounds_hash[tag]) {
              emberSet(phrase, 'sound', sounds_hash[tag]);
            } else if(!emberGet(phrase, 'sound')) {
              // try to fuzzy-match based on transcription
              var match_distance = phrase.text.length + 10;
              sounds.forEach(function(s) {
                var trans = s.get('transcription') && s.get('transcription').toLowerCase();
                if(trans) {
                  if(trans == phrase.text.toLowerCase()) {
                    emberSet(phrase, 'sound', s);
                    emberSet(phrase, 'pending_sound', true);
                    emberSet(cat, 'pending_sound', true);
                    match_distance = 0;
                  } else if(match_distance !== 0) {
                    var dist = word_suggestions.edit_distance(trans, phrase.text.toLowerCase());
                    if(dist < match_distance && dist < (Math.max(phrase.text.length, trans.length) * 0.15)) {
                      if((s.get('tags') || []).indexOf("not:" + tag) == -1) {
                        emberSet(phrase, 'sound', s);
                        emberSet(phrase, 'pending_sound', true);
                        emberSet(cat, 'pending_sound', true);
                      }
                    }
                  }
                }
              });
            }
          });
          // look for any recordings custom-added to the category
          sounds.forEach(function(s) {
            if(s.get('transcription') && (s.get('tags') || []).indexOf(rep.id + ":" + cat.id) != -1) {
              cat.phrases.pushObject({
                id: s.get('id'),
                text: s.get('transcription'),
                custom: true,
                sound: s
              });
            }
          });
        });
      }
      this.count_totals();
    }
  ),
  count_totals: function() {
    if(this.get('repository.id')) {
      var rep = this.get('repository');
      var total = 0;
      var recorded = 0;
      (rep.categories || []).forEach(function(cat) {
        var cat_sounds = 0;
        // remove any custom-added recordings that the user cleared
        var list = [];
        (cat.phrases || []).forEach(function(phrase) {
          if(!emberGet(phrase, 'custom') || emberGet(phrase, 'sound') || emberGet(phrase, 'pending_sound')) {
            list.push(phrase);
            // also tally while you're iterating
            if(emberGet(phrase, 'sound') && !emberGet(phrase, 'pending_sound')) {
              cat_sounds++;
            }
          }
        });
        emberSet(cat, 'phrases', list);
        emberSet(cat, 'recordings', cat_sounds);
        total = total + list.length;
        recorded = recorded + cat_sounds;
      });
      this.set('repository.total', total);
      this.set('repository.recorded', recorded);
    }
  },
  needs_user: computed('model.user', function() {
    return !this.get('model.user');
  }),
  update_user: observer('for_user_id', function() {
    var for_user_id = this.get('for_user_id');
    var current_user_id = this.get('model.user.id');
    if(this.get('model.user.id') == app_state.get('currentUser.id')) { current_user_id = 'self'; }
    if(for_user_id && current_user_id && for_user_id != current_user_id) {
      if(for_user_id == 'self' || for_user_id == app_state.get('currentUser.id')) {
        this.set('model.user', app_state.get('currentUser'));
      } else {
        var u = (app_state.get('currentUser.known_supervisees') || []).find(function(u) { return u.id == for_user_id; });
        u = u || LingoLinq.store.peekRecord('user', for_user_id);
        u = u || (app_state.get('quick_users') || {})[for_user_id];
        this.set('model.user', u);
      }
      this.load_recordings(true);
    }
  }),
  save_to_button: function(sound) {
    var _this = this;
    if(sound.get('id') && _this.get('phrase.saved_sound_id') == sound.get('id')) { return; }
    if(_this.get('phrase.button_id') && _this.get('phrase.board_id')) {
      persistence.ajax('/api/v1/boards/' + _this.get('phrase.board_id'), {
        type: 'POST',
        data: {
          '_method': 'PUT',
          'button': {
            id: _this.get('phrase.button_id'),
            sound_id: sound.get('id')
          }
        }
      }).then(function(data) {
        _this.set('phrase.saved_sound_id', sound.get('id'));
        LingoLinq.store.findRecord('board', data.board.id).then(function(b) { b.reload(); }, function() { });
      }, function() {
        modal.error(i18n.t('error_updating_button', "There was an unexpected error adding the sound to the button"));
      });
    }
  },
  actions: {
    decide_on_recording: function(decision) {
      var sound = this.get('phrase.sound');
      var _this = this;
      if(sound) {
        var tag = this.get('repository.id') + ":" + this.get('category.id') + ":" + this.get('phrase.id');
        if(this.get('phrase.custom')) {
          tag = this.get('repository.id') + ":" + this.get('category.id');
        }
        if(decision == 'reject') {
          tag = "not:" + tag;
        }
        sound.set('tag', tag);
        sound.save().then(function() {
          _this.set('phrase.pending_sound', false);
          if(decision == 'reject') {
            _this.set('phrase.sound', null);
          } else {
            _this.save_to_button(sound);
          }
          _this.count_totals();
        }, function(err) {
          modal.error(i18n.t('error_updating_recording', "There was an unexpected error while updating the recording settings"));
        });
      }
    },
    select_category: function(id) {
      var category = null;
      var next_category = null;
      var prev_category = null;
      (this.get('repository.categories') || []).forEach(function(cat) {
        if(cat.id == id) {
          category = cat;
        } else if(category && !next_category) {
          next_category = cat;
        } else if(!category) {
          prev_category = cat;
        }
      });
      this.set('category', category);
      this.set('next_category', next_category);
      this.set('phrase', null);
      this.set('custom_phrase', null);
      runLater(function() {
        $(".modal-content").scrollTop(0);
      });
    },
    select_phrase: function(id) {
      var phrase = null;
      var next_phrase = null;
      var prev_phrase = null;
      (this.get('category.phrases') || []).forEach(function(p) {
        if(id && p.id == id) {
          phrase = p;
        } else if(phrase && !next_phrase) {
          next_phrase = p;
        } else if(!phrase) {
          prev_phrase = p;
        }
      });
      this.set('phrase', phrase);
      this.set('next_phrase', next_phrase);
      if(this.get('phrase.sound.unloaded')) {
        var _this = this;
        LingoLinq.store.findRecord('sound', this.get('phrase.sound.id')).then(function(sound) {
          _this.set('phrase.sound', sound);
        }, function() {
          _this.set('phrase.sound.errored', true);
        });
      }
      runLater(function() {
        $(".modal-content").scrollTop(0);
      });
    },
    audio_ready: function(sound) {
      if(this.get('model.single')) {
        modal.close('batch-recording');
      } else if(this.get('phrase')) {
        this.set('phrase.sound', sound);
        this.save_to_button(sound);
        this.set('phrase.sound_unloaded', false);
        this.send('decide_on_recording', 'accept');
      }
    },
    audio_not_ready: function() {
      if(this.get('phrase')) {
        if(this.get('phrase.sound')) {
          this.send('decide_on_recording', 'reject');
        }
      }
    },
    add_phrase: function(confirm) {
      if(confirm) {
        if(this.get('custom_phrase.text')) {
          this.get('category.phrases').pushObject({
            id: (new Date()).getTime() + ":" + Math.random(),
            text: this.get('custom_phrase.text'),
            custom: true,
            pending_sound: true
          });
          this.set('category.pending_sound', true);
        }
        this.set('custom_phrase', null);
      } else {
        this.set('custom_phrase', {});
        runLater(function() {
          $("#custom_phrase_text").focus();
        }, 50);
      }
    },
    confirm_add_phrase: function() {
      this.send('add_phrase', 'confirm');
    },
    cancel_add_phrase: function() {
      this.set('custom_phrase', null);
    }
  }
});
