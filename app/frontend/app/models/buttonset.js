import Ember from 'ember';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import $ from 'jquery';
import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinqAAC from '../app';
import LingoLinqAACImage from '../models/image';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';
import word_suggestions from '../utils/word_suggestions';
import progress_tracker from '../utils/progress_tracker';
import { later as runLater } from '@ember/runloop';
import Utils from '../utils/misc';
import { computed } from '@ember/object';

var button_set_cache = {};

LingoLinqAAC.Buttonset = DS.Model.extend({
  key: DS.attr('string'),
  root_url: DS.attr('string'),
  buttons: DS.attr('raw'),
  remote_enabled: DS.attr('boolean'),
  name: DS.attr('string'),
  full_set_revision: DS.attr('string'),
  encryption_settings: DS.attr('raw'),
  board_ids: computed('buttons', function() {
    return this.board_ids_for(null);
  }),
  board_ids_for: function(board_id) {
    var buttons = (board_id ? this.redepth(board_id) : this.get('buttons')) || [];
    var hash = {};
    buttons.forEach(function(b) { hash[b.board_id] = true; });
    var res = [];
    for(var id in hash) { res.push(id); }
    return res;
  },
  buttons_for_level: function(board_id, level) {
    var key = board_id + "," + level;
    var hash = this.get('board_level_counts') || {};
    if(hash[key]) { return hash[key]; }
    var board_ids = {};
    var boards_to_check = [{id: board_id}];
    var buttons = this.get('buttons') || [];
    var count = 0;
    while(boards_to_check.length > 0) {
      var board_to_check = boards_to_check.shift();
      board_ids[board_to_check.id] = true;
      buttons.forEach(function(button) {
        if(button.board_id == board_to_check.id) {
          var visible = !button.hidden;
          var linked = !!button.link_disabled;
          if(button.visible_level) {
            visible = button.visible_level <= level;
          }
          if(button.linked_level) {
            linked = button.linked_level <= level;
          }
          if(visible) {
            if(button.linked_board_id && linked) {
              if(!board_ids[button.linked_board_id]) {
                board_ids[button.linked_board_id] = true;
                boards_to_check.push({id: button.linked_board_id});
              }
            } else {
              count++;
            }
          }
        }
      });
    }
    hash[key] = count;
    this.set('board_level_counts', hash);
    return count;
  },
  load_buttons: function(force) {
    // Takes a button set that is known to be generated
    // and retrieves the button list for that set. Will
    // error if the button set needs to be generated first.
    var bs = this;
    var board_id = bs.get('id');
    return new RSVP.Promise(function(resolve, reject) {
      var hash_mismatch = bs.get('buttons_loaded_hash') && bs.get('full_set_revision') != bs.get('buttons_loaded_hash');
      if(hash_mismatch) { force = true; }
      if(bs.get('root_url') && (!bs.get('buttons_loaded') || hash_mismatch || (force && !bs.get('buttons_force_loaded')))) {
        var regenerate = function(missing) {
          return persistence.ajax('/api/v1/buttonsets/' + bs.get('id') + '/generate', {
            type: 'POST',
            data: (missing ? { missing: true } : {})
          }).then(function(data) {
            if(data.exists && data.url) {
              return RSVP.resolve(data.url);
            } else {
              return new RSVP.Promise(function(gen_res, gen_rej) {
                progress_tracker.track(data.progress, function(event) {
                  if(event.status == 'errored') {
                    gen_rej({error: 'error while generating button set'});
                  } else if(event.status == 'finished') {
                    gen_res(event.result.url);
                  }
                });  
              });
            }
          });
        };
        var process_buttons = function(buttons) {
          if(buttons && buttons.find) {
            bs.set('buttons_loaded', true);
            if(force) { bs.set('buttons_force_loaded', true); }
            bs.set('buttons_loaded_hash', bs.get('full_set_revision'));
            bs.set('buttons', buttons);
            if(!buttons.find(function(b) { return b.board_id == board_id; })) {
              regenerate();
            } else if(!buttons.find(function(b) { return b.board_id == board_id && b.depth == 0; })) {
              bs.set('buttons', bs.redepth(board_id));
            }
          } else if(buttons && !buttons.find) {
            if(!bs.get('buttons') || bs.get('buttons.length') == 0) {
              bs.set('buttons', []);
              regenerate();
            }
            LingoLinqAAC.track_error("buttons has no find ", buttons);
            return reject({error: "not a valid buttonset result"});
          }
          resolve(bs);
        };
        var store_anyway = function(already_tried_local) {
          persistence.store_json(bs.get('root_url'), null, bs.get('encryption_settings')).then(function(res) {
            process_buttons(res);
          }, function(err) {
            var fallback = function() {
              if(already_tried_local) {
                reject(err);
              } else {
                // Something local is better than nothing,
                // even if we suspect it is out of date
                persistence.find_json(bs.get('root_url')).then(function(buttons) {
                  process_buttons(buttons);
                }, function() {
                  reject(err);
                });
              }  
            };
            // Try re-generating before giving up
            regenerate(true).then(function(url) {
              bs.set('root_url', url)
              persistence.store_json(url, null, bs.get('encryption_settings')).then(function(res) {
                process_buttons(res);
              }, function(err) {
                fallback();
              });
            }, function(err) {
              fallback();
            });
          });
        };
        if(force) {
          store_anyway(false);          
        } else {
          persistence.find_json(bs.get('root_url')).then(function(buttons) {
            process_buttons(buttons);
          }, function() {
            store_anyway(true);
          });
        }
      } else if(bs.get('buttons')) {
        resolve(bs);
      } else {
        reject({error: 'root url not available'});
      }
    });
  },
  redepth: function(from_board_id) {
    var buttons = this.get('buttons') || [];
    var new_buttons = [];
    var boards_to_check = [{id: from_board_id, depth: 0}];
    var found_boards = [];
    var check_button = function(b) {
      if(b.board_id == board_to_check.id) {
        var new_b = $.extend({}, b, {depth: board_to_check.depth});
        new_buttons.push(new_b);
        if(b.linked_board_id && found_boards.indexOf(b.linked_board_id) == -1) {
          found_boards.push(b.linked_board_id);
          boards_to_check.push({id: b.linked_board_id, depth: board_to_check.depth + 1});
        }
      }
    };
    while(boards_to_check.length > 0) {
      var board_to_check = boards_to_check.shift();
      buttons.forEach(check_button);
      // make sure to keep the list breadth-first!
      boards_to_check.sort(function(a, b) { return b.depth - a.depth; });
    }
    buttons = new_buttons;
    return buttons;
  },
  button_steps: function(start_board_id, end_board_id, map, home_board_id, sticky_board_id) {
    var last_board_id = end_board_id;
    var updated = true;
    if(sticky_board_id != home_board_id && sticky_board_id != start_board_id) {
      // TODO: consider route only needing a single-home to go through sticky board
    }
    if(start_board_id == end_board_id) {
      return {buttons: [], steps: 0, final_board_id: end_board_id};
    } else if(end_board_id == home_board_id) {
      return {buttons: [], steps: 1, pre: 'true_home', final_board_id: end_board_id};
    }
    var sequences = [{final_board_id: end_board_id, buttons: []}];
    while(updated) {
      var new_sequences = [];
      updated = false;
      var shortest_sequence = null;
      sequences.forEach(function(seq) {
        var ups = map[(seq.buttons[0] || {board_id: seq.final_board_id}).board_id];
        if(seq.done) {
          shortest_sequence = Math.min(shortest_sequence || seq.steps, seq.steps);
          if(seq.steps <= shortest_sequence) {
            new_sequences.push(seq);
          }
        } else if(ups && ups.length > 0) {
          ups.forEach(function(btn) {
            var been_to_board = seq.buttons.find(function(b) { return b.board_id == btn.board_id; });
            if(!been_to_board && btn.board_id != btn.linked_board_id) {
              var new_seq = $.extend({}, seq);
              new_seq.buttons = [].concat(new_seq.buttons);
              new_seq.buttons.unshift(btn);
              if(!shortest_sequence || new_seq <= shortest_sequence) {
                updated = true;
                new_seq.steps = (new_seq.steps || 0) + 1;
                if(btn.home_lock) {
                  new_seq.sticky_board_id = new_seq.sticky_board_id || btn.linked_board_id;
                }
                if(btn.board_id == start_board_id) {
                  new_seq.done = true;
                } else if(btn.board_id == home_board_id && start_board_id != home_board_id) {
                  new_seq.pre = 'true_home';
                  new_seq.steps++;
                  new_seq.done = true;
                }
                shortest_sequence = Math.min(shortest_sequence || new_seq.steps, new_seq.steps);
                if(new_seq.steps <= shortest_sequence) {
                  new_sequences.push(new_seq);
                }
              }
            }
          });
        }
      });
      sequences = new_sequences;
    }
    return sequences.filter(function(s) { return s.done; }).sort(function(a, b) { return b.steps - a.steps; })[0];
  },
  board_map: function(button_sets, locale) {
    var _this = this;
    if(_this.last_board_map) {
      if(_this.last_board_map.list == button_sets) {
        return _this.last_board_map.result;
      }
    }
    var board_map = {};
    var all_buttons = [];
    var buttons = [];
    var buttons_hash = {all: {}};
    button_sets.forEach(function(bs, idx) {
      var button_set_buttons = bs.get('buttons');
      if(bs == _this) {
        button_set_buttons = _this.redepth(bs.get('id'));
      }
      (button_set_buttons || []).forEach(function(button) {
        if(button && locale && button.locale && button.locale.split(/-|_/)[0] != locale.split(/-|_/)[0]) {
          if(button.tr && button.tr[locale]) {
            button = Object.assign({}, button);
            button.label = button.tr[locale].label;
            button.vocalization = button.tr[locale].vocalization;
          }
        }
        var ref_id = button.id + ":" + button.board_id;
        if(!buttons_hash['all'][ref_id]) {
          all_buttons.push(button);
          if(!button.linked_board_id || button.force_vocalize || button.link_disabled) {
            buttons.push(button);
            buttons_hash['all'][ref_id] = true;
          }
        }
        if(button.linked_board_id && !button.link_disabled) {
          board_map[button.linked_board_id] = board_map[button.linked_board_id] || []
          if(!buttons_hash[button.linked_board_id] || !buttons_hash[button.linked_board_id][ref_id]) {
            board_map[button.linked_board_id].push(button);
            buttons_hash[button.linked_board_id] = buttons_hash[button.linked_board_id] || {};
            buttons_hash[button.linked_board_id][ref_id] = true;
          }
        }
      });
    });
    var result = {buttons: buttons, map: board_map, all_buttons: all_buttons};
    _this.last_board_map = {
      list: button_sets,
      result: result
    };
    return result;
  },
  find_sequence: function(str, from_board_id, user, include_home_and_sidebar, locale) {
    // TODO: consider optional support for keyboard for missing words
    if(str.length === 0) { return RSVP.resolve([]); }
    var query = str.toLowerCase();
    var query_start = query.split(/[^\w]/)[0];
    var query_pre = new RegExp(query_start.replace(/(.)/g, "($1)?"), 'i');
    var _this = this;
    from_board_id = from_board_id || app_state.get('currentBoardState.id');
    var button_sets = [_this];
    var lookups = [RSVP.resolve()];
    var home_board_id = (app_state.get('speak_mode') && stashes.get('root_board_state.id')) || (user && user.get('preferences.home_board.id'));
    //    var buttons = this.get('buttons') || [];

    if(include_home_and_sidebar) {
      // add those buttons and uniqify the buttons list
      var add_buttons = function(key, home_lock) {
        var button_set = key && LingoLinqAAC.store.peekRecord('buttonset', key);
        if(button_set) {
          button_set.set('home_lock_set', home_lock);
          button_sets.push(button_set);
        } else if(key) {
          lookups.push(LingoLinqAAC.Buttonset.load_button_set(key).then(function(button_set) {
            button_set.set('home_lock_set', home_lock);
            button_sets.push(button_set);
          }, function() { return RSVP.resolve(); }));
        }
      };
      // probably skip the sidebar for now, highlighting the scrollable sidebar
      // is kind of a can of worms
      if(home_board_id != from_board_id) {
        add_buttons(home_board_id, false);
      }
    }

    var partial_matches = [];
    var all_buttons_enabled = true;
    var parts = query.match(/\b\w+\b/g);
    var cnt = 0;
    var buttons = [];
    var board_map = null;

    var build_board_map = RSVP.all_wait(lookups).then(function() {
      var res = _this.board_map(button_sets, locale);
      buttons = res.buttons;
      buttons.forEach(function(b) {
        b.lookup_parts = b.lookup_parts || [
          [b.label, b.label && b.label.toLowerCase().split(/\s+/)], 
          [b.vocalization, b.vocalization && b.vocalization.toLowerCase().split(/\s+/)]
        ];
      });
      board_map = res.map;
    });

    // check each button individually
    var button_sweep = build_board_map.then(function() {
//      console.log("all buttons", buttons, board_map);
      buttons.forEach(function(button, idx) {
        var lookups = button.lookup_parts;
        var found_some = false;
        // check for a match on either the label or vocalization
        lookups.forEach(function(arr) {
          var label = arr[0];
          if(found_some || !label) { return true; }
          var label_parts = arr[1];
          var running_totals = [];
          // iterate through all the parts of the query, looking for
          // any whole or partial matches
          parts.forEach(function(part, jdx) {
            // compare the first word in the button label
            // with each word in the query
            running_totals.push({
              keep_looking: true,
              start_part: jdx,
              next_part: jdx,
              label_part: 0,
              total_edit_distance: 0
            });
            running_totals.forEach(function(tot) {
              // if the label is still matching along the query
              // from where it started to the end of the label,
              // then add it as a partial match
              if(tot.keep_looking && tot.next_part == jdx) {
                if(!label_parts[tot.label_part]) {
                  // if the label is done, but there's more words
                  // in the query, we have a partial match
                } else {
                  // if we're not outside the bounds for edit
                  // distance, keep going for this starting point
                  var distance = word_suggestions.edit_distance(part, label_parts[tot.label_part]);
                  if(distance < Math.max(part.length, label_parts[tot.label_part].length) * 0.75) {
                    tot.label_part++;
                    tot.next_part++;
                    tot.total_edit_distance = tot.total_edit_distance + distance;
                  } else {
                    tot.keep_looking = false;
                  }
                }
                if(!label_parts[tot.label_part]) {
                  // if we got to the end of the label, we have a 
                  // partial match, otherwise there was more to 
                  // the label when the query ended, so no match
                  tot.valid = true;
                  tot.keep_looking = false;
                }
              }
            });
          });
          var matches = running_totals.filter(function(tot) { return tot.valid && tot.label_part == label_parts.length; });
          matches.forEach(function(match) {
            found_some = true;
            partial_matches.push({
              total_edit_distance: match.total_edit_distance,
              text: label,
              part_start: match.start_part,
              part_end: match.next_part,
              button: button
            });
          });
        });
      });
      console.log("SRCH: partial", partial_matches);
    });

    var sort_results = button_sweep.then(function() {
      partial_matches = partial_matches.sort(function(a, b) { 
        if(a.total_edit_distance == b.total_edit_distance) {
          return a.button.depth - b.button.depth;
        }
        return a.total_edit_distance - b.total_edit_distance; 
      });  
      console.log("SRCH: sorted partial", partial_matches);
    });


    var combos = [{
      sequence: true, 
      text: "", 
      next_part: 0, 
      parts_covered: 0, 
      imperfect_parts: 0,
      steps: [], 
      total_edit_distance: 0, 
      extra_steps: 0,
      current_sticky_board_id: stashes.get('temporary_root_board_state.id') || home_board_id
    }];
    var build_combos = sort_results.then(function() {
      // Check all permutations, score for shortest access distance
      // combined with shortest edit distance
      // for 1 part, include 30-50 matches
      // for 2 parts, include 20 matches per level
      // for 3 parts, include 10 matches per level
      // for 4 parts, include 5 matches per level
      // for 5 parts, include 3 matches per level
      var matches_per_level = Math.floor(Math.max(3, Math.min(1 / Math.log(parts.length / 1.4 - 0.17) * Math.log(100), 50)));
//      console.log('matches', partial_matches);
      parts.forEach(function(part, part_idx) {
        var starters = partial_matches.filter(function(m) { return m.part_start == part_idx; });
        starters = starters.slice(0, matches_per_level);
        var new_combos = [];
        var combo_scores = [];
        combos.forEach(function(combo) {
          if(combo.next_part == part_idx) {
            starters.forEach(function(starter) {
              var dup = $.extend({}, combo);
              dup.steps = [].concat(dup.steps);
              var pre_id = (dup.steps[dup.steps.length - 1] || {}).board_id || from_board_id;
              // remember to expect auto-home if enabled for user and a prior button exists
              if(dup.steps.length > 0 && user && user.get('preferences.auto_home_return')) { pre_id = combo.current_sticky_board_id; }
              var button_steps = _this.button_steps(pre_id, starter.button.board_id, board_map, home_board_id, combo.current_sticky_board_id);
              if(button_steps) {
                var btn = $.extend({}, starter.button);
                btn.actual_button = true;
                dup.steps.push({sequence: button_steps, button: btn, board_id: button_steps.final_board_id});
                if(dup.steps.length > 1) { dup.multiple_steps = true; }
                dup.text = dup.text + (dup.text == "" ? "" : " ") + starter.text;
                dup.next_part = part_idx + (starter.part_end - starter.part_start);
                dup.parts_covered = dup.parts_covered + (starter.part_end - starter.part_start);
                if(starter.total_edit_distance > 0) {
                  dup.imperfect_parts = dup.imperfect_parts + (starter.part_end - starter.part_start);
                }
                dup.total_edit_distance = dup.total_edit_distance + starter.total_edit_distance;
                dup.extra_steps = dup.extra_steps + (button_steps.steps || 0);
                dup.total_steps = dup.steps.length + dup.extra_steps;
                if(button_steps.sticky_board_id) {
                  dup.current_sticky_board_id = button_steps.sticky_board_id;
                }
                new_combos.push(dup);
              }
            });
          } else {
            new_combos.push(combo);
          }
          // include what-if for skipping the current step,
          // as in, if I search for "I want to sleep" but the user 
          // doesn't have "to" then it should match for "I want sleep"
          // and preferably rank it higher than "I want top sleep", for example
          // (maybe add 1 edit distance point for dropped words)
          var dup = $.extend({}, combo);
          dup.next_part = part_idx + 1;
          new_combos.push(dup);
        });
        var cutoff = Math.floor(parts.length / 2);
        var parts_current_count = part_idx + 1;
        new_combos.forEach(function(combo) {
          // calculate match scores
          var primary_score = combo.total_edit_distance + (combo.extra_steps / (combo.parts_covered || 1) * 3);
          if(combo.total_edit_distance == 0) { primary_score = primary_score / 5; }
          // prioritize:
          // 1. covering the most steps
          // 2. perfect spelling matches
          // 2.5. having the most perfect spelling parts
          // 3. covering more steps than the cutoff
          // 4. minimal spelling changes and navigation steps
          // 5. minimal number of found buttons needed
          combo.match_scores = [parts_current_count - combo.parts_covered, combo.total_edit_distance ? ((combo.imperfect_parts || 0) + (parts_current_count - combo.parts_covered)) : 0, combo.parts_covered > cutoff ? (parts_current_count - combo.parts_covered + primary_score) : 1000, parts_current_count - combo.parts_covered + primary_score, combo.steps.length];
        });
        // limit results as we go so we don't balloon memory usage
        combos = new_combos.sort(function(a, b) {
          for(var idx = 0; idx < a.match_scores.length; idx++) {
            if(a.match_scores[idx] != b.match_scores[idx]) {
              return a.match_scores[idx] - b.match_scores[idx];
            }
          }
          return 0;
        }).slice(0, 25 * (part_idx + 1));
      });
      console.log("SRCH: combos", combos);
    });

    // when searching for "I want to sleep" sort as follows:
    // - I want to sleep
    // - I want sleep
    // - I want top sleep
    // - I walk to sleep
    // - want sleep
    // - want
    // - sleep
    // If there are enough errorless matches, show those first,
    // then sort results w/ >50% coverage by edit distance and steps
    // then sort the rest by edit distance and steps
    // then sort by number of words covered (bonus for > 50% coverage)
    // finally by number of button hits required
    var sort_combos = build_combos.then(function() {
      combos.forEach(function(c) {
        var prefix = (c.text.match(query_pre) || [undefined]).indexOf(undefined) - 1;
        if(prefix < 0) { prefix = query_start.length; }
        // bonus for starting with the exactly-correct sequence of letters
        c.match_scores[2] = c.match_scores[2] - (prefix / 2);
      });
      combos = combos.filter(function(c) { return c.text; });
      combos = combos.sort(function(a, b) {
        for(var idx = 0; idx < a.match_scores.length; idx++) {
          if(a.match_scores[idx] != b.match_scores[idx]) {
            return a.match_scores[idx] - b.match_scores[idx];
          }
        }
        return 0;
      });
      console.log("SRCH: sorted combos", combos);
      combos = combos.slice(0, 10);
      return combos;
    });

    var images = LingoLinqAAC.store.peekAll('image');
    var image_lookups = sort_combos.then(function(combos) {
      var image_lookup_promises = [];
      combos.forEach(function(combo) {
        combo.steps.forEach(function(step) {
          var button = step.button;
          if(button) {
            var image = images.findBy('id', button.image_id);
            if(image) {
              button.image = image.get('best_url');
            }
            emberSet(button, 'image', emberGet(button, 'image') || Ember.templateHelpers.path('images/blank.gif'));
            if(emberGet(button, 'image') && LingoLinqAACImage.personalize_url) {
              emberSet(button, 'image', LingoLinqAACImage.personalize_url(button.image, app_state.get('currentUser.user_token'), app_state.get('referenced_user.preferences.skin'), button.no_skin));
            }
            emberSet(button, 'on_same_board', emberGet(button, 'steps') === 0);
  
            if(LingoLinqAAC.remote_url(button.image)) {
              emberSet(button, 'original_image', button.image);
              word_suggestions.fallback_url().then(function(url) {
                emberSet(button, 'fallback_image', url);
              });
              var promise = persistence.find_url(button.image, 'image').then(function(data_uri) {
                emberSet(button, 'image', data_uri);
              }, function() { });
              image_lookup_promises.push(promise);
              promise.then(null, function() { return RSVP.resolve() });
            }
          }
        });
      });
      return RSVP.all_wait(image_lookup_promises).then(function() {
        return combos;
      });
    });

    return image_lookups;
  },
  find_routes: function(words, locale, from_board_id, user) {
    var allow_inflections = !!(user && user.get('preferences.inflections_overlay'));
    var all_buttons_enabled = stashes.get('all_buttons_enabled');
    var _this = this;

    var res = _this.board_map([_this]);
    var buttons = res.all_buttons || [];
    var map = res.map;
    var full = (words || []).join(' ').toLowerCase();
    if(from_board_id && from_board_id != _this.get('id')) {
      // re-depthify all the buttons based on the starting board
      buttons = _this.redepth(from_board_id);
    }

    var words_hash = {};
    var missing_words = {};
    var found_words = {};
    words.forEach(function(s, idx) { 
      words_hash[s.toLowerCase()] = idx + 1; 
      missing_words[s.toLowerCase()] = true; 
    });
    var find_spoken_buttons = new RSVP.Promise(function(resolve, reject) {
      var list = [];
      var matches = function(str) {
        var str_lower = str.toLowerCase().replace(/\s+/g, ' ');
        if(str.match(/\s/)) {
          if(full.indexOf(str_lower) != -1) {
            var parts = str_lower.split(/\s+/);
            var found = false;
            words.forEach(function(s, idx) {
              var slice = words.slice(idx, idx + parts.length);
              if(found == false && slice.join(' ') == str_lower) {
                slice.forEach(function(s) {
                  delete missing_words[s.toLowerCase()];
                });
                found = idx + 1;
              }
            });  
            return found || false;
          } else {
            return false;
          }
        } else {
          delete missing_words[str_lower];
          return words_hash[str_lower] || false;
        }
      };
      buttons.forEach(function(button) {
        var voc = button.vocalization;
        var lbl = button.label;
        if(button.tr && button.tr[locale]) {
          voc = button.tr[locale][1];
          lbl = button.tr[locale][0];
        }
        var matching = false;
        if(voc && !voc.match(/^:/)) {
          matching = matches(voc.toLowerCase());
        } else if(lbl) {
          matching = matches(lbl.toLowerCase());
        }
        if(allow_inflections && matching !== false) {
          var infl = (button.infl || {})[locale] || [];
          infl.forEach(function(s) { 
            if(!matching && matches(s)) {
              matching = matches(s);
            }
          });
        }
        if(matching !== false) { 
          if((!button.linked_board_id || button.link_disabled) && (!button.hidden || all_buttons_enabled)) {
            var str = ((voc && !voc.match(/^:/) ? voc : lbl) || '').toLowerCase();
            found_words[str] = found_words[str] || [];
            var button = $.extend({}, button);
            button.loc = matching;
            button.str = str;
            found_words[str].push(button);
            list.push(button); 
          }
        }
      });
      return resolve(list.sortBy('loc'));
    });

    var downs = {};
    var find_upstreams = find_spoken_buttons.then(function(found_buttons) {
      var repeat = true;
      var links = [];
      var reachable_board_ids = {};
      found_buttons.forEach(function(b) { reachable_board_ids[b.board_id] = true; });
      var linked_buttons = [];
      buttons.forEach(function(button) {
        if(button.linked_board_id && !button.link_disabled && (!button.hidden || all_buttons_enabled)) {
          linked_buttons.push($.extend({}, button));
          downs[button.board_id] = downs[button.board_id] || [];
          downs[button.board_id].push(button);
        }
      });
      while(repeat) {
        repeat = false;
        linked_buttons.forEach(function(button) {
          if(reachable_board_ids[button.linked_board_id]) {
            if(!button.added) {
              button.added = true;
              links.push(button);
            }
            if(!reachable_board_ids[button.board_id]) {
              repeat = true;
              reachable_board_ids[button.board_id] = true;
            }
          }
        });
      }
      return {found: found_buttons, links: links};
    });
    var sort_buttons = find_upstreams.then(function(sets) {
      var matches = sets.found.concat(sets.links);
      var hash = {};
      buttons.forEach(function(button) {
        hash[button.board_id] = hash[button.board_id] ||  [];
      });
      matches.forEach(function(button) {
        hash[button.board_id] = hash[button.board_id] ||  [];
        hash[button.board_id].push(button);
      })
      hash['missing'] = [];
      hash['found'] = [];
      var already = {};
      var found_strings = {};
      var board_id_votes = {};
      sets.found.forEach(function(btn) {
        board_id_votes[btn.board_id] = (board_id_votes[btn.board_id] || 0) + 1;
      });
      sets.found.forEach(function(btn) {
        var word = btn.str.toLowerCase();
        if(!already[word]) {
          already[word] = true;
        }
        var min_steps = null;
        var max_votes = 0;
        var best = null;
        var all_steps = [];
        (found_words[word] || []).forEach(function(btn) {
          var votes = board_id_votes[btn.board_id] || 0;
          var steps = _this.button_steps(from_board_id, btn.board_id, map, from_board_id, null);
          all_steps.push(steps);
          var do_update = false;
          if(min_steps == null) {
            do_update = true;
          } else if(votes > max_votes && steps.steps < min_steps + 2) {
            do_update = true;
          } else if(votes >= max_votes && steps.steps < min_steps + 2) {
          } else if(votes == max_votes && steps.steps < min_steps) {
            do_update = true;
          } else if(steps.steps < min_steps && votes > max_votes - (min_steps - steps.steps)) {
            do_update = true;
          }
          if(do_update) {
            min_steps = steps.steps;
            max_votes = votes;
            best = btn;
            best.sequence = steps;
          }
        });
        if(best) {
          [best].concat(best.sequence.buttons).forEach(function(btn) {
            emberSet(btn, 'focus_image', btn.image);
            if(btn.image) {
              persistence.find_url(btn.image, 'image').then(function(data_uri) {
                emberSet(btn, 'focus_image', data_uri);
              }, function() { });
            }
          });
          if(!found_strings[word]) {
            found_strings[word] = true;
            hash['found'].push(best);
          }
        }
      });
      words.forEach(function(word) {
        if(already[word.toLowerCase()]) {
          return;
        }
        if(missing_words[word.toLowerCase()]) {
          hash['missing'].push(word.toLowerCase());
          already[word.toLowerCase()] = true;
        }
      });
      return hash;
    });
    return sort_buttons;
  },
  find_buttons: function(str, from_board_id, user, include_home_and_sidebar) {
    var matching_buttons = [];

    if(str.length === 0) { return RSVP.resolve([]); }
    var images = LingoLinqAAC.store.peekAll('image');
    var _this = this;

    var traverse_buttons = new RSVP.Promise(function(traverse_resolve, traverse_reject) {
      var re = new RegExp("\\b" + str, 'i');
      var all_buttons_enabled = stashes.get('all_buttons_enabled');
      var buttons = _this.get('buttons') || [];
      if(from_board_id && from_board_id != _this.get('id')) {
        // re-depthify all the buttons based on the starting board
        buttons = _this.redepth(from_board_id);
      }
  
      buttons.forEach(function(button, idx) {
        // TODO: optionally show buttons on link-disabled boards
        // TODO: include link board where add_vocalization=true
        if(!button.hidden || all_buttons_enabled) {
          var match_level = (button.label && button.label.match(re) && 3);
          match_level = match_level || (button.vocalization && button.vocalization.match(re) && 2);
          match_level = match_level || (button.label && word_suggestions.edit_distance(str, button.label) < Math.max(str.length, button.label.length) * 0.5 && 1);
          if(match_level) {
            button = $.extend({}, button, {match_level: match_level});
            button.on_this_board = (emberGet(button, 'depth') === 0);
            button.on_same_board = emberGet(button, 'on_this_board');
            button.actual_button = true;
            var path = [];
            var depth = button.depth || 0;
            var ref_button = button;
            var allow_unpreferred = false;
            var button_to_get_here = null;
            var check_for_match = function(parent_button) {
              if(!button_to_get_here && !parent_button.link_disabled && (!parent_button.hidden || all_buttons_enabled)) {
                if(parent_button.linked_board_id == ref_button.board_id && (allow_unpreferred || parent_button.preferred_link)) {
                  button_to_get_here = parent_button;
                }
              }
            };
            var find_same_button = function(b) { return b.board_id == button_to_get_here.board_id && b.id == button_to_get_here.id; };
            while(depth > 0) {
              button_to_get_here = null;
              allow_unpreferred = false;
              buttons.forEach(check_for_match);
              allow_unpreferred = true;
              buttons.forEach(check_for_match);
              if(!button_to_get_here) {
                // something bad happened
                depth = -1;
              } else {
                ref_button = button_to_get_here;
                depth = ref_button.depth;
                // check for loops, fail immediately
                if(path.find(find_same_button)) {
                  depth = -1;
                } else {
                  path.unshift(button_to_get_here);
                }
              }
              // hard limit on number of steps
              if(path.length > 15) {
                depth = -1;
              }
            }
            if(depth >= 0) {
              button.pre_buttons = path;
              matching_buttons.push(button);
            }
          }
        }
      });
      traverse_resolve();
    });

    var other_lookups = RSVP.resolve();

    var other_find_buttons = [];
    // TODO: include additional buttons if they are accessible from "home" or
    // the "sidebar" button sets.
    var home_board_id = stashes.get('temporary_root_board_state.id') || stashes.get('root_board_state.id') || (user && user.get('preferences.home_board.id'));

    if(include_home_and_sidebar && home_board_id) {
      other_lookups = new RSVP.Promise(function(lookup_resolve, lookup_reject) {
        var root_button_set_lookups = [];
        var button_sets = [];

        var lookup = function(key, home_lock) {
          var button_set = key && (button_set_cache[key] || LingoLinqAAC.store.peekRecord('buttonset', key));
          if(button_set) {
            button_set.set('home_lock_set', home_lock);
            button_sets.push(button_set);
            button_set_cache[key] = button_set;
          } else if(key) {
            console.log("extra load!");
            root_button_set_lookups.push(LingoLinqAAC.Buttonset.load_button_set(key).then(function(button_set) {
              button_set.set('home_lock_set', home_lock);
              button_sets.push(button_set);
              button_set_cache[key] = button_set;
            }, function() { return RSVP.resolve(); }));
          }
        };
        if(home_board_id) {
          lookup(home_board_id);
        }
        (app_state.get('sidebar_boards') || []).forEach(function(brd) {
          lookup(brd.id, brd.home_lock);
        });
        console.log("waiting on", root_button_set_lookups.length);
        RSVP.all_wait(root_button_set_lookups).then(function() {
          button_sets = Utils.uniq(button_sets, function(b) { return b.get('id'); });
          button_sets.forEach(function(button_set, idx) {
            var is_home = (idx === 0);
            if(button_set) {
              var promise = button_set.find_buttons(str).then(function(buttons) {
                buttons.forEach(function(button) {
                  button.meta_link = true;
                  button.on_this_board = false;
                  button.pre_buttons.unshift({
                    'id': -1,
                    'pre': is_home ? 'home' : 'sidebar',
                    'board_id': is_home ? 'home' : 'sidebar',
                    'board_key': is_home ? 'home' : 'sidebar',
                    'linked_board_id': button_set.get('id'),
                    'linked_board_key': button_set.get('key'),
                    'home_lock': button_set.get('home_lock_set'),
                    'label': is_home ? i18n.t('home', "Home") : i18n.t('sidebar_board', "Sidebar, %{board_name}", {hash: {board_name: button_set.get('name')}})
                  });
                  matching_buttons.push(button);
                });
              });
              other_find_buttons.push(promise);
            }
          });
          lookup_resolve();  
        }, function() {
          lookup_reject();
        });
      });
    }

    var lookups_ready = traverse_buttons.then(function() {
      return other_lookups;
    })

    var other_buttons = lookups_ready.then(function() {
      return RSVP.all_wait(other_find_buttons);
    });

    var sort_results = other_buttons.then(function() {
      matching_buttons = matching_buttons.sort(function(a, b) {
        var a_depth = a.current_depth ? 1 : 0;
        var b_depth = b.current_depth ? 1 : 0;
        if(a_depth > b_depth) {
          return 1;
        } else if(a_depth < b_depth) {
          return -1;
        } else {
          if(a.match_level > b.match_level) {
            return -1;
          } else if(a.match_level < b.match_level) {
            return 1;
          } else {
            if(a.label.toLowerCase() > b.label.toLowerCase()) {
              return 1;
            } else if(a.label.toLowerCase() < b.label.toLowerCase()) {
              return -1;
            } else {
              return (a.current_depth || 0) - (b.current_depth || 0);
            }
          }
        }
      });
      matching_buttons = Utils.uniq(matching_buttons, function(b) { return (b.id || b.label) + "::" + b.board_id; });
      matching_buttons = matching_buttons.slice(0, 50);
    });
    var image_lookups = sort_results.then(function() {
      var image_lookup_promises = [];
      matching_buttons.forEach(function(button) {
        image_lookup_promises.push(LingoLinqAAC.Buttonset.fix_image(button, images));
      });
      return RSVP.all_wait(image_lookup_promises);
    });


    return image_lookups.then(function() {
      return matching_buttons;
    });
  }
});

LingoLinqAAC.Buttonset.fix_image = function(button, images) {
  if(button.image && LingoLinqAACImage.personalize_url) {
    button.image = LingoLinqAACImage.personalize_url(button.image, app_state.get('currentUser.user_token'), app_state.get('referenced_user.preferences.skin'), button.no_skin);
  }
  var image = images.findBy('id', button.image_id);
  if(image) {
    button.image = image.get('best_url');
    button.image_license = image.get('license');
    button.hc = image.get('hc');
  }
  emberSet(button, 'image', emberGet(button, 'image') || Ember.templateHelpers.path('images/blank.gif'));

  emberSet(button, 'current_depth', (button.pre_buttons || []).length);
  if(LingoLinqAAC.remote_url(button.image)) {
    word_suggestions.fallback_url().then(function(url) {
      emberSet(button, 'fallback_image', url);
    });
    emberSet(button, 'original_image', button.image);
    var promise = persistence.find_url(button.image, 'image').then(function(data_uri) {
      emberSet(button, 'image', data_uri);
    }, function() { });
    promise.then(null, function() { });
    return promise;
  }
  return RSVP.resolve();
};
LingoLinqAAC.Buttonset.load_button_set = function(id, force, full_set_revision) {
  // use promises to make this call idempotent
  LingoLinqAAC.Buttonset.pending_promises = LingoLinqAAC.Buttonset.pending_promises || {};
  var promise = LingoLinqAAC.Buttonset.pending_promises[id];
  if(promise) { return promise; }
  if(id && (id.match(/^b/) || id.match(/^i/))) {
    return RSVP.reject();
  }

  var button_sets = LingoLinqAAC.store.peekAll('buttonset');
  var found = LingoLinqAAC.store.peekRecord('buttonset', id) || button_sets.find(function(bs) { return bs.get('key') == id; });
  if(!found) {
    button_sets.forEach(function(bs) {
      // TODO: check board keys in addition to board ids
      if((bs.get('board_ids') || []).indexOf(id) != -1 || bs.get('key') == id) {
        if(bs.get('fresh') || !found) {
          found = bs;
        }
      }
    });
  }
  if(found) {
    var board = LingoLinqAAC.store.peekRecord('board', found.get('id'));
    if(!board || board.get('full_set_revision') == found.get('full_set_revision')) {
      if(found.get('buttons') || found.get('root_url')) {
        found.load_buttons(force); 
        return RSVP.resolve(found);
      }
    }
  }
  var generate = function(id) {
    return new RSVP.Promise(function(resolve, reject) {
      persistence.ajax('/api/v1/buttonsets/' + id + '/generate', {
        type: 'POST',
        data: { }
      }).then(function(data) {
        var found_url = function(url) {
          LingoLinqAAC.store.findRecord('buttonset', id).then(function(button_set) {
            var reload = RSVP.resolve();
            if(!button_set.get('root_url') || button_set.get('root_url') != url) {
              force = true;
              reload = button_set.reload().then(null, function() { return RSVP.resolve(); });
              button_set.set('root_url', url);
            }
            reload.then(function() {
              button_set.load_buttons(true).then(function() {
                resolve(button_set);
              }, function(err) {
                reject(err); 
              });
            });
          }, function(err) {
            reject({error: 'error while retrieving generated button set'});
          });
        };
        if(data.exists && data.url) {
          found_url(data.url); 
        } else {
          progress_tracker.track(data.progress, function(event) {
            if(event.status == 'errored') {
              reject({error: 'error while generating button set'});
            } else if(event.status == 'finished') {
              found_url(event.result.url);
            }
          });  
        }
      }, function(err) {
        reject({error: "button set missing and could not be generated"});
      });
    });
  }

  var res = LingoLinqAAC.store.findRecord('buttonset', id).then(function(button_set) {
    var reload = RSVP.resolve(button_set);
    // Force a reload if the revisions don't match
    var wrong_revision = full_set_revision && button_set.get('full_set_revision') != full_set_revision;
    // try to reload before checking for root_url 
    // to ensure we have the freshest result
    if(persistence.get('online') && (!button_set.get('fresh') || force || wrong_revision)) {
      reload = button_set.reload().then(null, function(err) {
        return RSVP.resolve(button_set) 
      });
    }
    return reload.then(function(button_set) {
      if(!button_set.get('root_url') && button_set.get('remote_enabled')) {
        // if root_url not available for the user, try to build one
        return generate(id);
      } else if(button_set.get('buttons') || button_set.get('root_url')) {
        // otherwise you should be good to go
        return button_set.load_buttons(force);
      } else {
        return generate(id);
      }
    });
  }, function(err) {
    // if not found error, it may need to be regenerated
    if(err.error && err.error.error) {
      err = err.error;
    }
    if(err.error == 'Record not found' && err.id && err.id.match(/^\d/)) {
      return generate(id);
    } else if(found) {
      found.load_buttons(force); 
      return RSVP.resolve(found); 
    } else {
      return RSVP.reject(err);
    }
  });
  LingoLinqAAC.Buttonset.pending_promises[id] = res;
  res.then(function() { delete LingoLinqAAC.Buttonset.pending_promises[id]; }, function() { delete LingoLinqAAC.Buttonset.pending_promises[id]; });
  runLater(function() {
    if(LingoLinqAAC.Buttonset.pending_promises[id] == res) {
      delete LingoLinqAAC.Buttonset.pending_promises[id];
    }
  }, 30000);
  return res;
};

export default LingoLinqAAC.Buttonset;
