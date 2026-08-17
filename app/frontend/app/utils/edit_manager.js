import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { A as emberArray } from '@ember/array';
import { later as runLater, schedule as runSchedule } from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import LingoLinq from '../app';
import Button from './button';

// import stashes from './_stashes';
// import app_state from './app_state';
import contentGrabbers from './content_grabbers';
import modal from './modal';
// import persistence from './persistence';
import progress_tracker from './progress_tracker';
import word_suggestions from './word_suggestions';
import i18n from './i18n';
import { saveHomeBoard } from './home_board';
import { observer } from '@ember/object';
import utterance from './utterance';

/** True when fast_html can be shown ({{#if board.fast_html.html}}). Ember SafeString is truthy in JS even when empty. */
export function fastHtmlHasRenderableContent(fast) {
  if(!fast || fast.html == null) { return false; }
  var s = typeof fast.html.toString === 'function' ? fast.html.toString() : String(fast.html);
  return s.length > 0;
}

var editManager = EmberObject.extend({
  _services: {},
  get appState() {
    return (this._services && (this._services.appState || this._services.app_state)) || window.appState || (window.LingoLinq && window.LingoLinq.appState);
  },
  set appState(val) {
    this._services = this._services || {};
    this._services.appState = val;
  },
  get persistence() {
    return (this._services && this._services.persistence) || window.persistence || (window.LingoLinq && window.LingoLinq.persistence);
  },
  set persistence(val) {
    this._services = this._services || {};
    this._services.persistence = val;
  },
  get stashes() {
    return (this._services && this._services.stashes) || window.stashes || (window.LingoLinq && window.LingoLinq.stashes);
  },
  set stashes(val) {
    this._services = this._services || {};
    this._services.stashes = val;
  },

  setup: function(board, appState, persistence, stashes) {
    editManager.Button = Button;
    this.controller = board;
    this.appState = appState;
    this.persistence = persistence;
    this.stashes = stashes;
    if (appState) {
        this.set('app_state', appState); // Keeping this for now if referenced by property
        if(appState.controller) {
        appState.controller.addObserver('dragMode', function() {
            if(editManager.controller == board) {
            var newMode = appState.controller.get('dragMode');
            if(newMode != editManager.dragMode) {
                editManager.set('dragMode', newMode);
            }
            }
        });
        }
    }
    
    this.set('dragMode', false);
    var edit = editManager.get_stashes().get('current_mode') == 'edit';
    if(this.auto_edit.edits && this.auto_edit.edits[board.get('model.id')]) {
      edit = true;
      this.auto_edit.edits[board.get('model.id')] = false;
      editManager.get_stashes().persist('current_mode', 'edit');
    }
    this.swapId = null;
    this.stashedButtonToApply = null;
    this.clear_history();
  },
  set_drag_mode: function(enable) {
    if(this.appState && this.appState.controller) {
      this.appState.controller.set('dragMode', enable);
    }
  },
  edit_mode_triggers: observer('app_state.edit_mode', function() {
    if(this.controller && this.lucky_symbol.pendingSymbols && this.appState && this.appState.get('edit_mode')) {
      this.lucky_symbols(this.lucky_symbol.pendingSymbols);
      this.lucky_symbol.pendingSymbols = [];
    }

  }),
  /**
   * Handles long-press actions. In Speak Mode with inflections_overlay enabled,
   * shows the inflection options overlay (see docs/INFLECTIONS_LONG_PRESS_OVERLAY.md).
   * REFACTOR NOTE: Board display refactoring must preserve this path - long_press_mode
   * is invoked from raw_events.track_long_press and depends on grid_for + overlay_grid.
   */
  long_press_mode: function(opts) {
    if(!this.appState) { return; }
    var app = this.appState.controller;
    if(!this.appState.get('edit_mode')) {
      if(opts.button_id && this.appState.get('speak_mode') && this.appState.get('currentUser.preferences.long_press_edit_disabled')) {
        if(this.appState.get('speak_mode') && this.appState.get('currentUser.preferences.require_speak_mode_pin') && this.appState.get('currentUser.preferences.speak_mode_pin')) {
          modal.open('speak-mode-pin', {actual_pin: this.appState.get('currentUser.preferences.speak_mode_pin'), action: 'edit', hide_hint: this.appState.get('currentUser.preferences.hide_pin_hint')});
          return true;
        }
        if(this.appState.get('currentUser.preferences.long_press_edit')) {
          app.toggleMode('edit');
          return true;
        }
      }
      var routeName = this.appState.get('current_route') || '';
      var boardDetailCommunicate = routeName.indexOf('board-detail') !== -1 && this.controller && !this.controller.get('edit_mode');
      var inflectionsUser = this.appState.get('speak_mode') ? this.appState.get('referenced_user') : this.appState.get('currentUser');
      if((this.appState.get('speak_mode') || boardDetailCommunicate) && inflectionsUser && inflectionsUser.get('preferences.inflections_overlay')) {
        if(opts.button_id) {
          // INFLECTIONS OVERLAY: Long-press in Speak Mode (or board-detail communicate surface) shows inflection options.
          // grid_for() builds the 3x3 grid (nw,n,ne, w,c,e, sw,s,se) from button inflections.
          // overlay_grid() creates #overlay_container and appends to document.body.
          // TODO: scanning will require a reset, and looking for this
          // new mini-grid, but scanning can wait because how do you
          // open this overlay via scanning anyway? Idea: another button
          var grid = editManager.grid_for(opts.button_id);
          var $button = $(".button[data-id='" + opts.button_id + "']");
          var elem = $button[0];
          if(!elem && grid) {
            elem = editManager.synthetic_button_elem_for_overlay(opts.button_id, opts);
          }
          if(elem && grid && !modal.is_open() && !modal.is_open('highlight') && !modal.is_open('highlight-secondary')) {
            editManager.overlay_grid(grid, elem, opts);
          }
          return true;
        } else if(opts.radial_id && opts.radial_dom) {
          // TODO: look for handler for radial, it should return
          // a hash of button labels, images and callbacks to be rendered
          // around the original element:
          // [
          //   {location: 'n', label: 'more', image: 'https://...', callback: function() { }},
          //   {...} location 's', 'c', 'e', 'nw', etc.
          // ]
        }
      } else if(this.appState.get('default_mode') && opts.button_id) {
        var button = editManager.find_button(opts.button_id);
        if(button && (button.label || button.vocalization)) {
          modal.open('word-data', {word: (button.label || button.vocalization), button: button, usage_stats: null, user: this.appState.get('currentUser')});
        }
        return true;
      }
    }
  },
  synthetic_button_elem_for_overlay: function(button_id, opts) {
    var boardDom = this.appState.get('board_virtual_dom');
    if(!boardDom || !boardDom.button_from_id) { return null; }
    var virtualButton = boardDom.button_from_id(button_id);
    if(!virtualButton || virtualButton.left === undefined) { return null; }
    var pos = virtualButton;
    var $board = $('.board');
    if(!$board.length) { return null; }
    var boardRect = $board[0].getBoundingClientRect();
    var bounds = {
      top: boardRect.top + pos.top,
      left: boardRect.left + pos.left,
      width: pos.width || 100,
      height: pos.height || 100,
      right: boardRect.left + pos.left + (pos.width || 100),
      bottom: boardRect.top + pos.top + (pos.height || 100)
    };
    var button = this.find_button(button_id);
    var imageUrl = null;
    if(button) {
      imageUrl = (button.get ? button.get('local_image_url') || button.get('image') : button.local_image_url || button.image);
      if(typeof imageUrl !== 'string') { imageUrl = null; }
    }
    if(imageUrl && this.persistence && typeof this.persistence.find_url === 'function') {
      imageUrl = this.persistence.find_url(imageUrl);
    }
    var computedClass = (button && (button.get ? button.get('computed_class') : button.computed_class)) || 'button b__';
    var symbolEl = imageUrl ? { src: imageUrl, parentNode: { getAttribute: function() { return 'width: 100%; height: 100%;'; } } } : null;
    var lblHeight = 20;
    var innerLbl = { style: { display: '' }, getBoundingClientRect: function() { return { height: lblHeight }; } };
    var lblHolder = {
      getElementsByClassName: function() { return [innerLbl]; },
      getBoundingClientRect: function() { return { height: lblHeight }; }
    };
    return {
      getBoundingClientRect: function() { return bounds; },
      getElementsByClassName: function(name) {
        if(name === 'symbol') { return symbolEl ? [symbolEl] : []; }
        if(name === 'button-label-holder') { return [lblHolder]; }
        if(name === 'button-label') { return [innerLbl]; }
        return [];
      },
      getAttribute: function(attr) {
        if(attr === 'class') { return computedClass; }
        return null;
      }
    };
  },
  overlay_button_from: function(button, board) {
    return editManager.Button.create({
      overlay: true,
      board: board,
      id: button.get('id'),
      label: button.get('label'),
      image_id: button.get('image_id'),
      sound_id: button.get('sound_id'),
      part_of_speech: button.get('part_of_speech')
    });
  },
  parse_rules: function(str) {
    var lines = str.split(/\n/);
    var list = [];
    var subs = {};
    lines.forEach(function(line) {
      var quotes = line.match(/\"[^\"]+\"/g);
      var idx = 0;
      (quotes || []).forEach(function(quote) {
        idx++;
        subs["sub__" + idx] = quote;
        line.replace(quote, "sub__" + idx);
      });
      var parts = line.split(/=/);
      if(parts.length == 2 && parts[0] && parts[0].length > 0 && parts[1] && parts[1].length) {
        var replacement = parts.pop();
        var pre_words = parts[0].split(/\s+/);
        if(pre_words.length > 0) {
          pre_words.forEach(function(w, idx) {
            if(subs[w]) {
              pre_words[idx] = subs[w];
            }
          });
          pre_words.push(replacement);
          list.push(pre_words);
        }
      }
    });
    return list;
  },
  stringify_rules: function(obj) {
    var lines = [];
    if(obj && obj.length && !Array.isArray(obj[0])) {
      // Legacy issue with rules being a single array instead
      // of an array of arrays
      obj = [];
    }
    (obj || []).forEach(function(rule) {
      if(!rule) { return; }
      var str = rule[rule.length - 1];
      var line = rule.slice(0, -1).map(function(w) { 
        if(w.match(/\s|\=/)) {
          return "\"" + w + "\"";
        } else {
          return w;
        }
      }).join(" ");
      lines.push(line + "=" + str);
    });
    for(var str in obj) {
      var words = obj[str];
      if(str && words) {
      }
    }
    return lines.join("\n");
  },
  inflection_for_types: function(history, locale, inflection_shift) {
    if(!inflection_shift) {
      if(!locale || history.length == 0) {
        return {};
      }  
    }
    var inflections = {};

    // Greedy algorithm stops at the first match
    var lang = (this.appState.get('speak_mode') && this.appState.get('vocalization_locale')) || i18n.langs.preferred || i18n.langs.fallback || 'en';
    var lang_fallback = lang.split(/-|_/)[0];
    var rules = (i18n.lang_overrides[lang] || i18n.lang_overrides[lang_fallback] || {}).rules;
    if(!rules && lang.match(/^en/)) {
      rules = [
        // Verbs:
        //   pronoun (I, you, they, we): present (c)
        //     Y: * they always [look]
        {id: 'has_she_looked', type: 'verb', lookback: [{words: ['has', 'have', 'had', "hasn't", "haven't", "hadn't"]}, {words: ["you", "I", "he", "she", "it", "that", "this", "they"]}, {optional: true, type: 'adverb'}], inflection: 'past_participle', location: 'sw'},
        {id: 'is_she_looking', type: 'verb', lookback: [{words: ["is", "am", "was", "were", "be", "to be", "are", "isn't", "aren't", "wasn't", "weren't", "aren't"]}, {type: 'pronoun', optional: true}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}], inflection: 'present_participle', location: 's'},
        {id: 'you_look', type: 'verb', lookback: [{words: ["i", "you", "they", "we", "these", "those"]}, {optional: true, type: 'adverb'}], inflection: 'present', location: 'c'},
        //   verb (do, does, did, can, could, will, would, may, might, must, shall, should) pronoun (he, she, it) [adverb (never, already, etc.)]: present (n)
        {id: 'does_she_look', type: 'verb', lookback: [{words: ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should', "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {words: ["he", "she", "it", "that", "this", "they"]}, {optional: true, type: 'adverb'}], inflection: 'present', location: 'c'},
        {id: 'they_can_look', type: 'verb', lookback: [{words: ["he", "she", "it", "that", "this", "they"]}, {words: ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should', "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {optional: true, type: 'adverb'}], inflection: 'present', location: 'c'},
        // {id: 'has_she_looked'},
        //   pronoun (he, she, it) [adverb (never, already, etc.)]: simple_present (n)
        //     Y: * she never [looks]
        //     Y: that smells weird
        {id: 'she_looks', type: 'verb', lookback: [{words: ["he", "she", "it", "that", "this"]}, {optional: true, type: 'adverb'}], inflection: 'simple_present', location: 'n'},
        //   pronoun ()
        //   pronoun (he, she, you, etc.) [verb (is, are, were, etc.)] [not|adverb (never, probably, etc.)] verb (-ing, going): infinitive (e)
        //     Y: they are not wanting [to look]
        //     Y: tell me why she is wanting [to look]
        {id: 'he_is_looking_to_go', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["be", "is", "am", "are", "was", "were", "isn't", "aren't", "wasn't", "weren't"], optional: true}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}, {type: 'verb', match: /ing$/}], inflection: 'infinitive', location: 'e'},
        //   pronoun [verb (will, would, could, etc.)] verb (is, am, was) [not|adverb (never, already, etc.)]: present_participle (s)
        //     Y: he would be always [looking]
        //     Y: they can like [eating]
        //     Y: she hates [jumping]
        //     N: she hates [to jump]
        //     N: is there a reason she would want [to jump]
        {id: 'would_she_want_to_look', type: 'verb', lookback: [{words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "do", "does", "don't", "doesn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {type: 'pronoun'}, {type: 'verb', words: ['like', 'want']}, {optional: true, type: 'adverb'}], inflection: 'infinitive', location: 'e'},
        {id: 'she_wants_to_look', type: 'verb', lookback: [{type: 'pronoun'}, {optional: true, type: 'adverb'}, {type: 'verb', words: ['wanted', 'want', 'wants']}], inflection: 'infinitive', location: 'e'},
        {id: 'she_likes_looking', type: 'verb', lookback: [{type: 'pronoun'}, {optional: true, type: 'adverb'}, {type: 'verb', words: ['like', 'likes', 'liked']}], inflection: 'present_participle', location: 's'},
        {id: 'she_can_want_to_look', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "do", "does", "did", "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"], optional: true}, {optional: true, words: ['not']}, {optional: true, type: 'adverb'}, {type: 'verb', words: ['want']}], inflection: 'infinitive', location: 'e'},
        {id: 'they_can_like_to_look', type: 'verb', lookback: [{type: 'pronoun'}, {optional: true, type: 'adverb'}, {type: 'verb', words: ['can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should', "do", "does", "did", "didn't", "don't", "doesn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {optional: true, words: ['not']}, {type: 'verb', words: ['like', 'likes', 'want', 'wants']}], inflection: 'infinitive', location: 'e'},
        {id: 'have_looked', type: 'verb', lookback: [{optional: true, type: 'pronoun'}, {words: ["being", "doing", "has", "have", "had", "hasn't", "haven't", "hadn't"]}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}], inflection: 'past_participle', location: 'sw'},
        {id: 'should_not_look', type: 'verb', lookback: [{words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "do", "does", "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {words: ['not'], optional: true}, {optional: true, type: 'adverb'}], inflection: 'default', location: 'c'},
        {id: 'she_is_looking', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "do", "does", "don't", "doesn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"], optional: true}, {type: 'verb'}, {optional: true, type: 'adverb'}], inflection: 'present_participle', location: 's'},
        {id: 'she_likes_not_looking', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "do", "does", "don't", "doesn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"], optional: true}, {type: 'verb'}, {optional: true, words: ["not"]}], inflection: 'present_participle', location: 's'},
        {id: 'would_she_think_looking', type: 'verb', lookback: [{words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {type: 'pronoun'}, {type: 'verb'}, {optional: true, type: 'adverb'}], inflection: 'present_participle', location: 's'},
        {id: 'hope_for_eating', type: 'verb', lookback: [{type: 'verb'}, {words: ['for', 'from']}], inflection: 'present_participle', location: 's'},
        //   verb (being, have, has, had) [adverb] [not]: past (w)
        //     Y: I have always looked
        //     Y: have looked
        //     Y: he had eaten
        //     Y: she has taken some more
        //     N: I have to look at this
        //     N: she had looked happier before
        //   verb (have, has, had) pronoun (I, you, she) [adverb] [not]: past (w)
        //     Y: have you looked at this
        //     Y: tell me why has she 
        //     N: have you taken your medicine (past participle)
        {id: 'have_you_looked', type: 'verb', lookback: [{words: ["have", "has", "had", "haven't", "hasn't", "hadn't"]}, {type: 'pronoun'}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}], inflection: 'past_participle', location: 'sw'},
        //   verb (have, has, had) [not] been: present_participle (s)
        //     Y: I have not been looking
        //     N: She has been taken
        {id: 'have_been_looking', type: 'verb', lookback: [{words: ["have", "has", "had", "haven't", "hasn't", "hadn't"]}, {words: ["not"], optional: true}, {words: ["been"]}], inflection: 'present_participle', location: 's'},
        //   verb (can, could, will, etc.) [not] be: present participle
        //     Y: he could be thinking about tomorrow
        //     N: it should be finished by now (past participle)
        {id: 'can_be_looking', type: 'verb', lookback: [{words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {words: ["not"], optional: true}, {words: ["be"]}], inflection: 'present_participle', location: 's'},
        //   verb (is, am, was, be, are, were, etc.) [pronoun (he, she, it, etc.)] [not]: present_participle (s)
        //     Y: the cat is licking her paws
        //     N: the frog was forgotten
        //   verb (do, does, did, etc.) pronoun (he, she, it, etc.) [not]: present (c)
        //   verb (do, does, did, etc.) [determiner] noun: present (c)
        //   noun (singular): simple_present (n)

        // [jumping] am, on?, in?, are, is, go, off, on, prepositions?, there?, was, were, are, am, stop, the, because, done, no, not, together, lot, wether, than, favorite, perfect, silly, serious, own, me, him, her, them, us, -self, usual, despite, because, maybe, however, although
        {id: 'still_laughing', type: 'verb', lookback: [{words: ['before', 'am', 'are', "aren't", 'is', "isn't", 'there', 'was', "wasn't", 'were', "weren't", 'are', "aren't", 'am', 'stop', 'the', 'because', 'done', 'no', 'not', 'together', 'than', 'own', 'usual', 'despite', 'maybe', 'however', 'although', 'usually', 'still']}], inflection: 'present_participle', location: 's'},
        {id: 'over_laughing', type: 'verb', lookback: [{type: 'preposition', words: ['on', 'off', 'here', 'there', 'over', 'under']}], inflection: 'present_participle', location: 's'},
        {id: 'his_laughing', type: 'verb', lookback: [{type: 'pronoun', words: ['my', 'his', 'her', 'our', 'their', 'mine', 'hers', 'ours', 'theirs', 'myself', 'himself', 'herself', 'themselves', 'ourselves']}], inflection: 'present_participle', location: 's'},

        
        {id: 'did_the_dog_look', type: 'verb', lookback: [{words: ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should', "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {type: "determiner"}, {type: 'noun'}], inflection: 'present', location: 'c'},
        {id: 'did_my_dog_look', type: 'verb', lookback: [{words: ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should', "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "mayn't", "mightn't", "mustn't", "shan't", "shouldn't"]}, {type: 'pronoun'}, {type: 'noun'}], inflection: 'present', location: 'c'},
        {id: 'has_the_dog_eaten', type: 'verb', lookback: [{words: ['have', 'has', 'had', "haven't", "hasn't", "hadn't"]}, {type: 'determiner'}, {type: 'noun'}], inflection: 'past_participle', location: 'sw'},
        {id: 'has_my_dog_eaten', type: 'verb', lookback: [{words: ['have', 'has', 'had', "haven't", "hasn't", "hadn't"]}, {type: 'pronoun'}, {type: 'noun'}], inflection: 'past_participle', location: 'sw'},
        {id: 'dog_looks', type: 'verb', lookback: [{type: "noun", non_match: /[^s]s$/}], inflection: 'simple_present', location: 'n'},
        //   will: present (c)
        // Nouns: 
        //   plural determiners (those, these, some, many): plural (n)
        {id: 'these_dogs', type: 'noun', lookback: [{words: ["those", "these", "some", "many"]}], inflection: 'plural', location: 'n'},
        //   else: base (c)
        // Pronouns:
        //   (at, for, with): objective (n)
        {id: 'with_her', type: 'pronoun', lookback: [{words: ["at", "for", "with"]}], inflection: 'objective', location: 'n'},

        //   pronoun (that, it, this) verb (is, was): objective (n)
        {id: 'it_is_his', type: 'pronoun', lookback: [{words: ["this", "that", "it"]}, {type: 'adverb', optional: true}, {words: ["is", "was", "be"]}, {words: ["not"], optional: true}], inflection: 'possessive_adjective', location: 'w'},
        // [him/her/me/you/them/us] want, like, to, in, help, tell, near, over, under, for, preposition, give, get, make, not, stop, hello, goodbye, from, feed, bite, suck, hug, kiss, it's, count, around, beneath, among, beyond, visit, bug
        {id: 'about_him', type: 'pronoun', lookback: [{words: ["about", "to", "tell", "for", "give", "get", "make", "not", "from", "among"]}], inflection: 'objective', location: 'n'},
        {id: 'these_are_his', type: 'pronoun', lookback: [{words: ["these", "those", "they", "we"]}, {type: 'adverb', optional: true}, {words: ["are", "were", "be"]}], inflection: 'possessive_adjective', location: 'w'},
        {id: 'i_am_him', type: 'pronoun', lookback: [{type: 'verb', words: ['am', 'was', 'were', 'are', 'be', 'been', 'being']}], inflection: 'objective', location: 'n'},
        {id: 'i_think_he', type: 'pronoun', lookback: [{type: 'verb', words: ['think', 'hope', 'wish', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'will', 'would' ,'may', 'might', 'must', 'shall', 'should', 'are']}], inflection: 'default', location: 'c'},
        // [his/her/my/your/their/our] eat, on, up, play, drink, off, down, out, is, are, read, use, wear, all, at, of, eat, drink, taste, lick, left, across, into, where's, lost, lower, raise, hide, lose, start, exit, run, turn, return, check, finish, continue, begin, improve, honor, change, reduce, grow, expand, shrink, it's, refill, drink, swallow, feel, communicate, resolve, describe, explain, represent, spray, scrub, wipe, wash, clean, learn, study, cheat, type, become, exercise, play, ponder, 
        {id: 'eat_my', type: 'pronoun', lookback: [{words: ['eat', 'on', 'up', 'off', 'in', 'out', 'down', 
                  'drink', 'is', 'are', 'read', 'use', 'wear', 'all', 'of', 'eat', 'drink', 'taste', 'lick', 
                  'left', 'across', 'into', "where's", 'lost', 'lose', 'lower', 'raise', 'hide', 'start', 
                  'exit', 'run', 'turn', 'return', 'check', 'finish', 'continue', 'begin', 'improve', 'honor', 
                  'change', 'reduce', 'grow', 'expand', 'shrink', "it's", 'refill', 'drink', 'swallow', 'feel',
                  'communicate', 'resolve', 'describe', 'explain', 'represent', 'spray', 'scrub', 'wipe', 
                  'wash', 'clean', 'learn', 'study', 'cheat', 'type', 'become', 'exercise', 'play', 'ponder']}], inflection: 'possessive_adjective', location: 'w'},
        {id: 'all_by_myself', type: 'pronoun', lookback: [{words: ['all', 'not']}, {words: ['by', 'with']}], inflection: 'reflexive', location: 'e'},
        // [himself/herself/myself/ourself] by, view, prepare, settle, repeat, defend
        {id: 'view_yourself', type: 'pronoun', lookback: [{words: ['view', 'prepare', 'settle', 'repeat', 'defend']}], inflection: 'reflexive', location: 'e'},
        {id: 'near_me', type: 'pronoun', lookback: [{type: 'preposition'}], inflection: 'objective', location: 'n'},
        {id: 'i_like_him', type: 'pronoun', lookback: [{type: 'verb'}], inflection: 'objective', location: 'n'},
        {id: 'with_him', type: 'pronoun', lookback: [{words: ['than', 'with', 'as', 'before', 'after']}], inflection: 'objective', location: 'n'},
        {id: 'hug_me', type: 'pronoun', lookback: [{type: 'verb'}], inflection: 'objective', location: 'n'},
        {id: 'i_am_his', type: 'pronoun', lookback: [{type: 'pronoun'}, {type: 'adverb', optional: true}, {type: 'verb', words: ["is", "am", "are", "be"]}], inflection: 'possessive_adjective', location: 'w'},
      ];
      rules.fallback_list = true;
    }
    if(!rules || rules.length == 0) {
      return {};
    }
    var matches = function(rule, history) {
      if(history.length == 0 && !inflection_shift) { return false; }
      var history_idx = history.length - 1;
      var valid = true;
      for(var idx = rule.lookback.length - 1; idx >= 0 && valid; idx--) {
        var item = history[history_idx]
        var check = rule.lookback[idx];
        if(!item) { 
          if(!check.optional) {
            valid = false;
          }
        } else {
          var label = item.label.toLowerCase();
          var matching = false;
          if(check.words) {
            if(check.words.indexOf(label) != -1) {
              matching = true;
            }
          } else if(check.type) {
            if(item.part_of_speech == check.type) {
              matching = true;
            }
          }
          if(matching) {
            if(check.match) {
              if(!label.match(check.match)) {
                matching = false;
              }
            }
            if(check.non_match) {
              if(label.match(check.non_match)) {
                matching = false;
              }
            }  
          }
          if(matching) {
            history_idx--;
          } else if(!check.optional) {
            valid = false;
          }
        }
      }
      if(valid) {
        // console.log("INFLECTIONS", valid);
      }
      return valid;
    };
    if(inflection_shift) {
      inflections["*"] = {type: 'override', location: inflection_shift};
    } else if(history.length > 0) {
      // TO BE verb overrides
      var overrides = [];
      if(rules.fallback_list) {
        overrides.push({type: 'override', lookback: [{words: ["i"]}, {type: 'adverb', optional: true}], callback: function(inflections) {
          inflections["is"] = {type:'override', label: "am"};
          inflections["are"] = {type:'override', label: "am"};
          inflections["does"] = {type:'override', label: "do"};
          inflections["has"] = {type:'override', label: "have"};
          inflections["were"] = {type:'override', label: "was"};
          inflections["no"] = {type:'override', label: "don't"};
          inflections["not"] = {type:'override', label: "am not"};
        }});
        overrides.push({type: 'override', lookback: [{type: 'pronoun'}, {type: 'adverb', optional: true}, {words: ["feel", "feels", "felt", "feeling"]}], callback: function(inflections) {
          inflections["like"] = {type:'override', label: "like"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["you", "we", "they"]}, {type: 'adverb', optional: true}], callback: function(inflections) {
          inflections["is"] = {type:'override', label: "are"};
          inflections["am"] = {type:'override', label: "are"};
          inflections["was"] = {type:'override', label: "were"};
          inflections["does"] = {type:'override', label: "do"};
          inflections["has"] = {type:'override', label: "have"};
          inflections["no"] = {type:'override', label: "don't"};
          inflections["not"] = {type:'override', label: "aren't"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["those", "these"]}, {type: 'adverb', optional: true}], callback: function(inflections) {
          inflections["is"] = {type:'override', label: "are"};
          inflections["am"] = {type:'override', label: "are"};
          inflections["was"] = {type:'override', label: "were"};
          inflections["no"] = {type:'override', label: "don't"};
          inflections["not"] = {type:'override', label: "aren't"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["he", "she"]}, {type: 'adverb', optional: true}], callback: function(inflections) {
          inflections["am"] = {type:'override', label: "is"};
          inflections["is"] = {type:'override', label: "is"};
          inflections["were"] = {type:'override', label: "was"};
          inflections["no"] = {type:'override', label: "doesn't"};
          inflections["not"] = {type:'override', label: "isn't"};
          inflections["done"] = {type:'override', label: "does"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["can", "will", "could", "should", "would", "may", "might", "must", "shall"]}, {words: ["it", "that", "this", "he", "she", "they", "i", "we"]}, {type: 'adverb', optional: true}], callback: function(inflections) {
          inflections["am"] = {type:'override', label: "be"};
          inflections["is"] = {type:'override', label: "be"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["it", "that", "this"]}, {type: 'adverb', optional: true}], callback: function(inflections) {
          inflections["am"] = {type:'override', label: "is"};
          inflections["is"] = {type:'override', label: "is"};
          inflections["were"] = {type:'override', label: "was"};
          inflections["no"] = {type:'override', label: "doesn't"};
          inflections["not"] = {type:'override', label: "isn't"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["what"]}], callback: function(inflections) {
          inflections["happen"] = {type:'override', label: "happened"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["will", "won't", "can", "can't", "do", "don't"]}], callback: function(inflections) {
          inflections["am"] = {type:'override', label: "be"};
          inflections["is"] = {type:'override', label: "be"};
        }});
        overrides.push({type: 'override', lookback: [{words: ["is", "are", "am", "be"]}, {words: ["she", "he", "i", "they", "we", "you"], optional: true}], callback: function(inflections) {
          inflections["I"] = {type:'override', label: "my"};
          inflections["done"] = {type:'override', label: "done"};
        }});
      }

      utterance.first_rules(rules.concat(overrides), history).forEach(function(rule) {
        if(rule.callback) {
          rule.callback(inflections);
        } else if(rule.type == 'override') {
          if(rule.overrides) {
            for(var before in rule.overrides) {
              inflections[before] = inflections[before] || {type: 'override', label: rule.overrides[before], condense_items: rule.condense_items};
            }
          }
        } else {
          inflections[rule.type] = rule;
        }
      });

      inflections["can"] = {type:'override', label: "can"};
      inflections["can't"] = {type:'override', label: "can't"};
      inflections["could"] = {type:'override', label: "could"};
      inflections["couldn't"] = {type:'override', label: "couldn't"};
      inflections["will"] = {type:'override', label: "will"};
      inflections["would"] = {type:'override', label: "would"};
      inflections["wouldn't"] = {type:'override', label: "wouldn't"};
      inflections["may"] = {type:'override', label: "may"};
      inflections["might"] = {type:'override', label: "might"};
      inflections["must"] = {type:'override', label: "must"};
      inflections["mustn't"] = {type:'override', label: "mustn't"};
      inflections["shall"] = {type:'override', label: "shall"};
      inflections["shan't"] = {type:'override', label: "shan't"};
      inflections["should"] = {type:'override', label: "should"};
      inflections["shouldn't"] = {type:'override', label: "shouldn't"};
      inflections["ought"] = {type:'override', label: "ought"};
      inflections["oughtn't"] = {type:'override', label: "oughtn't"};
    }

    return inflections;
  },
  update_inflections: function(buttons, inflections_for_type, translations_hash, locale) {
    var arr = [];
    for(var key in inflections_for_type) {
      var ref = inflections_for_type[key];
      ref.key = key;
      arr.push(ref);
    }
    arr = arr.reverse().sort(function(a, b) { 
      if(a.key == '*') {
        return -1;
      } else if(b.key == '*') {
        return 1;
      } else if(a.key.match(/^btn/)) {
        return -1;
      } else if(b.key.match(/^btn/)) {
        return 1;
      } else if(a.type == 'override') {
        return -1;
      } else if(b.type == 'override') {
        return 1;
      } else {
        return 0;
      }
    });
    var res = [];
    translations_hash = translations_hash || {};
    buttons.forEach(function(button) {
      var updated_button = null;
      // TODO: level should be applied already, but make sure
      var unlinked = !button.load_board || button.link_disabled;
      // For now, skip if there are manual inflections because we
      // don't know for sure if those inflections match
      // the auto-location rules
      var trans_btn = (locale && translations_hash[button.id] && (translations_hash[button.id][locale] || {})) || 
          (locale && translations_hash[button.id] && (translations_hash[button.id][locale.split(/-|_/)[0]] || {})) || 
          button;
      var rules = trans_btn.rules || [];
      if(rules && rules.length && !Array.isArray(rules[0])) {
        rules = [];
      }
      var possible_auto_inflects = (!button.inflections && !trans_btn.inflections) || rules.length > 0;
      if(possible_auto_inflects && !button.vocalization && (unlinked || button.inflect || button.add_vocalization)) {
        arr.forEach(function(infl) {
          if(updated_button) { return; }
          if(infl.key == "btn" + button.id) {
            updated_button = Object.assign({}, button);
            updated_button.original_label = button.original_label || button.label;
            updated_button.label = infl.label;
            if(infl.board_id) {
              updated_button.load_board = { id: infl.board_id, key: infl.board_key };
            }
            if(infl.image && updated_button.original_label == updated_button.label) {
              updated_button.image = infl.image;
              updated_button.image_id = infl.image_id;
            } else if(infl.image === false) {
              updated_button.text_only = true;
            } else {
              // Otherwise just use whatever was there before, image-wise
            }
            updated_button.tweaked = true;
          } else if(infl.key == "*" && infl.location) {
            var new_label = button.inflection_defaults && button.inflection_defaults[infl.location];
            if(!new_label) {
              var grid = editManager.grid_for(button) || [];
              new_label = (grid.find(function(i) { return i.location == infl.location; }) || {}).label;
            }
            (rules || []).forEach(function(list) {
              if(list[0] == ":" + infl.location) {
                new_label = list[list.length - 1];
              }
            });
            if(new_label) {
              updated_button = Object.assign({}, button);
              if(new_label.match(/^_/)) {
                new_label = new_label.substring(1);
                updated_button.text_only = true;
              }
              updated_button.original_label = button.original_label || button.label;
              updated_button.label = new_label;
              updated_button.tweaked = true;
            }
          } else if(infl.key == button.label && infl.type == 'override') {
            updated_button = Object.assign({}, button);
            updated_button.original_label = button.original_label || button.label;
            updated_button.label = infl.label;
            updated_button.tweaked = true;
          } else if(button.part_of_speech == infl.key && infl.type != 'override') {
            updated_button = Object.assign({}, button);
            var new_label = button.inflection_defaults && button.inflection_defaults[infl.location];
            if(!new_label) {
              var grid = editManager.grid_for(button) || [];
              new_label = (grid.find(function(i) { return i.location == infl.location; }) || {}).label;
            }
            if(new_label) {
              updated_button.original_label = button.original_label || button.label;
              updated_button.label = new_label;
              updated_button.tweaked = true;
            }
          }
          if(updated_button) {
            updated_button.condense_items = infl.condense_items;
            // Keep speak text aligned with inflected label when vocalization
            // was not manually set to something different.
            var base_voc = button.vocalization;
            var base_label = button.original_label || button.label;
            if(!base_voc || base_voc === base_label) {
              updated_button.vocalization = updated_button.label;
            }
          }
        });
      }
      res.push(updated_button || Object.assign({}, button));
    });
    return res;
  },
  /**
   * Builds the inflection options grid for a button (nw, n, ne, w, c, e, sw, s, se).
   * Used by the long-press inflections overlay in Speak Mode.
   * REFACTOR NOTE: See docs/INFLECTIONS_LONG_PRESS_OVERLAY.md - ensure button lookup
   * and inflection resolution still work if board/button rendering changes.
   */
  grid_for: function(button_id) {
    var button = button_id;
    if(!button || !button.id) {
      button = editManager.find_button(button_id);
    }
    if(!this.controller || !this.appState.controller) { return; }
    var expected_inflections_version = 2;
    var board = this.controller.get('model');
    var res = [];
    if(!button) { return null; }
    var select_button = function(label, vocalization, event) {
      var overlay_button = editManager.overlay_button_from(button, board);
  
      editManager.appState.controller.activateButton(overlay_button, {
        board: editManager.controller.get('model'),
        overlay_label: label,
        overlay_vocalization: vocalization,
        event: event,
        trigger_source: 'overlay',
        overlay_location: event.overlay_location
      });
    };
    var voc_locale = this.appState.get('vocalization_locale') || navigator.language;
    var lab_locale = this.appState.get('label_locale') || navigator.language;
    var base_label = button.original_label || button.label;
    var trans = (board.get('translations') || {})[button_id];
    var voc = (trans || {})[voc_locale] || (trans || {})[voc_locale.split(/-|_/)[0]];
    var lab = (trans || {})[lab_locale] || (trans || {})[lab_locale.split(/-|_/)[0]];
    var locs = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    var list = [];
    var ignore_defaults = false;
    var defaults_allowed = true;
    // If the button has been set to a different part of speech than
    // what the defaults were expecting, don't use the defaults
    if(button.inflection_defaults && button.inflection_defaults.types && button.inflection_defaults.types[0] != button.part_of_speech) {
      ignore_defaults = true;
    }
    if(button.inflections || trans || button.inflection_defaults) {
      if(button.inflection_defaults) {
        base_label = button.inflection_defaults['base'] || button.inflection_defaults['c'] || button.inflection_defaults['src'] || button.label;
      }
      var board_locale = board.get('locale');
      var for_current_locale = !voc_locale || !board_locale || (voc_locale == lab_locale && voc_locale == board_locale);
      for(var idx = 0; idx < 8; idx++) {
        var trans_voc = voc && (voc.inflections || [])[idx];
        if(!ignore_defaults && !trans_voc && voc) {
          trans_voc = (voc.inflection_defaults || {})[locs[idx]]; 
          if((voc.inflection_defaults || {}).v != expected_inflections_version) {
            defaults_allowed = false;
          }
        }
        var trans_lab = lab && (lab.inflections || [])[idx];
        if(!ignore_defaults && !trans_lab && lab) { 
          trans_lab = (lab.inflection_defaults || {})[locs[idx]];
          if((lab.inflection_defaults || {}).v != expected_inflections_version) {
            defaults_allowed = false;
          }
        }
        // If it's for the current locale we can just use the inflections
        // list or suggested defaults, otherwise we need to check the
        // translations for inflections/suggested defaults
        if(for_current_locale && button.inflections && button.inflections[idx]) {
          defaults_allowed = false;
          list.push({location: locs[idx], label: button.inflections[idx]});
        } else if(trans_voc && trans_lab) {
          list.push({location: locs[idx], label: trans_lab, voc: trans_voc});
        } else if(for_current_locale && button.inflection_defaults && button.inflection_defaults[locs[idx]]) {
          if(button.inflection_defaults.v != expected_inflections_version) {
            defaults_allowed = false;
          }
          if(locs[idx] == 'se' && !button.inflection_defaults.no) {
            list.push({location: locs[idx], label: button.inflection_defaults[locs[idx]], opposite: true});
          } else {
            list.push({location: locs[idx], label: button.inflection_defaults[locs[idx]]});
          }
        }
      }
      if(list.length > 0) { 
        list.push({location: 'c', label: (lab || {}).label || button.original_label || button.label, vocalization: (voc || {}).label || button.vocalization});
        res = list; 
      }
    }
    if(button && button.vocalization == ':native-keyboard') {
      res.push({location: 'n', label: '?', vocalization: '+?'});
      res.push({location: 's', label: '.', vocalization: '+.'});
      res.push({location: 'e', label: '.', vocalization: '+.'});
      res.push({location: 'w', label: ',', vocalization: '+,'});
      res.push({location: 'nw', label: '!', vocalization: '+!'});
    } else if(button && button.vocalization && button.vocalization.match(/\+\w/)) {
      // Keep a list of suggestions for keyboard letters
      var subs = i18n.completions[button.vocalization.substring(1)];
      (subs || []).forEach(function(str, idx) {
        if(str && locs[idx]) {
          res.push({location: locs[idx], label: str});
        }
      });
      // TODO: use word suggestions to find most likely next words starting with this letter
    }
    // Only use the fallacks if it's a known locale for label and vocalization,
    // and there are no existing values populated or the default values were used,
    // i.e. don't use fallbacks if the user manually set any inflections
    if(lab_locale.match(/^en/i) && lab_locale == voc_locale && (res.length == 0 || defaults_allowed)) {
      var inflection_types = (button.inflection_defaults || {}).types || [];
      if(button.part_of_speech == 'noun') {
        // next to close need a "more" option that
        // can be replaced by up/down
        res = res.concat([
          {location: 'n', label: i18n.pluralize(base_label)},
          {location: 'c', label: button.original_label || button.label},
          {location: 's', label: i18n.possessive(base_label)},
        ]);
        if(inflection_types.indexOf('verb') != -1) {
          res = res.concat([
            {location: 'w', label: i18n.tense(base_label, {simple_past: true})},
            {location: 's', label: i18n.tense(base_label, {present_participle: true})},
            {location: 'sw', label: i18n.tense(base_label, {past_participle: true})},
            {location: 'n', label: i18n.tense(base_label, {simple_present: true})},
            {location: 'e', label: i18n.tense(base_label, {infinitive: true})},  
            {location: 'nw', label: i18n.tense(base_label, {simple_past: true})}, // dup
            {location: 'ne', label: base_label}, // dup
          ]);
        }
        if(inflection_types.indexOf('adjective') != -1) {
          res = res.concat([
            {location: 'ne', label: i18n.comparative(base_label)},
            {location: 'e', label: i18n.superlative(base_label)},
            {location: 'w', label: i18n.negative_comparative(base_label)},
          ]);
        }
        res = res.concat([
          {location: 'nw', label: i18n.negation(base_label)},
        ]);
      } else if(button.part_of_speech == 'adjective') {
        res = res.concat([
//          {location: 'n', label: i18n.pluralize(button.label)},
          {location: 'ne', label: i18n.comparative(base_label)},
          {location: 'e', label: i18n.superlative(base_label)},
          {location: 'se', label: i18n.negation(base_label), opposite: true},
          {location: 'w', label: i18n.negative_comparative(base_label)},
          {location: 'c', label: button.original_label || button.label},
        ]);
        if(inflection_types.indexOf('noun') != -1) {
          res = res.concat([
            {location: 'n', label: i18n.pluralize(base_label)},
            {location: 's', label: i18n.possessive(base_label)},
          ]);
        }
        if(inflection_types.indexOf('verb') != -1) {
          res = res.concat([
            {location: 'w', label: i18n.tense(base_label, {simple_past: true})},
            {location: 's', label: i18n.tense(base_label, {present_participle: true})},
            {location: 'sw', label: i18n.tense(base_label, {past_participle: true})},
            {location: 'n', label: i18n.tense(base_label, {simple_present: true})},
            {location: 'e', label: i18n.tense(base_label, {infinitive: true})},  
            {location: 'nw', label: i18n.tense(base_label, {simple_past: true})}, // dup
            {location: 'ne', label: base_label}, // dup
          ]);
        }
      } else if(button.part_of_speech == 'pronoun') {
        res = res.concat([
          {location: 'c', label: button.original_label || button.label},
          {location: 's', label: i18n.possessive(base_label, {pronoun: true})},
          {location: 'n', label: i18n.possessive(base_label, {objective: true})},
          {location: 'w', label: i18n.possessive(base_label, {})},
          {location: 'e', label: i18n.possessive(base_label, {reflexive: true})}
        ]);
      } else if(button.part_of_speech == 'verb') {
        res = res.concat([
          {location: 'w', label: i18n.tense(base_label, {simple_past: true})},
          {location: 's', label: i18n.tense(base_label, {present_participle: true})},
          {location: 'sw', label: i18n.tense(base_label, {past_participle: true})},
          {location: 'n', label: i18n.tense(base_label, {simple_present: true})},
          {location: 'e', label: i18n.tense(base_label, {infinitive: true})},
          // {location: 'sw', label: i18n.perfect_non_progression(button.label)},
          {location: 'c', label: button.original_label || button.label}
        ]);
        if(inflection_types.indexOf('noun') != -1) {
          res = res.concat([
            {location: 'n', label: i18n.pluralize(base_label)},
            {location: 's', label: i18n.possessive(base_label)},  
          ]);
        }
        if(inflection_types.indexOf('adjective') != -1) {
          res = res.concat([
            {location: 'ne', label: i18n.comparative(base_label)},
            {location: 'e', label: i18n.superlative(base_label)},
            {location: 'w', label: i18n.negative_comparative(base_label)},
          ]);
        }
        res = res.concat([
          {location: 'nw', label: i18n.tense(base_label, {simple_past: true})}, // dup
          {location: 'ne', label: base_label}, // dup
        ]);
      } else {
        console.log("unrecognized en button type", button.part_of_speech, button);
        if(button.part_of_speech == 'numeral' || (button.label || '').match(/^[0-9\.\,]+$/)) {
          res = res.concat([
            {location: 'n', label: i18n.ordinal(button.label)}
          ]);
        }
        res = res.concat([
  //        {location: 'n', label: 'ice cream', callback: function() { alert('a'); }},
          {location: 'c', label: button.original_label || button.label},
          {location: 'se', label: i18n.negation(base_label), opposite: true},
  //        {location: 'se', label: 'bacon', callback: function() { alert('c'); }},
        ]);
      }
      res = res.concat([
        {location: 'se', label: i18n.negation(base_label)},
      ]);
    }
    var final = [];
    var seen_locations = {};
    res.forEach(function(i) { 
      if(!seen_locations[i.location]) {
        final.push(i);
      }
      seen_locations[i.location] = true;
    })
    final.select = function(obj, event) {
      event.overlay_location = obj.location;
      select_button(obj.label, obj.vocalization, event);
    };
    if(final.length == 0) { return null; }
    return final;
  },
  /**
   * Renders the inflections overlay as a 3x3 grid of options around the pressed button.
   * Creates #overlay_container (div with .overlay .board classes), appends to document.body.
   * Uses elem.getBoundingClientRect() for positioning; creates .overlay_button elements with
   * select_callback. raw_events.element_release invokes select_callback on overlay_button taps.
   * REFACTOR NOTE: Preserve #overlay_container id and .overlay_button class. Button DOM (or
   * synthetic_button_elem_for_overlay) must provide getBoundingClientRect(),
   * getElementsByClassName('symbol'), getElementsByClassName('button-label-holder').
   */
  overlay_grid: function(grid, elem, event) {
    // TODO: log the overlay being opened somewhere

    // if we have room put the close/cancel button underneath,
    // otherwise put it on top or on the right
    var bounds = elem.getBoundingClientRect();
    var screen_width = window.innerWidth;
    var screen_height = window.innerHeight;
    var header_height = $("header").height();
    if(bounds.width > 0 && bounds.height > 0) {
      var margin = 5; // TODO: this is a user pref
      var button_width = bounds.width + (margin * 2);
      var button_height = bounds.height + (margin * 2);
      var top = bounds.top;
      var left = bounds.left;
      var vertical_close = true;
      var resize_images = false;
      if(button_height > (screen_height - header_height) / 3) {
        // grid won't fit, needs to shrink
        if(screen_height < screen_width) {
          vertical_close = false;
        }
        resize_images = true;
        button_height = (screen_height - header_height - margin - margin) / (vertical_close ? 3.5 : 3);
        top = event.clientY - (button_height / 2);
      }
      if(button_width > screen_width / 3) {
        // grid won't fit, needs to shrink
        button_width = screen_width / (vertical_close ? 3 : 3.5);
        left = event.clientX - (button_width / 2);
      }
      var left = Math.max(left - margin, button_width);
      var left = Math.min(left, screen_width - button_width - button_width);
      // don't let it go above the fold
      var top = Math.max(top - margin, button_height);
      // don't let it go below the screen edge
      var top = Math.min(top, screen_height - button_height - button_height);
      // keep it below the header
      top = Math.max(top, header_height + margin + button_height);
      // shift up just a little if it's not on the bottom, but will get clipped
      if(vertical_close) {
        if((top + button_height) < screen_height - (button_height * 1.5)) {
          top = Math.min(top, screen_height - button_height * 3);
        }
      }
      var layout = [];
      var hash = {'nw': 0, 'n': 1, 'ne': 2, 'w': 3, 'c': 4, 'e': 5, 'sw': 6, 's': 7, 'se': 8};
      grid.forEach(function(e) {
        if(hash[e.location] != null && !layout[hash[e.location]]) {
          layout[hash[e.location]] = e;
        }
      });
      var far_left = left - button_width;
      var far_right = left + button_width + button_width;
      var far_top = top - button_height;
      var far_bottom = top + button_height + button_height;
      // TODO: if the buttons are small enough, allow for a full-size (not half-size) close button
      var too_tall = button_height > (screen_height / 4);
      var too_wide = button_width > (screen_width / 4);
      var close_position = 'n';
      if(vertical_close) {
        if((top + button_height) < screen_height - (button_height * 1.5)) {
          close_position = 's';
          far_bottom = far_bottom + (button_height * (too_tall ? 0.5 : 1.0));
          // put the close underneath
        } else {
          far_top = far_top - (button_height * (too_tall ? 0.5 : 1.0));
          // put the close above
        }
      } else {
        if((left + button_width) < screen_width - (button_width * 1.5)) {
          close_position = 'e';
          far_right = far_right + (button_width * (too_wide ? 0.5 : 1.0));
          // put the close to the right
        } else {
          close_position = 'w';
          far_left = far_left - (button_width * (too_wide ? 0.5 : 1.0));
          // put the close to the left
        }
      }
      var pad = 5;
      var div = document.createElement('div');
      div.id = 'overlay_container';
      var boardEl = document.getElementsByClassName('board')[0];
      div.setAttribute('class', (boardEl && boardEl.getAttribute('class')) || 'board speak overlay');
      // Remove board-detail-only layout classes so #overlay_container keeps float/block layout
      // (copying md-board-detail-grid would switch it to CSS grid and break overlay rows/buttons).
      ['md-board-detail-grid'].forEach(function(cls) { div.classList.remove(cls); });
      div.classList.add('overlay');
      div.classList.add('board');
      // raw_events.find_selectable_under_event requires .advanced_selection on the region so
      // touch_release runs button_select → overlay_button.select_callback. Board-detail's
      // grid intentionally omits advanced_selection (Ember actions for taps), so the copied
      // class list may lack it — always set on the overlay.
      div.classList.add('advanced_selection');
      div.style.left = (far_left - pad) + 'px';
      div.style.width = (far_right - far_left + (pad * 2)) + 'px';
      div.style.top = (far_top - pad) + 'px';
      div.style.height = (far_bottom - far_top + (pad * 2)) + 'px';
      div.style.padding = pad + 'px';
      var button_margin = 5; // TODO: this is a user preference
      var img = elem.getElementsByClassName && elem.getElementsByClassName('symbol')[0];
      var lbl = elem.getElementsByClassName && elem.getElementsByClassName('button-label-holder')[0];
      var inner = lbl && lbl.getElementsByClassName && lbl.getElementsByClassName('button-label')[0];
      var lbl_height = 24;
      if(lbl && inner && typeof lbl.getBoundingClientRect === 'function') {
        var origDisplay = inner.style && inner.style.display;
        if(inner.style) { inner.style.display = 'inline'; }
        var rect = lbl.getBoundingClientRect();
        lbl_height = (rect && rect.height) ? Math.max(rect.height, 12) : 24;
        if(inner.style) { inner.style.display = origDisplay || ''; }
      }
      var text_position = 'top';
      if(editManager.get_app_state().get('referenced_user.preferences.device.button_text_position') == 'bottom') {
        text_position = 'bottom';
      } else if(editManager.get_app_state().get('referenced_user.preferences.device.button_text_position') == 'text_only') {
        text_position = 'no_image';
      } else if(editManager.get_app_state().get('referenced_user.preferences.device.button_text_position') == 'none') {
        text_position = 'bottom';
      }
      var elemClass = (elem.getAttribute && elem.getAttribute('class')) || 'button b__';
      var imgHolderStyle = (img && img.parentNode && img.parentNode.getAttribute && img.parentNode.getAttribute('style')) || '';
      var formatted_button = function(label, image_url, opposite) {
        // TODO: this needs to call persistence.find_url for local versions
        image_url = image_url || (img && img.src) || "https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg";
        var btn = document.createElement('div');
        btn.setAttribute('class', elemClass.replace(/b_[\w\d_]+_/, ''));
        btn.classList.add('overlay_button');
        if(opposite) {
          btn.classList.add('opposite');
        }
        btn.classList.add('b__');
        btn.classList.remove('touched');
        btn.style.margin = button_margin + 'px';
        btn.style.width = Math.floor(button_width - (button_margin * 2)) + 'px';
        btn.style.height = Math.floor(button_height - (button_margin * 2)) + 'px';
        var html = "";
        if(text_position != 'no_image' && img) {
          html = html + "<span class='img_holder' style=\"" + (imgHolderStyle || '') + "\"><img src=\"" + image_url + "\" style=\"width: 100%; vertical-align: middle; height: 100%; object-fit: contain; object-position: center;\"/></span>";
        } else {
          html = html + "<span class='img_holder'></span>";
        }
        html = html + "<div class='button-label-holder " + text_position + "'><span class='button-label' style='display: inline;'>" + label + "</span></div>";
        btn.innerHTML = html
        var holder = btn.getElementsByClassName('img_holder')[0];
        if(holder) {
          holder.style.display = 'inline-block';
          holder.style.height = (button_height - lbl_height - margin - margin) + 'px';
          holder.style.lineHeight = holder.style.height;
          var holderImg = holder.getElementsByTagName('IMG')[0];
          if(holderImg) {
            holderImg.style.height = holder.style.height;
          }
        }
        return btn;
      };
      var close_row = document.createElement('div');
      close_row.classList.add('overlay_row');
      close_row.classList.add('button_row');
      var close = formatted_button('close', "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/274c.svg");
      if(close_position != 'w') {
        close.style.float = 'right';
      }
      close.select_callback = function() {
        div.parentNode.removeChild(div);
        // TODO: log the close event somewhere
      };
      close_row.appendChild(close);
      if(close_position == 'n') {
        div.appendChild(close_row);
      }
      var row = null;
      for(var idx = 0; idx < 9; idx++) {
        if(idx % 3 == 0) {
          row = document.createElement('div');
          row.classList.add('overlay_row');
          row.classList.add('button_row');
          if(close_position == 'w') {
            if(idx == 0) {
              row.appendChild(close);
            } else {
              var btn = formatted_button('nothing');
              btn.style.visibility = 'hidden';
              row.appendChild(btn);
            }
          }
        }
        var btn = formatted_button((layout[idx] || {}).label || "nothing", null, (layout[idx] || {}).opposite);
        if(idx == 4) { 
          btn.setAttribute('class', elemClass); 
          btn.classList.remove('touched');
          btn.classList.add('overlay_button');
        }
        btn.select_callback = (function(obj) {
          return function(event) {
            // TODO: log the event somewhere
            if(obj && obj.callback) {
              obj.callback(event);
            } else if(grid.select) {
              grid.select(obj, event);
            }
            runLater(function() {
              div.parentNode.removeChild(div);
            }, 50);
          }
        })(layout[idx]);
        if(!layout[idx]) {
          btn.style.visibility = 'hidden';
        }
        row.appendChild(btn);
        if(idx % 3 == 2) {
          if(close_position == 'e') {
            if(idx == 8) {
              row.appendChild(close);
            } else {
              var btn = formatted_button();
              document.createElement('div');
              btn.style.visibility = 'hidden';
              row.appendChild(btn);
            }
          }
          div.appendChild(row);
        }
      }
      if(close_position == 's') {
        div.appendChild(close_row);
      }

      document.body.appendChild(div);
    }

    // TODO: for the log event mark it as an overlay event,
    // for computing travel don't +1 depth or anything,
    // but track how many times each button has overlays used
    // so we can learn which are the most useful
  },
  auto_edit: function(id) {
    // used to auto-enter edit mode after creating a brand new board
    this.auto_edit.edits = (this.auto_edit.edits || {});
    this.auto_edit.edits[id] = true;
  },
  clear_history: function() {
    this.setProperties({
      'history': [],
      'future': []
    });
    this.lastChange = {};
    this.bogus_id_counter = 0;
    if(this.controller && this.controller.get('ordered_buttons')) {
      var neg_ids = [0];
      this.controller.get('ordered_buttons').forEach(function(row) {
        row.forEach(function(btn) {
          var num_id = parseInt(emberGet(btn, 'id'), 10) || 0;
          if(num_id < 0 && isFinite(num_id)) {
            neg_ids.push(num_id);
          }
        });
      });
      this.bogus_id_counter = (Math.min.apply(null, neg_ids) || -999);
    }
    this.update_color_key_id();
  },
  update_color_key_id: function() {
    editManager.get_app_state().set('color_key_id', Math.random() + "." + (new Date()).getTime());
  },
  update_history: observer('history', 'history.[]', 'future', 'future.[]', function() {
    if(this.controller) {
      this.controller.set('noRedo', this.get('future').length === 0);
      this.controller.set('noUndo', this.get('history').length === 0);
    }
  }),
  // TODO: should we be using this to ensure modifying proper board?
//   forBoard: function(board, callback) {
//     if(this.controller.get('model.id') == board.get('id')) {
//       callback();
//     }
//   },
  clear_text_edit: function() {
    this.lastChange = {};
  },
  save_state: function(details) {
    // TODO: needs revisit
    // currently if you reset state to exactly what it was before it'll still add to undo history. this is dumb.
    // also if I change the label, then change the color on the same button, only counts as one undo event. is that dumb? unsure.
    this.set('future', []);
    if(details && this.lastChange && details.button_id == this.lastChange.button_id && details.changes && JSON.stringify(details.changes) == JSON.stringify(this.lastChange.changes)) {
      // don't add to state if it's the same as the previous edit (i.e. add'l change to label)
    } else if(details && this.lastChange && details.mode == 'paint' && details.paint_id == this.lastChange.paint_id) {
      // don't add to state if it's the same paint as the previous edit.
    } else {
      this.set('history', (this.get('history') || []).concat([this.clone_state()]));
    }
    this.lastChange = details;
  },
  clone_state: function() {
    if(!this.controller) { return; }
    var oldState = this.controller.get('ordered_buttons');
    var board = this.controller.get('model');
    var clone_state = [];
    for(var idx = 0; idx < oldState.length; idx++) {
      var arr = [];
      for(var jdx = 0; jdx < oldState[idx].length; jdx++) {
        var btn = oldState[idx][jdx];
        var raw;
        if(btn.raw && typeof btn.raw === 'function') {
          raw = btn.raw();
        } else if(btn.getProperties && typeof btn.getProperties === 'function') {
          raw = btn.getProperties('id', 'label', 'vocalization', 'image_id', 'sound_id', 'background_color', 'border_color', 'part_of_speech', 'suggested_part_of_speech', 'painted_part_of_speech', 'hidden', 'link_disabled', 'load_board', 'url', 'apps', 'empty', 'text_only', 'level', 'home_lock');
        } else {
          raw = {};
          for(var key in btn) {
            if(btn.hasOwnProperty && btn.hasOwnProperty(key) && typeof btn[key] !== 'function') {
              raw[key] = btn[key];
            }
          }
        }
        raw.local_image_url = (btn.get && typeof btn.get === 'function') ? btn.get('local_image_url') : btn.local_image_url;
        raw.local_sound_url = (btn.get && typeof btn.get === 'function') ? btn.get('local_sound_url') : btn.local_sound_url;
        raw.image_url = (btn.get && typeof btn.get === 'function') ? btn.get('image_url') : btn.image_url;
        // Ensure pending_image and pending_sound are false so the pending computed property works correctly
        raw.pending_image = false;
        raw.pending_sound = false;
        // board-detail speak grid adds this plain bool; Button defines it as a
        // computed — passing it into create clobbers the computed (Ember 3.28+).
        delete raw.display_as_hidden;
        var b = editManager.Button.create(raw, {board: board});
        if(b.get('board') != board || (b.get('pending_image') || b.get('pending_sound'))) { alert('blech!'); }
        b.set('id', (btn.get && typeof btn.get === 'function') ? btn.get('id') : btn.id);
        // Explicitly preserve empty/image_url — Button.create may not retain them from raw
        if(raw.empty) { b.set('empty', true); }
        if(raw.image_url) { b.set('image_url', raw.image_url); }
        arr.push(b);
      }
      clone_state.push(arr);
    }
    return clone_state;
  },
  undo: function() {
    if(!this.controller) { return; }
    var history = (this.get('history') || []).slice();
    var lastState = history.pop();
    if(lastState) {
      this.set('history', history);
      var currentState = this.clone_state();
      this.set('future', (this.get('future') || []).concat([currentState]));
      this.controller.set('ordered_buttons', lastState);
      this.update_color_key_id();
    }
  },
  redo: function() {
    if(!this.controller) { return; }
    var future = (this.get('future') || []).slice();
    var state = future.pop();
    if(state) {
      this.set('future', future);
      var currentState = this.clone_state();
      this.set('history', (this.get('history') || []).concat([currentState]));
      this.controller.set('ordered_buttons', state);
      this.update_color_key_id();
    }
  },
  bogus_id_counter: 0,
  fake_button: function(board) {
    var button = editManager.Button.create({
      empty: true,
      label: '',
      id: --this.bogus_id_counter
    });
    var controller = this.controller;
    board = board || (controller && controller.get && controller.get('model'));
    if(board) {
      button.set('board', board);
    }
    return button;
  },
  modify_size: function(type, action, index) {
    this.save_state({
    });
    var state = this.controller.get('ordered_buttons');
    var newState = [];
    var fakeRow = [];
    if(type == 'column') {
      if(index == null) {
        index = (action == 'add' ? state[0].length : state[0].length - 1);
      }
    } else {
      if(index == null) {
        index = (action == 'add' ? state.length : state.length - 1);
      }
      for(var idx = 0; idx < state[0].length; idx++) {
        fakeRow.push(this.fake_button());
      }
    }
    for(var idx = 0; idx < state.length; idx++) {
      var row = [];
      if(index == idx && action == 'add' && type == 'row') {
        newState.push(fakeRow);
      }
      if(index == idx && action == 'remove' && type == 'row') {
      } else {
        for(var jdx = 0; jdx < state[idx].length; jdx++) {
          if(jdx == index && action == 'add' && type == 'column') {
            row.push(this.fake_button());
          }
          if(jdx == index && action == 'remove' && type == 'column') {
          } else {
            row.push(state[idx][jdx]);
          }
        }
        if(index == state[0].length && action == 'add' && type == 'column') {
          row.push(this.fake_button());
        }
        if(row.length === 0) { row.push(this.fake_button()); }
        newState.push(row);
      }
    }
    if(index == state.length && action == 'add' && type == 'row') {
      newState.push(fakeRow);
    }
    if(newState.length === 0) { newState.push(fakeRow); }
    this.update_color_key_id();
    this.controller.set('ordered_buttons', newState);
  },
  find_button: function(id) {
    if(!this.controller || !this.controller.get) { return []; }
    var ob = this.controller.get('ordered_buttons') || [];
    var res = null;
    var board = this.controller.get('model');
    for(var idx = 0; idx < ob.length; idx++) {
      for(var jdx = 0; jdx < ob[idx].length; jdx++) {
        if(!res) {
          if(id && ob[idx][jdx].id == id) {
            res = ob[idx][jdx];
          } else if(id == 'empty' && ob[idx][jdx].empty) {
            res = ob[idx][jdx];
          }
          // board-detail (and similar) may use plain objects for display; Button methods are required
          if(res && typeof res.load_image !== 'function') {
            // Strip plain-object fields that collide with Button computeds.
            // Object.assign passes every own property into Button.create,
            // and Ember 3.28 treats setting a key that has a `computed`
            // on the class as a clobber-and-replace — the computed is
            // permanently swapped out for the static plain-object value.
            // `display_as_hidden` is the board-detail-specific plain-bool
            // mirror; the Button class has its own computed of the same
            // name. Strip before create so the computed survives.
            var raw_props = Object.assign({}, res);
            delete raw_props.display_as_hidden;
            res = editManager.Button.create(raw_props, {board: board});
            ob[idx][jdx] = res;
          }
        }
      }
    }
    var buttons = board.contextualized_buttons(editManager.get_app_state().get('label_locale'), editManager.get_app_state().get('vocalization_locale'), editManager.get_stashes().get('working_vocalization'), false, editManager.get_app_state().get('inflection_shift'));
    if(res) {
      var trans_button = buttons.find(function(b) { return b.id == id; });
      // If contextualized button exists, we should
      // override with that button's display settings
      // as long as we're not editing the button
      if(trans_button && !emberGet(res, 'user_modified')) {
        // TODO: code smell, nobody is ever going
        // to remember that this code exists
        emberSet(res, 'label', trans_button.label);
        emberSet(res, 'original_label', emberGet(res, 'label'));
        emberSet(res, 'vocalization', trans_button.vocalization);
        emberSet(res, 'tweaked', true);
      }
      if(trans_button && trans_button.condense_items) {
        emberSet(res, 'condense_items', trans_button.condense_items);
        emberSet(res, 'tweaked', true);
      }
      return res;
    }
    if(board.get('fast_html')) {
      buttons.forEach(function(b) {
        if(id && id == b.id) {
          res = editManager.Button.create(b, {board: board});
        }
      });
    }
    return res;
  },
  clear_button: function(id) {
    var opts = {};
    for(var idx = 0; idx < editManager.Button.attributes.length; idx++) {
      opts[editManager.Button.attributes[idx]] = null;
    }
    opts.label = '';
    opts.image = null;
    opts.image_url = null;
    opts.local_image_url = null;
    opts.local_sound_url = null;
    this.change_button(id, opts);
  },
  change_button: function(id, options) {
    try {
      this.save_state({
        button_id: id,
        changes: Object.keys(options)
      });
    } catch(e) {
      console.warn('edit_manager: save_state failed during change_button', e);
    }
    var button = this.find_button(id);
    if(button) {
      var deferImageId = !!(options.image && Object.prototype.hasOwnProperty.call(options, 'image_id'));
      var pickedDisplayUrl = options._picked_display_url || null;
      if(options.image) {
        emberSet(button, 'local_image_url', null);
        emberSet(button, 'image_url', null);
        // Do not call load_image() when we are supplying the image: it would use the
        // current (old) image_id and later overwrite button.image when its promise
        // resolves, hiding the new image on the board.
      } else if(options.image === null) {
        emberSet(button, 'local_image_url', null);
        emberSet(button, 'image_url', null);
      }
      if(options.sound) {
        emberSet(button, 'local_sound_url', null);
        // Do not call load_sound() when we are supplying the sound (same race as image).
      } else if(options.sound === null) {
        emberSet(button, 'local_sound_url', null);
      }
      for(var key in options) {
        if(deferImageId && key === 'image_id') { continue; }
        if(key === '_picked_display_url') { continue; }
        emberSet(button, key, options[key]);
      }
      // Sync changes to board.buttons so contextualized_buttons/fast_html see them immediately
      var board = this.controller && this.controller.get('model');
      if(board && Object.keys(options).length) {
        var rawAttrs = Button.attributes || [];
        var boardButtons = board.get('buttons') || [];
        var isSerializable = function(v) {
          if(v === null) { return true; }
          if(typeof v !== 'object') { return true; }
          return typeof v.get !== 'function'; // exclude Ember models
        };
        for(var bi = 0; bi < boardButtons.length; bi++) {
          if(boardButtons[bi] && String(boardButtons[bi].id) === String(id)) {
            for(var key in options) {
              if(key === '_picked_display_url') { continue; }
              if(rawAttrs.indexOf(key) >= 0 && isSerializable(options[key])) {
                boardButtons[bi][key] = options[key];
              }
            }
            break;
          }
        }
        board.set('last_cb', null);
        if(board.get('fast_html')) {
          board.set('fast_html', null);
        }
      }
      if(options.image && button.get('image')) {
        emberSet(button, 'original_image_url', button.get('image.url') || pickedDisplayUrl);
        var sourceUrl = button.get('image.url') || pickedDisplayUrl;
        var best = button.get('image.best_url');
        // Prefer the picked/saved source URL when best_url still points at a stale
        // processed upload for the same image id (see debug logs: savedUrl
        // updates to OpenSymbols but displayUrl stays on old S3 SVG).
        var displayUrl = pickedDisplayUrl || best;
        if(!pickedDisplayUrl && sourceUrl && sourceUrl.match(/^https?:\/\//) && best && sourceUrl !== best &&
           best.match(/lingolinq.*uploads|s3\.amazonaws\.com.*\/images\//)) {
          displayUrl = sourceUrl;
        }
        if(!displayUrl && sourceUrl) {
          displayUrl = sourceUrl;
        }
        if(displayUrl && (displayUrl.match(/^https?:\/\//) || displayUrl.match(/^data:/) || displayUrl.match(/^blob:/))) {
          emberSet(button, 'local_image_url', displayUrl);
          // board-detail-grid renders btn.image_url, not local_image_url
          emberSet(button, 'image_url', displayUrl);
        }
      }
      // Apply image_id after URLs so findContentLocally does not reuse a stale
      // button.image_url from the previous symbol when the id changes.
      if(deferImageId) {
        emberSet(button, 'image_id', options.image_id);
      }
      if(options.sound && button.get('sound')) {
        emberSet(button, 'local_sound_url', button.get('sound.best_url'));
      }
      emberSet(button, 'user_modified', true);
      this.check_button(id);
      this.update_color_key_id();
    } else {
      console.log("no button found for: " + id);
    }
  },
  check_button: function(id) {
    var button = this.find_button(id);
    var empty = !button.label && !button.image_id;
    emberSet(button, 'empty', !!empty);
  },
  stash_button: function(id) {
    var list = editManager.get_stashes().get_object('stashed_buttons', true) || [];
    var button = null;
    if(id && id.raw) {
      button = id.raw();
    } else {
      button = this.find_button(id);
      button = button && button.raw();
    }
    if(button) {
      delete button.id;
      button.stashed_at = (new Date()).getTime();
    }
    if(button && list[list.length - 1] != button) {
      list.push(button);
    }
    editManager.get_stashes().persist('stashed_buttons', list);
  },
  get_ready_to_apply_stashed_button: function(button) {
    if(!button || !button.raw) {
      console.error("raw buttons won't work");
    } else if(button) {
      this.stashedButtonToApply = button.raw();
      this.controller.set('model.finding_target', true);
    }
  },
  apply_stashed_button: function(id) {
    if(this.stashedButtonToApply) {
      this.change_button(id, this.stashedButtonToApply);
      this.stashedButtonToApply = null;
    }
  },
  finding_target: function() {
    return this.swapId || this.stashedButtonToApply;
  },
  apply_to_target: function(id) {
    if(this.swapId) {
      this.switch_buttons(id, this.swapId);
    } else if(this.stashedButtonToApply) {
      this.apply_stashed_button(id);
    }
    this.controller.set('model.finding_target', false);
    this.update_color_key_id();
  },
  prep_for_swap: function(id) {
    var button = this.find_button(id);
    if(button) {
      button.set('for_swap', true);
      this.swapId = id;
      this.controller.set('model.finding_target', true);
    }
  },
  switch_buttons: function(a, b, decision) {
    if(a == b) { return; }
    this.save_state();
    var buttona = this.find_button(a);
    var buttonb = this.find_button(b);
    if(!buttona || !buttonb) { console.log("couldn't find a button!"); return; }
    if(buttonb.get('folderAction') && !decision) {
      buttona = buttona && editManager.Button.create(buttona.raw());
      buttona.set('id', a);
      buttonb = buttonb && editManager.Button.create(buttonb.raw());
      buttonb.set('id', b);
      modal.open('swap-or-drop-button', {button: buttona, folder: buttonb});
      return;
    }
    var ob = this.controller.get('ordered_buttons');
    for(var idx = 0; idx < ob.length; idx++) {
      for(var jdx = 0; jdx < ob[idx].length; jdx++) {
        if(ob[idx][jdx].id == a) {
          ob[idx][jdx] = buttonb;
        } else if(ob[idx][jdx].id == b) {
          ob[idx][jdx] = buttona;
        }
      }
    }
    buttona.set('for_swap', false);
    buttonb.set('for_swap', false);
    this.swapId = null;
    // Create a new array reference so Ember detects the change and re-renders
    this.controller.set('ordered_buttons', ob.map(function(row) { return [].concat(row); }));
    this.update_color_key_id();
    this.controller.redraw_if_needed();
  },
  move_button: function(a, b, decision) {
    var button = this.find_button(a);
    var folder = this.find_button(b);
    if(button) {
      button = editManager.Button.create(button.raw());
    }
    if(!button || !folder) { return RSVP.reject({error: "couldn't find a button"}); }
    if(!folder.load_board || !folder.load_board.key) { return RSVP.reject({error: "not a folder!"}); }
    this.clear_button(a);

    var find = LingoLinq.store.findRecord('board', folder.load_board.key).then(function(ref) {
      return ref;
    });
    var reload = find.then(function(ref) {
      return ref.reload();
    });
    var _this = this;
    var ready_for_update = reload.then(function(ref) {
      if(ref.get('permissions.edit')) {
        return RSVP.resolve(ref);
      } else if(ref.get('permissions.view')) {
        if(decision == 'copy') {
          return ref.create_copy().then(function(copy) {
            _this.change_button(b, {
              load_board: {id: copy.get('id'), key: copy.get('key')}
            });
            return copy;
          });
        } else {
          return RSVP.reject({error: 'view only'});
        }
      } else {
        return RSVP.reject({error: 'not authorized'});
      }
    });

    var new_id;
    var update_buttons = ready_for_update.then(function(board) {
      new_id = board.add_button(button);
      return board.save();
    });

    return update_buttons.then(function(board) {
      _this.update_color_key_id();
      return RSVP.resolve({visible: board.button_visible(new_id), button: button});
    });
  },
  paint_mode: null,
  set_paint_mode: function(fill_color, border_color, part_of_speech) {
    if(fill_color == 'hide') {
      this.paint_mode = {
        hidden: true,
        paint_id: Math.random()
      };
    } else if(fill_color == 'show') {
      this.paint_mode = {
        hidden: false,
        paint_id: Math.random()
      };
    } else if(fill_color == 'close') {
      this.paint_mode = {
        close_link: true,
        paint_id: Math.random()
      };
    } else if(fill_color == 'open') {
      this.paint_mode = {
        close_link: false,
        paint_id: Math.random()
      };
    } else if(fill_color == 'level') {
      this.paint_mode = {
        level: border_color,
        attribute: part_of_speech,
        paint_id: Math.random()
      };
    } else {
      var fill = window.tinycolor(fill_color);
      var border = null;
      if(border_color) {
        border = window.tinycolor(border_color);
      } else {
        border = window.tinycolor(fill.toRgb()).darken(30);
        if(fill.toName() == 'white') {
          border = window.tinycolor('#eee');
        } else if(fill.toHsl().l < 0.5) {
          border = window.tinycolor(fill.toRgb()).lighten(30);
        }
      }
      this.paint_mode = {
        border: border.toRgbString(),
        fill: fill.toRgbString(),
        paint_id: Math.random(),
        part_of_speech: part_of_speech
      };
    }
    this.controller.set('paint_mode', this.paint_mode);
  },
  clear_paint_mode: function() {
    this.paint_mode = null;
    if(this.controller) {
      this.controller.set('paint_mode', false);
    }
  },
  preview_levels: function() {
    if(this.controller) {
      this.controller.set('preview_levels_mode', true);
    }
  },
  clear_preview_levels: function() {
    if(this.controller) {
      this.controller.set('preview_levels_mode', false);
      this.controller.set('preview_level', null);
      // Reset every button. Tagged buttons get apply_level(10) which
      // surfaces them at full vocab. Untagged buttons restore their
      // original hidden state from the stash we set on preview entry,
      // so we don't leave them with hidden=true from the preview-level
      // mutation below.
      (this.controller.get('ordered_buttons') || []).forEach(function(row) {
        row.forEach(function(button) {
          if(button && typeof button.apply_level === 'function') {
            button.apply_level(10);
            var mods = button.get('level_modifications');
            var untagged = !mods || Object.keys(mods).length === 0;
            if(untagged && button._preview_original_hidden !== undefined) {
              button.set('hidden', button._preview_original_hidden);
            }
            delete button._preview_original_hidden;
          }
        });
      });
      this.update_color_key_id();
    }
  },
  apply_preview_level: function(level) {
    if(this.controller) {
      (this.controller.get('ordered_buttons') || []).forEach(function(row) {
        row.forEach(function(button) {
          if(button && typeof button.apply_level === 'function') {
            // Stash original hidden once so clear_preview_levels can
            // restore untagged buttons we're about to gray out.
            if(button._preview_original_hidden === undefined) {
              button._preview_original_hidden = button.get('hidden');
            }
            button.apply_level(level);
            var mods = button.get('level_modifications');
            var untagged = !mods || Object.keys(mods).length === 0;
            if(untagged) {
              // Untagged: gray out at any preview level below 10;
              // restore original at level 10 (= full vocab).
              if(level < 10) {
                button.set('hidden', true);
              } else {
                button.set('hidden', button._preview_original_hidden);
              }
            } else {
              // Tagged: a button is visible at preview level N if it
              // has ANY level rule for a level ≤ N. This is robust to
              // data variations (level rules sometimes have just the
              // key with an empty {} body, sometimes a `hidden:false`
              // value, sometimes other attribute overrides). The
              // presence of the key itself signals "promoted at this
              // level". This intentionally ignores `mods.override`,
              // so prior eye-slash hides on tagged buttons don't
              // override the preview's level filter.
              var has_promoting_rule = false;
              for(var lvl_check = 1; lvl_check <= level; lvl_check++) {
                if(mods[lvl_check]) { has_promoting_rule = true; break; }
              }
              button.set('hidden', !has_promoting_rule);
            }
          }
        });
      });
      this.update_color_key_id();
    }
  },
  release_stroke: function() {
    if(this.paint_mode) {
      this.paint_mode.paint_id = Math.random();
    }
  },
  paint_button: function(id) {
    this.save_state({
      mode: 'paint',
      paint_id: this.paint_mode.paint_id,
      button_id: id
    });
    var button = this.find_button(id);
    if(this.paint_mode.border) {
      Button.set_attribute(button, 'border_color', this.paint_mode.border);
    }
    if(this.paint_mode.fill) {
      Button.set_attribute(button, 'background_color', this.paint_mode.fill);
    }
    if(this.paint_mode.hidden != null) {
      // Hidden Tool (paint hide / reveal) operates on the plain
      // `hidden` attribute ONLY. Do NOT route through
      // Button.set_attribute here: that helper stamps
      // level_modifications.override.hidden whenever the button
      // already carries a level rule (every CommuniKate button does),
      // which surfaces a "*" level badge — not the intended behavior
      // for the Hidden Tool. The Button Levels system is untouched;
      // this is a direct author-intent set, matching how the
      // reveal/reveal-all paths already set `hidden`.
      emberSet(button, 'hidden', this.paint_mode.hidden);
    }
    if(this.paint_mode.close_link != null) {
      Button.set_attribute(button, 'link_disabled', this.paint_mode.close_link);
    }
    if(this.paint_mode.level) {
      var mods = $.extend({}, emberGet(button, 'level_modifications') || {});
      var level = this.paint_mode.attribute.toString();
      if(!mods.pre) { mods.pre = {}; }
      if(this.paint_mode.level == 'hidden' && this.paint_mode.attribute) {
        mods.pre.hidden = true;
        for(var idx in mods) {
          if(parseInt(idx, 10) > 0) { delete mods[idx]['hidden']; }
          if(Object.keys(mods[idx]).length == 0) { delete mods[idx]; }
        }
        mods[level] = mods[level] || {};
        mods[level].hidden = false;
        Button.set_attribute(button, 'level_modifications', mods);
//        emberSet(button, 'level_modifications', mods);
        // TODO: controller/boards/index#button_levels wasn't picking up this
        // change automatically, had to add explicit notification, not sure why
        editManager.controller.set('levels_change', true);
        // Folder cascade: if this button links to a sub-board, mark it so
        // the save payload signals the backend to propagate the same
        // level_modifications to every button in the downstream board
        // tree (recursively). Non-folder buttons don't carry the marker.
        // emberGet on Ember Button reads load_board; plain objects fall
        // back to the property. We stamp the marker as a non-persisted
        // hint that process_for_saving promotes into JSON via
        // `cascade_level_to_subtree: true`.
        var is_folder = !!(emberGet(button, 'load_board') || (button.load_board));
        if(is_folder) {
          button._pending_cascade_level = true;
        }
        // Re-evaluate `hidden` against the current preview level so the
        // newly-painted button surfaces in full CSS immediately. Before
        // this paint, the button was untagged and apply_preview_level
        // had set hidden=true (gray) for level<10. The new rule promotes
        // it at `level`; if preview ≥ level, the button should now be
        // visible. Also clear the stash so clear_preview_levels won't
        // restore the stale gray-out value if preview is exited.
        var pv_lvl = editManager.controller.get('preview_level');
        if(pv_lvl && editManager.controller.get('preview_levels_mode')) {
          var painted_n = parseInt(level, 10);
          emberSet(button, 'hidden', !(painted_n <= pv_lvl));
        }
        button._preview_original_hidden = false;
      } else if(this.paint_mode.level == 'link_disabled' && this.paint_mode.attribute) {
        mods.pre.link_disabled = true;
        for(var idx in mods) {
          if(parseInt(idx, 10) > 0) { delete mods[idx]['link_disabled']; }
          if(Object.keys(mods[idx]).length == 0) { delete mods[idx]; }
        }
        mods[level] = mods[level] || {};
        mods[level].link_disabled = false;
        emberSet(button, 'level_modifications', mods);
      } else if(this.paint_mode.level == 'clear') {
        emberSet(button, 'level_modifications', null);
      }
    }
    if(this.paint_mode.part_of_speech) {
      if(!emberGet(button, 'part_of_speech') || emberGet(button, 'part_of_speech') == emberGet(button, 'suggested_part_of_speech')) {
        emberSet(button, 'part_of_speech', this.paint_mode.part_of_speech);
        emberSet(button, 'painted_part_of_speech', this.paint_mode.part_of_speech);
      }
    }
    this.update_color_key_id();
    this.check_button(id);
  },
  process_for_displaying: function(ignore_fast_html) {
    if(!this) { return; }
    var _vb = (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.verboseDebug);
    if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying start', { hasController: !!this.controller, hasBoard: !!(this.controller && this.controller.get('model')) }); }
    LingoLinq.log.track('processing for displaying');
    var controller = this.controller;
    if(!controller) { if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (no controller)'); } return; }
    var appState = this.appState || (typeof window !== 'undefined' && window.appState) || (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.appState);
    if(!appState || (typeof appState.get !== 'function')) { if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (no appState)'); } return; }
    // Ember 5 throws a hard assertion when a computed (edit_mode/speak_mode below)
    // is read on a destroyed object. A leaked post-teardown callback (e.g. the
    // app-state on_user_change observer or a scheduled runloop task) can reach
    // here after the app-state service is torn down; the throw then re-enters the
    // window.onerror chain and wedges the test runner. Nothing is displayable on a
    // destroyed app-state anyway, so bail. (3.28 returned undefined here silently.)
    if(appState.isDestroyed || appState.isDestroying) { if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (destroyed appState)'); } return; }
    var stashes = this.stashes;
    if(appState.get('edit_mode') && controller.get('ordered_buttons')) {
      LingoLinq.log.track('will not redraw while in edit mode');
      // return;
    }
    var board = controller.get('model');
    if(!board) {
      if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (no board)'); }
      if (this.controller === controller) { this.controller = null; }
      return;
    }
    var applyBoardDetailFocusDim = function() {
      if(!controller || !controller.get) { return; }
      if(controller.get('is_board_detail') && typeof controller._apply_focus_dim_to_ordered_buttons === 'function') {
        controller._apply_focus_dim_to_ordered_buttons();
      }
    };
    var is_board_detail = !!(controller.get && controller.get('is_board_detail'));
    // Board-detail builds its own plain-object grid in speak mode (_build_from_raw /
    // boardDetailCache). The classic path below recreates every cell as Button.create
    // on each utterance update — redundant load_image work and console noise with no
    // visible change. Edit mode still uses board-detail's Ember-button grid rebuild.
    if(appState.get('speak_mode') && is_board_detail && !appState.get('edit_mode')) {
      if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (board-detail speak mode)'); }
      applyBoardDetailFocusDim();
      if(typeof appState.refresh_suggestions === 'function') {
        appState.refresh_suggestions();
      }
      // The board-detail render path returns early here (rendering is handled by the
      // board-detail components, not the fast_html canvas), so — unlike the non-board-detail
      // path below — it never reaches resume_scanning(). Without this, a find-a-button
      // guided highlight sequence stalls the instant it navigates INTO a sub-board, because
      // highlight_button('resume') is never called after the sub-board renders. Trigger it here,
      // guarded on an active highlight queue AND on an actual board CHANGE — firing on every
      // incidental re-render of the same board (e.g. a language switch mid-sequence) would
      // re-call highlight_button('resume'), which rejects and rebuilds the pending highlight
      // overlay and flickers. The tracker is cleared when a new sequence starts (application.js
      // highlight_button method), so the first navigation of every sequence always resumes.
      var _hl_ctrl = appState && appState.controller;
      var _bd_cur_board_id = board.get('id');
      if(_hl_ctrl && !_hl_ctrl.isDestroyed && (_hl_ctrl.get('button_highlights') || []).length > 0
          && appState.get('_bd_highlight_resume_board') != _bd_cur_board_id) {
        appState.set('_bd_highlight_resume_board', _bd_cur_board_id);
        (function resume_board_detail_highlight(attempts) {
          attempts = attempts || 0;
          if(!appState || appState.isDestroyed) { return; }
          if($(".board[data-id='" + board.get('id') + "']").length > 0) {
            runLater(function() {
              var ctrl = appState && appState.controller;
              if(ctrl && !ctrl.isDestroyed && typeof ctrl.highlight_button === 'function') {
                ctrl.highlight_button('resume');
              }
            });
          } else if(attempts < 10) {
            runLater(function() { resume_board_detail_highlight(attempts + 1); }, (attempts + 1) * 100);
          }
        })(0);
      }
      return;
    }
    var board_level = controller.get('current_level') || editManager.get_stashes().get('board_level') || 10;
    board.set('display_level', board_level);
    if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying getting contextualized_buttons'); }
    var buttons = board.contextualized_buttons(appState.get('label_locale'), appState.get('vocalization_locale'), editManager.get_stashes().get('working_vocalization'), false, appState.get('inflection_shift'));
    var preferred_symbols = appState.get('referenced_user.preferences.preferred_symbols') || 'original';
    var grid = board.get('grid');
    if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying got buttons and grid', { buttonsLength: buttons && buttons.length, hasGrid: !!grid }); }
    if(!grid) { return; }
    var allButtonsReady = true;
    var _this = this;
    var result = [];
    result.board_id = board.get('id');
    var pending_buttons = [];
    var used_button_ids = {};

    LingoLinq.log.track('process word suggestions');
    if(controller.get('model.word_suggestions')) {
      controller.set('suggestions', {loading: true});
      word_suggestions.load().then(function() {
        controller.set('suggestions', {ready: true});
        controller.updateSuggestions();
      }, function() {
        controller.set('suggestions', {error: true});
      });
    }

    // new workflow:
    // - get all the associated image and sound ids
    // - if the board was loaded remotely, they should all be peekable
    // - if they're not peekable, do a batch lookup in the local db
    //   NOTE: I don't think it should be necessary to push them into the
    //   ember-data cache, but maybe do that as a background job or something?
    // - if any *still* aren't reachable, mark them as broken
    // - do NOT make remote requests for the individual records???

    var resume_scanning = function() {
      if(!appState || (appState.isDestroyed !== undefined && appState.isDestroyed)) { return; }
      resume_scanning.attempts = (resume_scanning.attempts || 0) + 1;
      if($(".board[data-id='" + board.get('id') + "']").length > 0) {
        runLater(function() {
          var ctrl = appState && appState.controller;
          if(ctrl && !ctrl.isDestroyed && typeof ctrl.highlight_button === 'function') {
            ctrl.highlight_button('resume');
          }
        });
        var ctrl = appState.controller;
        if(ctrl && !ctrl.isDestroyed && typeof ctrl.send === 'function') {
          ctrl.send('check_scanning');
        }
        // also check for word suggestions
        if(appState && typeof appState.refresh_suggestions === 'function') {
          appState.refresh_suggestions();
        }
      } else if(resume_scanning.attempts < 10) {
        runLater(resume_scanning, resume_scanning.attempts * 100);
      } else {
        console.error("scanning resume timed out");
      }
    };

    var p = this.persistence || (typeof window !== 'undefined' && window.persistence);
    var need_everything_local = appState.get('speak_mode') || !p || typeof p.get !== 'function' || !p.get('online');
    if(appState.get('speak_mode') && !is_board_detail) {
      if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying speak_mode path', { hasFastHtml: !!board.get('fast_html') }); }
      controller.update_button_symbol_class();
      if(!ignore_fast_html && board.get('fast_html') && fastHtmlHasRenderableContent(board.get('fast_html'))
            && board.get('fast_html.width') == controller.get('width') 
            && board.get('fast_html.height') == controller.get('height') 
            && board.get('current_revision') == board.get('fast_html.revision') 
            && board.get('fast_html.label_locale') == appState.get('label_locale') 
            && board.get('fast_html.display_level') == board_level 
            && board.get('fast_html.inflection_prefix') == appState.get('inflection_prefix') 
            && board.get('fast_html.inflection_shift') == appState.get('inflection_shift') 
            && board.get('fast_html.skin') == appState.get('referenced_user.preferences.skin') 
            && board.get('fast_html.symbols') == appState.get('referenced_user.preferences.preferred_symbols') 
            && board.get('focus_id') == board.get('fast_html.focus_id')) {
        LingoLinq.log.track('already have fast render');
        if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (already have fast render)'); }
        resume_scanning();
        applyBoardDetailFocusDim();
        return;
      } else {
        board.set('fast_html', null);
        board.add_classes();
        LingoLinq.log.track('trying fast render');
        if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying calling render_fast_html'); }
        var fast = board.render_fast_html({
          label_locale: appState.get('label_locale'),
          height: controller.get('height'),
          width: controller.get('width'),
          skin: appState.get('referenced_user.preferences.skin'),
          symbols: appState.get('referenced_user.preferences.preferred_symbols'),
          extra_pad: controller.get('extra_pad'),
          inner_pad: controller.get('inner_pad'),
          display_level: board_level,
          focus_id: board.get('focus_id'),
          base_text_height: controller.get('base_text_height'),
          text_only_button_symbol_class: controller.get('text_only_button_symbol_class'),
          button_symbol_class: controller.get('button_symbol_class')
        });

        if(fastHtmlHasRenderableContent(fast)) {
          // var prior = JSON.stringify(board.get('fast_html'));
          // if(prior && prior != JSON.stringify(fast)) {
            board.set_fast_html(fast);
          // }
          // TODO: this repeats too many times
          if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying early return (fast_html set)'); }
          resume_scanning();
          applyBoardDetailFocusDim();
          return;
        }
      }
    }

    // build the ordered grid
    // TODO: work without ordered grid (i.e. scene displays)
    if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying building grid (before find_content_locally)'); }
    LingoLinq.log.track('finding content locally');
    var prefetch = board.find_content_locally().then(null, function(err) {
      return RSVP.resolve();
    });
    if (_vb) { console.log('[BOARD-DEBUG] edit_manager.process_for_displaying sync path done (prefetch.then scheduled)'); }

    buttons.forEach(function(btn) {
      if(btn.no_skin && btn.image_id) {
        LingoLinq.Image.unskins = LingoLinq.Image.unskins || {};
        LingoLinq.Image.unskins[btn.image_id] = true
      }
    });
    var image_urls = board.variant_image_urls(editManager.get_app_state().get('referenced_user.preferences.skin'));
    var sound_urls = board.get('sound_urls');
    prefetch.then(function() {
      LingoLinq.log.track('creating buttons');
      preferred_symbols = editManager.get_app_state().get('referenced_user.preferences.preferred_symbols') || 'original';
      for(var idx = 0; idx < grid.rows; idx++) {
        var row = [];
        for(var jdx = 0; jdx < grid.columns; jdx++) {
          var button = null;
          var id = (grid.order[idx] || [])[jdx];
          for(var kdx = 0; kdx < buttons.length; kdx++) {
            if(id !== null && id !== undefined && buttons[kdx].id == id && !used_button_ids[id]) {
              // only allow each button id to be used once, even if referenced more than once in the grid
              // TODO: if a button is references more than once in the grid, probably clone
              // it for the second reference or something rather than just ignoring it. Multiply-referenced
              // buttons do weird things when in edit mode.
              used_button_ids[id] = true;
              var more_args = {board: board};
              if(board.get('no_lookups')) {
                more_args.no_lookups = true;
              }
              if(image_urls) {
                more_args.image_url = image_urls[buttons[kdx]['image_id'] + '-' + preferred_symbols] || image_urls[buttons[kdx]['image_id']];
                more_args.unpref_image_url = image_urls[buttons[kdx]['image_id']];
              }
              if(buttons[kdx].no_skin) {
                more_args.image_url = image_urls['ns_' + buttons[kdx]['image_id'] + '-' + preferred_symbols] || image_urls['ns_' + buttons[kdx]['image_id']];
                more_args.unpref_image_url = image_urls['ns_' + buttons[kdx]['image_id']];
              }
              if(sound_urls) {
                more_args.sound_url = sound_urls[buttons[kdx]['sound_id']];
              }
              button = editManager.Button.create(buttons[kdx], more_args);
            }
          }
          button = button || _this.fake_button(board);
          if(!button.everything_local() && need_everything_local) {
            allButtonsReady = false;
            pending_buttons.push(button);
          }
          row.push(button);
        }
        result.push(row);
      }
      if(!allButtonsReady) {
        LingoLinq.log.track('need to wait for buttons');
        // Ember 5 (EXTEND_PROTOTYPES:false): a native array is NOT observable, so
        // board.set_all_ready's `pending_buttons.[]` / `.@each.content_status`
        // observer would never fire → all_ready stays false → ordered_buttons stays
        // null → "Grid not defined". Wrap in A() so the array stays observable and
        // all_ready flips once the button images finish loading. (Regular boards
        // usually skip this path with cached images; the eval's symbol-library
        // images always hit it, which is why the eval broke on the 5.12 upgrade.)
        board.set('pending_buttons', emberArray(pending_buttons));
        board.addObserver('all_ready', function() {
          if(!controller.get('ordered_buttons')) {
            if(controller.get('model.id') == result.board_id) {
              board.set('pending_buttons', null);
              controller.set('ordered_buttons',result);
              LingoLinq.log.track('redrawing if needed');
              controller.redraw_if_needed();
              LingoLinq.log.track('done redrawing if needed');
              applyBoardDetailFocusDim();
              resume_scanning();  
            }
          }
        });
        controller.set('ordered_buttons', null);
      } else if(controller.get('model.id') == result.board_id) {
        LingoLinq.log.track('buttons did not need waiting');
        controller.set('ordered_buttons', result);
        LingoLinq.log.track('redrawing if needed');
        controller.redraw_if_needed();
        LingoLinq.log.track('done redrawing if needed');
        applyBoardDetailFocusDim();
        resume_scanning();
        for(var idx = 0; idx < result.length; idx++) {
          for(var jdx = 0; jdx < result[idx].length; jdx++) {
            var button = result[idx][jdx];
            if(button.get('suggest_symbol')) {
              _this.lucky_symbol(button.id);
            }
          }
        }
      }
    }, function(err) {
      console.log(err);
    });
  },
  process_for_saving: function() {
    var orderedButtons = this.controller.get('ordered_buttons') || [];
    var priorButtons = this.controller.get('model.buttons') || [];
    this.controller.set('model.update_hash', Math.random());
    this.controller.set('model.updated', new Date());
    var gridOrder = [];
    var newButtons = [];
    var maxId = 0;
    for(var idx = 0; idx < priorButtons.length; idx++) {
      maxId = Math.max(maxId, parseInt(priorButtons[idx].id, 10) || 0);
    }

    for(var idx = 0; idx < orderedButtons.length; idx++) {
      var row = orderedButtons[idx];
      var gridRow = [];
      for(var jdx = 0; jdx < row.length; jdx++) {
        var currentButton = row[jdx];
        var originalButton = null;
        for(var kdx = 0; kdx < priorButtons.length; kdx++) {
          if(priorButtons[kdx].id == emberGet(currentButton, 'id')) {
            originalButton = priorButtons[kdx];
          }
        }
        var newButton = $.extend({}, originalButton);
        if(emberGet(currentButton, 'label') || emberGet(currentButton, 'image_id')) {
          newButton.label = emberGet(currentButton, 'label');
          var vocalization = emberGet(currentButton, 'vocalization');
          if(vocalization && vocalization != newButton.label) {
            newButton.vocalization = vocalization;
          } else {
            delete newButton['vocalization'];
          }
          newButton.ref_id = emberGet(currentButton, 'ref_id');
          newButton.image_id = emberGet(currentButton, 'image_id');
          newButton.sound_id = emberGet(currentButton, 'sound_id');
          var bg = window.tinycolor(emberGet(currentButton, 'background_color'));
          if(bg._ok) {
            newButton.background_color = bg.toRgbString();
          }
          var border = window.tinycolor(emberGet(currentButton, 'border_color'));
          if(border._ok) {
            newButton.border_color = border.toRgbString();
          }
          newButton.hidden = emberGet(currentButton, 'hidden') === true;
          newButton.link_disabled = !!emberGet(currentButton, 'link_disabled');
          if(emberGet(currentButton, 'text_only')) {
            newButton.text_only = true;
          } else {
            delete newButton['text_only'];
          }
          if(emberGet(currentButton, 'no_skin')) {
            newButton.no_skin = true;
          } else {
            delete newButton['no_skin'];
          }
          if(emberGet(currentButton, 'talkAction')) {
            if(emberGet(currentButton, 'prevent_adding_to_vocalization') == null) {
              newButton.add_vocalization = true;
            } else {
              newButton.add_vocalization = !emberGet(currentButton, 'prevent_adding_to_vocalization');
            }
          } else {
            if(emberGet(currentButton, 'force_add_to_vocalization') == null) {
              newButton.add_vocalization = !!emberGet(currentButton, 'add_to_vocalization');
            } else {
              newButton.add_vocalization = !!emberGet(currentButton, 'force_add_to_vocalization');
            }
          }
          if(emberGet(currentButton, 'level_style')) {
            if(emberGet(currentButton, 'level_style') == 'none') {
              emberSet(currentButton, 'level_modifications', null);
            } else if(emberGet(currentButton, 'level_style') == 'basic' && (emberGet(currentButton, 'hidden_level') || emberGet(currentButton, 'link_disabled_level'))) {
              var mods = emberGet(currentButton, 'level_modifications') || {};
              mods.pre = mods.pre || {};
              if(emberGet(currentButton, 'hidden_level')) {
                mods.pre['hidden'] = true;
                mods[emberGet(currentButton, 'hidden_level').toString()] = {hidden: false};
              }
              if(emberGet(currentButton, 'link_disabled_level')) {
                mods.pre['link_disabled'] = true;
                mods[emberGet(currentButton, 'link_disabled_level').toString()] = {link_disabled: false};
              }
              for(var ref_key in mods.pre) {
                var found_change = false;
                for(var level in mods) {
                  if(level != 'pre' && mods[level][ref_key] != undefined && mods[level][ref_key] != mods.pre[ref_key]) {
                    found_change = true;
                  }
                }
                if(!found_change) {
                  newButton[ref_key] = mods.pre[ref_key];
                  delete mods.pre[ref_key];
                }
              }
              emberSet(currentButton, 'level_modifications', mods);
            } else if(emberGet(currentButton, 'level_json')) {
              emberSet(currentButton, 'level_modifications', JSON.parse(emberGet(currentButton, 'level_json')));
            }
          }
          newButton.level_modifications = emberGet(currentButton, 'level_modifications');
          // Folder cascade marker — set by paint_button when a folder-
          // typed button receives a level rule. Tells the backend to
          // propagate the same level_modifications to every button in
          // the downstream board tree (recursively). Cleared from the
          // in-memory button after serializing so subsequent saves
          // don't re-fire the cascade if no further changes happened.
          if(currentButton._pending_cascade_level) {
            newButton.cascade_level_to_subtree = true;
            currentButton._pending_cascade_level = false;
          }
          newButton.home_lock = !!emberGet(currentButton, 'home_lock');
          newButton.meta_home = !!(newButton.home_lock && emberGet(currentButton, 'meta_home'));
          newButton.hide_label = !!emberGet(currentButton, 'hide_label');
          newButton.blocking_speech = !!emberGet(currentButton, 'blocking_speech');
          newButton.rules = emberGet(currentButton, 'rules');
          var translations = emberGet(currentButton, 'translations');
          if(translations && translations.length > 0) {
            newButton.translations = translations;
          }
          var inflections = emberGet(currentButton, 'inflections');
          if(inflections && inflections.length > 0) {
            newButton.inflections = inflections;
          }
          var externalId = emberGet(currentButton, 'external_id');
          if(externalId) {
            newButton.external_id = externalId;
          }
          if(emberGet(currentButton, 'part_of_speech')) {
            newButton.part_of_speech = emberGet(currentButton, 'part_of_speech');
            newButton.suggested_part_of_speech = emberGet(currentButton, 'suggested_part_of_speech');
            newButton.painted_part_of_speech = emberGet(currentButton, 'painted_part_of_speech');
          }
          if(emberGet(currentButton, 'buttonAction') == 'talk') {
            delete newButton['load_board'];
            delete newButton['apps'];
            delete newButton['url'];
            delete newButton['integration'];
          } else if(emberGet(currentButton, 'buttonAction') == 'link') {
            delete newButton['load_board'];
            delete newButton['apps'];
            delete newButton['integration'];
            newButton.url = emberGet(currentButton, 'fixed_url');
            var video = emberGet(currentButton, 'video');
            if(video) {
              newButton.video = video;
            } else {
              var book = emberGet(currentButton, 'book');
              if(book) {
                newButton.book = book;
              }
            }
          } else if(emberGet(currentButton, 'buttonAction') == 'app') {
            delete newButton['load_board'];
            delete newButton['url'];
            delete newButton['integration'];
            newButton.apps = emberGet(currentButton, 'apps');
            if(newButton.apps && newButton.apps.web && newButton.apps.web.launch_url) {
              newButton.apps.web.launch_url = emberGet(currentButton, 'fixed_app_url');
            }
          } else if(emberGet(currentButton, 'buttonAction') == 'integration') {
            delete newButton['load_board'];
            delete newButton['apps'];
            delete newButton['url'];
            newButton.integration = emberGet(currentButton, 'integration');
          } else {
            delete newButton['url'];
            delete newButton['apps'];
            delete newButton['integration'];
            newButton.load_board = emberGet(currentButton, 'load_board');
          }
          // newButton.top = ...
          // newButton.left = ...
          // newButton.width = ...
          // newButton.height = ...
          if(newButton.id < 0 || !newButton.id) {
            newButton.id = ++maxId;
          }
          newButton.id = newButton.id || ++maxId;
          for(var key in newButton) {
            if(newButton[key] === undefined) {
              delete newButton[key];
            }
          }
          newButtons.push(newButton);
          gridRow.push(newButton.id);
        } else {
          gridRow.push(null);
        }
      }
      gridOrder.push(gridRow);
    }
    return {
      grid: {
        rows: gridOrder.length,
        columns: (gridOrder[0] && gridOrder[0].length) || 0,
        order: gridOrder
      },
      buttons: newButtons
    };
  },
  lucky_symbols: function(ids) {
    var _this = this;
    var board = _this.controller.get('model');
    var library = (editManager.get_app_state().get('currentUser') && editManager.get_app_state().get('currentUser').preferred_symbol_library(board)) || 'opensymbols';
    var now = (new Date()).getTime();
    var lookup = parseInt(editManager.get_stashes().get('last_image_library_at') || 0, 10);
    if(lookup > (now - (15 * 60 * 1000) && !(editManager.get_stashes().get('last_image_library') || "").match(/required/))) {
      library = editManager.get_stashes().get('last_image_library');
    }
    var posColorItems = [];
    ids.forEach(function(id) {
      var board_id = _this.controller.get('model.id');
      var button = _this.find_button(id);
      var force_refresh = button && button.label && button.image && (button.image.url || '').match(/empty_22_g/i) && !button.text_only;
      var needs_check = force_refresh || (button && button.label && !button.image && !button.local_image_url && !button.text_only);
      if(needs_check) {
        button.set('pending_image', true);
        // Don't set pending directly - it's a computed property based on pending_image/pending_sound
      }
      // Batch part-of-speech lookups below — per-button GETs hit Rack::Attack (429) on large boards.
      if(button && button.label && !button.get('background_color') && !button.get('border_color')) {
        var posText = (button.get('vocalization') || button.get('label') || '').trim();
        if(posText) {
          posColorItems.push({ id: id, text: posText });
        }
      }
      if(needs_check) {
        var locale = _this.controller.get('model.locale') || 'en';
        contentGrabbers.pictureGrabber.picture_search(library, button.label, _this.controller.get('model.user_name'), locale, true, true, null).then(function(data) {
          button = _this.find_button(id);
          var image = data[0];
          if(image && button && button.label && (!button.image || force_refresh)) {
            var license = {
              type: image.license,
              copyright_notice_url: image.license_url,
              source_url: image.source_url,
              author_name: image.author,
              author_url: image.author_url,
              uneditable: true
            };
            var preview = {
              url: editManager.get_persistence().normalize_url(image.image_url),
              content_type: image.content_type,
              suggestion: button.label,
              protected: image.protected,
              protected_source: image.protected_source,
              finding_user_name: image.finding_user_name,
              save_url: image.to_save_url,
              external_id: image.id,
              license: license
            };
            var save = contentGrabbers.pictureGrabber.save_image_preview(preview);

            save.then(function(image) {
              button = _this.find_button(id);
              if(_this.controller.get('model.id') == board_id && button && button.label && (!button.image || force_refresh)) {
                // Don't set pending directly - it's a computed property based on pending_image/pending_sound
                button.set('pending_image', false);
                var imgUrl = (image.get && (image.get('best_url') || image.get('url'))) || (typeof image.url === 'string' ? image.url : null);
                if(!imgUrl && image && image.image_url) {
                  imgUrl = image.image_url;
                }
                if(!imgUrl && preview && preview.url) {
                  imgUrl = editManager.get_persistence().normalize_url(preview.url);
                }
                // Defer to afterRender so we use the server-assigned id when the server returns a different id
                runSchedule('afterRender', function() {
                  button = _this.find_button(id);
                  if(!button || _this.controller.get('model.id') !== board_id) { return; }
                  var serverId = (image.get && image.get('id')) || image.id;
                  emberSet(button, 'image_id', serverId);
                  emberSet(button, 'image', image);
                  if(imgUrl) {
                    button.set('image_url', imgUrl);
                    button.set('local_image_url', imgUrl);
                    button.set('original_image_url', imgUrl);
                  }
                  var board = _this.controller && _this.controller.get('model');
                  if(board && imgUrl) {
                    var urls = board.get('image_urls') || {};
                    urls = Object.assign({}, urls, { [serverId]: imgUrl });
                    board.set('image_urls', urls);
                    var modelButtons = board.get('buttons') || [];
                    for(var b = 0; b < modelButtons.length; b++) {
                      if(modelButtons[b].id == id) {
                        modelButtons[b].image_id = serverId;
                        break;
                      }
                    }
                  }
                });
                runLater(function() {
                  if(editManager.controller && editManager.controller === _this.controller) {
                    if(editManager.controller.redraw_if_needed) {
                      editManager.controller.redraw_if_needed();
                    }
                  }
                }, 50);
              }
            }, function() {
              // Don't set pending directly - it's a computed property based on pending_image/pending_sound
              button.set('pending_image', false);
            });
          } else if(button) {
            // Don't set pending directly - it's a computed property based on pending_image/pending_sound
            button.set('pending_image', false);
          }
        }, function() {
          // Don't set pending directly - it's a computed property based on pending_image/pending_sound
          button.set('pending_image', false);
          // nothing to do here, this can be a silent failure and it's ok
        });
      }
    });
    if(posColorItems.length > 0) {
      var keyedColors = editManager.get_keyed_colors();
      var uniqueTexts = [];
      var seenText = {};
      posColorItems.forEach(function(item) {
        if(!seenText[item.text]) {
          seenText[item.text] = true;
          uniqueTexts.push(item.text);
        }
      });
      var fetchPosBatches = function(start, acc) {
        acc = acc || {};
        var chunk = uniqueTexts.slice(start, start + 100);
        if(chunk.length === 0) {
          return RSVP.resolve(acc);
        }
        return editManager.get_persistence().ajax('/api/v1/search/batch_parts_of_speech', {
          type: 'GET',
          data: { words: chunk.join(',') }
        }).then(function(res) {
          Object.assign(acc, (res && res.results) || {});
          return fetchPosBatches(start + 100, acc);
        }, function() {
          return fetchPosBatches(start + 100, acc);
        });
      };
      fetchPosBatches(0, {}).then(function(results) {
        posColorItems.forEach(function(item) {
          var btn = _this.find_button(item.id);
          var data = results[item.text];
          if(btn && data) {
            btn.check_for_parts_of_speech(keyedColors, data);
          }
        });
      }, function() { });
    }
  },
  lucky_symbol: function(id) {
    if(!this.controller || !editManager.get_app_state().get('edit_mode')) {
      this.lucky_symbol.pendingSymbols = this.lucky_symbol.pendingSymbols || [];
      this.lucky_symbol.pendingSymbols.push(id);
    } else {
      this.lucky_symbols([id]);
    }
  },
  stash_image: function(data) {
    this.stashedImage = data;
  },
  done_editing_image: function() {
    this.imageEditingCallback = null;
  },
  get_edited_image: function() {
    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      if(_this.imageEditorSource) {
        var resolved = false;
        _this.imageEditingCallback = function(data) {
          resolved = true;
          resolve(data);
        };
        runLater(function() {
          if(!resolved) {
            reject({error: 'editor response timeout'});
          }
        }, 500);
        _this.imageEditorSource.postMessage('imageDataRequest', '*');
      } else {
        reject({editor: 'no editor found'});
      }
    });
  },
  edited_image_received: function(data) {
    if(this.imageEditingCallback) {
      this.imageEditingCallback(data);
    } else if(this.stashedBadge && this.badgeEditingCallback) {
      this.badgeEditingCallback(data);
    }
  },
  copy_board: function(old_board, decision, user, make_public, swap_library, new_owner, disconnect) {
    return new RSVP.Promise(function(resolve, reject) {
      var ids_to_copy = old_board.get('downstream_board_ids_to_copy') || [];
      var expand_selected_ids = old_board.get('expand_selected_board_ids_to_copy');
      var prefix = old_board.get('copy_prefix');
      var level = user.get('copy_level');
      user.set('copy_level', null);
      if(decision == 'links_copy_as_home' && user && user.get('org_board_keys')) {
        // TODO: always start with a shallow clone, even if not an org board
        if(user.get('org_board_keys').indexOf(old_board.get('key')) != -1) {
          // use shallow-enabled cloning workflow shown here
          /* `org` can be undefined: `org_board_keys` is the flattened key list,
             but `organizations` only carries the orgs whose `home_board_keys`
             this client actually received. Dereferencing `org.id` threw inside
             this RSVP executor, where the TypeError is swallowed into a
             rejection and surfaced as the generic "we couldn't set up your
             board". Fall through to the normal copy path instead — it does not
             need the org reference. */
          /* NOT COVERED BY A CLICK-TEST (2026-08-14). The other two `as_home`
             cases — supervisor-picks-for-communicator, and communicator with no
             existing copy — were both driven end to end and confirmed by
             re-reading the user from the server. This org branch was not: the org
             home board is private, appears in no board-picker category, and the
             picker in that layout renders no search box, so the flow cannot be
             reached from the picker at all. The other producer of this same
             `links_copy_as_home` decision (board-detail -> "Set as Home Board" ->
             "Make a New Copy", components/set-as-home.js:180) lives in the board
             edit panel, which only renders under `edit_mode`. Both guards below
             fail SAFE — falling through to the normal copy path, or rejecting with
             a message — so the risk is unverified-not-broken. If you touch this
             branch, exercise it manually first. See
             docs/task-management/2026-08-14-click-test-adversarial-fixes.md. */
          var org = (user.get('organizations') || []).find(function(org) { return org.home_board_keys.indexOf(old_board.get('key')) != -1; });
          if(org && org.id) {
            user.set('preferences.home_board', {
              id: old_board.get('id'),
              key: old_board.get('key'),
              swap_library: swap_library,
              shallow: true,
              copy: true,
              copy_from_org: org.id
            });
            if(level && level > 0 && level < 10) {
              user.set('preferences.home_board.level', level);
            }
            user.save().then(function() {
              /* Deliberately NOT saveHomeBoard's identity check: this request
                 asks the server to COPY the org board, so it legitimately
                 stores a different id than the one sent (user.rb#
                 copy_to_home_board ~2869). What must be true is that an id came
                 back at all — without this guard a skipped write fell through to
                 findRecord(undefined), which reads as "couldn't retrieve the
                 copied board" rather than "nothing was stored". */
              var stored_id = user.get('preferences.home_board.id');
              if(!stored_id) {
                reject(i18n.t('user_home_failed', "Failed to update user's home board"));
                return;
              }
              LingoLinq.store.findRecord('board', stored_id).then(function(board) {
                resolve(board);
              }, function(err) {
                reject(i18n.t('user_home_find_failed', "Failed to retrieve the copied home board"));
              })
            }, function() {
              reject(i18n.t('user_home_failed', "Failed to update user's home board"));
            });
            return;
          }
        }
      }
      var save = old_board.create_copy(user, make_public, swap_library, new_owner, disconnect);
      if(decision == 'remove_links') {
        save = save.then(function(res) {
          res.get('buttons').forEach(function(b) {
            if(emberGet(b, 'load_board')) {
              emberSet(b, 'load_board', null);
            }
          });
          return res.save();
        });

      }
      save.then(function(board) {
        board.set('should_reload', true);
        var done_callback = function(result) {
          var finalize = function(success, result) {
            board.reload(true).then(function() {
              success ? resolve(result) : reject(result);
            }, function(err) {
              success ? resolve(result) : reject(result);              
            });
          };
          var affected_board_ids = result && result.affected_board_ids;
          var new_board_ids = result && result.new_board_ids;
          board.set('new_board_ids', new_board_ids);
          board.load_button_set(true);
          if(decision && decision.match(/as_home$/)) {
            /* CONFIRMED write. A 200 on the user PUT does not prove the home
               board was stored — process_home_board (user.rb ~2932) DELETES the
               preference and returns true when the reference will not resolve,
               so the old `user.save().then(success)` reported a board that was
               never set. saveHomeBoard reads the server's own echo back off the
               record; both rejection shapes land on the same message the caller
               already handled. */
            saveHomeBoard(user, board, null, {level: level}).then(function() {
              finalize(true, board);
            }, function() {
              finalize(false, i18n.t('user_home_failed', "Failed to update user's home board"));
            });
          } else if(decision && decision.match(/as_sidebar$/)) {
            var list = user.get('preferences.sidebar_boards');
            if(list) {
              list.forEach(function(side) {
                if(side.key == old_board.get('key') || side.id == old_board.get('id')) {
                  side.key = board.get('key');
                  side.id = board.get('id');
                }
              });
            }
            user.set('preferences.sidebar_boards', list);
            user.save().then(function() {
              finalize(true, board);
            }, function() {
              finalize(false, i18n.t('user_sidebar_failed', "Failed to update user's sidebar"));
            });
          } else {
            finalize(true, board);
          }
          editManager.get_stashes().persist('last_index_browse', 'personal');
          old_board.reload_including_all_downstream(affected_board_ids);
        };
        var endpoint = null;
        if(decision == 'modify_links_update' || decision == 'modify_links_copy') {
          if((user.get('stats.board_set_ids') || []).indexOf(old_board.get('id')) >= 0) {
            endpoint = '/api/v1/users/' + user.get('id') + '/replace_board';
          } else if((user.get('stats.sidebar_board_ids') || []).indexOf(old_board.get('id')) >= 0) {
            endpoint = '/api/v1/users/' + user.get('id') + '/replace_board';
          }
        } else if(decision == 'links_copy' || decision == 'links_copy_as_home' || decision == 'links_copy_as_sidebar') {
          endpoint = '/api/v1/users/' + user.get('id') + '/copy_board_links';
        }
        if(endpoint) {
          editManager.get_persistence().ajax(endpoint, {
            type: 'POST',
            data: {
              old_board_id: old_board.get('id'),
              new_board_id: board.get('id'),
              update_inline: (decision == 'modify_links_update'),
              old_default_locale: old_board.get('locale'),
              new_default_locale: old_board.get('default_locale') || old_board.get('locale'),
              swap_library: swap_library,
              ids_to_copy: ids_to_copy.join(','),
              expand_selected_board_ids: expand_selected_ids,
              new_owner: new_owner,
              disconnect: disconnect,
              copy_prefix: prefix,
              make_public: make_public
            }
          }).then(function(data) {
            progress_tracker.track(data.progress, function(event) {
              if(event.status == 'finished' || event.finished_at) {
                runLater(function() {
                  user.reload();
                  editManager.get_app_state().refresh_session_user();
                }, 100);
                var res = event.result;
                if(typeof res === 'string') {
                  try { res = JSON.parse(res) || {}; } catch(e) { }
                }
                done_callback(res);
              } else if(event.status == 'errored') {
                if(event.result) {
                  reject(i18n.t('re_linking_failed_custom', "Board re-linking failed: ") + event.result);
                } else {
                  reject(i18n.t('re_linking_failed2', "Board re-linking failed while processing"));
                }
              }
            });
          }, function() {
            reject(i18n.t('re_linking_failed', "Board re-linking failed unexpectedly"));
          });
        } else if((decision == 'remove_links' || decision == 'keep_links') && swap_library && swap_library != 'original') {
          editManager.get_persistence().ajax('/api/v1/boards/' + board.get('id') + '/swap_images', {
            type: 'POST',
            data: {
              library: swap_library,
              board_ids_to_convert: [board.get('id')]
            }
          }).then(function(res) {
            progress_tracker.track(res.progress, function(event) {
              if(event.status == 'errored') {
                reject(i18n.t('swap_imaged_failed2', "Swapping images for new board failed unexpectedly"));
              } else if(event.status == 'finished' || event.finished_at) {
                board.reload(true).then(function() {
                  editManager.get_app_state().set('board_reload_key', Math.random() + "-" + (new Date()).getTime());
                  done_callback();
                }, function() {
                  done_callback();
                });
              }
            });
          }, function(res) {
            reject(i18n.t('swap_imaged_failed', "Swapping images for new board failed"));
          });
        } else {
          done_callback();
        }
      }, function(err) {
        reject(i18n.t('copying_failed', "Board copy failed unexpectedly"));
      });
    });
  },
  retrieve_badge: function() {
    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      var state = null, data_url = null;
      if(_this.badgeEditorSource) {
        var resolved = false;
        _this.badgeEditingCallback = function(data) {
          if(data.match && data.match(/^data:/)) {
            data_url = data;
          }
          if(data && data.zoom) {
            state = data;
          }
          if(state && data_url) {
            _this.badgeEditingCallback.state = state;
            resolved = true;
            resolve(data_url);
          }
        };
        runLater(function() {
          if(!resolved && data_url) {
            resolve(data_url);
          } else if(!resolved) {
            reject({error: 'editor response timeout'});
          }
        }, 500);
        _this.badgeEditorSource.postMessage('imageDataRequest', '*');
        _this.badgeEditorSource.postMessage('imageStateRequest', '*');
      } else {
        reject({editor: 'no editor found'});
      }
    });
  }
}).create({
  history: [],
  future: [],
  lastChange: {},
  board: null
});

$(window).bind('message', function(event) {
  event = event.originalEvent || event;
  if(event.data && event.data.match && event.data.match(/^data:image/)) {
    editManager.edited_image_received(event.data);
  } else if(event.data && event.data.match && event.data.match(/state:{/)) {
    var str = event.data.replace(/^state:/, '');
    try {
      var json = JSON.parse(str);
      if(editManager.stashedBadge && editManager.badgeEditingCallback) {
        editManager.badgeEditingCallback(json);
      }
    } catch(e) { }
  } else if(event.data == 'imageDataRequest' && editManager.stashedImage) {
    editManager.imageEditorSource = event.source;
    event.source.postMessage(editManager.stashedImage.url, '*');
  } else if(event.data == 'wordStateRequest' && editManager.stashedImage) {
    editManager.imageEditorSource = event.source;
    event.source.postMessage("state:" + JSON.stringify(editManager.stashedImage), '*');
  } else if(event.data == 'imageURLRequest' && editManager.stashedBadge) {
    editManager.badgeEditorSource = event.source;
    if(editManager.stashedBadge && editManager.stashedBadge.image_url) {
      event.source.postMessage('https://opensymbols.s3.amazonaws.com/libraries/mulberry/bright.svg', '*');
    }
  } else if(event.data == 'imageStateRequest' && editManager.stashedBadge) {
    editManager.badgeEditorSource = event.source;
    if(editManager.stashedBadge && editManager.stashedBadge.state) {
      event.source.postMessage('state:' + JSON.stringify(editManager.stashedBadge.state));
    }
  }
});
window.editManager = editManager;

// Static service registry for explicit injection
editManager._services = {};

// Getter methods for services with fallback to globals
editManager.get_app_state = function() {
  return editManager._services.app_state || window.appState || (window.LingoLinq && window.LingoLinq.appState);
};

editManager.get_persistence = function() {
  return editManager._services.persistence || window.persistence || (window.LingoLinq && window.LingoLinq.persistence);
};

editManager.get_keyed_colors = function() {
  // Use board-detail colors when the active controller is the board-detail page
  if(editManager.controller && editManager.controller.constructor &&
     editManager.controller.constructor.toString().match(/board-detail/)) {
    return window.LingoLinq.board_detail_keyed_colors || window.LingoLinq.keyed_colors;
  }
  // Check for a board_detail_route flag set by the board-detail controller
  if(editManager.controller && editManager.controller.get && editManager.controller.get('is_board_detail')) {
    return window.LingoLinq.board_detail_keyed_colors || window.LingoLinq.keyed_colors;
  }
  return window.LingoLinq.keyed_colors;
};

editManager.get_stashes = function() {
  return editManager._services.stashes || window.stashes || (window.LingoLinq && window.LingoLinq.stashes);
};

// Service registration method
editManager.register_services = function(appStateService, persistenceService, stashesService) {
  if(appStateService) {
    editManager._services.app_state = appStateService;
    editManager._services.appState = appStateService;
  }
  if(persistenceService) { editManager._services.persistence = persistenceService; }
  if(stashesService) { editManager._services.stashes = stashesService; }
};

export default editManager;
