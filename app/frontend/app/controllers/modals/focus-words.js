import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import { htmlSafe } from '@ember/template';
import { set as emberSet } from '@ember/object';
import Button from '../../utils/button';
import { computed,  observer } from '@ember/object';
import RSVP from 'rsvp';
import $ from 'jquery';
import stashes from '../../utils/_stashes';
import utterance from '../../utils/utterance';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import editManager from '../../utils/edit_manager';
import sync from '../../utils/sync';

export default modal.ModalController.extend({
  opening: function() {
    this.set('analysis', null);
    this.set('search', null);
    this.set('search_term', null);
    this.set('words', null);
    this.set('focus_id', null);
    this.set('ideas', null);
    this.set('navigated', null);
    this.set('browse', null);
    this.set('existing', null);
    this.set('reuse', null);
    if(window.webkitSpeechRecognition) {
      var speech = new window.webkitSpeechRecognition();
      if(speech) {
        speech.continuous = true;
        this.set('speech', {engine: speech});
      }
    }
  },
  analysis_subset: computed('analysis.found', function() {
    return (this.get('analysis.found') || []).slice(0, 3);
  }),
  analysis_extras: computed('analysis.found', function() {
    return (this.get('analysis.found') || []).slice(3);
  }),
  user_list: computed('model', 'model.user.focus_words', function() {
    var list = [];
    var _this = this;
    var hash = _this.get('model.user.focus_words') || {};
    var found_words = {};
    for(var name in hash) {
      if(hash[name] && hash[name].updated && !hash[name].deleted) {
        if(!found_words[hash[name].words]) {
          found_words[hash[name].words] = true;
          list.push({title: name, words: hash[name].words, user_name: _this.get('model.user.user_name'), updated: hash[name].updated});  
        }
      }
    }
    // Include modelee's focus words as well if any
    if(this.get('model.user.id') != app_state.get('referenced_user.id')) {
      hash = app_state.get('referenced_user.focus_words') || {};
      for(var name in hash) {
        if(hash[name] && hash[name].updated && !hash[name].deleted) {
          if(!found_words[hash[name].words]) {
            found_words[hash[name].words] = true;
            list.push({title: name, words: hash[name].words, user_name: app_state.get('currentUser.user_name'), updated: hash[name].updated});
          }
        }
      }
    }
    return list.sortBy('updated').reverse();
  }),
  recent_list: computed('model', 'user_list', function() {
    var res = [];
    var last = stashes.get('last_focus_words');
    if(last && last.user_id == app_state.get('sessionUser.id')) {
      res.push({title: last.title || i18n.t('last_focus_word_set', "Last Focus Word Set"), words: last.words, tmp: true});
    }
    var more = this.get('user_list').slice(0, 2);
    more.forEach(function(item) {
      if(res[0] && item.words == res[0].words) {
        res.shift();
      }
    });
    res = res.concat(more);
    if(stashes.get('working_vocalization.length') > 0)  {
      var str = utterance.sentence(stashes.get('working_vocalization') || []) || "";
      res.unshift({title: i18n.t('current_vocalization', "Current Vocalization Box Contents"), words: str, tmp: true});
    }
    return res;
  }),
  update_category_items: observer('model', 'browse', 'browse.category', 'user_list', function() {
    var _this = this;
    var cat = _this.get('browse.category.id');
    if(!cat) { return; }
    if(cat == 'saved') {
      _this.set('browse.items', _this.get('user_list'));
    } else {
      _this.set('browse', _this.get('browse') || {});
      _this.set('browse.pending', true);
      var opts = {sort: 'popularity'};
      if(cat == 'shared_reading') {
        opts.type = 'core_focus';
        opts.category = 'books';
        opts.valid = true;
      } else if(cat == 'activities') {
        opts.type = 'core_focus';
        opts.category = 'activities';
        opts.valid = true;
      } else if(cat == 'books') {
        opts.type = 'core_book';
        opts.valid = true;
      } else if(cat == 'other_focus') {
        opts.type = 'core_focus';
        opts.category = 'other';
        opts.valid = true;
      } else if(cat.match(/^tarheel_/)) {
        opts.type = 'tarheel_book';
        opts.category = cat.replace(/^tarheel_/, '');
        opts.valid = true;
      }
      if(opts.valid) {
        persistence.ajax('/api/v1/search/focus?q=&locale=' + (app_state.get('label_locale') || 'en').split(/-|_/)[0] + '&type=' + opts.type + '&category=' + opts.category + '&sort=' + opts.sort, {type: 'GET'}).then(function(list) {
          _this.set('browse.pending', false);
          _this.set('browse.items', list);
        }, function(err) {
          _this.set('browse.pending', false);
          _this.set('browse.error', true);  
        });  
      } else if(this.get('browse')) {
        _this.set('browse.pending', false);
        _this.set('browse.error', false);  
        _this.set('browse.items', null);  
      }
    }
  }),
  update_search_items: observer('search.term', 'user_list', function() {
    var _this = this;
    if(_this.get('search.term')) {
      var term = _this.get('search.term').toLowerCase();
      _this.set('search.loading', true);
      _this.set('search.error', false);
      var res = [];
      (_this.get('user_list') || []).forEach(function(item) {
        if(item.title.toLowerCase().includes(term) || item.words.toLowerCase().includes(term)) {
          res.push(item);
        }
      });
      persistence.ajax('/api/v1/search/focus?locale=' + (app_state.get('label_locale') || 'en').split(/-|_/)[0] + '&q=' + encodeURIComponent(_this.get('search.term') || ''), {type: 'GET'}).then(function(list) {
        _this.set('search.loading', false);
        res = res.concat(list);
        _this.set('search.results', res.slice(0, 20));
  
      }, function(err) {
        _this.set('search.loading', false);
        _this.set('search.results', res);  
      });
    }
  }),
  reuse_or_existing: computed('reuse', 'existing', function() {
    return this.get('reuse') || this.get('existing');
  }),
  stash_set: function() {
    var _this = this;
    stashes.persist('last_focus_words', {
      user_id: app_state.get('sessionUser.id'),
      words: _this.get('words'),
      title: _this.get('title')
    });
  },
  not_ready: computed('words_list', function() {
    return this.get('words_list').length == 0;
  }),
  search_or_browse: computed('search', 'browse', function() {
    return this.get('search') || this.get('browse');
  }),
  words_list: computed('words', function() {
    return (this.get('words') || '')
      .split(/[\n\s]+/)
      .map(function(s) { return s.replace(/[^\p{L}\p{N}_]/gu, ''); })
      .filter(function(s) { return s.length > 0; });
  }),
  browse_categories: computed('model', function() {
    var res = [];
    if(this.get('model.user')) {
      res.push({id: 'saved', title: i18n.t('saved_focus_word_sets', "Saved Focus Word Sets"), saved: true});
    }
    res.push({id: 'shared_reading', title: i18n.t('shared_reading_books', "Shared-Reading Books")});
    res.push({id: 'books', title: i18n.t('core_books', "Popular Core Workshop Books")});
    res.push({id: 'activities', title: i18n.t('context_activities', "Context-Specific Activities")});
    res.push({id: 'tarheel_Alph', title: i18n.t('tarheel_alphabet', "Tarheel Reader Alphabet Books")});
    res.push({id: 'tarheel_Anim', title: i18n.t('tarheel_animals', "Tarheel Reader Animals & Nature Books")});
    res.push({id: 'tarheel_ArtM', title: i18n.t('tarheel_art', "Tarheel Reader Art & Music Books")});
    res.push({id: 'tarheel_Biog', title: i18n.t('tarheel_biography', "Tarheel Reader Biography Books")});
    res.push({id: 'tarheel_Fair', title: i18n.t('tarheel_tales', "Tarheel Reader Fairy & Folk Tale Books")});
    res.push({id: 'tarheel_Fict', title: i18n.t('tarheel_fiction', "Tarheel Reader Fiction Books")});
    res.push({id: 'tarheel_Food', title: i18n.t('tarheel_food', "Tarheel Reader Food Books")});
    res.push({id: 'tarheel_Heal', title: i18n.t('tarheel_health', "Tarheel Reader Health Books")});
    res.push({id: 'tarheel_Hist', title: i18n.t('tarheel_history', "Tarheel Reader History Books")});
    res.push({id: 'tarheel_Holi', title: i18n.t('tarheel_holiday', "Tarheel Reader Holiday Books")});
    res.push({id: 'tarheel_Math', title: i18n.t('tarheel_math', "Tarheel Reader Math Books")});
    res.push({id: 'tarheel_Nurs', title: i18n.t('tarheel_nursery', "Tarheel Reader Nursery Rhyme Books")});
    res.push({id: 'tarheel_Peop', title: i18n.t('tarheel_people', "Tarheel Reader People & Places Books")});
    res.push({id: 'tarheel_Poet', title: i18n.t('tarheel_poetry', "Tarheel Reader Poetry Books")});
    res.push({id: 'tarheel_Recr', title: i18n.t('tarheel_recreation', "Tarheel Reader Recreation Books")});
    res.push({id: 'tarheel_Spor', title: i18n.t('tarheel_sports', "Tarheel Reader Sports Books")});
    res.push({id: 'other_focus', title: i18n.t('other_focus_sets', "Other Focus Word Sets")});
    return res;
  }),
  save_set: function() {
    var _this = this;
    var focus = _this.get('model.user.focus_words') || {};
    if(!_this.get('title')) {
      return;
    }
    var item = {words: _this.get('words'), updated: Math.round((new Date()).getTime() / 1000)};
    focus[_this.get('title')] = item;
    _this.set('model.user.focus_words', focus);
    _this.get('model.user').save().then(function() {
    }, function(err) {
      modal.error(i18n.t('error_saving_user', "Focus words failed to save"))
    });
  },
  actions: {
    find_source: function() {
      this.set('navigated', true);
      this.set('browse', null);
      this.set('search', {term: this.get('search_term')});
    },
    clear_search: function() {
      this.set('search', null);
    },
    browse: function(category) {
      this.set('navigated', true);
      this.set('search', null);
      this.set('browse', {ready: true});
      if(category) {
        this.set('browse.category', category);
      }
    },
    back: function(category) {
      if(category) {
        this.set('browse.category', null);
      } else {
        this.set('browse', null);
      }
    },
    remove_set: function(set) {
      var _this = this;
      var focus = _this.get('model.user.focus_words') || {};
      var found = focus[set.title];
      if(found) {
        emberSet(found, 'deleted', Math.round((new Date()).getTime() / 1000));
      }
      _this.set('model.user.focus_words', $.extend({}, focus));
      _this.get('model.user').save().then(function() {
      }, function(err) {
        emberSet(found, 'deleted', null);
      });
    },
    save_missing: function() {
      var _this = this;
      var user = _this.get('model.user');
      if(user) {
        var list = user.set('preferences.requested_phrase_changes') || [];
        (_this.get('analysis.missing') || []).forEach(function(str) {
          list = list.filter(function(p) { return (p != "add:" + str) && (p != "remove:" + str); });
          list.push("add:" + str);  
        });
        user.set('preferences.requested_phrase_changes', list);
        _this.set('ideas', {saving: true});
        user.save().then(function() {
          _this.set('ideas', {saved: true});
        }, function(err) {
          _this.set('ideas', {error: true});
          modal.error(i18n.t('error_saving_ideas', "Requested Ideas failed to save"))        
        })  
      }
    },
    record: function() {
      this.set('speech.ready', true);
    },
    speech_content: function(str) {
      var words = this.get('words') || "";
      if(words.length > 0) {
        words = words + "\n";
      }
      words = words + str;
      this.set('words', words);
    },
    speech_error: function() {
      this.set('speech.ready', false);
    },
    speech_stop: function() {
      this.set('speech.ready', false);
    },
    pick_set: function(set) {
      this.set('navigated', true);
      this.set('words', set.words);
      this.set('focus_id', set.id);
      this.set('title', set.tmp ? null : set.title);
      this.set('existing', true);
      this.set('browse', null);
      this.set('search', null);
      this.set('analysis', null);
    },
    set_focus_words: function() {
      var _this = this;
      var words = _this.get('words_list');
      if(_this.get('reuse')) {
        if(!_this.get('title')) { return; }
        _this.save_set();
      } else {
        _this.stash_set();
      }
      if(_this.get('focus_id') && app_state.get('currentUser')) {
        persistence.ajax('/api/v1/focus/usage', {
          type: 'POST',
          data: {
            focus_id: _this.get('focus_id')
          }
        }).then(function(data) { }, function(err) { });  
      }

      var focusRevision = Math.random();
      app_state.set('focus_words', {list: words, focus_id: focusRevision});
      var boardController = editManager.controller;
      if (boardController && boardController.get && boardController.get('model')) {
        boardController.get('model').set('focus_id', focusRevision);
      }
      modal.close();
      editManager.process_for_displaying();
      if(app_state.get('pairing') || app_state.get('followers.allowed')) {
        sync.send_update(app_state.get('referenced_user.id') || app_state.get('currentUser.id'), {assertion: {focus_words: words}});
      }
    },
    analyze_focus_words: function() {
      var _this = this;
      var words = _this.get('words_list');
      var model = _this.get('model');
      if(!model) {
        modal.error(i18n.t('focus_words_analyze_needs_user', "User information is not available. Try opening this screen again or signing in."));
        return;
      }
      var rootBoardId = _this.get('model.root_board_id');
      if(!rootBoardId) {
        modal.error(i18n.t('focus_words_analyze_needs_home_board', "Set or open a home board first. Analysis looks up each word on that board."));
        return;
      }
      if(_this.get('reuse')) {
        if(!_this.get('title')) { return; }
        _this.save_set();
      } else {
        _this.stash_set();
      }
      var locale = app_state.get('label_locale');
      _this.set('analysis', {loading: true});
      var board = null;
      var find_board = LingoLinq.store.findRecord('board', rootBoardId);
      var load_buttons = find_board.then(function(brd) {
        board = brd;
        return board.load_button_set();
      });
      var find_routes = load_buttons.then(function(set) {
        return set.find_routes(words, locale, board.get('id'), _this.get('model.user'));
      });
      find_routes.then(function(res) {
        console.log(res);
        res.found.forEach(function(btn) {
          var last_button = btn;
          [btn].concat(btn.sequence.buttons).forEach(function(btn) {
            var last = (last_button == btn);
            var style = "position: relative; display: inline-block; border-radius: 5px; height: 70px; text-align: center; min-width: 75px; max-width: 100px; overflow: hidden; font-size: 14px;";
            var big_style = "vertical-align: middle; position: relative; display: inline-block; border-radius: 5px; height: 100px; text-align: center; min-width: 100px; max-width: 120px; overflow: hidden; font-size: 16px;";
            var mini_style = "display: inline-block; padding: 5px 10px; border: 1px solid #888; border-radius: 5px; font-weight: bold; margin-right: 5px; min-width: 30px; text-align: center;"
            var print_style = "position: absolute; top: 0; left: 0; width: 100%;"
            style = style + "background: " + Button.clean_text(btn.background_color || '#fff') + "; ";
            style = style + "border: 2px solid " + Button.clean_text(btn.border_color || '#ccc') + "; ";
            big_style = big_style + "background: " + Button.clean_text(btn.background_color || '#fff') + "; ";
            big_style = big_style + "border: " + (last ? 4 : 2) + "px solid " + Button.clean_text(btn.border_color || '#ccc') + "; ";
            if(!last) {
              big_style = big_style + "opacity: 0.9; ";
            }
            print_style = print_style + " border-bottom: 100px solid " + Button.clean_text(btn.background_color || '#fff') + ";";
            mini_style = mini_style + "background: " + Button.clean_text(btn.background_color || '#fff') + "; ";
            mini_style = mini_style + "border: 1px solid " + Button.clean_text(btn.border_color || '#ccc') + "; ";

            if(window.tinycolor) {
              var fill = window.tinycolor(btn.background_color || '#fff');
              var text_color = window.tinycolor.mostReadable(fill, ['#fff', '#000']);
              style = style + 'color: ' + text_color + ';';
              big_style = big_style + 'color: ' + text_color + ';';
              mini_style = mini_style + 'color: ' + text_color + ';';
            }
            emberSet(btn, 'more_sequence', !last);  
            emberSet(btn, 'style', htmlSafe(style));  
            emberSet(btn, 'big_style', htmlSafe(big_style));
            emberSet(btn, 'mini_style', htmlSafe(mini_style));
            emberSet(btn, 'print_style', htmlSafe(print_style));
          });
        })
        _this.set('analysis', res);
      }, function() {
        debugger
        _this.set('analysis', {error: true});
      });
    },
    report: function() {
      var _this = this;
      var ready = RSVP.resolve({correct_pin: true});
      if(app_state.get('speak_mode') && app_state.get('currentUser.preferences.require_speak_mode_pin') && app_state.get('currentUser.preferences.speak_mode_pin')) {
        ready = modal.open('speak-mode-pin', {actual_pin: app_state.get('currentUser.preferences.speak_mode_pin'), action: 'none', hide_hint: app_state.get('currentUser.preferences.hide_pin_hint')});
      }
      ready.then(function(res) {
        if(res && res.correct_pin) {
          _this.set('model.analysis', _this.get('analysis'));
          _this.set('model.words', _this.get('words'));
          _this.set('model.title', _this.get('title'));
          app_state.set('focus_route', _this.get('model'));
          _this.transitionToRoute('user.focus', _this.get('model.user.user_name'));
        }

      });
    }
  }
});
