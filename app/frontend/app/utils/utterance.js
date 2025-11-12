import EmberObject from '@ember/object';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import { set as emberSet, get as emberGet } from '@ember/object';
import i18n from './i18n';
import stashes from './_stashes';
import speecher from './speecher';
import app_state from './app_state';
import persistence from './persistence';
import $ from 'jquery';
import LingoLinq from '../app';
import { observer } from '@ember/object';
import word_suggestions from './word_suggestions';

var punctuation_at_start = /^\+[\.\?\,\!]/;
var punctuation_with_space = /^\s*[\.\?\,\!]\s*$/;
var punctuation_at_end = /[\.\?\,\!]\s*$/;
var punctuation_ending_sentence = /[\.\?\!]/;
var utterance = EmberObject.extend({
  setup: function(controller) {
    this.controller = controller;
    this.set('rawButtonList', stashes.get('working_vocalization'));
    this.set('app_state', app_state);
    app_state.addObserver('currentUser', this, this.update_voice);
    app_state.addObserver('currentUser.preferences.device.voice', this, this.update_voice);
    app_state.addObserver('currentUser.preferences.device.voice.volume', this, this.update_voice);
    app_state.addObserver('currentUser.preferences.device.voice.pitch', this, this.update_voice);
    app_state.addObserver('currentUser.preferences.device.voice.voiceURI', this, this.update_voice);
    app_state.addObserver('currentUser.preferences.clear_on_vocalize', this, this.update_voice);
//     this.set('clear_on_vocalize', window.user_preferences.any_user.clear_on_vocalize);
//     speecher.set_voice(window.user_preferences.device.voice);
    if(stashes.get('ghost_utterance')) {
      this.set('list_vocalized', true);
    }
  },
  update_voice: function() {
    var user = app_state.get('currentUser');
    if(user && user.get) {
      if(user.get && user.get('preferences.device.voice')) {
        user.update_voice_uri();
        speecher.set_voice(user.get('preferences.device.voice'), user.get('preferences.device.alternate_voice'));
      }
      this.set('clear_on_vocalize', user.get('preferences.clear_on_vocalize'));
    }
  },
  set_button_list: observer(
    'app_state.insertion.index',
    'rawButtonList',
    'rawButtonList.[]',
    'rawButtonList.length',
    'rawButtonList.@each.image',
    'hint_button',
    'hint_button.label',
    'hint_button.image_url',
    function() {
      var buttonList = [];
      var _this = this;
      var rawList = _this.get('rawButtonList');
      if(!rawList) { app_state.set('button_list', []); return; }
      var last_append = null;
      
      // check user.preferences.substitutions
      if(rawList.length > 0 && rawList[rawList.length - 1].auto_substitute !== false) {
        var rule = utterance.first_rules((app_state.get('sessionUser.preferences.substitutions') || []), rawList, true)[0];
        if(rule && rule.lookback.length > 1) {
          var str = rule.label;
          var original = rawList.slice(0 - rule.lookback.length);
          if(original[0].capitalized) {
            str = utterance.capitalize(str);
          }
          rawList = rawList.slice(0, 0 - rule.lookback.length);
          rawList.push({
            pre_substitution: original,
            auto_substitute: false,
            capitalized: original[0].capitalized,
            image: original[original.length - 1].image,
            label: str
          });
          _this.set('rawButtonList', rawList);
        }

        if(app_state.get('sessionUser.preferences.substitute_contractions')) {
          var rules = [];
          var lang = (app_state.get('speak_mode') && app_state.get('vocalization_locale')) || i18n.langs.preferred || i18n.langs.fallback || 'en';
          var lang_fallback = lang.split(/-|_/)[0];
          var contractions = (i18n.lang_overrides[lang] || i18n.lang_overrides[lang_fallback] || {}).default_contractions || i18n.substitutions.default_contractions;
          for(var cont in contractions) {
            var rule_parts = cont.toLowerCase().split(/\s+/);
            rule_parts.push(contractions[cont]);
            rules.push(rule_parts);
          }
          var rule = utterance.first_rules(rules, rawList, true)[0];
          if(rule) {
            var str = rule.label;
            var original = rawList.slice(0 - rule.lookback.length);
            if(original[0].capitalized) {
              str = utterance.capitalize(str);
            }
            rawList = rawList.slice(0, 0 - rule.lookback.length);
            rawList.push({
              pre_substitution: original,
              auto_substitute: false,
              image: original[original.length - 1].image,
              label: str
            });
            _this.set('rawButtonList', rawList);
          }
        } 
      }
      
      // Combine raw list into actual buttons/words
      for(var idx = 0; idx < rawList.length; idx++) {
        var button = rawList[idx];
        button.modifications = null;
        emberSet(button, 'auto_substitute', false);
        button.raw_index = idx;
        last_append = null;
        var last = rawList[idx - 1] || {};
        var last_computed = buttonList[buttonList.length - 1];
        var text = (button && (button.vocalization || button.label)) || '';

        var plusses = [], colons = [], inlines = [];
        if(button.specialty_with_modifiers) {
          var parts = text.split(/\s*&&\s*/);
          parts.forEach(function(text) {
            if(text.match(/^\+/)) {
              plusses.push(text);
            } else if(text.match(/^\:/)) {
              colons.push(text);
            }
          });
        }
        var regex = /.\s*:[^\s\&]+\s*./g;
        var group = null;
        while((group = regex.exec(text)) != null) {
          var txt = group[0];
          if(!txt.match(/^&/) || !txt.match(/&$/)) {
            var mod = txt.match(/:[^\s\&]+/);
            inlines.push([mod[0], group.index + mod.index]);
          }
        }
        
        var added = false;
        if(plusses.length > 0) {
          last = {};
          // Append to the last button if that one is still in progress,
          // or this is a punctuation mark, or it's part of a decimal number
          if(idx === 0 || last_computed.in_progress || plusses[0].match(punctuation_at_start) || ((last_computed.vocalization || last_computed.label).match(/[\.\,]$/) && plusses[0].match(/^\+\d/))) {
            last = buttonList.pop() || {};
          }
          // append to previous
          var altered = _this.modify_button(last, button);
          added = true;
          last_append = plusses[plusses.length - 1];
          buttonList.push(altered);
        }
        var inline_actions = false;
        if(colons.length > 0) {
          colons.forEach(function(text) {
            last = buttonList.pop();
            if((text == ':complete' || text == ':predict') && !(last || {}).in_progress) {
              if(last) {
                buttonList.push(last);
              }
              last = {};
            }
            var action = LingoLinq.find_special_action(text);
            if(action && (action.modifier || action.completion) && !added) {
              var altered = _this.modify_button(last || {}, button);
              added = true;                           
              buttonList.push(altered);
            } else if(last) {
              buttonList.push(last);
            }
          });
        }
        if(inlines.length > 0) {
          inlines.forEach(function(arr) {
            var action = LingoLinq.find_special_action(arr[0]);
            if(action && action.inline) {
              inline_actions = inline_actions || [];
              action = Object.assign({}, action);
              action.str = arr[0];
              action.index = arr[1];
              inline_actions.unshift(action);
            }
          });
        }
        if(inline_actions && !button.inline_content) {
          rawList[idx].inline_content = utterance.combine_content(utterance.process_inline_content(text, inline_actions));
        }
        if(button.inline_content) {
          // Collect all the text components and inline components
          // and aggregate them together. Combine all adjacent text
          // components, then add the button as-is if no sounds
          // are attached, otherwise add a list of buttons as needed.
          // Mark the buttons as inline_generated so we don't
          // re-call .content() on future button adds/modifications
          var btn = Object.assign({}, button);
          btn.vocalization = button.inline_content.map(function(c) { return c.text; }).join(' ');
          added = true;
          buttonList.push(btn);
        }
        if(!added) {
          buttonList.push(rawList[idx]);
          if(button.condense_items) {
            var new_list = [];
            buttonList.forEach(function(b, idx) {
              if(button.condense_items.indexOf(idx) == -1) {
                new_list.push(b);
              }
            });
            buttonList = new_list;
          }
        }
      }
      var visualButtonList = [];
      var hint = null;
      if(utterance.get('hint_button')) {
        hint = EmberObject.create({label: utterance.get('hint_button.label'), image: utterance.get('hint_button.image_url'), ghost: true});
      }
      buttonList.forEach(function(button, idx) {
        var visualButton = EmberObject.create(button);
        visualButtonList.push(visualButton);
        // Use cached images/sounds if available
        if(button.image && button.image.match(/^http/)) {
          visualButton.set('original_image', button.image);
          persistence.find_url(button.image, 'image').then(function(data_uri) {
            visualButton.set('image', data_uri);
          }, function() { 
            if(button.image.match(/\.variant/)) {
              var unskin = button.image.replace(/\.variant-.+\.(png|svg)$/, '');
              persistence.find_url(unskin, 'image').then(function(data_uri) {
                visualButton.set('image', data_uri);
              }, function() {

              });
            }
          });
        }
        if(button.sound && button.sound.match(/^http/)) {
          visualButton.set('original_sound', button.sound);
          persistence.find_url(button.sound, 'sound').then(function(data_uri) {
            visualButton.set('sound', data_uri);
          }, function() { });
        }
        visualButton.set('label', (visualButton.get('label') || '').replace(/\s$/g, ''));
        if(visualButton.get('vocalization')) {
          visualButton.set('vocalization', visualButton.get('vocalization').replace(/\s$/g, ''));
        }
        if(app_state.get('insertion.index') == idx) {
          visualButton.set('insert_after', true);
          if(hint) {
            visualButtonList.push(hint);
            hint = null;
          }
        } else if(app_state.get('insertion.index') == -1 && idx == 0) {
          visualButton.set('insert_before', true);
          if(hint) {
            visualButtonList.unshift(hint);
            hint = null;
          }
        }
      });
      var idx = Math.min(Math.max(app_state.get('insertion.index') || visualButtonList.length - 1, 0), visualButtonList.length - 1);
      var last_spoken_button = visualButtonList[idx];
      var last_spoken_text = last_spoken_button && (last_spoken_button.vocalization || last_spoken_button.label || "");
      if(last_spoken_text && last_spoken_text.match(/\s/) && !last_append) {
        // if it wasn't appending, then don't assume it was intended to speak the whole last sentence
      } else {
        // If the last event was a punctuation mark, speak the whole last sentence
        if(last_spoken_button && !last_spoken_button.blocking_speech && last_spoken_text.match(punctuation_at_end)) {
          var prior = utterance.sentence(visualButtonList.slice(0, -1));
          var parts = prior.split(punctuation_ending_sentence);
          var last_part = parts[parts.length - 1];
          var str = last_part + " " + (last_spoken_button.vocalization || last_spoken_button.label);
          last_spoken_button = {
            label: str
          };
        }
      }
      if(hint) {
        visualButtonList.push(hint);
      }
      app_state.set('button_list', visualButtonList);
      utterance.set('last_spoken_button', last_spoken_button);
      stashes.persist('working_vocalization', buttonList);
      if(!utterance.suggestion_refresh_scheduled) {
        utterance.suggestion_refresh_scheduled = true;
        runLater(function() {
          utterance.suggestion_refresh_scheduled = false;
          app_state.refresh_suggestions();
          if(window.editManager) {
            window.editManager.process_for_displaying();
          }
        }, 100);  
      }

    }
  ),
  first_rules: function(rules, history, prevent_expansion) {
    var history_string = (history || []).map(function(b) { return b.label + "." + b.button_id + (b.board || {}).key}).join('_');
    history_string = history_string + "::" + JSON.stringify(rules);
    utterance.recent_rules = (utterance.recent_rules || []).slice(-5);
    var match = utterance.recent_rules.find(function(r) { return r.key == history_string; });
    if(match) { return match.result; }

    var res = [];
    var found_types = {};
    if(rules && rules.length && !Array.isArray(rules[0]) && !rules[0].id) {
      rules = [];
    }
    (rules || []).forEach(function(rule) {
      if(rule && !rule.lookback && rule.forEach) {
        var str = rule[rule.length - 1];
        var rule_parts = rule.slice(0, -1);
        rule = {
          lookback: rule_parts.map(function(p) { return p.toLowerCase(); }),
          type: 'substitution',
          label: str
        };
      }
      rule.type = rule.type || 'custom';
      if(!found_types[rule.type] || rule.type == 'override') {
        var matches = utterance.matches_rule(rule, history, prevent_expansion);
        if(matches) {
          if(matches.condense_items) {
            rule = Object.assign({}, rule);
            rule.condense_items = matches.condense_items;
          }
          res.push(rule);
          found_types[rule.type] = true;
        }
      }
    });
    utterance.recent_rules.push({key: history_string, result: res});
    return res;
  },
  matches_rule: function(rule, raw_buttons, prevent_expansion) {
    var buttons = [];
    if(raw_buttons.length == 0) { return false; }
    raw_buttons.forEach(function(b) {
      if(!prevent_expansion && b.pre_substitution) {
        buttons = buttons.concat(b.pre_substitution);
      } else {
        buttons.push(b);
      }
    });
    var history_idx = buttons.length - 1;
    var valid = true;
    var condenses = [];
    for(var idx = rule.lookback.length - 1; idx >= 0 && valid; idx--) {
      var item = buttons[history_idx]
      var check = rule.lookback[idx];
      if(typeof(check) == 'string') {
        if(check.match(/^\(/)) {
          check = {type: check.replace(/\(|\)/g, '')};
        } else if(check.match(/^\[/)) {
          check = {words: check.replace(/^\[/, '').replace(/\[$/, '').split(/|/).map(function(w) { return w.replace(/^\s+/, '').replace(/\s+$/, ''); })};
        } else if(check.match(/^&/)) {
          check = {words: check.replace(/^&/, ''), condense: true};
        } else {
          check = {words: [check]};
        }
      }
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
            var mm = check.match;
            if(typeof mm == 'string') {
              mm = new RegExp(mm);
            }
            if(!label.match(mm)) {
              matching = false;
            }
          }
          if(check.non_match) {
            var nm = check.non_match;
            if(typeof nm == 'string') {
              nm = new RegExp(nm);
            }
            if(label.match(nm)) {
              matching = false;
            }
          }  
        }
        if(matching) {
          if(check.condense) {
            condenses.push(history_idx);
          }
          history_idx--;
        } else if(!check.optional) {
          valid = false;
        }
      }
    }
    if(valid && condenses.length > 0) {
      return {condense_items: condenses};
    }
    return !!valid;
  },
  process_inline_content: function(text, inline_actions) {
    var content = [];
    var loc = 0;
    inline_actions.sortBy('index').forEach(function(action) {
      var pre = text.slice(loc, action.index);
      if(pre && !pre.match(/^\s*$/)) {
        content.push({text: pre});
      }
      loc = action.index + action.str.length;
      if(action.match) {
        content = content.concat(action.content(action.str.match(action.match)));
      } else {
        content = content.concat(action.content(action.str));
      }
    });
    var left = text.slice(loc);
    if(left && !left.match(/^\s*$/)) {
      content.push({text: left});
    }
    return content;
  },
  combine_content: function(content) {
    var final_content = [];
    var text_pad = null;
    var clear_pad = function() {
      if(text_pad) { final_content.push({text: text_pad}); text_pad = null; }
    };
    for(var jdx = 0; jdx < content.length; jdx++) {
      var content_text = content[jdx].text.toString();
      if(content[jdx].sound_url) {
        clear_pad();
        final_content.push(content[jdx]);
      } else if(content_text && text_pad) {
        text_pad = (text_pad || '').replace(/\s+$/, '') + " " + content_text.replace(/^\s+/, '');
      } else if(content_text) {
        text_pad = content_text.replace(/^\s+/, '');
      }
    }
    clear_pad();
    return final_content;
  },
  update_hint: observer('hint_button.label', function() {
    if(this.get('hint_button.label')) {
//      console.error("hint button!", this.get('hint_button.label'));
      // temporarily show hint overlay
    } else {
//      console.error("hint button cleared");
      // clear hint overlay
    }
  }),
  modify_button: function(original, addition) {
    addition.mod_id = addition.mod_id || Math.round(Math.random() * 9999);
    if(original && original.modifications && original.modifications.find(function(m) { return addition.button_id == m.button_id && m.mod_id == addition.mod_id; })) {
      return original;
    }

    var altered = $.extend({}, original);

    altered.modified = true;
    altered.button_id = altered.button_id || addition.button_id;
    altered.sound = null;
    altered.board = altered.board || addition.board;
    altered.modifications = altered.modifications || [];
    altered.modifications.push(addition);

    var parts = (addition.vocalization || addition.label || '').split(/\s*&&\s*/);
    parts.forEach(function(text) {
      if(text && text.length > 0) {
        var prior_text = (altered.vocalization || altered.label || '');
        var prior_label = (altered.label || '');
        var action = LingoLinq.find_special_action(text);
    
        if(text.match(/^\+/) && (altered.in_progress || !prior_text || text.match(punctuation_at_start))) {
          altered.vocalization = prior_text + text.substring(1);
          altered.label = prior_label + text.substring(1);
          altered.in_progress = !altered.vocalization.match(punctuation_at_end);
        } else if(action && action.alter) {
          action.alter(text, prior_text, prior_label, altered, addition);
        }
    
      }
    });

    var filler = 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/pencil%20and%20paper%202.svg';
    altered.image = altered.image || filler;
    if(!altered.in_progress && altered.image == filler) {
      altered.image = 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg';
    }
    return altered;
  },
  specialty_button: function(button) {
    var vocs = [];
    (button.vocalization || '').split(/\s*&&\s*/).forEach(function(mod) {
      if(mod && mod.length > 0) { vocs.push(mod); }
    });
    var specialty = null;
    var has_action = false, has_non_action = false;
    vocs.forEach(function(voc) {
      var action = LingoLinq.find_special_action(voc);
      if(action && !action.completion && !action.modifier && !action.inline) {
        if(action.has_sound) {
          button.has_sound = true;
        }
        has_action = true;
        specialty = button;
        var any_special = true;
      } else if((voc.match(/^\+/) || voc.match(/^:/)) && voc != ':native-keyboard') {
        button.specialty_with_modifiers = true;
        if(voc.match(/^\+/) || (action && action.completion)) {
          button.default_speak = true;
        } else if(action && action.modifier) {
          button.default_speak = true;
        }
        has_non_action = true;
        specialty = button;
      } else {
        has_non_action = true;
        if(button.default_speak) {
          button.default_speak = button.default_speak + " " + voc;
        } else {
          button.default_speak = voc;
        }
      }
    });
    if(specialty && has_action && !has_non_action) {
      specialty.only_action = true;
    }
    return specialty;
  },
  add_button: function(button, original_button) {
    // clear if the sentence box was already spoken and auto-clear is enabled
    if(this.get('clear_on_vocalize') && this.get('list_vocalized')) {
      this.clear({auto_cleared: true});
    }
    // append button attributes as needed
    var b = $.extend({}, button);
    if(button.vocalization && button.vocalization.match(/:space|:complete/)) {
      var parts = (button.vocalization || button.label || '').split(/\s*&&\s*/);
      if(parts.find(function(p) { return p == ':space' || p == ':complete'; })) {
        // Search buttonset for a matching image and use that
        // if one is found
        var last_word = app_state.get('button_list')[app_state.get('button_list').length - 1];
        if(last_word && last_word.label) {
          word_suggestions.lookup({
            word_in_progress: last_word.label,
            board_ids: [app_state.get('currentUser.preferences.home_board.id'), stashes.get('temporary_root_board_state.id')]
          }).then(function(result) {
            var word = result.find(function(w) { return w.word == last_word.label; });
            if(word && word.image) { 
              emberSet(b, 'suggestion_image', word.image); 
              emberSet(b, 'suggestion_image_license', word.image_license);
              word.image_update = function(url) {
                emberSet(b, 'suggestion_image', url);
                emberSet(b, 'suggestion_image_license', word.image_license);
                runLater(function() {
                  utterance.set_button_list();
                })
              };
            }
          });
        }
      }
    }
    if(original_button && original_button.load_image && !button.suggestion_override) {
      original_button.load_image('local').then(function(image) {
        image = image || original_button.get('image');
        if(image) {
          emberSet(b, 'image', image.get('best_url'));
          emberSet(b, 'image_license', image.get('license'));
        }
      });
      original_button.load_sound('local').then(function(sound) {
        sound = sound || original_button.get('sound');
        if(sound) {
          emberSet(b, 'sound', sound.get('best_url'));
          emberSet(b, 'sound_license', sound.get('license'));
        }
      });
    }
    if(original_button && original_button.condense_items) {
      emberSet(b, 'condense_items', original_button.condense_items);
    }
    // add button to the raw button list
    var list = this.get('rawButtonList');
    var rendered_list = app_state.get('button_list');
    var idx = app_state.get('insertion.index');
    var possibly_capitalize = function(b, prior) {
      var prior = prior || {};
      var prior_text = prior.vocalization || prior.label || "";
      var prior_rendered = rendered_list.find(function(b) { return b.raw_index == prior.raw_index || (b.modifications || []).find(function(m) { return m.raw_index == prior.raw_index; }); });
      if(prior_rendered) { prior_text = prior_rendered.vocalization || prior_rendered.label || prior_text; }
      var do_capitalize = false;
      if(!prior_text) {
        do_capitalize = true;
      } else if(app_state.get('shift')) {
        do_capitalize = 'force';
      } else if(b.vocalization == ':complete' && utterance.capitalize(prior_text) == prior_text) {
        do_capitalize = 'force';
      } else if(b.vocalization == ':complete' && prior_text.length > 1 && prior_text.toUpperCase() == prior_text) {
        do_capitalize = 'caps';
      } else if(prior_text.match(punctuation_ending_sentence)) {
        if(!button.unshifted) {
          var do_capitalize = false;
          var parts = prior_text.split(/\s*&&\s*/);
          parts.forEach(function(part) {
            if(part.match(punctuation_ending_sentence) && part.match(punctuation_at_end)) {
              do_capitalize = true;
            }
          });
        }
      }
      if(do_capitalize == 'force' || (do_capitalize && app_state.get('shift') !== false && app_state.get('sessionUser.preference.auto_capitalize') !== false)) {
        if(b.vocalization) {
          b.vocalization = utterance.capitalize(b.vocalization);
        }
        b.label = utterance.capitalize(b.label);
        b.capitalized = true;
        if(b.completion) { b.completion = utterance.capitalize(b.completion); }
      } else if(do_capitalize == 'caps') {
        if(b.vocalization) {
          b.vocalization = b.vocalization.toUpperCase();
        }
        b.label = b.label.toUpperCase();
        b.capitalized = true;
        if(b.completion) { b.completion = b.completion.toUpperCase(); }
      }
      return do_capitalize;
    }
    app_state.set('inflection_shift', null);
    if(app_state.get('insertion') && isFinite(idx)) {
      // insertion.index is for the visual list, which has 
      // different items than the raw list
      var button = app_state.get('button_list')[idx];
      var raw_index = button && button.raw_index;
      if(button) {
        if(button.modifications) {
          raw_index = button.modifications[button.modifications.length - 1].raw_index || (raw_index + button.modifications.length);
        }
        possibly_capitalize(b, list[raw_index]);
        list.insertAt(raw_index + 1, b);
      }
      if(!b.specialty_with_modifiers) {
        app_state.set('insertion.index', Math.min(list.length - 1, idx + 1));
      }
    } else {
      possibly_capitalize(b, list[list.length - 1]);
      list.pushObject(b);
    }
    app_state.set('shift', null);
    this.set('list_vocalized', false);
    // retrieve the correct result from the now-updated button list
    // should return whatever it is the vocalization is supposed to say
    return utterance.get('last_spoken_button');
  },
  capitalize: function(str) {
    if(str.match(/^\+/)) {
      return '+' + str.charAt(1).toUpperCase() + str.slice(2);
    } else {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

  },
  contraction: function() {
    var buttons = app_state.get('button_list').slice(-2);
    var str_2 = buttons.map(function(b) { return b.label; }).join(' ');
    var str_1 = (buttons[buttons.length - 1] || {}).label;
    var res = null;
    var lang = (app_state.get('speak_mode') && app_state.get('vocalization_locale')) || i18n.langs.preferred || i18n.langs.fallback || 'en';
    var lang_fallback = lang.split(/-|_/)[0];
    var contractions = (i18n.lang_overrides[lang] || i18n.lang_overrides[lang_fallback] || {}).contractions || i18n.substitutions.contractions
    for(var words in contractions) {
      if(!res) {
        var words_minus_last = words.split(/\s+/).slice(0, -1).join(' ');
        if(words.length > 0 && str_2 && str_2.toLowerCase() == words) {
          res = {lookback: words.split(/\s+/).length, label: contractions[words]};
        } else if(words_minus_last.length > 0 && str_1 && str_1.toLowerCase() == words_minus_last) {
          res = {lookback: words_minus_last.split(/\s+/).length, label: contractions[words]};
        }
      }
    }
    if(!res) {
      var last = buttons.slice(-1)[0];
      if(last && last.part_of_speech == 'noun') {
        res = {lookback: 1, label: last.label + "'s"};
      }
    }
    return res;
  },
  apply_contraction: function(contraction) {
    var rawList = utterance.get('rawButtonList');
    var to_remove = [];
    if(contraction.lookback > 0) {
      var buttons = app_state.get('button_list').slice(0 - contraction.lookback);
      var last = buttons[buttons.length - 1] || {};
      last = last.modifications ? (last.modifications[last.modifications.length - 1].raw_index) : last.raw_index;
      var first = buttons[0] || {};
      first = first.modifications ? (first.modifications[0].raw_index) : first.raw_index;
      var count  =  (last - first) + 1;
      to_remove = rawList.slice(0 - count);
      rawList = rawList.slice(0, 0 - count);
      utterance.set('rawButtonList', rawList);
    }
    app_state.activate_button({label: contraction.label}, {
      label: contraction.label,
      prevent_return: true,
      button_id: null,
      pre_substitution: to_remove,
      source: 'speak_menu',
      board: {id: 'speak_menu', key: 'core/speak_menu'},
      type: 'speak'
    });
  },
  speak_button: function(button) {
    var alt_voice = speecher.alternate_voice && speecher.alternate_voice.enabled && speecher.alternate_voice.for_buttons === true;
    if(button.sound) {
      var collection_id = null;
      if(button.blocking_speech) {
        collection_id = 'hold-' + button.button_id + "-" + (button.board || {}).id + "-" + Math.round((new Date()).getTime() / 30000);
      }
      speecher.speak_audio(button.sound, 'text', collection_id, {alternate_voice: alt_voice, prevent_repeat: true, prevent_any: app_state.get('referenced_user.preferences.prevent_button_interruptions')});
    } else {
      if(speecher.ready) {
        if(button.vocalization == ":beep") {
          speecher.beep();
        } else {
          var collection_id = null;
          if(button.blocking_speech) {
            collection_id = 'hold-' + button.button_id + '-' + (button.board || {}).id + '-' + Math.round((new Date()).getTime() / 30000);
          }
          if(button.inline_content) {
            var items = [];
            var list = button.inline_content;
            for(var idx = 0; idx < list.length; idx++) {
              if(list[idx].sound_url) {
                var url = list[idx].sound_url;
                if(url.match(/_url$/)) { url = speecher[url]; }
                items.push({sound: url});
              } else {
                items.push({text: list[idx].text});
              }
            }
            speecher.speak_collection(items, collection_id, {alternate_voice: alt_voice});
          } else {
            var text = button.vocalization || button.label;
            speecher.speak_text(text, collection_id, {alternate_voice: alt_voice, prevent_repeat: true, prevent_any: app_state.get('referenced_user.preferences.prevent_button_interruptions')});
          }
        }
      } else {
        this.silent_speak_button(button);
      }
    }
  },
  sentence: function(u) {
    return u.map(function(b) { return b.vocalization || b.label; }).join(" ");
  },
  silent_speak_button: function(button) {
    var selector = '#speak_mode';
    var opts = {html: true};
    var timeout = 2000;
    if(app_state.get('speak_mode')) {
      opts.container = 'body';
      opts.placement = 'bottom';
      selector = '#home_button';
    }
    if(!$(selector).attr('data-popover')) {
      $(selector).attr('data-popover', true).popover(opts);
    }
    runCancel(this._popoverHide);
    var div = document.createElement('div');
    div.innerText = "\"" + (button.vocalization || button.label) + "\"";
    if(button.message) {
      if(button.message.match(/^http/)) {
        var img = document.createElement('img');
        img.setAttribute('class', 'reaction');
        img.src = button.message;
        div.innerText = "";
        div.append(img);
        timeout = 3000;
      } else {
        div.innerText = button.message;
        timeout = 5000;
      }
    }
    if(button.sound) {
      var span = document.createElement('span');
      span.setAttribute('class', 'glyphicon glyphicon-volume-up');
      div.append(" ");
      div.append(span);
    }
    if(button.avatar_url) {
      var img = document.createElement('img');
      img.setAttribute('class', 'user');
      img.src = button.avatar_url;
      div.prepend(img);
    }
    $(selector).attr('data-content', div.innerHTML).popover('show');

    this._popoverHide = runLater(this, function() {
      $(selector).popover('hide');
    }, timeout);
  },
  speak_text: function(text) {
    if(text == ':beep') {
      speecher.beep();
    } else {
      speecher.speak_text(text);
    }
  },
  alert: function(opts) {
    speecher.beep(opts);
  },
  clear: function(opts) {
    opts = opts || {}
    app_state.set('shift', null);
    app_state.set('inflection_shift', null);
    if(app_state.get('reply_note') && this.get('rawButtonList.length') == 0) {
      app_state.set('reply_note', null);
    }
    app_state.set('insertion', null);
    var prior_list = this.get('rawButtonList') || [];
    this.set('rawButtonList', []);
    var audio = [];
    if(document.getElementById('button_list')) {
      audio = document.getElementById('button_list').getElementsByTagName('AUDIO');
    }
    for(var idx = audio.length - 1; idx >= 0; idx--) {
      audio[idx].parentNode.removeChild(audio[idx]);
    }
    this.remember_utterance(prior_list);

    if(!opts.skip_logging) {
      stashes.log({
        action: 'clear',
        button_triggered: opts.button_triggered
      });
    }
    if(!opts.auto_cleared) {
      speecher.stop('all');
    }
    app_state.refresh_suggestions();
    this.set('list_vocalized', false);
  },
  backspace: function(opts) {
    opts = opts || {};
    app_state.set('shift', null);
    var skip_remove = false;
    if(app_state.get('inflection_shift')) {
      skip_remove = true;
    }
    app_state.set('inflection_shift', null);
    var list = this.get('rawButtonList');
    // if buttons are about to be cleared, un-clear them
    if(app_state.get('clearable_history') > 0) {
      utterance.check_vocalization_history('reset');
    }
    // if the list is vocalized, backspace should take it back into building-mode
    else if(!this.get('list_vocalized') || !this.get('clear_on_vocalize')) {
      var idx = app_state.get('insertion.index');
      if(skip_remove) {
        this.set('rawButtonList', [].concat(this.get('rawButtonList') || []));
      } else {
        if(app_state.get('insertion') && isFinite(idx)) {
          // insertion.index is for the visual list, which has 
          // different items than the raw list
          var button = app_state.get('button_list')[idx];
          var raw_index = button && button.raw_index;
          var move_index = true;
          if(button) {
            if(button.modifications) {
              raw_index = button.modifications[button.modifications.length - 1].raw_index || (raw_index + button.modifications.length);
              move_index = false;
            }
            list.removeAt(raw_index);
          }
          if(move_index) {
            app_state.set('insertion.index', Math.max(-1, idx - 1));
          }
        } else {
          var popped = list.popObject();
          if(popped && popped.pre_substitution) {
            popped.pre_substitution[popped.pre_substitution.length - 1].auto_substitute = false
            list.pushObjects(popped.pre_substitution);
          }
        }
      }
    } else {
      speecher.stop('all');
    }
    stashes.log({
      action: 'backspace',
      button_triggered: opts.button_triggered
    });
    app_state.refresh_suggestions();
    this.set('list_vocalized', false);
  },
  set_and_say_buttons: function(buttons) {
    this.set('rawButtonList', buttons);
    this.controller.vocalize();
  },
  remember_utterance: function(list) {
    if(list.length > 0 && app_state.get('referenced_user.preferences.recent_cleared_phrases')) {
      var now = (new Date()).getTime();
      var priors = (stashes.get('prior_utterances') || []).filter(function(p) { return p.cleared > (now - (24 * 60 * 60 * 1000))} );
      var sentence = utterance.sentence(list);
      var found = false;
      priors.forEach(function(p) {
        if(utterance.sentence(p.vocalizations) == sentence) {
          found = true;
        }
      });
      if(!found) {
        priors.push({
          user_id: app_state.get('referenced_user.id'),
          cleared: now,
          vocalizations: list
        });
      }
      stashes.persist('prior_utterances', priors);
    }
  },
  check_vocalization_history: function(allow_clear) {
    var cutoff_count = 0, cutoff_ts = 0;
    if(app_state.get('currentUser.preferences.clear_vocalization_history')) {
      cutoff_count = app_state.get('currentUser.preferences.clear_vocalization_history_count') || 0;
      cutoff_ts = app_state.get('currentUser.preferences.clear_vocalization_history_minutes') || 0;
    }
    var prior_list = this.get('rawButtonList') || [];
    var now = (new Date()).getTime();
    var new_list = [];
    var old_count = 0;
    var do_update = false;
    prior_list.forEach(function(btn) {
      if(allow_clear == 'reset') {
        delete btn.vocalizations;
        delete btn.history_clearable;
        delete btn.first_vocalized;
        do_update = true;
        new_list.push(btn);
      } else {
        btn.vocalizations = (btn.vocalizations || 0);
        if(btn.history_clearable || (cutoff_count && btn.vocalizations >= cutoff_count && cutoff_ts && btn.first_vocalized < (now - cutoff_ts * 60 * 1000))) {
          // It's surpassed the cutoff and 
          // can be auto-cleared or marked as clearable
          old_count++;
          do_update = true;
          if(!btn.history_clearable) {
            btn.history_clearable = true;
          }
        } else {
          new_list.push(btn);
        }
        if(allow_clear) {
          if(!btn.first_vocalized) {
            btn.first_vocalized = now;
          }
          btn.vocalizations++;
        }
      }
    });
    if(!allow_clear && old_count > 0) {
      app_state.set('clearable_history', old_count);      
    } else {
      app_state.set('clearable_history', 0);
    }
    if((do_update || new_list.length != prior_list.length) && allow_clear) {
      new_list = [].concat(new_list);
      if(new_list.length != prior_list.length) {
        this.remember_utterance(prior_list);
      }
      runLater(function() {
        debugger
        utterance.set('rawButtonList', new_list);
      });
    }
  },
  vocalize_list: function(volume, opts) {
    opts = opts || {};
    var list = app_state.get('button_list');
    var text = list.map(function(i) { return i.vocalization || i.label; }).join(' ');
    var items = [];
    if(speecher.speaking_from_collection && app_state.get('referenced_user.preferences.utterance_interruptions') && (speecher.speaking_from_collection.match(/^utterance-/) || speecher.speaking_from_collection.match(/^hold-/))) {
      speecher.stop('text');
      return;
    } else if(speecher.speaking_from_collection && speecher.speaking_from_collection.match(/^utterance/) && app_state.get('referenced_user.preferences.prevent_utterance_repeat')) {
      return;
    }
    this.check_vocalization_history(true);

    for(var idx = 0; idx < list.length; idx++) {
      if(list[idx].inline_content) {
        list[idx].inline_content.forEach(function(content) {
          if(content.sound_url) {
            var url = content.sound_url;
            if(url.match(/_url$/)) { url = speecher[url]; }
            items.push({sound: url});
          } else if(content.text) {
            items.push({text: content.text, volume: volume});
          }
        });
      } else if(list[idx].sound) {
        items.push({sound: list[idx].sound});
      } else if(items.length && items[items.length - 1].text) {
        var item = items.pop();
        items.push({text: item.text + ' ' + (list[idx].vocalization || list[idx].label), volume: volume});
      } else {
        items.push({text: (list[idx].vocalization || list[idx].label), volume: volume});
      }
    }

    stashes.log({
      text: text,
      button_triggered: opts.button_triggered,
      buttons: stashes.get('working_vocalization')
    });
    app_state.set('insertion', null);
    var collection_id = 'utterance-' + Math.round(Math.random() * 99999) + '-' + (new Date()).getTime();
    speecher.speak_collection(items, collection_id, {override_volume: volume});
    $("#hidden_input").val("");
    this.set('list_vocalized', true);
  },
  set_ghost_utterance: observer('list_vocalized', 'clear_on_vocalize', function() {
    stashes.persist('ghost_utterance', !!(this.get('list_vocalized') && this.get('clear_on_vocalize')));
  }),
  test_voice: function(voiceURI, rate, pitch, volume, target) {
    rate = parseFloat(rate);
    if(isNaN(rate)) { rate = 1.0; }
    pitch = parseFloat(pitch);
    if(isNaN(pitch)) { pitch = 1.0; }
    volume = parseFloat(volume);
    if(isNaN(volume)) { volume = 1.0; }

    speecher.speak_text(i18n.t('do_you_like_voice', "Do you like my voice?"), 'test-' + voiceURI, {
      volume: volume,
      pitch: pitch,
      rate: rate,
      voiceURI: voiceURI,
      default_prompt: true,
      target: target
    });
  }
}).create({scope: (window.polyspeech || window)});
window.utterance = utterance;

export default utterance;
