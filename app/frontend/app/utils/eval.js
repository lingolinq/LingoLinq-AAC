/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

import { later as runLater } from '@ember/runloop';
import templateHelpers from './template_helpers';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import { set as emberSet, observer } from '@ember/object';
import app_state from './app_state';

// select language when starting assessment

var pixels_per_inch = 96;
window.ppi = window.ppi || 96;
var evaluation = {
  _services: {},
  setup: function(appState, persistence, stashes, speecher, utterance, obf, modal, i18n, capabilities) {
    this._services.appState = appState;
    this._services.persistence = persistence;
    this._services.stashes = stashes;
    this._services.speecher = speecher;
    this._services.utterance = utterance;
    this._services.obf = obf;
    this._services.modal = modal;
    this._services.i18n = i18n;
    this._services.capabilities = capabilities;
  },
  // Fall back when setup() has not run yet or eval.js was re-evaluated (e.g. dev reload) while the app kept running.
  get appState() { return this._services.appState || app_state; },
  get persistence() { return this._services.persistence; },
  get stashes() { return this._services.stashes; },
  get speecher() { return this._services.speecher; },
  get utterance() { return this._services.utterance; },
  get obf() { return this._services.obf || (typeof window !== 'undefined' && window.obf); },
  get modal() { return this._services.modal; },
  get i18n() { return this._services.i18n; },
  get capabilities() { return this._services.capabilities; },
  register: function(obf) {
    obf.register("eval", evaluation.callback);
    obf.eval = evaluation;
    if(!window.ppi_accurate) {
      var msr = document.createElement('div');
      msr.style.width = '1in';
      msr.style.height = '30px';
      msr.style.position = 'absolute';
      msr.style.left = '-1000px';
      document.body.appendChild(msr);
      pixels_per_inch = msr.getBoundingClientRect().width;
      window.ppi = pixels_per_inch;
      runLater(function() {
        document.body.removeChild(msr);
      });
    }
  },
  resume: function(assmnt) {
    assmnt.gaps = assmnt.gaps || [];
    var now = (new Date()).getTime() / 1000;
    assmnt.gaps.push([assmnt.ended, now]);
    assmnt.ended = null;
    assmnt.saved = true;
    assessment = assmnt;
    working = assmnt.working_stash;
    evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
    evaluation.appState.set_history([]);
  },
  clear: function() {
    assessment = {};
    working = {};
  },
  conclude: function() {
    evaluation.modal.open('modals/assessment-settings', {assessment: assessment, action: 'results'});
  },
  update: function(settings, reload) {
    assessment.name = settings.name;
    assessment.default_library = settings.default_library;
    assessment.notes = settings.notes;
    assessment.label = settings.label;
    assessment.accommodations = settings.accommodations;
    assessment.prompts = settings.prompts;
    assessment.prompts_delay = settings.prompts_delay || 0;
    assessment.chimes = settings.chimes;
    if(settings.for_user && !assessment.saved) {
      if(settings.for_user.user_id == 'self') {
        emberSet(settings.for_user, 'user_id', evaluation.appState.get('currentUser.id'));
      }
      assessment.user_id = settings.for_user.user_id;
      assessment.user_name = settings.for_user.user_name;
    } else if(!assessment.saved && settings.user_id) {
      assessment.user_id = settings.user_id;
      assessment.user_name = settings.user_name;
    }
    if(reload) {
      evaluation.appState.jump_to_board({key: 'obf/eval-' + (new Date()).getTime()});
      evaluation.appState.set_history([]);
    }
  },
  persist: function() {
    assessment.ended = (new Date()).getTime() / 1000;
    assessment.working_stash = Object.assign({}, working);
    assessment.ref_id = assessment.ref_id || "tmp." + (new Date()).getTime() + "." + (Math.random());
    delete assessment.working_stash['ref'];
    // save the evaluation (must match user.log lookup: same id string + optional username alias)
    var evaluated_user_id = assessment.user_id;
    if (evaluated_user_id == null || evaluated_user_id === '') {
      evaluated_user_id = evaluation.appState.get('currentUser.id');
      assessment.user_id = evaluated_user_id;
    }
    evaluated_user_id = String(evaluated_user_id);
    evaluation.appState.set('last_assessment_for_' + evaluated_user_id, assessment);
    if (assessment.user_name) {
      evaluation.appState.set('last_assessment_for_uname_' + assessment.user_name, assessment);
    }
    evaluation.stashes.log_event(assessment, assessment.user_id, evaluation.appState.get('sessionUser.id'));
    if(evaluation.persistence.get('online')) {
      evaluation.stashes.push_log();
    }
    // navigate to the results page (should work even if offline and haven't been able to push yet)
    evaluation.appState.controller.transitionToRoute('user.log', assessment.user_name, 'last-eval');
    assessment = {};
    working = {};
  },
  last_assessment_from_memory: function(userId, userName) {
    if (userId != null && userId !== '') {
      var byId = evaluation.appState.get('last_assessment_for_' + String(userId));
      if (byId) { return byId; }
    }
    if (userName) {
      return evaluation.appState.get('last_assessment_for_uname_' + userName) || {};
    }
    return {};
  },
  clear_last_assessment_memory: function(userId, userName) {
    if (userId != null && userId !== '') {
      evaluation.appState.set('last_assessment_for_' + String(userId), null);
    }
    if (userName) {
      evaluation.appState.set('last_assessment_for_uname_' + userName, null);
    }
  },
  settings: function() {
    evaluation.modal.open('modals/assessment-settings', {assessment: assessment});
  },
  sections: function() {
    var res = [];
    res.push({id: 'intro', name: evaluation.i18n.t('introduction', 'Introduction'), description: evaluation.i18n.t('brief_introduction', "A short introduction, including instructions, for the evaluation tool")});
    res.push({id: 'find_target', name: evaluation.i18n.t('find_targets', 'Find Targets'), description: evaluation.i18n.t('find_target_level', "Find a target in a grid of empty buttons")});
    res.push({id: 'diff_target', name: evaluation.i18n.t('differentiate_targets', 'Differentiate Targets'), description: evaluation.i18n.t('diff_target_level', "Find a target in a grid of populated buttons")});
    res.push({id: 'symbols', name: evaluation.i18n.t('alternate_symbols', 'Alternate Symbol Libraries'), description: evaluation.i18n.t('symbols_level', "Find targets using different symbol libraries")});
    res.push({id: 'find_shown', name: evaluation.i18n.t('named_targets', 'Find Targets by Name'), description: evaluation.i18n.t('find_shown_level', "Find named targets from different parts of speech")});
    res.push({id: 'open_ended', name: evaluation.i18n.t('open_ended', 'Open-Ended Comments'), description: evaluation.i18n.t('open_ended_level', "Comment on open-ended image prompts")});
    res.push({id: 'categories', name: evaluation.i18n.t('categorization', 'Categorization'), description: evaluation.i18n.t('categories_level', "Find targets by category or grouping")});
    res.push({id: 'inclusion_exclusion_association', name: evaluation.i18n.t('inclusion_exclusion_association', 'Inclusion/Exclusion/Association'), description: evaluation.i18n.t('inclusion_exclusion_association_level', "Find targets by inclusion, exclusion or association")});
    res.push({id: 'literacy', name: evaluation.i18n.t('literacy', 'Literacy'), description: evaluation.i18n.t('literacy_level', "Find the words (no pictures) that identify or describe images")});
    return res;
  },
  jump_to: function(section_id) {
    if(section_id) {
      var level_obj = levels.find(function(l) { return l[0].intro == section_id; });
      var level_idx = Math.max(0, levels.indexOf(level_obj));
      working.level = level_idx;
      working.step = 0;
      working.attempts = 0;
      working.correct = 0;
      working.fails = 0;
      working.ref.session_events = [];
      evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
      evaluation.appState.set_history([]);
    } else {
      var section_id = working.level_id;
      if(section_id.match(/^intro/)) { section_id = 'intro'; }
      evaluation.modal.open('modals/eval-jump', {section_id: section_id});
    }
  },
  move: function(direction) {
    if(direction == 'harder') {
      var level = levels[working.level];
      var next_step = level.find(function(step, idx) { return step > working.step && step.difficulty_stop; });
      if(next_step) {
        working.step = level.indexOf(next_step);
      } else {
        direction = 'forward';
      }
    }
    if(direction == 'forward') {
      working.level = Math.min(working.level + 1, levels.length - 1);
      working.step = 0;
    } else if(direction == 'back') {
      working.level = Math.max(working.level - 1, 0);
      working.step = 0;
    }
    working.attempts = 0;
    working.correct = 0;
    working.fails = 0;
    working.ref.session_events = [];
    evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
    evaluation.appState.set_history([]);
  },
  /** Header shortcuts for intro boards when on-board Start/Skip are obscured (same logic as intro_board handler). */
  intro_header_visibility: function() {
    try {
      if(typeof levels === 'undefined' || !levels || !levels.length) {
        return { showStart: false, showSkip: false };
      }
      if(!working || working.level === undefined || working.level === null) {
        return { showStart: false, showSkip: false };
      }
      var level = levels[working.level];
      if(!level) { return { showStart: false, showSkip: false }; }
      var step = level[working.step];
      if(!step || !step.intro || step.intro === 'done') {
        return { showStart: false, showSkip: false };
      }
      return {
        showStart: true,
        showSkip: !step.intro.match(/intro/)
      };
    } catch(e) {
      return { showStart: false, showSkip: false };
    }
  },
  intro_header_start: function() {
    if(!evaluation.appState.get('speak_mode')) {
      evaluation.modal.notice(evaluation.i18n.t('speak_mode_required_for_buttons', "Please enter speak mode before trying to run an evaluation"), true);
      return;
    }
    evaluation.speecher.click();
    var level = levels[working.level];
    if(!level) { return; }
    var step = level[working.step];
    if(!step || !step.intro || step.intro === 'done') { return; }
    if(step.intro == 'find_target') {
      var start_step = level.find(function(s) { return s.id == "find-4"; });
      if(start_step) {
        working.step = level.indexOf(start_step);
      } else {
        working.step++;
      }
    } else if(step.intro == 'diff_target') {
      var step_id = 'diff-4';
      if(working.skill == 1) { step_id = 'diff-15'; }
      else if(working.skill == 2) { step_id = 'diff-6-24'; }
      var start_step = level.find(function(s) { return s.id == step_id; });
      if(start_step) {
        working.step = level.indexOf(start_step);
      } else {
        working.step++;
      }
    } else {
      working.step++;
    }
    if(!level[working.step]) {
      working.level++;
      working.step = 0;
    }
    evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
    evaluation.appState.set_history([]);
  },
  intro_header_skip: function() {
    if(!evaluation.appState.get('speak_mode')) {
      evaluation.modal.notice(evaluation.i18n.t('speak_mode_required_for_buttons', "Please enter speak mode before trying to run an evaluation"), true);
      return;
    }
    evaluation.speecher.click();
    var level = levels[working.level];
    if(!level) { return; }
    var step = level[working.step];
    if(!step || !step.intro || step.intro === 'done') { return; }
    if(step.intro.match(/intro/)) { return; }
    working.step = 0;
    working.level++;
    evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
    evaluation.appState.set_history([]);
  },
  analyze: function(assessment) {
    if(!assessment || !assessment.mastery_cutoff) {
      return {};
    }
    var res = Object.assign({}, assessment);
    res.label = assessment.name || "Unnamed Eval";
    res.total_time = 0;
    res.total_correct = 0;
    res.total_possibly_correct = 0;
    res.hits = 0;
    res.hit_locations = [];
    res.date = new Date((assessment.started || 0) * 1000);
    res.sessions = 1 + (res.gaps || []).length;
    res.multiple_sessions = res.sessions > 1;
    var cutoff = window.moment().add(-1, 'month')._d;
    res.resumable = res.date > cutoff;
    res.assessments = [];
    var button_sizes = {};
    var field_sizes = {};
    var symbol_libraries = {};
    var open_prompts = {};
    var literacies = [];
    var event_types = []
    for(var key in assessment.events) {
      if(key == 'symbols') {
        var types = {};
        assessment.events[key].forEach(function(step, idx) {
          if(step) {
            step.forEach(function(event) {
              types[event.library] = types[event.library] || [];
              types[event.library][idx] = types[event.library][idx] || [];
              types[event.library][idx].push(event);
            });
          }
        });
        for(var type_key in types) {
          types[type_key][0] = [];
          event_types.push({ type: key, library: type_key, list: types[type_key] });
        }
      } else {
        event_types.push({ type: key, list: assessment.events[key] });
      }
    }
    var already_done = {};
    var maxes = {};
    console.log(event_types);
    event_types.forEach(function(type) {
      var key = type.type;
      var list = type.list;
      var level = levels.find(function(l) { return l[0].intro == key; });
      list.forEach(function(step, idx) {
        step.forEach(function(event) {
          console.log("EVENT");
        });
        if(!step || idx == 0) { //(idx == 0 && !(step[0] || {}).time)) { 
          var level_name = key || 'no-key';
          if(key == 'find_target') { level_name = evaluation.i18n.t('find_target_level', "Find a target in a grid of empty buttons"); }
          else if(key == 'diff_target') { level_name = evaluation.i18n.t('diff_target_level', "Find a target in a grid of populated buttons"); }
          else if(key == 'symbols') { level_name = evaluation.i18n.t('symbols_level', "Find targets using different symbol libraries"); }
          else if(key == 'find_shown') { level_name = evaluation.i18n.t('find_shown_level', "Find named targets from different parts of speech"); }
          else if(key == 'open_ended') { level_name = evaluation.i18n.t('open_ended_level', "Comment on open-ended image prompts"); }
          else if(key == 'categories') { level_name = evaluation.i18n.t('categories_level', "Find targets by category or grouping"); }
          else if(key == 'inclusion_exclusion_association') { level_name = evaluation.i18n.t('inclusion_exclusion_association_level', "Find targets by inclusion, exclusion or association"); }
          else if(key == 'literacy') { level_name = evaluation.i18n.t('literacy_level', "Find the words (no pictures) that identify or describe images"); }
          if(!already_done[key]) {
            already_done[key] = true;
            res.assessments.push({category: level_name});
          }
          return;
        }
        var correct = 0;
        var full_time = 0;
        var library = null;
        var possibly_correct = 0;
        var level_step = level[idx];
        if(step[0] && step[0].id) {
          level_step = level.find(function(s) { return s.id == step[0].id; });
        }
        step.forEach(function(event) {
          res.hits++;
          library = library || event.library;
          if(event.correct) { 
            correct++; 
            res.total_correct++;
          }
          if(event.crow != null && event.ccol != null) {
            res.total_possibly_correct++;
            possibly_correct++;
          }
          if(event.clbl && event.prompt) {
            literacies.push(event);
          }
          res.hit_locations.push({
            possibly_correct: (event.crow != null && event.ccol != null),
            correct: event.correct,
            partial: (event.skiprow && event.skiprow > 0),
            cpctx: (event.ccol / event.cols) + (1 / event.cols * 0.5),
            cpcty: (event.crow / event.rows) + (1 / event.rows * 0.5),
            pctx: event.pcxt || event.pctx,
            pcty: event.pcty,
          });
          full_time = full_time + event.time;
          res.total_time = res.total_time + event.time;
          if(key == 'open_ended') {
            var prompt_key = event.prompt + "::" + level_step.id;
            open_prompts[prompt_key] = open_prompts[prompt_key] || [];
            open_prompts[prompt_key].push(event);
          }
          if(event.win != null && event.hin != null && (key == 'find_target' || key == 'diff_target' || key == 'symbols')) {
            var btn_dim = (Math.round(event.win * 10) / 10) + "x" + (Math.round(event.hin * 10) / 10);
            button_sizes[btn_dim] = button_sizes[btn_dim] || {win: event.win, hin: event.hin, rows: event.rows, cols: event.cols, cnt: 0, correct: 0, possibly_correct: 0};
            button_sizes[btn_dim].cnt++;
            if(event.approxin) { button_sizes[btn_dim].approximate = true; }
            if(event.correct) { button_sizes[btn_dim].correct++; }            
            if(event.fail) { button_sizes[btn_dim].fail = true; }
            if(event.crow != null && event.ccol != null) { button_sizes[btn_dim].possibly_correct++; }
          }
          if(event.vsize && (key == 'find_target' || key == 'diff_target' || key == 'symbols')) {
            event.vsize = Math.round(event.vsize * 10) / 10;
            field_sizes[event.vsize] = field_sizes[event.vsize] || {size: event.vsize, cnt: 0, correct: 0, possibly_correct: 0};
            field_sizes[event.vsize].cnt++;
            if(event.correct) { field_sizes[event.vsize].correct++; }            
            if(event.fail) { field_sizes[event.vsize].fail = true; }
            if(event.crow != null && event.ccol != null) { field_sizes[event.vsize].possibly_correct++; }
          }
          if(((key == 'diff_target' && event.vsize < 60) || key == 'symbols') && event.library) {
            symbol_libraries[event.library] = symbol_libraries[event.library] || {library: event.library, cnt: 0, correct: 0, possibly_correct: 0, time_tally: 0};
            symbol_libraries[event.library].cnt++;
            symbol_libraries[event.library].time_tally = symbol_libraries[event.library].time_tally + event.time;
            // TODO: ignore the hardest-levels of diff_target, since that's not a fair comparison
            if(event.correct) { symbol_libraries[event.library].correct++; }            
            if(event.fail) { symbol_libraries[event.library].fail = true; }
            if(event.crow != null && event.ccol != null) { symbol_libraries[event.library].possibly_correct++; }
          }
        });
        var pct = Math.round(correct / Math.max(step.length) * 100) / 100;
        var name = key + "-" + (idx + 1);
        if(level_step) {
          name = level_step.id + " (" + key;
          if(key == 'symbols') { name = name + ", " + library; }
          name = name + ")";
        }
        var accuracy_class = null;
        if(possibly_correct > 0) {
          if(pct >= assessment.mastery_cutoff) {
            accuracy_class = 'accuracy_mastered';
          } else if(pct <= assessment.non_mastery_cutoff) {
            accuracy_class = 'accuracy_non_mastered';
          } else {
            accuracy_class = 'accuracy_middle';
          }
        }

        var library = {key: library};
        library[library[key]] = true;
        var long_name = evaluation.step_description(level_step.id, library) || name;

        var fail = step.find(function(e) { return e && e.fail; });
        if(key == 'find_target' || key == 'diff_target' || key == 'symbols') {
          var size = step[0].rows * step[0].cols;
          maxes[key] = maxes[key] || {size: 0};
          if(maxes[key].size <= size && pct > assessment.mastery_cutoff && !fail) {
            maxes[key] = {size: size, rows: step[0].rows, cols: step[0].cols, hin: step[0].hin, win: step[0].win};
          }
        }
        if(fail) { accuracy_class = 'accuracy_non_mastered'; }

        res.assessments.push({
          accuracy_class: accuracy_class || null,
          library: library,
          fail: !!fail,
          type: name,
          name: long_name,
          pct: Math.round(pct * 100 * 10) / 10,
          attempts: step.length,
          avg_time: Math.round(full_time / Math.max(step.length, 1) / 1000 * 100) / 100
        });
      });
    });
    res.avg_response_time = Math.round(res.total_time / Math.max(res.hits, 1) / 1000 * 10) / 10;
    res.avg_accuracy = Math.round(res.total_correct / Math.max(res.total_possibly_correct, 1) * 100);
    res.duration = res.total_time / 1000;
    if(assessment.ended) {
      res.duration = assessment.ended - assessment.started;
      (res.gaps || []).forEach(function(arr) {
        res.duration = res.duration - (arr[1] - arr[0]);
      });
    }

    [[button_sizes, 'button_sizes'], [field_sizes, 'field_sizes'], [symbol_libraries, 'symbol_libraries']].forEach(function(ref) {
      var items = ref[0];
      var item_key = ref[1];
      var list = [];
      if(Object.keys(items).length > 0) {
        for(var key in items) {
          if(items[key].approximate) { res.approximate = true; }
          if(items[key].possibly_correct > 0) {
            var pct = Math.round(items[key].correct / items[key].possibly_correct * 100)
            var item = {
              count: items[key].cnt,
              pct: pct,
              fail: !!items[key].fail,
              bar_class: 'bar ' + (items[key].cnt > 10 ? 'confident ' : (items[key].cnt > 5) ? 'semi_confident ' : 'unconfident ') + (items[key].fail ? 'failure ' : '') + ((pct >= assessment.mastery_cutoff * 100) ? (pct >= 100 ? 'perfect' : 'mastered') : (pct <= assessment.non_mastery_cutoff * 100 ? 'non_mastered' : '')),
              bar_style_props: { 'margin-top': Math.min(100 - pct, 99) + "px", height: Math.max(1, pct) + "px" }
            };  
            if(item_key == 'field_sizes') {
              maxes[item_key] = maxes[item_key] || {size: 0};
              item.size = items[key].size;
              item.name = "field of " + items[key].size;
              item.title = pct + "% accuracy over " + items[key].possibly_correct + " trials";
              if(item.fail) { item.title = item.title + " (stopped early from errors)"; }
              if(pct >= assessment.mastery_cutoff * 100 && !item.fail) {
                if(maxes[item_key]['size'] <= item.size) {
                  maxes[item_key] = {size: item.size}                  
                }
              }
            } else if(item_key == 'symbol_libraries') {
              item.name = items[key].library;
              item.title = pct + "% accuracy over " + items[key].possibly_correct + " trials";
              item.avg_response = Math.round(items[key].time_tally / item.count / 1000 * 10) / 10;
              if(items[key]) {
                item.title = item.title + ", " + templateHelpers.seconds_ago(item.avg_response) + " avg. response time";
              }
              if(item.fail) { item.title = item.title + " (stopped early from errors)"; }
            } else if(item_key == 'button_sizes') {
              item.size = items[key].win * items[key].hin;
              item.name = items[key].rows + " x " + items[key].cols + "\n" + (items[key].approximate ? '~' : '') + (Math.round(items[key].win * 10) / 10) + "\" x " + (Math.round(items[key].hin * 10) / 10) + "\"";
              item.title = pct + "% accuracy over " + items[key].possibly_correct + " trials";
              if(item.fail) { item.title = item.title + " (stopped early from errors)"; }
            }
            list.push(item);
          }
        }
        list.forEach(function(i) { i.box_style_props = { width: (Math.floor(1000 / list.length) / 10) + "%" }});
        if(item_key == 'button_sizes') {
          list = list.sortBy('size').reverse();
        } else if(item_key == 'field_sizes') {
          list = list.sortBy('size');
        } else if(item_key == 'symbol_libraries') {
          // list = list;
        }
        res[item_key] = list;
      }
    });

    res.open_ended_sections = [];
    for(var key in open_prompts) {
      var list = open_prompts[key];
      var parts = key.split(/::/);
      var words = [];
      var word = "";
      var tally = 0;
      list.forEach(function(event) {
        tally = tally + event.time;
        if(event.voc && event.voc.match(/^\+/)) {
          word = word + event.voc.substring(1);
        }
        if(event.voc == ':space' || !event.voc) {
          if(word) {
            words.push(word);
            word = "";
          }
          if(event.voc != ':space') {
            words.push(event.lbl);
          }
        }
      });
      res.open_ended_sections.push({
        prompt: parts[0],
        step: parts[1],
        sentence: words.join(' '),
        avg_time: tally / Math.max(list.length, 1) / 1000
      });
    }

    // TODO: open-ended sections shouldn't have an attempts tally
    //         <!-- list of words/spelling for each prompt (check spelling against word list for accuracy), including total # of words -->
    res.literacy_responses = [];
    literacies.forEach(function(e) {
      res.literacy_responses.push({
        prompt: e.prompt,
        correct_answer: e.clbl,
        correct: e.correct,
        distractors: e.distr.join(', '),
        time: e.time / 1000
      });
    });

    //       <!-- list of literacy words, including prompt and distractors -->
    res.access_method = evaluation.i18n.t('touch', "Touch");
    if(assessment.access_method == 'scanning') {
      res.access_method = evaluation.i18n.t('scanning', "Scanning");
    } else if(assessment.access_method == 'axis_scanning') {
      res.access_method = evaluation.i18n.t('axis_scanning', "Axis Scanning");
    } else if(assessment.access_method == 'dwell') {
      res.access_method = evaluation.i18n.t('dwell', "Dwell/Eye Gaze");
    } else if(assessment.access_meethod == 'arrow_dwell') {
      res.access_method = evaluation.i18n.t('arrow_dwell', "Cursor-Guided Dwell");
    } else if(assessment.access_meethod == 'head') {
      res.access_method = evaluation.i18n.t('head_tracking', "Head Tracking");
    }
    res.access_settings = []; //assessment;
    res.access_settings.push({key: evaluation.i18n.t('mastery', "mastery"), val: assessment.mastery_cutoff * 100, percent: true});
    res.access_settings.push({key: evaluation.i18n.t('non-mastery', "non-mastery"), val: assessment.non_mastery_cutoff * 100, percent: true});
    res.access_settings.push({key: evaluation.i18n.t('library_lower', "library"), val: assessment.default_library});
    res.access_settings.push({key: evaluation.i18n.t('access_lower', "access"), val: res.access_method.toLowerCase().replace(/\s+/g, '-')});
    res.access_settings.push({key: evaluation.i18n.t('background_lower', "background"), val: assessment.board_background});
    res.access_settings.push({key: evaluation.i18n.t('button-spacing', "button-spacing"), val: assessment.button_spacing});
    res.access_settings.push({key: evaluation.i18n.t('button-border', "button-border"), val: assessment.button_border});
    res.access_settings.push({key: evaluation.i18n.t('button-text', "button-text"), val: assessment.button_text});
    res.access_settings.push({key: evaluation.i18n.t('text-position', "text-position"), val: assessment.text_position});
    res.access_settings.push({key: evaluation.i18n.t('font', "font"), val: assessment.text_font});
    res.access_settings.push({key: evaluation.i18n.t('prompts', "prompts"), val: (!!assessment.prompts).toString()});
    res.access_settings.push({key: evaluation.i18n.t('chimes', "chimes"), val: (!!assessment.chimes).toString()});
    if(assessment.high_contrast) {
      res.access_settings.push({key: evaluation.i18n.t('high-contrast', "high-contrast"), val: "true"});
    }
    res.access_settings.push({key: evaluation.i18n.t('', ""), val: assessment.val});

    if(assessment.access_method == 'touch') {
      res.access_settings.push({key: evaluation.i18n.t('hold-time', "hold-time"), val: assessment.activation_cutoff / 1000, ms: true});
      res.access_settings.push({key: evaluation.i18n.t('hold-min', "hold-min"), val: assessment.activation_minimum / 1000, ms: true});
      res.access_settings.push({key: evaluation.i18n.t('debounce', "debounce"), val: assessment.debounce / 1000, ms: true});
    } else if(assessment.access_method == 'scanning' || assessment.access_method == 'axis_scanning') {
      if(assessment.access_method == 'axis_scanning') {
        res.access_settings.push({key: evaluation.i18n.t('sweep', "sweep"), val: assessment.scanninng_sweep_speed / 1000, ms: true});
      } else {
        res.access_settings.push({key: evaluation.i18n.t('scan-step', "scan-step"), val: assessment.scanning_interval / 1000, ms: true});
      }
      if(assessment.scanning_wait) {
        res.access_settings.push({key: evaluation.i18n.t('scan-wait', "scan-wait"), val: assessment.scanning_wait});
      }
      res.access_settings.push({key: evaluation.i18n.t('scan-prompt', "scan-prompt"), val: assessment.scanning_prompts});
      res.access_settings.push({key: evaluation.i18n.t('scan-auto-select', "scan-auto-select"), val: assessment.scanning_auto_select});
      res.access_settings.push({key: evaluation.i18n.t('scan-keys', "scan-keys"), val: assessment.scanning_keys.join(',').replace(/,+$/, '')});
    } else if(assessment.access_method == 'dwell' || assessment.access_method == 'arrow_dwell' || assessment.access_method == 'head') {
      res.access_settings.push({key: evaluation.i18n.t('dwell-type', "dwell-type"), val: assessment.dwell_type});
      if(assessment.access_method == 'arrow-dwell') {
        res.access_settings.push({key: evaluation.i18n.t('dwell-speed', "dwell-speed"), val: assessment.dwell_arrow_speed});
      }
      res.access_settings.push({key: evaluation.i18n.t('dwell-select', "dwell-select"), val: assessment.dwell_selection});
      if(assessment.dwell_selection == 'button') {
        res.access_settings.push({key: evaluation.i18n.t('dwell-key', "dwell-key"), val: assessment.dwell_selection_code});
      } else {
        res.access_settings.push({key: evaluation.i18n.t('dwell-time', "dwell-time"), val: assessment.dwell_time / 1000, ms: true});
      }
      res.access_settings.push({key: evaluation.i18n.t('dwell-delay', "dwell-delay"), val: assessment.dwell_delay / 1000, ms: true});
      res.access_settings.push({key: evaluation.i18n.t('dwell-release', "dwell-release"), val: assessment.dwell_release});
      res.access_settings.push({key: evaluation.i18n.t('dwell-style', "dwell-style"), val: assessment.dwell_style});
          
    }

    var best_max = maxes['diff_target'] || {};
    ['win', 'hin', 'rows', 'cols'].forEach(function(measurement) {
      if(maxes['symbols'] && (!best_max[measurement] || maxes['symbols'][measurement] > best_max[measurement])) {
        best_max[measurement] = maxes['symbols'][measurement];
      }
      best_max[measurement] = best_max[measurement] || (maxes['find_target'] || {})[measurement];
    });
    res.button_width = Math.round((best_max.win || 0) * 10) / 10;
    res.button_height = Math.round((best_max.hin || 0) * 10) / 10;
    res.grid_height = best_max.rows || 0;
    res.grid_width = best_max.cols || 0; 
    res.field = Math.min((maxes['field_sizes'] || {}).size || 0, (res.grid_width * res.grid_height) || (maxes['field_sizes'] || {}).size);
    return res;
  }, 
  intro_board: function(level, step, user_id) {
    var board = evaluation.obf.shell(3, 6);
    board.key = 'obf/eval';
    if(step.continue_on_non_mastery) {
      level.continue_on_non_mastery = true;
    }
    var bg_word = words.find(function(w) { return w.label == 'backgrounds'; });
    board.background.image = (bg_word && bg_word.urls[step.intro]) || "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f49b.svg";
    board.background.position = "center";
    working.level_id = step.intro;
    working.ref = working.ref || {};
    working.ref.passable_increments = 0;
    working.ref.prompt_index = null;
    board.background.text = evaluation.level_prompt(step);
    level.libraries_used = {};
    level.libraries_used[assessment.default_library] = true;

    // TODO: include sclera or some auto-high-contrast feature as an option if pcs is not available
    if(!evaluation.checks_for[user_id].pcs) { // not a premium_symbols account
      level.libraries_used['pcs'] = true;
      level.libraries_used['pcs_hc'] = true;
      level.libraries_used['symbolstix'] = true;
    }
    if(evaluation.checks_for[user_id].lessonpix) { // not a lessonpix account
      level.libraries_used['lessonpix'] = true;
    }
    if(assessment.events) {
      var skill_level = evaluation.skill_level(assessment);
      if(skill_level != null) {
        working.skill = skill_level;
      }
    }
    console.log("skill level", working.skill);
    if(step.intro == 'done') {
      board.add_button({
        label: "save",
        id: 'button_save',
        skip_vocalization: true,
        image: {url: words.find(function(w) { return w.label == 'done'; }).urls['default']},
      }, 0, 5);
      board.add_button({
        label: 'settings',
        id: 'button_settings',
        skip_vocalization: true,
        image: {url: words.find(function(w) { return w.label == 'think'; }).urls['default']},
      }, 0, 0);
    } else {
      board.add_button({
        label: step.intro.match(/intro/) ? 'next' : 'start',
        id: 'button_start',
        skip_vocalization: true,
        image: {url: words.find(function(w) { return w.label == 'go'; }).urls['default']},
      }, 0, 5);
      if(step.intro.match(/intro/)) {
        board.add_button({
          label: 'settings',
          id: 'button_settings',
          skip_vocalization: true,
          image: {url: words.find(function(w) { return w.label == 'think'; }).urls['default']},
        }, 0, 0);
      } else {
        board.add_button({
          label: 'skip',
          id: 'button_skip',
          skip_vocalization: true,
          image: {url: words.find(function(w) { return w.label == 'right'; }).urls['default']},
        }, 0, 4);
      }
    }
    var handler = function(button) {
      if(evaluation.appState.get('speak_mode')) {
        evaluation.speecher.click();
        if(button.id == 'button_start') {
          if(step.intro == 'find_target') {
            var start_step = level.find(function(s) { return s.id == "find-4"; });
            if(start_step) {
              working.step = level.indexOf(start_step);
            } else {
              working.step++;
            }
          } else if(step.intro == 'diff_target') {
            var step_id = 'diff-4';
            if(working.skill == 1) { step_id = 'diff-15'; }
            else if(working.skill == 2) { step_id = 'diff-6-24'}
            var start_step = level.find(function(s) { return s.id == step_id; });
            if(start_step) {
              working.step = level.indexOf(start_step);
            } else {
              working.step++;
            }
          } else {
            working.step++;
          }
          if(!level[working.step]) {
            working.level++;
            working.step = 0;
          }
          evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
          evaluation.appState.set_history([]);
        } else if(button.id == 'button_settings') {
          evaluation.settings();
        } else if(button.id == 'button_skip') {
          working.step = 0;
          working.level++;          
          evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + '-' + working.step});
          evaluation.appState.set_history([]);
        } else if(button.id == 'button_save') {
          evaluation.conclude();
        }
      } else {
        evaluation.modal.notice(evaluation.i18n.t('speak_mode_required_for_buttons', "Please enter speak mode before trying to run an evaluation"), true);
      }
      return {ignore: true, highlight: false, auto_return: false};
    };
    return {board: board, handler: handler};
  }
};


var assessment = {};
var working = {};
var mastery_cutoff = 0.69;
var non_mastery_cutoff = 0.32;
var attempt_minimum = 2;
var attempt_maximum = 6;
var testing_min_attempts = null;
var levels = [
  // TODO: best way to assess different symbol libraries
  [
    {intro: 'intro'},
  ],[
    {intro: 'intro2'},
  ],[
    {intro: 'find_target'},
    {id: 'find-2', rows: 1, cols: 2, distractors: false, min_attempts: 1},
    {id: 'find-3', rows: 1, cols: 3, distractors: false, min_attempts: 1},
    {id: 'find-4', rows: 1, cols: 4, distractors: false, perfect_id: 'find-15', fail_id: 'find-2'},
    {id: 'find-8', rows: 2, cols: 4, distractors: false, difficulty_stop: true},
    {id: 'find-15', rows: 3, cols: 5, distractors: false, perfect_id: 'find-6-60'},
    {id: 'find-6-24', cluster: '24', rows: 4, cols: 6, distractors: false, spacing: 2, difficulty_stop: true, fail_id: 'find-8'},
    {id: 'find-24', cluster: '24', rows: 4, cols: 6, distractors: false, fail_id: 'find-15'},
    {id: 'find-6-60', cluster: '60', rows: 6, cols: 10, distractors: false, spacing: 3, difficulty_stop: true, perfect_id: 'find-6-112', fail_id: 'find-6-24'},
    {id: 'find-15-60', cluster: '60', rows: 6, cols: 10, distractors: false, spacing: 2, fail_id: 'find-6-24'},
    {id: 'find-30-60', cluster: '60', rows: 6, cols: 10, distractors: false, alternating: true, fail_id: 'find-24'},
    {id: 'find-60', cluster: '60', rows: 6, cols: 10, distractors: false, min_attempts: 4, fail_id: 'find-24'},
    {id: 'find-6-112', cluster: '112', rows: 8, cols: 14, distractors: false, spacing: 4, difficulty_stop: true, fail_id: 'find-6-60'},
    {id: 'find-28-112', cluster: '112', rows: 8, cols: 14, distractors: false, spacing: 2, fail_id: 'find-15-60'},
    {id: 'find-56-112', cluster: '112', rows: 8, cols: 14, distractors: false, alternating: true, min_attempts: testing_min_attempts, fail_id: 'find-30-60'},
    {id: 'find-112', cluster: '112', rows: 8, cols: 14, distractors: false, min_attempts: 4, fail_id: 'find-60'},
    // TODO: on the higher levels, also do continuous rows/continuous columns before everything
  ], [
    {intro: 'diff_target'},
    {id: 'diff-2', rows: 1, cols: 2, distractors: true, min_attempts: 1},
    {id: 'diff-3', rows: 1, cols: 3, distractors: true, min_attempts: 1},
    {id: 'diff-4', rows: 1, cols: 4, distractors: true, perfect_id: 'diff-15', fail_id: 'diff-2'},
    {id: 'diff-8', rows: 2, cols: 4, distractors: true, difficulty_stop: true},
    {id: 'diff-15', rows: 3, cols: 5, distractors: true, perfect_id: 'diff-6-60'},
    // lower_level means didn't really succeed above this point
    {id: 'diff-6-24', cluster: '24', rows: 4, cols: 6, distractors: true, spacing: 2, difficulty_stop: true, perfect_id: 'diff-6-60', fail_id: 'diff-8'},
    {id: 'diff-24', cluster: '24', rows: 4, cols: 6, distractors: true, fail_id: 'diff-15'},
    {id: 'diff-24-shuffle', cluster: '24', rows: 4, cols: 6, distractors: true, shuffle: true, min_attempts: 1},
    {id: 'diff-6-60', cluster: '60', rows: 6, cols: 10, distractors: true, spacing: 3, difficulty_stop: true, perfect_id: 'diff-6-112', fail_id: 'diff-6-24'},
    {id: 'diff-15-60', cluster: '60', rows: 6, cols: 10, distractors: true, spacing: 2, fail_id: 'diff-6-24'},
    {id: 'diff-30-60', cluster: '60', rows: 6, cols: 10, distractors: true, alternating: true, fail_id: 'diff-24'},
    {id: 'diff-60', cluster: '60', rows: 6, cols: 10, distractors: true, fail_id: 'diff-24'},
    {id: 'diff-60-shuffle', cluster: '60', rows: 6, cols: 10, distractors: true, shuffle: true, min_attempts: 1},
    {id: 'diff-6-112', cluster: '112', rows: 8, cols: 14, distractors: true, spacing: 4, difficulty_stop: true, fail_id: 'diff-6-60'},
    {id: 'diff-28-112', cluster: '112', rows: 8, cols: 14, distractors: true, spacing: 2, fail_id: 'diff-15-60'},
    {id: 'diff-56-112', cluster: '112', rows: 8, cols: 14, distractors: true, alternating: true, fail_id: 'diff-30-60'},
    // higher_level means < 10x increase in time on next step vs. previous
    // This level is probably too high to be useful
    // {id: 'diff-112', cluster: '112', rows: 8, cols: 14, distractors: true, fail_id: 'diff-60'},
    // {id: 'diff-112-shuffle', cluster: '112', rows: 8, cols: 14, distractors: true, shuffle: true, min_attempts: 1},
  ], 
  // at this point, settle on a grid size that the user was 
  // really good with, maybe try occasionally bumping a little,
  // or slipping back down if they're not succeeding
  // (min of 3, max of, say, 15)
  [
    {intro: 'symbols'},
    {id: 'symbols-below', difficulty: -1, symbols: 'auto', distractors: true, min_attempts: 2},
    {id: 'symbols-at', difficulty: 0, symbols: 'auto', distractors: true, min_attempts: 3, difficulty_stop: true},
    {id: 'symbols-above', difficulty: 1, symbols: 'auto', distractors: true, min_attempts: 2, difficulty_stop: true},
    {id: 'symbols-above-shuffle', difficulty: 1, symbols: 'auto', distractors: true, min_attempts: 1, shuffle: true},
    // TODO: include text-only as a possible option
  ],
  // TODO: at this point if there is an obviously-better symbol library, start using it (unless explicitly told not to in the settings)
  [
    {intro: 'find_shown'}, // lower grid of core words, find word at the top (with symbols)
    {id: 'noun-find', find: 'noun', difficulty: -1, distractors: true, min_attempts: 3},
    {id: 'adjective-find', find: 'adjective', difficulty: -1, distractors: true, min_attempts: 3},
    {id: 'verb-find', find: 'verb', difficulty: -1, distractors: true, min_attempts: 3},
    {id: 'core-find', core: true, find: 'core', difficulty: 0, distractors: true, min_attempts: 3},
    {id: 'core-find+', core: true, find: 'core', difficulty: 1, distractors: true, min_attempts: 3},
  ], [
    {intro: 'open_ended'}, // open-ended commentary on pictures, only up to observed proficiency level
    {id: 'open-core', core: true, difficulty: 1, distractors: true, prompts: [
      //    ['happy', 'sad', 'dog', 'eat', 'play', 'read', 'ball']
      {id: 'kidc1', core_word: 'eat', url: 'https://images.pexels.com/photos/6413448/pexels-photo-6413448.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc2', core_word: 'play', url: 'https://images.pexels.com/photos/4004418/pexels-photo-4004418.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc3', core_word: 'read', url: 'https://images.pexels.com/photos/261895/pexels-photo-261895.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc4', core_word: 'read', url: 'https://images.pexels.com/photos/1741230/pexels-photo-1741230.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc5', core_word: 'eat', url: 'https://images.pexels.com/photos/5693056/pexels-photo-5693056.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc6', core_word: 'dog', url: 'https://images.pexels.com/photos/332974/pexels-photo-332974.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc7', core_word: 'play', url: 'https://images.pexels.com/photos/3618499/pexels-photo-3618499.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc8', core_word: 'play', url: 'https://images.pexels.com/photos/974498/pexels-photo-974498.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc9', core_word: 'happy', url: 'https://images.pexels.com/photos/294173/pexels-photo-294173.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc10', core_word: 'play', url: 'https://images.pexels.com/photos/4691579/pexels-photo-4691579.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc11', core_word: 'sad', url: 'https://images.pexels.com/photos/208087/pexels-photo-208087.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc12', core_word: 'read', url: 'https://images.pexels.com/photos/5634667/pexels-photo-5634667.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidc13', core_word: 'they', url: 'https://images.pexels.com/photos/274422/pexels-photo-274422.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'}
    ]}, // allow cycling through while staying on the same step
    {id: 'open-keyboard', core: true, keyboard: true, prompts: [
      {id: 'kidk1', ref: 'bike', url: 'https://images.pexels.com/photos/5792901/pexels-photo-5792901.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk2', ref: 'game', url: 'https://images.pexels.com/photos/4691587/pexels-photo-4691587.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk3', ref: 'snack', url: 'https://images.pexels.com/photos/5692278/pexels-photo-5692278.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk4', ref: 'bake', url: 'https://images.pexels.com/photos/3992206/pexels-photo-3992206.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk5', ref: 'race', url: 'https://images.pexels.com/photos/1571939/pexels-photo-1571939.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk6', ref: 'construction', url: 'https://images.pexels.com/photos/544966/pexels-photo-544966.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk7', ref: 'library', url: 'https://images.pexels.com/photos/1106468/pexels-photo-1106468.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
      {id: 'kidk8', ref: 'shopping', url: 'https://images.pexels.com/photos/896018/pexels-photo-896018.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=500'},
    ]}
  ], [
    {intro: 'categories', continue_on_non_mastery: true}, 
    {id: 'functional', find: 'functional', difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 4}, // was 4 // find the one that people [eat, drive, draw] with
    {id: 'functional-association', find: 'functional_association', difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 4}, // what do you do with a ________
    {id: 'find-the-group', find: 'category', difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 4}, // find the group that _____ belongs to
    {id: 'what-kind', find: 'from_category', always_visual: true, difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 4}, // what kind of [fruit, animal, etc] is this
  ], [
    {intro: 'inclusion_exclusion_association', continue_on_non_mastery: true, min_attempts: testing_min_attempts || 3}, // was 3
    {id: 'inclusion', find: 'inclusion', difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 3}, // find the one that is/is not a _______
    {id: 'exclusion', find: 'exclusion', difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 3, difficulty_stop: true},
    {id: 'association', find: 'association', always_visual: true, difficulty: -1, distractors: true, min_attempts: testing_min_attempts || 3, difficulty_stop: true} // find the one that goes with _________
  ], [
    {intro: 'literacy', continue_on_non_mastery: true},
    {id: 'word-description', find: 'spelling', literacy: true, difficulty: 0, always_visual: true, distractors: true, min_attempts: testing_min_attempts || 4}, // was 4 // find the word for this picture
    {id: 'word-category', find: 'spelling_category', literacy: true, difficulty: 0, always_visual: true, distractors: true, min_attempts: testing_min_attempts || 4, difficulty_stop: true}, // find the category for this picture
    {id: 'word-descriptor', find: 'spelling_descriptor', literacy: true, difficulty: 0, always_visual: true, distractors: true, min_attempts: testing_min_attempts || 4, difficulty_stop: true}, // find the description for this picture
    // multiple difficulty levels, from basic labeling to categoric labeling to concrete adjectives (red, wet, soft, fast, etc.) to abstract adjectives (dangerous, young, heavy)
  ], [
    {intro: 'done'}
  ]
];

function shuffle(array) {
  var array = [].concat(array);
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
//evaluation.obf.words = words;

var libraries = ['default', 'photos', 'lessonpix', 'pcs_hc', 'pcs', 'symbolstix', 'words_only'];
evaluation.libraries = libraries;
var shuffled_libraries = shuffle(libraries.filter(function(w) { return w != 'words_only'; }));
shuffled_libraries.push('words_only');
var core_prompts = {};
evaluation.callback = function(key) {
  if(!evaluation.appState.get('currentUser.currently_premium_or_premium_supporter')) { 
    board = evaluation.obf.shell(1, 1);
      var bg_word = words.find(function(w) { return w.label == 'backgrounds'; });
    var msg = evaluation.i18n.t('eval_login_required', "Evaluations require you to be logged in first");
    if(evaluation.appState.get('currentUser')) {
      msg = evaluation.i18n.t('eval_subscription_required', "Evaluations require an active paid account");
    }
    board.background = {
      image: (bg_word && bg_word.urls['intro2']) || "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f49b.svg",
      text: msg,
      position: 'center'
    }
    return {json: board.to_json()};
  }
  evaluation.obf.offline_urls = evaluation.obf.offline_urls || [];
  if(!words.prefetched) {
    var all_words = [];
    var next_word = function() {
      var w = all_words.shift();
      if(w) {
        for(var key in w.urls) {
          (function(key) {
            if(w.urls[key] && w.urls[key].match(/^http/)) {
              // TODO: sync should store evaluation.obf.offline_urls as another step
              evaluation.obf.offline_urls.push(w.urls[key]);
              evaluation.persistence.find_url(w.urls[key], 'image').then(function(data_uri) {
                w.urls[key] = data_uri;
              }, function(err) {
                var img = new Image();
                img.src = w.urls[key];
              });
            }
          })(key);
        }  
        setTimeout(next_word, 100);
      }
    };
    words.forEach(function(w) {
      all_words.push(w);
    });
    var threads = 3;
    for(var idx = 0; idx < threads; idx++) {
      next_word();
    }
    words.prefetched = true;
  }
  evaluation.checks_for = evaluation.checks_for || {};
  var user_id = evaluation.appState.get('sessionUser.id');
  assessment.uid = assessment.uid || (user_id + "x" + Math.random() + (new Date()).getTime());
  if(!evaluation.checks_for[user_id]) {
    evaluation.checks_for[user_id] = {};
    if(evaluation.appState.get('currentUser')) {
      evaluation.appState.get('currentUser').find_integration('lessonpix').then(function(res) {
        evaluation.checks_for[user_id].lessonpix = true;
      }, function(err) { });
    }
    if(evaluation.appState.get('currentUser.subscription.lessonpix')) {
      evaluation.checks_for[user_id].lessonpix = true;
    }
    if(evaluation.appState.get('currentUser.subscription.extras_enabled')) {
      evaluation.checks_for[user_id].pcs = true;
      evaluation.checks_for[user_id].pcs_hc = true;
      evaluation.checks_for[user_id].symbolstix = true;
    }
  }
  // https://www.youtube.com/watch?v=I71jXvIysSA&feature=youtu.be
  // https://www.youtube.com/watch?v=82XZ2cKV-VQ
  // https://www.youtube.com/watch?v=7ylVk9n5ne0
  // https://www.youtube.com/watch?v=2RA9wVvVmkA
  // Communication Matrix
  // CDI checklist https://mb-cdi.stanford.edu/about.html
  // SICD-R https://www.wpspublish.com/sicd-r-sequenced-inventory-of-communication-development-revised
  //
  // What we want to know:
  // - How small of a button can they handle?
  // - How many buttons per screen can they handle?
  // - Can they handle symbols or photos better?
  // - Can they pick up and start using a new board set?
  // - Can they read? At what level? Single words, sentences?
  // - Is it possible to end with a recommendation?
  // What others have wanted to know:
  // - Can they differentiate symbols?
  // - Can they differentiate concepts?
  // - Do they understand conceptual associations?
  // - Can they use mands, tacts, intraverbals, echoic
  // Expressive and Receptive Language 
  // MLU
  // Breadth of language, sentence complexity
  // Start w/ brief introduction and explanation for each assessment
  // TODO: dynamic scenes, repeat the prompt after a long-enough delay
  // TODO: should we try to include the same sub-choices a few times in a row?
  // TODO: quantitative conclusions of competency/percentile
  var res = {};
  var board = null;
  var opts = key.split(/-/);
  if(opts[1] == 'start') {
    assessment = {
      mastery_cutoff: mastery_cutoff,
      non_mastery_cutoff: non_mastery_cutoff,
      attempt_minimum: attempt_minimum,
      attempt_maximum: attempt_maximum,
      ppi: window.ppi,
      prompts: true,
      chimes: true,
      prompts_delay: 1500,
      default_library: 'default',
      name: 'Unnamed Eval',
    };
    working = {step: 0};
  } else if(opts[0] === 'eval' && opts[1] && opts[1].match(/^\d+$/) && opts[2] && opts[2].match(/^\d+$/)) {
    // board route calls obf.lookup(params.key.split(/\//)[1]) so key is "eval-3-3", not "obf/eval-3-3".
    // Sync in-memory working to the URL so reload / deep links match the route (was only updated on jump_to_board).
    working.level = parseInt(opts[1], 10);
    working.step = parseInt(opts[2], 10);
    if(opts[3] !== undefined && opts[3] !== '' && String(opts[3]).match(/^\d+$/)) {
      working.attempts = parseInt(opts[3], 10);
    }
    working.level = Math.max(0, Math.min(levels.length - 1, working.level));
    var _levelArr = levels[working.level];
    if(_levelArr) {
      working.step = Math.max(0, Math.min(_levelArr.length - 1, working.step));
    }
  } else if(!working || working.step == undefined) {
    board = evaluation.obf.shell(1, 1);
    runLater(function() {
      evaluation.appState.jump_to_board({key: 'obf/eval-start'});
      evaluation.appState.set_history([]);
    })
    res.json = board.to_json();
    return res;
  }
  if(!assessment.populated) {
    evaluation.populate_assessment(assessment);
  }
  window.assessment = assessment;
  window.working = working;
  working.ref = working.ref || {};
  working.level = working.level || 0;
  assessment.started = assessment.started || (new Date()).getTime() / 1000;
  var level = levels[working.level];
  var step = level[working.step];
  if(working.step == 0) {
    var intro = evaluation.intro_board(level, step, user_id);
    board = intro.board;
    res.handler = intro.handler;
  } else {
    console.log("step", step.id, working)
    var step_rows = step.rows, step_cols = step.cols;
    if(step.symbols == 'auto' && !level.current_library) {
      level.more_libraries = false;
      var found = false;
      shuffled_libraries.forEach(function(lib) {
        if(!level.libraries_used[lib]) {
          if(!found) {
            level.current_library = lib;
          } else {
            level.more_libraries = true;
          }
          found = true;
        }
      });
    } else if(assessment.library) {
      level.current_library = assessment.library;
    }
    var library = level.current_library || assessment.default_library || 'default';
    if(library == 'photos' && step.find) {
      library = 'default';
    }
    level.libraries_used = level.libraries_used || {};
    level.libraries_used[library] = true;
    if(Object.keys(level.libraries_used).length >= 4) {
      // don't make communicators do more than 4 libraries
      level.more_libraries = false;
    }
    // Figure out rows based on current known skill level
    if(step.keyboard) {
      step_rows = 3;
      step_cols = 10;
    } else if(step.difficulty != null) {
      if(step.difficulty < 0) {
        step_rows = 1;
        step_cols = 3;
        if(step.find) {
          if(working.skill === -1) {
            step_rows = 1;
            step_cols = 2;
          } else if(working.skill === 2) {
            step_rows = 1;
            step_cols = 4;
          }
        } else {
          if(working.skill === -1 || working.skill === 0) { // below-level
            step_rows = 1;
            step_cols = 2;
          } else if(working.skill === 2) { // above-level
            step_rows = 2;
            step_cols = 2;
          }
        }
      } else if(step.difficulty === 0) {
        step_rows = 2;
        step_cols = 3;
        if(working.skill === -1 || working.skill === 0) { // below-level
          step_rows = 1;
          step_cols = 4;
        } else if(working.skill === 2) { // above-level
          step_rows = 2;
          step_cols = 4;
        }
      } else {
        step_rows = 3;
        step_cols = 4;
        if(working.skill === -1 || working.skill === 0) { // below-level
          step_rows = 2;
          step_cols = 4;
        } else if(working.skill === 2) { // above-level
          step_rows = 4;
          step_cols = 5;
        }
      }
    }
    var skip_rows = 0;
    var core = [];
    if(step.find || step.prompts) {
      var rows_to_add = step.prompts ? 3 : 2;
      step_rows = step_rows + rows_to_add;
      skip_rows = rows_to_add;
    }
    var core_list = [];
    // ADD "THE", INFLECTIONS 
    if(step.core) {
      opts = evaluation.core_list(step, step_rows - skip_rows, step_cols);
      core = opts.core;
      core_list = opts.core_list;
      if(step.prompts && working.ref.core_step != step) {
        working.ref.core_step = step;
        working.ref.core_prompts = [];
        step.prompts.forEach(function(prompt) {
          if(step.keyboard || !prompt.core_word || core_list.indexOf(prompt.core_word) != -1) {
            working.ref.core_prompts.push(prompt);
          }
        });
        working.ref.core_prompts = shuffle(working.ref.core_prompts);
      }
    }
    board = evaluation.obf.shell(step_rows, step_cols);
    board.key = 'obf/eval-' + Math.round(Math.random() * 9999) + "-" + (new Date()).getTime();
    board.name = "Evaluation Board";
    board.locale = 'en';
    board.obf_type = 'eval';
    board.license = {private: true};
  
    // TODO: make sure you exclude all items in the list from being distractors
    // TODO: option to have a consistent mapping of distractors to row, col locations
    // TODO: record for each answer what the prompt was
    assessment.label = assessment.label || 'cat';
    var prompts = [assessment.label];
    if(assessment.label == 'animals') {
      prompts = ['cat', 'dog', 'fish', 'bird'];
    } else if(assessment.label == 'vehicles') {
      prompts = ['car', 'truck', 'airplane', 'motorcycle', 'train'];
    } else if(assessment.label == 'food') {
      prompts = ['sandwich', 'burrito', 'spaghetti', 'hamburger', 'taco'];
    } else if(assessment.label == 'fruit') {
      prompts = ['apple', 'banana', 'strawberry', 'blueberry'];
    } else if(assessment.label == 'space') {
      prompts = ['planet', 'sun', 'comet', 'asteroid'];
    }

    working.ref = working.ref || {};
    working.ref.find_prompt_index = working.ref.find_prompt_index == null ? 0 : working.ref.find_prompt_index + 1;

    working.ref.prompt_label = prompts[working.ref.find_prompt_index % prompts.length];
    var prompt = words.find(function(w) { return w.label == working.ref.prompt_label; });
    var distractor_words = words.filter(function(w) { return w.label && w.type && w.type != 'filler'; });

    if(level.current_library == 'words_only') {
      board.text_only = true;      
    }
    if(step.find) {
      // {id: 'functional', find: 'functional', difficulty: -1, distractors: true}, // find the one that people [eat, drive, draw] with
      // {id: 'functional-association', find: 'functional_association', difficulty: -1, distractors: true}, // what do you do with a ________
      // {id: 'find-the-group', find: 'category', difficulty: -1, distractors: true}, // find the group that _____ belongs to
      // {id: 'what-kind', find: 'from_category', always_visual: true, difficulty: -1, distractors: true}, // what kind of [fruit, animal, etc] is this
  
      var filtered = words.filter(function(w) { return w.type == step.find; });
      var prompt_text = null;
      var assert = function(type) {
        working.ref = working.ref || {};
        if(type == 'functional') {
          if(!working.ref.functional) {
            var categories = [];
            var all_words = [];
            for(var key in functional) {
              var cat = Object.assign({}, functional[key]);
              cat.category = key;
              cat.words = shuffle(words.filter(function(w) { return w.category == key && w.functional; }));
              all_words = all_words.concat(cat.words);
              categories.push(cat);
            }
            working.ref.all_functional_words = all_words;
            categories = shuffle(categories);
            working.ref.functional = categories;
          }            
        } else if(type == 'functional_association') {
          if(!working.ref.functional_associations) {
            var categories = [];
            var all_words = [];
            for(var key in functional_associations) {
              var cat = Object.assign({}, functional_associations[key]);
              cat.label = key;
              cat.word = words.find(function(w) { return w.label == cat.label; });
              cat.action = words.find(function(w) { return w.label == cat.answer; });
              all_words.push(cat.action);
              categories.push(cat);
            }
            working.ref.all_functional_association_words = all_words;
            categories = shuffle(categories);
            working.ref.functional_associations = categories;
          }  
        } else if(type == 'groups') {
          if(!working.ref.groups) {
            var categories = [];
            var all_words = [];
            var category_words = [];
            for(var key in groups) {
              var cat = Object.assign({}, groups[key]);
              cat.group = key;
              cat.words = shuffle(words.filter(function(w) { return w.category == key; }));
              all_words = all_words.concat(cat.words);
              cat.word = words.find(function(w) { return w.group == key; });
              category_words.push(cat.word);
              categories.push(cat);
            }
            working.ref.all_group_words = shuffle(all_words);
            categories = shuffle(categories);
            working.ref.groups = shuffle(categories);
            working.ref.category_words = category_words;
          }  
        } else if(type == 'associations') {
          if(!working.ref.associations) {
            var list = [];
            var all_words = [];
            for(var key in associations) {
              var item = Object.assign({}, associations[key]);
              item.name = key;
              item.prompt = words.find(function(w) { return w.label == item.name; });
              item.answer = words.find(function(w) { return w.label == item.word; });
              if(!item.answer) { debugger }
              list.push(item);
              all_words.push(item.answer);
            }
            working.ref.associations = shuffle(list);
            working.ref.association_answers = all_words;
          }
        } else if(type == 'spelling') {
          if(!working.ref.spelling) {
            working.ref.simple_words = [];
            working.ref.medium_words = [];
            working.ref.simple_adjectives = [];
            working.ref.difficult_adjectives = [];
            working.ref.spelling = true;
            words.forEach(function(word) {
              if(word.type && word.type != 'filler') {
                if(word.distractors && word.distractors.length > 0) {
                  if(word.literacy_level == 1 && word.type == 'noun') {
                    working.ref.simple_words.push(word);
                  } else if(word.literacy_level == 2 || word.literacy_level == 3 || (word.literacy_level == 1 && word.type != 'noun')) {
                    working.ref.medium_words.push(word);
                  }
                }
                if(word.simple_adjectives && word.simple_adjectives.length > 0) {
                  working.ref.simple_adjectives.push(word);
                }
                if(word.difficult_adjectives && word.difficult_adjectives.length > 0) {
                  working.ref.difficult_adjectives.push(word);
                }
              }
            });
            working.ref.simple_words = shuffle(working.ref.simple_words);
            working.ref.medium_words = shuffle(working.ref.medium_words);
            working.ref.simple_adjectives = shuffle(working.ref.simple_adjectives);
            working.ref.difficult_adjectives = shuffle(working.ref.difficult_adjectives);
          }
        }
      };
      if(step.find == 'core') {
        working.ref.core_used = working.ref.core_used || {};
        var core_word = core_list.find(function(w) { return !working.ref.core_used[w]; });
        if(!core_word) {
          working.ref.core_used = {};
          core_word = core_list[0];
        }
        working.ref.core_used[core_word] = true;
        filtered = words.filter(function(w) { return w.label == core_word; });
      } else if(step.find == 'functional') {
        assert('functional');
        working.ref.functional_index = working.ref.functional_index || 0;
        var cat = working.ref.functional[working.ref.functional_index];
        working.ref.functional_index++;
        if(working.ref.functional_index >= working.ref.functional.length) { working.ref.functional_index = 0; }
        prompt_text = "Find the one that people " + cat.prompt;
        filtered = cat.words;
        var cat_word = words.find(function(w) { return w.group == cat.category});
        if(!cat_word) { debugger }
        board.background.image = cat_word.urls['photos'] || cat_word.urls['default'];
        distractor_words = shuffle(working.ref.all_functional_words.filter(function(w) { return w.category != cat.category && !(cat.exclude || {})[w.category] && !(cat.exclude || {})[w.label]; }));
      } else if(step.find == 'functional_association') {
        assert('functional_association');
        working.ref.functional_association_index = working.ref.functional_association_index || 0;
        var cat = working.ref.functional_associations[working.ref.functional_association_index];
        working.ref.functional_association_index++;
        if(working.ref.functional_association_index >= working.ref.functional_associations.length) { working.ref.functional_association_index = 0; }
        if(!cat.prompt) { debugger }
        prompt_text = "What do you do with " + cat.prompt + "?";
        filtered = [cat.action];
        distractor_words = working.ref.all_functional_association_words.filter(function(w) { return w && w != cat.action && !(cat.exclude || {})[w.category]  && !(cat.exclude || {})[w.label]; });
        board.background.image = cat.word.urls['photos'] || cat.word.urls['default'];
      } else if(step.find == 'category') {
        assert('groups');
        working.ref.groups_index = working.ref.groups_index || 0;
        var word = working.ref.all_group_words[working.ref.groups_index];
        var cat = words.find(function(w) { return w.group == word.category});
        filtered = [cat];
        distractor_words = working.ref.category_words.filter(function(w) { return w != cat; });
        working.ref.groups_index++;
        if(working.ref.groups_index >= working.ref.all_group_words.length) { working.ref.groups_index = 0; }
        prompt_text = "Find the group that " + word.label + " belongs to";
        board.background.image = word.urls['photos'] || word.urls['default'];
      } else if(step.find == 'from_category') {
        assert('groups');
        working.ref.category_group_index = working.ref.category_group_index || 0;
        var category = working.ref.groups[working.ref.category_group_index];
        working.ref.category_group_index++;
        if(working.ref.category_group_index >= working.ref.groups.length) { working.ref.category_group_index = 0; }
        var word = category.words[Math.floor(Math.random() * category.words.length)];
        filtered = [word];
        var extras = shuffle(working.ref.all_group_words).slice(0, 9 - category.words.length);
        distractor_words = category.words.concat(extras);
        prompt_text = "What kind of " + category.category + " is this?";
        if(category.category == 'color') {
          prompt_text = "What color is this?";
        }
        board.background.image = word.urls['photos'] || word.urls['default'];
      } else if(step.find == 'inclusion') {
        assert('groups');
        working.ref.category_group_index = working.ref.category_group_index || 0;
        var category = working.ref.groups[working.ref.category_group_index];
        working.ref.category_group_index++;
        if(working.ref.category_group_index >= working.ref.groups.length) { working.ref.category_group_index = 0; }
        var word = category.words[Math.floor(Math.random() * category.words.length)];
        filtered = [word];
        distractor_words = working.ref.all_group_words.filter(function(w) { return w.category != category.group });
        prompt_text = "Find the one that is " + category.prompt;
        board.background.image = category.word.urls['photos'] || category.word.urls['default'];
      } else if(step.find == 'exclusion') {
        assert('groups');
        working.ref.category_group_index = working.ref.category_group_index || 0;
        var category = working.ref.groups[working.ref.category_group_index];
        working.ref.category_group_index++;
        if(working.ref.category_group_index >= working.ref.groups.length) { working.ref.category_group_index = 0; }
        var others = working.ref.all_group_words.filter(function(w) { return w.category != category.group });
        // TODO: make sure it can't get actual valid ones
        var word = others[Math.floor(Math.random() * others.length)];
        filtered = [word];
        distractor_words = category.words;
        console.log("EXCLUSION", word, category, others);
        prompt_text = "Find the one that is not " + category.prompt;
        board.background.image = category.word.urls['photos'] || category.word.urls['default'];
        board.background.ext_lingolinq_image_exclusion = true;
      } else if(step.find == 'association') {
        assert('associations');
        working.ref.association_index = working.ref.association_index || 0;
        var item = working.ref.associations[working.ref.association_index];
        working.ref.association_index++;
        if(working.ref.association_index >= working.ref.associations.length) { working.ref.association_index = 0; }
        // TODO: still no valid options sometimes
        prompt_text = "Find the one that goes with " + item.name;
        board.background.image = item.prompt.urls['photos'] || item.prompt.urls['default'];        
        filtered = [item.answer];
        distractor_words = working.ref.association_answers.filter(function(w) { return w != item.answer && !(item.exclude || {})[w.label]; });
        console.log("ASSOCIATIONS", item, distractor_words);
      } else if(step.find == 'spelling') {
        board.text_only = true;
        board.spelling = true;
        assert('spelling');
        working.ref.literacy_used = working.ref.literacy_used || {};
        var get_words = function() {
          var spelling_words = working.ref.simple_words.filter(function(w) { return w.urls['photos'] && !working.ref.literacy_used[w.label]; });
          if(working.ref.literacy_spelling1) {
            spelling_words = working.ref.medium_words.filter(function(w) { return w.urls['photos'] && !working.ref.literacy_used[w.label]; });
          }
          return spelling_words;
        }
        var spelling_words = get_words();
        if(spelling_words.length == 0) { working.ref.literacy_used = {}; }
        spelling_words = get_words();
        if(spelling_words.length == 0) { spelling_words = working.ref.literacy_spelling1 ? working.ref.medium_words : working.ref.simple_words}
        working.ref.spelling_index = working.ref.spelling_index || 0;
        if(working.ref.spelling_index >= spelling_words.length) { working.ref.spelling_index = 0; }
        var word = spelling_words[working.ref.spelling_index];
        working.ref.spelling_index++;
        if(working.ref.spelling_index >= spelling_words.length) { working.ref.spelling_index = 0; }
        working.ref.literacy_used[word.label] = true;
        filtered = [word];
        distractor_words = word.distractors;
        prompt_text = "Find the name of this picture";
        // TODO: we sshould probably just use nouns for this
        board.background.image = word.urls['photos'];
        board.prompt_name = word.label;
        board.correct_answer = word.label;
      } else if(step.find == 'spelling_category') {
        board.text_only = true;
        board.spelling = true;
        assert('spelling');
        assert('groups');
        working.ref.literacy_used = working.ref.literacy_used || {};
        var get_words = function() {
          return working.ref.all_group_words.filter(function(w) { return w.category && w.category != 'filler' && w.category != 'color' && w.category != 'feeling' && w.urls['photos'] && !working.ref.literacy_used[w.label]; });
        };
        var spelling_words = get_words();
        if(spelling_words.length == 0) { working.ref.literacy_used = {}; }
        spelling_words = get_words();
        if(spelling_words.length == 0) { working.ref.all_group_words.filter(function(w) { return w.urls['photos']; }) }
        working.ref.spelling_category_index = working.ref.spelling_category_index == null ? spelling_words.length - 1 : working.ref.spelling_category_index;
        if(working.ref.spelling_category_index >= spelling_words.length) { working.ref.spelling_category_index = spelling_words.length - 1; }
        var word = spelling_words[working.ref.spelling_category_index];
        working.ref.spelling_category_index--;
        if(working.ref.spelling_category_index < 0) { working.ref.spelling_category_index = spelling_words.length - 1; }
        var category = working.ref.groups.find(function(g) { return g.group == word.category; });
        working.ref.literacy_used[word.label] = true;
        filtered = [category.word];
        distractor_words = working.ref.groups.filter(function(g) { return g.group != word.category; }).map(function(g) { return g.simple_name || g.name });
        prompt_text = "Find the category that this picture belongs to";
        board.background.image = word.urls['photos'];
        board.prompt_name = word.label;
        board.correct_answer = category.word.label;
      } else if(step.find == 'spelling_descriptor') {
        board.text_only = true;
        board.spelling = true;
        assert('spelling');
        working.ref.literacy_used = working.ref.literacy_used || {};
        var get_words = function() {
          var spelling_words = working.ref.simple_adjectives.filter(function(w) { return w.urls['photos'] && !working.ref.literacy_used[w.label]; });
          if(working.ref.literacy_describe1) {
            spelling_words = working.ref.difficult_adjectives.filter(function(w) { return w.urls['photos'] && !working.ref.literacy_used[w.label]; });
          }
          return spelling_words;
        }
        var spelling_words = get_words();
        if(spelling_words.length == 0) { working.ref.literacy_used = {}; }
        spelling_words = get_words();
        if(spelling_words.length == 0) { spelling_words = working.ref.literacy_describe1 ? working.ref.difficult_adjectives : working.ref.simple_adjectives}
        working.ref.spelling_descriptor_index = working.ref.spelling_descriptor_index || 0;
        if(working.ref.spelling_descriptor_index >= spelling_words.length) { working.ref.spelling_descriptor_index = 0; }
        var word = spelling_words[working.ref.spelling_descriptor_index];
        working.ref.spelling_descriptor_index++;
        if(working.ref.spelling_descriptor_index >= spelling_words.length) { working.ref.spelling_descriptor_index = 0; }
        var list = (working.ref.literacy_describe1 ? word.difficult_adjectives : word.simple_adjectives).filter(function(w) { return !w.match(/^-/); });
        var desc = list[Math.floor(Math.random() * list.length)];
        working.ref.literacy_used[word.label] = true;
        filtered = [{label: desc, urls: {'default': 'na'}}];
        distractor_words = word.simple_adjectives.filter(function(w) { return w.match(/^-/); }).map(function(w) { return w.substring(1); });
        prompt_text = "Find the word that describes this picture";
        board.background.image = word.urls['photos'];
        board.prompt_name = word.label;
        board.correct_answer = list[0];
      }
      working.ref.prompt = prompt_text;
      working.ref.filtered_corrects = filtered;
      working.ref.distractors = distractor_words;
  
      prompt = filtered[Math.floor(Math.random() * filtered.length)];
      working.ref.prompt_label = prompt.label;
      prompt_text = prompt_text || "Find " + prompt.label;
      core_list[prompt.label] = true;
      var not_nailed_yet = (working.attempts || 0) < 2 || (working.correct / working.attempts) < 0.65;
      var none_yet = (working.correct || 0) == 0;
      if(step.always_visual || not_nailed_yet || working.attempts < 15) {
        board.background.image = board.background.image || prompt.urls['photos'] || prompt.urls['default'];
        if(none_yet || true) {
          board.background.text = prompt_text;
        }
      } else {
        board.background.image = null;
        board.add_button({
          id: 'button_repeat',
          label: 'repeat',
          background_color: "rgba(255, 255, 255, 0.5)",
          vocalization: prompt_text
        }, 0, 0);
        // add button for repeating the audio prompt
      }
      if(board.background.image) {
        board.background.position = board.background.position || "center,0,0,6,1";
      }
      board.background.prompt = {
        text: prompt_text,
        timeout: assessment.prompts_delay
      };
    } else if(step.core) {
      board.background.position = 'center,0,0,10,2';
      board.background.prompt = null;
      board.background.text = null;

      // TODO: only include images/prompts that apply to
      // the current core list
      working.ref.prompt_index = working.ref.prompt_index || Math.floor(Math.random() * step.prompts.length) || 0;
      working.ref.prompt_index++;
      if(working.ref.prompt_index >= step.prompts.length) { working.ref.prompt_index = 0; }
      var prompt = step.prompts[working.ref.prompt_index];
      
      board.background.image = prompt.url;
      $("#board_bg img").attr('src', prompt.url);
      
      board.add_button({
        id: 'button_prev',
        label: "previous",
        background_color: "rgba(255, 255, 255, 0.7)",
        image: {url: words.find(function(w) { return w.label == 'left'; }).urls['default']},
        skip_vocalization: true
      }, 0, 0);
      board.add_button({
        id: 'button_next',
        label: "next",
        background_color: "rgba(255, 255, 255, 0.7)",
        image: {url: words.find(function(w) { return w.label == 'right'; }).urls['default']},
        skip_vocalization: true
      }, 0, step_cols - 1);
      board.add_button({
        id: 'button_done',
        label: "done",
        background_color: "rgba(255, 255, 255, 0.7)",
        image: {url: words.find(function(w) { return w.label == 'done'; }).urls['default']},
        skip_vocalization: true
      }, 1, step_cols - 1);
    } else {
      board.background.position = "stretch";
      // board.background.text = "Find the " + prompt.label;
      var bg_prompt = evaluation.i18n.t('find_the', "Find the %{item}", {item: prompt.label});
      board.background.delay_prompts = [
        evaluation.i18n.t('can_you_find_the_item', "Can you find the %{item}?", {item: prompt.label}),
        evaluation.i18n.t('see_if_you_can_find_the_item', "See if you can find the %{item}", {item: prompt.label})
      ];
      // after a period of inactivity, go ahead and re-prompt (unless using slow access like scanning)
      if(assessment.reprompt !== 0 && !(evaluation.appState.get('currentUser.access_method')).match(/scanning/)) {
        board.background.delay_prompt_timeout = (assessment.reprompt || (board.background.delay_prompts ? 20 : 40)) * 1000;
      }
      if(level.current_library == 'words_only') {
        bg_prompt = evaluation.i18n.t('find_item', "Find %{item}", {item: prompt.label});
        board.background.delay_prompts = [
          evaluation.i18n.t('can_you_find_item', "Can you find, %{item}?", {item: prompt.label}),
          evaluation.i18n.t('see_if_you_can_find_item', "See if you can find, %{item}", {item: prompt.label})
        ];
      }
      board.background.prompt = {
        text: bg_prompt,
        timeout: assessment.prompts_delay,
        loop: true
      };
    }
    if(assessment.prompts === false) {
      if(board.background) {
        delete board.background.prompt;
        delete board.background.delay_prompts;
        delete board.background.delay_prompt_timeout;
      }
    }
    var loc = null;
    var spacing = step.spacing || 1;
    var alternating = step.alternating || false;
    var rows = Math.floor(step_rows / spacing) - skip_rows;
    var cols = Math.floor(step_cols / spacing);
    var offset = (working.attempts || 0) % spacing;
    var events = (((assessment.events || {})[working.level_id] || [])[working.step] || []);
    var prior = events[events.length - 1];
    var resets = 0;
    var sample_rand = Math.random();
    var sample = null;
    if(sample_rand < 0.28 && working.cluster_samples && working.cluster_samples.length > 0) {
      var idx = Math.floor(Math.random() * working.cluster_samples.length);
      sample = working.cluster_samples[idx];
      // try to find a row/col near the sample location with some jitter
      var x = sample.x, y = sample.y;
      if(!sample.in) {
        // for antigravity entries, mark some locations as off-limits
        sample.avoid = {rows: {}, cols: {}, type: sample.type};
        sample.avoid.rows[Math.floor(y / (1.0 / step_rows))] = true;
        sample.avoid.rows[Math.floor((y - 0.05) / (1.0 / step_rows))] = true;
        sample.avoid.rows[Math.floor((y - 0.1) / (1.0 / step_rows))] = true;
        sample.avoid.rows[Math.floor((y + 0.05) / (1.0 / step_rows))] = true;
        sample.avoid.rows[Math.floor((y + 0.1) / (1.0 / step_rows))] = true;
        sample.avoid.cols[Math.floor(x / (1.0 / step_cols))] = true;
        sample.avoid.cols[Math.floor((x - 0.05) / (1.0 / step_cols))] = true;
        sample.avoid.cols[Math.floor((x - 0.1) / (1.0 / step_cols))] = true;
        sample.avoid.cols[Math.floor((x + 0.05) / (1.0 / step_cols))] = true;
        sample.avoid.cols[Math.floor((x + 0.1) / (1.0 / step_cols))] = true;
      } else {
        var jitter_y = y + 0.1 - Math.random() * 0.2;
        var jitter_x = x + 0.1 - Math.random() * 0.2;
        var row = Math.floor(jitter_y / (1.0 / step_rows));
        var col = Math.floor(jitter_x / (1.0 / step_cols));
        var spaced_row = (row - offset) / spacing;
        if(spaced_row > 0 && spaced_row == Math.round(spaced_row)) {
          sample.row = Math.min(Math.max(spaced_row, 0), rows);
        }
        var spaced_col = (col - offset) / spacing;
        if(spaced_col > 0 && spaced_col == Math.round(spaced_col)) {
          sample.col = Math.min(Math.max(spaced_col, 0), cols);
        }
        if(alternating) {
          if(sample.col % 2 != sample.row % 2) {
            sample.row = null;
            sample.col = null;
          }
        }
      }
    }
    if(sample && sample.in) {
      // try to render near the target(s)
      loc = [Math.floor(Math.random() * rows), Math.floor(Math.random() * cols)];
      working.ref.loc_from = 'sample.in';

      if(alternating) {
        if(sample.type == 'xy' && sample.row && sample.col) {
          loc[0] = Math.max(Math.min(sample.row, rows - 1), 0);
          loc[1] = Math.max(Math.min(sample.col, cols - 1), 0);
        }
      } else {
        if(sample.col && (sample.type == 'x' || sample.type == 'xy')) {
          loc[1] = Math.max(Math.min(sample.col, cols - 1), 0);
        }
        if(sample.row && (sample.type == 'y' || sample.type == 'xy')) {
          loc[0] = Math.max(Math.min(sample.row, rows - 1), 0);
        }
      }
    }
    while(!loc || (prior && loc[0] == prior.crow && loc[1] == prior.ccol)) {
      loc = [Math.floor(Math.random() * rows), Math.floor(Math.random() * cols)];
      working.ref.loc_from = 'random.sample';
      if(alternating && loc[1] % 2 != loc[0] % 2) {
        working.ref.loc_from = 'shift.col';
        // force onto alternating spot if possible
        if(loc[1] < step_cols - 2) {
          loc[1]++;
        } else {
          loc[1]--;
        }
      }
      var q = (loc[0] < (rows / 2) ? 0 : 1) + (loc[1] < (cols / 2) ? 0 : 2);
      // try (but not too hard) to jump to a different quadrant
      if(resets < 3 && prior && prior.q == q) {
        resets++;
        loc = null;
      } else if(resets < 5 && sample && !sample.in && sample.avoid) {
        // try to render away from the target(s)
        var avoid = false;
        avoid = avoid || (sample.avoid.type == 'x' && sample.avoid.cols[loc[1]]);
        avoid = avoid || (sample.avoid.type == 'y' && sample.avoid.rows[loc[0]]);
        avoid = avoid || (sample.avoid.type == 'xy' && sample.avoid.cols[loc[1]] && sample.avoid.rows[loc[0]]);
        if(avoid) {
          resets++;
          loc = null;
        }
      }
    }
    working.edge = null;
    if(step_rows * step_cols > 8 && !alternating) {
      working.big_hits = (working.big_hits || 0) + 1;
      var edge_cutoff = Math.floor(working.big_hits / 10);
      if(working.n_cnt < 2 || working.s_cnt < 2 || working.e_cnt < 2 || working.w_cnt < 2) {
        edge_cutoff = Math.floor(working.big_hits / 7);
      } else if(working.n_cnt < 1 || working.s_cnt < 1 || working.e_cnt < 1 || working.w_cnt < 1) {
        edge_cutoff = Math.floor(working.big_hits / 3);
      }
      if(working.n_cnt < edge_cutoff) {
        working.edge = 'n';
        loc[0] = 0;
      } else if(((rows - 1) * spacing) + offset + skip_rows == step_rows - 1 && working.s_cnt < edge_cutoff) {
        working.edge = 's';
        loc[0] = rows - 1;
      } else if(working.w_cnt < edge_cutoff) {
        working.edge = 'w';
        loc[1] = 0;
      } else if(((cols - 1) * spacing) + offset == step_cols - 1 && working.e_cnt < edge_cutoff) {
        working.edge = 'e';
        loc[1] = cols - 1;
      }
    }
    if(loc[0] == 0) {
      working.n_cnt = (working.n_cnt || 0) + 1;
    } else if(loc[0] == step_rows - 1) {
      working.s_cnt = (working.s_cnt || 0) + 1;
    }
    if(loc[1] == 0) {
      working.w_cnt = (working.w_cnt || 0) + 1;
    } else if(loc[1] == step_rows - 1) {
      working.e_cnt = (working.e_cnt || 0) + 1;
    }
    if(step.find == 'core') {
      for(var idx = 0; idx < core.length; idx++) {
        for(var jdx = 0; jdx < core[idx].length; jdx++) {
          if(prompt.label == core[idx][jdx]) {
            loc[0] = Math.max(Math.min(idx, rows - 1), 0);
            loc[1] = Math.max(Math.min(jdx, cols - 1), 0);
          }
        }
      }
    }
    if(!step.prompts) {
      board.add_button({
        id: 'button_correct',
        label: prompt.label, 
        skip_vocalization: true,
        image: {url: prompt.urls[library] || prompt.urls['default']},
        rc: [loc[0] * spacing + offset + skip_rows, loc[1] * spacing + offset, loc[0] * spacing + offset, loc[0] * spacing, loc[0]]
  //      sound: {}
      }, loc[0] * spacing + offset + skip_rows, loc[1] * spacing + offset);
      working.ref.last_correct = loc;
      console.log("adding correct button at". loc);
    }
    var used_words = {};
    if(['diff_target', 'symbols'].indexOf(working.level_id) != -1 && !working.ref['diff_map_for_' + assessment.label]) {
      working.ref['diff_map_for_' + assessment.label] = {};
      var distractors = shuffle(distractor_words).filter(function(w) { return prompts.indexOf(w.label) == -1; });
      for(var idx = 0; idx < 8; idx++) {
        working.ref['diff_map_for_' + assessment.label][idx] = {};
        for(var jdx = 0; jdx < 14; jdx++) {
          working.ref['diff_map_for_' + assessment.label][idx][jdx] = distractors[idx * 8 + jdx];
        }
      }
    }
    for(var idx = 0; idx < rows; idx++) {
      for(var jdx = 0; jdx < cols; jdx++) {
        if(alternating && jdx % 2 != idx % 2) {
          // skip every other when alternating
        } else {
          var word = null, letter = null;
          if(step.keyboard) {
            letter = core[idx][jdx];
          } else if(['diff_target', 'symbols'].indexOf(working.level_id) != -1 && !step.shuffle) {
            word = working.ref['diff_map_for_' + assessment.label][idx * spacing + offset + skip_rows][jdx * spacing + offset];
          } else if(step.distractors) {
            if(core.length > 0) {
              if(core[idx] && core[idx][jdx]) {
                word = core[idx][jdx];
                word = words.find(function(w) { return w.label == word; });
                if(!word) { debugger }
                used_words[word.label] = true;  
              }
            } else {
              var unused = distractor_words.filter(function(w) { return w != prompt && !used_words[w.label]; });
              var fails = 0;
              var tries = 0;
              while(tries < 20 && (!word || used_words[word.label] || !(word && (word.urls[library] || word.urls['default'])))) {
                tries++;
                var maybe = unused;
                if(step.find) {
                  // show a slight preference for words of the same type/category
                  maybe = unused.filter(function(w) { return w.type == prompt.type && (w.category == prompt.category || (Math.random() < 0.5))});
                }
                if(maybe.length == 0) { maybe = unused; }
                word = maybe[Math.floor(Math.random() * maybe.length)];
                if(step.literacy && typeof(word) == 'string') {
                  word = {label: word, urls: {'default': 'na'}};
                }
                if(!step.find && word && word.category == prompt.category && fails < 3 && tries < 15) {
                  word = null;
                  fails++;
                }
              }
              used_words[word.label] = true;
            }
          }
          if(letter) {
            board.add_button({
              label: letter,
              vocalization: letter == '⎵' ? ':space' : '+' + letter,
              text_only: true,
              image: null,
            }, idx * spacing + offset + skip_rows, jdx * spacing + offset)            
          } else {
            word = word || {urls: {}};
            board.add_button({
              label: !step.distractors ? '' : word.label,
              skip_vocalization: !step.prompts,
              image: !step.distractors ? null : {url: word.urls[library] || word.urls['default']},
            }, idx * spacing + offset + skip_rows, jdx * spacing + offset)  
          }
        }
      }
    }
    var handling = false;
    var original_board = board;
    res.handler = function(button, obj) {
      assessment.access_method = assessment.access_method || evaluation.appState.get('currentUser.access_method');
      obj = obj || {};
      var r = -1, c = -1;
      var cr = -1, cc = -1;
      var skip_event = false;
      if(button.id == 'button_repeat') {
        evaluation.speecher.speak_text(button.vocalization, false, {alternate_voice: evaluation.speecher.alternate_voice});
        skip_event = true;
        runLater(function() {
          evaluation.utterance.clear({skip_logging: true});
        });
        return {ignore: true, highlight: false, sound: false};
      } else if(button.id == 'button_next') {
        skip_event = true;
        working.ref.prompt_index++;
        if(working.ref.prompt_index >= step.prompts.length) { working.ref.prompt_index = 0; }
      } else if(button.id == 'button_prev') {
        skip_event = true;
        working.ref.prompt_index--;
        if(working.ref.prompt_index < 0) { working.ref.prompt_index = step.prompts.length - 1; }
      } else if(button.id == 'button_done') {
        skip_event = true;
      }
      if(working.ref.prompt_index != null) {
        var prompt = step.prompts[working.ref.prompt_index];
        $("#board_bg img").attr('src', prompt.url);
      }
      var grid = button.board.get('grid');
      for(var idx = 0; idx < grid.rows; idx++) {
        for(var jdx = 0; jdx < grid.columns; jdx++) {
          if(grid.order[idx][jdx] == button.id) {
            r = idx;
            c = jdx;
          }
          if(grid.order[idx][jdx] == 'button_correct') {
            cr = idx;
            cc = jdx;
          }
        }
      }
      var time_to_select = (new Date()).getTime() - button.board.get('rendered');
      var typical_time_to_select = time_to_select;
      var typ_tally = 0, typ_sum = 0;
      for(var key in assessment.events) {
        if(assessment.events[key].forEach) {
          assessment.events[key].forEach(function(step) {
            if(step) {
              step.forEach(function(e) {
                typ_tally++;
                typ_sum = typ_sum + e.time;
              });            
            }
          });
        }
      }
      typical_time_to_select = typ_sum / typ_tally;
      if(evaluation.appState.get('speak_mode')) {
        if(handling) { return {highlight: false}; }
        handling = true;
        // ding, wait, then jump!
        if(!step.prompts) {
          if(assessment.chimes === false) {
            evaluation.speecher.click();          
          } else {
            evaluation.speecher.click(button.id == 'button_correct' ? 'ding' : null);
          }
          working.attempts = (working.attempts || 0) + 1;
          working.correct = (working.correct || 0);
        } else if(button.id == 'button_done') {
          evaluation.speecher.click();          
        }
        
        // Record event datas
        var e = evaluation.log_response(assessment, button, obj, {
          step: step,
          spacing: spacing,
          alternating: alternating,
          skip_rows: skip_rows,
          r: r,
          c: c,
          cr: cr,
          cc: cc,
          offset: offset,
          library: library,
          time_to_select: time_to_select,
          original_board: original_board,
        });

        if(button.id == 'button_correct') {
          working.correct++;
        } 
        var has_correct_button = true;
        if(step.prompts) {

        } else if((button.id != 'button_correct' && has_correct_button) || time_to_select > (typical_time_to_select * 5)) {
          evaluation.recompute_gravities(button, obj, has_correct_button, r, c, cr, cc);
        }
        var next_step = false;
        var step_reason = null;
        var pct_correct = working.correct / working.attempts;
        if(working.attempts >= (step.min_attempts || assessment.attempt_minimum) && pct_correct >= assessment.mastery_cutoff) {
          next_step = true;
          step_reason = "mastered";
          working.fails = 0;
        } else if(working.attempts > 1 && working.attempts >= (step.min_attempts || assessment.attempt_minimum) && pct_correct <= assessment.non_mastery_cutoff) {
          step_reason = "not_mastered";
          working.fails = (working.fails || 0) + 1;
          e.fail = true;  
          next_step = true;
        } else if(working.attempts >= assessment.attempt_maximum && working.attempts >= (step.min_attempts || assessment.attempt_minimum)) {
          step_reason = "max_reached_without_mastery";
          working.fails = (working.fails || 0) + 0.7;
          next_step = true;
        } else if(button.id == 'button_done') {
          step_reason = "manually_concluded";
          next_step = true;
          working.fails = 0;
        }
        if(step.find == 'spelling' && working.attempts > 2 && working.attempts == working.corect) {
          working.ref.literacy_spelling1 = true;
        } else if(step.find == 'spelling_descriptor' && working.attempts > 2 && working.attempts == working.corect) {
          working.ref.literacy_describe1 = true;
        }
        var short_circuit = false;
        if(working.attempts > 0 && pct_correct <= assessment.mastery_cutoff && working.fails >= Math.max(2, (step.min_attempts || 0) * 0.75)) {
          // Don't require hitting min_attempts number of
          // tries once too many past steps have not reached mastery
          step_reason = step_reason || "too_many_fails";
          next_step = true;
          if(!level.continue_on_non_mastery) {
            // short_circuit means it's time to stop
            // trying for this whole section of steps
            short_circuit = true;
          }
        }
        if(next_step) {
          var next_step_override = null;
          // If in find_target, step progression is adaptive
          if(level[0].intro == 'find_target' || level[0].intro == 'diff_target') {
            // mark all steps they've already tried so we don't get stuck in a loop
            var next_step_id = null;
            var attempted_steps = {};
            attempted_steps[step.id] = true;
            (working.ref.session_events || []).forEach(function(e) {
              attempted_steps[e.id] = true;
            });
            if(working.correct == working.attempts && step_reason == 'mastered') {
              // if they get 100% then try for larger minimal buttons.
              next_step_id = step.perfect_id || (level[working.step + 1] || {}).id || step.id;
              working.ref.passable_increments = Math.max(0, (working.ref.passable_increments || 0) - 1);
            } else if(step_reason == 'mastered') {
              // If they do ok then try more buttons in that size or continue.
              var next_step_ref = level[working.step + 1] || step;
              next_step_id = next_step_ref.id;
              if(next_step_ref.difficulty_stop) {
                working.ref.passable_increments = (working.ref.passable_increments || 0) + 2;
              }
            } else if(step_reason == 'max_reached_without_mastery') {
              // If they barely don't fail, try the next one
              next_step_id = step.id;
              working.ref.passable_increments = (working.ref.passable_increments || 0) + 1;
            } else if(step_reason == 'not_mastered' || step_reason == 'too_many_fails') {
              // If they fail go back to the previous grid size and try more buttons.
              working.backsteps = (working.backsteps || 0) + 1;
              if(working.backsteps > 2) {
                // Only allow walking backwards twice, or it gets too long
                short_circuit = true;
              } else {
                if(step.fail_id && !attempted_steps[step.fail_id]) {
                  next_step_id = step.fail_id;
                } else {
                  // If no fail_id is defined, walk backwards
                  // until you find a step they haven't done
                  var ref_step = step;
                  while(ref_step && attempted_steps[ref_step.id]) {
                    var idx = level.indexOf(ref_step);
                    ref_step = level[idx - 1];
                  }
                  next_step_id = (ref_step || {}).id || 1;
                }  
              }
            }
            if(next_step_id) {
              var next_step = level.find(function(s) { return s.id == next_step_id; });
              var next_step_idx = level.indexOf(next_step);
              if(next_step_idx != -1) {
                // If user has already attempted the next step,
                // try moving on to more steps in the same difficulty
                while(attempted_steps[next_step_id] && level[next_step_idx + 1] && !level[next_step_idx + 1].difficulty_stop) {
                  next_step_idx++;
                  next_step_id = level[next_step_idx].id;
                }
                if(!attempted_steps[next_step_id] && working.ref.passable_increments <= 3) {
                  // passable_increments tracks the # of times
                  // the user just scraped by, we don't want to push too
                  // hard on those so we limit the total before short-circuiting
                  short_circuit = false;
                  next_step_override = next_step_idx;
                } else {
                  // If the user has already attempted the next
                  // step this session, call it quits
                  short_circuit = true;
                }
              }               
            }
          } else {
            if(step_reason == 'not_mastered') {
              if(working.fails > 1) {
                if(!level.continue_on_non_mastery) {
                  short_circuit = true;
                }
              }  
            }
          }
          // next step
          working.step = next_step_override || (working.step + 1);
          working.attempts = 0;
          working.correct = 0;
          if(step.cluster && short_circuit && step_reason != "not_mastered" && step_reason != 'too_many_fails') {
            while(levels[working.level][working.step] && levels[working.level][working.step].cluster == step.cluster) {
              working.step++;              
            }
            working.fails = 1;
            short_circuit = false;
          }
          if(short_circuit || !levels[working.level][working.step]) {
            // next level when short-circuiting or there are
            // no more steps in this level
            working.step = 0;
            working.level++;
            working.fails = 0;
            working.backsteps = 0;
            if(level.more_libraries) {
              if(true) { // TODO: don't hang out in symbol-testing level for more than 5 minutes total
                working.level--;
                working.step++;
                level.current_library = null;
              }
            }
          }
        }
        if(!step.prompts || next_step) {
          runLater(function() {
            evaluation.appState.jump_to_board({key: 'obf/eval-' + working.level + "-" + working.step + "-" + working.attempts});
            evaluation.appState.set_history([]);  
            evaluation.utterance.clear();
          }, button.id == 'button_done' ? 200 : 1000);
          return {ignore: true, highlight: false, sound: false};
        }
      } else {
        evaluation.modal.notice(evaluation.i18n.t('speak_mode_required_for_buttons', "Please enter speak mode before trying to run an evaluation"), true);
      }
      handling = false;
      return {auto_return: false};
    };
  }
  // TODO: need settings for:
  // - force blank buttons to be hidden
  // - background image (url, grid range, cover or center)
  // - text description (same area, over the top of bg)
  if(board) {
    res.json = board.to_json();
  }
  return res;
};

evaluation.core_list = function(step, step_rows, step_cols) {
  var core = [];
  // go, want, more, stop, like, help, turn, I, play, you,
  // not, eat, in, look, do, no, get, that, it, put, open, on
  if(step.keyboard) {
    core = [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', null],
      ['⎵', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⎵', '⎵']
    ];  
  } else if(step_rows >= 4) {
    if(step_cols == 5 || true) {
      core = [
        ['he',   'is', 'eat', 'happy', 'sad'],
        ['she',  'want', 'play', 'ball', 'dog'],
        ['they', 'are', 'read', 'book', 'treat'],
        ['it',   'not', 'the', 'good', 'bad'],
      ];
    }
  } else if(step_rows == 3) {
    if(step_cols == 4 || true) {
      step_cols = 5;
      core = [
        ['he',  'is', 'eat', 'happy', 'sad'],
        ['she', 'want', 'play', 'ball', 'dog'],
        ['they',  'not', 'read', 'treat', 'book'],
      ];
    }
  } else if(step_rows == 2) {
    if(step_cols == 4) {
      core = [
        ['they', 'want', 'eat', 'treat'],
        ['it',   'not', 'play', 'ball']
      ];
    } else if(step_cols == 3 || true) {
      core = [
        ['they', 'eat', 'treat'],
        ['not',   'play', 'ball']
      ];
    }
  } else {
    if(step_cols == 2) {
      core = [
        ['eat', 'play']
      ];
    } else if(step_cols == 3) {
      core = [
        ['eat', 'play', 'not']
      ];
    } else if(step_cols == 4) {
      core = [
        ['they', 'eat', 'play', 'not']
      ];
    }
  }
  var core_list = [];
  if(!step.keyboard) {
    // this shuffles the list of core words so
    // that "find [core_word]" is randomized
    for(var idx = 0; idx < core.length; idx++) {
      for(var jdx = 0; jdx < core[idx].length; jdx++) {
        core_list.push(core[idx][jdx]);
      }
    } 
    core_list = shuffle(core_list);
    var filtered_core_list = core_list.filter(function(w) { return !core_prompts[w.label]; });
    if(filtered_core_list.length == 0) {
      core_prompts = {};
    } else {
      core_list = filtered_core_list;
    }
  }
  return {core: core, core_list: core_list};
}

evaluation.populate_assessment = function(assessment) {
  var prefs = evaluation.appState.get('currentUser.preferences');
  if(prefs) {
    assessment.populated = true;
    Object.assign(assessment, {
      initiator_user_id: evaluation.appState.get('sessionUser.id'),
      initiator_user_name: evaluation.appState.get('sessionUser.user_name'),
      board_background: prefs.board_background,
      button_spacing: prefs.device.button_spacing,
      button_border: prefs.device.button_border,
      button_text: prefs.device.button_text,
      text_position: prefs.device.button_text_position,
      text_font: prefs.device.button_style,
      activation_cutoff: prefs.activation_cutoff,
      activation_minimum: prefs.activation_minimum,
      debounce: prefs.activation_minimum,
      high_contrast: prefs.high_contrast,
    });
    if(assessment.scanning) {
      Object.assign(assessment, {
        scanning: prefs.device.scanning,
        scanning_mode: prefs.device.scanning_mode,
        scanninng_sweep_speed: prefs.device.scanning_sweep_speed,
        scanning_rows: prefs.device.scanning_region_rows,
        scanning_cols: prefs.device.scanning_region_columns,
        scanning_wait: prefs.device.scanning_wait_for_input,
        scanning_interval: prefs.device.scanning_interval,
        scanning_prompts: prefs.device.scanning_prompt,
        scanning_screen_switch: prefs.device.scanning_select_on_any_event,
        scanning_screen_left: prefs.device.scanning_left_screen_action,
        scanning_screen_right: prefs.device.scanning_right_screen_action,
        scanning_auto_select: prefs.device.scanning_auto_select,
        scanning_keys: [prefs.device.scanning_select_keycode, prefs.devices.scanning_next_keycode, prefs.device.scanning_prev_keycode, prefs.device.scanning_cancel_keycode],
      });
    }
    if(assessment.dwell) {
      Object.assign(assessment, {
        dwell: prefs.device.dwell,
        dwell_type: prefs.device.dwell_type,
        dwell_arrow_speed: prefs.device.dwell_arrow_speed,
        dwell_selection: prefs.device.dwell_selection,
        dwell_selection_code: prefs.device.scanning_select_keycode,
        dwell_no_cutoff: prefs.device.dwell_no_cutoff,
        dwell_time: prefs.device.dwell_duration,
        dwell_delay: prefs.device.dwell_delay,
        dwell_release: prefs.device.dwell_release_distance,
        dwell_style: prefs.device.dwell_targeting
      });
    }
  }
  for(var key in assessment) {
    if(!assessment[key]) {
      delete assessment[key];
    }
  }
};

evaluation.log_response = function(assessment, button, obj, data) {
  var step = data.step;
  var spacing = data.spacing;
  var alternating = data.alternating;
  var skip_rows = data.skip_rows;
  var r = data.r;
  var c = data.c;
  var cr = data.cr;
  var cc = data.cc;
  var offset = data.offset;
  var library = data.library;
  var time_to_select = data.time_to_select;
  var original_board = data.original_board;
  assessment.events = assessment.events || {};
  assessment.events[working.level_id] = assessment.events[working.level_id] || [];
  assessment.events[working.level_id][working.step] = assessment.events[working.level_id][working.step] || [];
  var e = {
    rows: button.board.get('grid.rows'),
    cols: button.board.get('grid.columns'),
    vsize:$(".button:not(.empty)").length, // Math.round(rows * cols / (alternating ? 2 : 1)),
    pctx: obj.percent_x,
    pcty: obj.percent_y,
    srow: r,
    scol: c,
    library: library,
    q: (cr < (button.board.get('grid.rows') / 2) ? 0 : 1) + ((cc < (button.board.get('grid.columns') / 2) ? 0 : 2)),
    time: time_to_select
  };
  if(assessment.events[working.level_id][working.step].length == 0) {
    e.id = step.id;
  }
  var btn = $(".button:visible")[0];
  if(btn && window.ppi) {
    var rect = btn.getBoundingClientRect();
    var ppix = ((window.ppix && window.ppix / window.devicePixelRatio) || window.ppi);
    var ppiy = ((window.ppiy && window.ppiy / window.devicePixelRatio) || window.ppi);
    e.win = Math.round(rect.width / ppix * 100) / 100;
    e.hin = Math.round(rect.height / ppiy * 100) / 100;
    if(!window.ppix || !window.ppiy) {
      e.approxin = true;
    }
  }
  if(step.prompts) {
    e.lbl = button.label;
    e.voc = button.vocalization;
  } else { // if has_correct_answer
    e.correct = button.id == 'button_correct';
    e.prompt = working.ref.prompt_label;
    e.crow = cr;
    e.ccol = cc;
  }
  if(step.literacy) {
    var $btns = $(".button:visible .button-label");
    var distractors = [];
    for(var idx = 0; idx < $btns.length; idx++) {
      if($btns[idx].innerText && $btns[idx].innerText != original_board.correct_answer) {
        distractors.push($btns[idx].innerText);
      }
    }
    e.distr = distractors;
    e.prompt = original_board.prompt_name;
    e.clbl = original_board.correct_answer;
    // find the name of the image, the correct answer, the answer they selected, and a list of all distractors
  }
  if(step.prompts && step.core && working.ref.prompt_index != null) {
    var prompt = step.prompts[working.ref.prompt_index];
    if(prompt) {
      e.label = button.get('label');
      e.prompt = prompt.id;
    }
    // note the name/label/whatever for the current prompt
  }
  if(spacing > 0) {
    e.gap = spacing;
    e.offset = offset;
  }
  if(alternating) {
    e.alt = true;
  }
  if(skip_rows) {
    e.skiprow = skip_rows;
  }
  assessment.events[working.level_id][working.step].push(e);
  working.ref.session_events = working.ref.session_events || [];
  working.ref.session_events.push(e);
  return e;
};

evaluation.skill_level = function(assessment) {
  var level_check = assessment.events['diff_target'] || assessment.events['find_target'];
  if(level_check) {
    var max_level = -1;
    var last_avg_time = 0;
    level_check.forEach(function(step, idx) {
      var time_tally = 0;
      var size = 0;
      var correct_tally = 0;
      step.forEach(function(event, jdx) {
        time_tally = time_tally + event.time;
        size = event.vsize;
        if(event.correct) { correct_tally++; }
      });
      var avg_time = (time_tally / step.length);
      var avg_correct = (correct_tally / step.length)
      if(size >= 110 && avg_correct > assessment.mastery_cutoff && last_avg_time && avg_time < (last_avg_time * 10)) {
        max_level = Math.max(max_level, 2);
      } else if(size >= 16 && avg_correct > assessment.mastery_cutoff) {
        max_level = Math.max(max_level, 1);
      } else if(size >= 3 && avg_correct > assessment.mastery_cutoff) {
        max_level = Math.max(max_level, 0);
      }
      last_avg_time = avg_time;
    });
    return max_level;
  } else {
    return null;
  }
};

evaluation.recompute_gravities = function(button, obj, has_correct_button, r, c, cr, cc) {
  // If the user selects incorrectly or uncharacteristically slowly,
  // mark this as a troublesome spot and cluster all troublesome
  // spots looking for areas they struggle to correctly reach (try these again),
  // and areas they erroneously select often (avoid these)
  working.gravities = working.gravities || [];
  working.gravities.push({
    y: ((cr + .5) / button.board.get('grid.rows')),
    x: ((cc + .5) / button.board.get('grid.columns')),
    id: Math.random() + (new Date()).getTime(),
    in: true
  });
  if(button.id != 'button_correct' && has_correct_button) {
    working.antigravities = working.antigravities || [];
    working.antigravities.push({
      y: obj.percent_y || ((r + .5) / button.board.get('grid.rows')),
      x: obj.percent_x || ((c + .5) / button.board.get('grid.columns')),
      id: Math.random() + (new Date()).getTime(),
      in: false
    });
  }
  runLater(function() {
    // TODO: put this in a worker thread?
    var single_distance_cutoff = 0.15;
    var distance_cutoff = 0.1 * 0.1;
    var clusters = {};
    var clusterize = function(list) {
      var gravities = list;
      var ignores = {x: {}, y: {}, xy: {}};
      var changed = true;
      while(changed) {
        var max_clusters = {};
        changed = false;
        gravities.forEach(function(candidate) {
          var x_cluster = [candidate], y_cluster = [candidate], xy_cluster = [candidate];
          if(ignores.x[candidate.id] && ignores.y[candidate.id] && ignores.xy[candidate.id]) {
            return;
          }
          gravities.forEach(function(target) {
            if(target != candidate) {
              var x_dist = Math.abs(target.x - candidate.x);
              var y_dist = Math.abs(target.y - candidate.y);
              if(y_dist < single_distance_cutoff && !ignores.y[target.id]) {
                y_cluster.push(target);
              }
              if(x_dist < single_distance_cutoff && !ignores.x[target.id]) {
                x_cluster.push(target);
              }
              if(!ignores.xy[target.id] && Math.pow(y_dist, 2) + Math.pow(x_dist, 2) < distance_cutoff) {
                xy_cluster.push(target);
              }
            }
          });
          if((max_clusters.x || []).length < x_cluster.length && x_cluster.length > 2) {
            max_clusters.x = x_cluster;
          }
          if((max_clusters.y || []).length < y_cluster.length && y_cluster.length > 2) {
            max_clusters.y = y_cluster;
          }
          if((max_clusters.xy || []).length < xy_cluster.length && xy_cluster.length > 2) {
            max_clusters.xy = xy_cluster;
          }
        });
        if(max_clusters.x) {
          changed = true;
          clusters.x = (clusters.x || []);
          clusters.x.push(max_clusters.x);
          max_clusters.x.forEach(function(x) { ignores.x[x.id] = true; });
        } 
        if(max_clusters.y) {
          changed = true;
          clusters.y = (clusters.y || [])
          clusters.y.push(max_clusters.y);
          max_clusters.y.forEach(function(y) { ignores.y[y.id] = true; });
        }
        if(max_clusters.xy) {
          changed = true;
          clusters.xy = (clusters.xy || [])
          clusters.xy.push(max_clusters.xy);
          max_clusters.xy.forEach(function(xy) { ignores.xy[xy.id] = true; });
        }
      }
    };
    clusterize(working.gravities || []);
    clusterize(working.antigravities || []);
    var samples = [];
    for(var key in clusters) {
      // each cluster type can have multiple clusters, we 
      // add them to a list weighted by their frequency
      clusters[key].forEach(function(cluster) {
        // TODO: find the cluster midpoint, mayhaps?
        var root = cluster[0];
        root.type = key;
        for(var idx = 0; idx < cluster.length; idx++) {
          samples.push(root);
        }
      });
    }
    working.cluster_samples = samples;
  }, 500);
};

// TODO: track how far away they were from the right answer distance-wise
var associations = {
  bird: {word: "nest", exclude: ['carrot']},
  shoes: {word: "socks", exclude: ['racquet', 'hoop']},
  "tennis ball": {word: "racquet"},
  basketball: {word: "hoop", exclude: ['socks']},
  bow: {word: "arrow"},
  hair: {word: "brush"},
  horse: {word: "saddle"},
  car: {word: "wheel"},
  fork: {word: "salad"},
  paintbrush: {word: "paint"},
  pants: {word: "belt", exclude: ['socks']},
  flower: {word: "vase"},
  cookie: {word: "milk"},
  hammer: {word: "nail"},
  tv: {word: "remote"},
  fish: {word: "fish food"},
  rabbit: {word: "carrot"},
  dog: {word: "bone"},
  nose: {word: "tissue"},
  fire: {word: "match"},
  thread: {word: "needle"},
  bread: {word: "butter"},
  lock: {word: "key"},
  toothbrush: {word: "toothpaste"},
  pencil: {word: "paper"},
  pillow: {word: "blanket"},
  "ice cream": {word: "cone"},
  bath: {word: "towel", exclude: ['blanket']}
};
var functional_associations = {
  pencil: {prompt: "a pencil", answer: "write"},
  car: {prompt: "a car", answer: "drive"},
  cup: {prompt: "a cup", answer: "drink"},
  pillow: {prompt: "a pillow", answer: "sleep"},
  button: {prompt: "a button", answer: "push"},
//  window: {prompt: "a window", answer: "open"},
  apple: {prompt: "an apple", answer: "eat"},
  motorcycle: {prompt: "a motorcycle", answer: "race", exclude: {drive: true}},
  airplane: {prompt: "an airplane", answer: "fly"},
  bubble: {prompt: "a bubble", answer: "pop"},
  soap: {prompt: "soap", answer: "wash"},
  shovel: {prompt: "a shovel", answer: "dig"},
  eye: {prompt: "your eyes", answer: "see"},
  nose: {prompt: "your nose", answer: "smell"},
  hands: {prompt: "your hands", answer: "clap"},
  scissors: {prompt: "scissors", answer: "cut"},
  laundry: {prompt: "laundry", answer: "fold", exclude: {clothing: true, sleep: true}},
};
var functional = { // no picture?
  pet: {prompt: "keep as a pet"},
  vehicle: {prompt: "drive"},
  meal: {prompt: "use for eating", exclude: {food: true}},
  art: {prompt: "use for drawing"},
  food: {prompt: "eat for dinner", exclude: {pet: true}},
  sleep: {prompt: "use for sleeping"},
  // more specifics (use to cut, sleep on, wear, use to sweep, can fly, you kick, use to paint)
};
var groups = {
  pet: {name: "animals", category: "animal", prompt: "an animal"},
  fruit: {name: "fruits", category: "fruit", prompt: "a fruit"},
  body: {name: "body parts", category: "body part", prompt: "a body part", simple_name: 'body'},
  space: {name: "space", category: "space object", prompt: "a space object"},
  shape: {name: "shapes", category: "shape", prompt: "a shape"},
  color: {name: "colors", category: "color", prompt: "a color"},
  art: {name: "art", category: "art tool", prompt: "an art tool"},
  feeling: {name: "feelings", category: "feeling", prompt: "a feeling"},
  vehicle: {name: "vehicles", category: "vehicle", prompt: "a vehicle"},
};
// level 1 - single syllable, no combination sounds or secondary vowel sounds
// level 2 - single syllable, sh, th, ch, oo, ee but no secondary vowel sounds
// level 3 - two-syllable, no combination sounds or secondary vowel sounds
// level 4 - one- or two-syllable with secondary vowel sounds
// level 5 - everything else
var words = [
  // happy, sad, angry, surprised, confused, silly, bored, excited
  // red, yellow, blue, gray, green, purple, pink, brown
  // heavy, tall, deep, tight, steep, soft, wet, empty
  {label: 'cat', type: 'noun', category: 'pet', literacy_level: 1, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/cat.jpg', 'lessonpix': 'https://lessonpix.com/drawings/615/150x150/615.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31952/99ab9aad60e2ba06eb200101fe6eb91165f673a4549d16033f3e2ad73ede8c09138f95ea2898b75a7bba0a9b28a8228f9d22e842674fee6d1d679df7bb9f3362/31952.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02069/d98a15eaf38e0b3e4ecba299a035076e6d29fc0c6b5a5869ee28531fe33b5942e12408da6c0be984af162c23f12b0acb359d4741b14f0680d8ee69b2525d4f5a/02069.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000930/8edc2e233f1e03ed50bcc8dc4e4807430856b4e462ce7b8797bf90de80e813e12131d36db0ac9e12c63f4ebc514494eacec46571aef46415c2d03b8153c5efce/c-animals-symbol00000930.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f431.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/cat.png'}, distractors: ['crunch', 'clash', 'call', 'clap', 'caterpillar', 'cart', 'cast', 'cam'], simple_adjectives: ['soft', 'gray', '-red', '-wet', '-surprised', '-deep', '-tall', '-tight', '-angry', '-heavy'], difficult_adjectives: ['young', 'awake']},
  {label: 'dog', type: 'noun', category: 'pet', literacy_level: 1, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/dog.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1645/150x150/1645.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31958/c08ca81f4615aa3bcc2f3423b3afd7785353b422edb3ff2738b7cdf4f433b7bd22c193a1e42e7decbd10b0d7fbb661c2615d7e145eddcaace2f31b512096dfe5/31958.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02078/062c66b181bf245aaaa9bb4f70e88db14f330feb43ea006c606a0c7d3344a5b2d6ebd7aeac891fec8f2f3a16bb0faaebb763c6b07bd12a825bd5968a44ac5fdd/02078.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000992/9dbdcfe20a013286374cac8260bea6c218ad6f0c0ddc5aa67e4ccb1002b7510fcd988724597d567bd1ff5134c9fdcb9c4fa4a3f66fabe43695b3c4dbd6328582/c-animals-dogs-symbol00000992.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f436.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/dog.png'}, distractors: ['diagonal', 'dribble', 'dots', 'doom', 'door', 'ding', 'dong', 'dig'], simple_adjectives: ['brown', '-wet', '-blue', '-tired', '-angry', '-bored', '-steep'], difficult_adjectives: ['interested', 'looking']},
  {label: 'fish', type: 'noun', category: 'pet', literacy_level: 2, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/fish.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5374/150x150/5374.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31961/b36b386465a44eb53c2aad54ff2c55bb34720b7a125cfd13db584431756545dc1048c53d82318f0fd63f88eed64fe0f2cca517cb232039c57c9a18875a7fdc19/31961.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05016/f81c87be259044eaaa38616b3b392d2311af8d2e28b592319bb26bd75c480f0c3513dc4d4e06fca67a1453c2b03844b90daf0e4c289b8e643e2b9ab063f049d8/05016.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001086/49079f2eeaa3b05b4f91e9aac7ea6082c4d28c4e346d95bde1f2bda69428fc9228730a0c5aeaf69d2edbf7117da28bacbe63a557c2da833841761c45b9da27bf/c-animals-fish_ocean-symbol00001086.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f41f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/fish.svg'}, distractors: ['father', 'friendly', 'following', 'fasten', 'flush', 'flash', 'fast', 'fist'], simple_adjectives: ['wet', 'orange', '-blue', '-tall', '-confused', '-heavy', '-steep', '-dark', '-difficult', '-broken'], difficult_adjectives: ['round', 'swimming']},
  {label: 'rabbit', type: 'noun', category: 'pet', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/rabbit.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1727/150x150/1727.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31978/322dcdf62cc9847946594515975f4dcbf333c957d10067423f596c09f77900ebd2776bac2d80fd5413ea37eef1eff07128ee606feb2779d502be29aff39d03df/31978.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02110/27c691483f026fa388de5ba9b454c221bc978cd6ebba43c7a3b9d70228a05bf2b045517d79fe06308924f6beefdd40893429961fe2b65461f076b212767d332b/02110.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001271/1e15e4118b4882a3b54a5c3cfe1a7fc8680ebe56bbdeddffbb6627a9cad167655783963ccca6d4f9f3882afa1016f37dc40993a34a6243fbf0650c93b6773c34/c-animals-symbol00001271.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f430.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/rabbit.png'}, distractors: ['running', 'round', 'radish', 'rabies', 'restful', 'rolling', 'ruby', 'runny'], simple_adjectives: ['fluffy', 'little', '-red', '-wet', '-bored', '-green', '-heavy', '-empty', '-steep'], difficult_adjectives: ['gentle']},
  {label: 'lizard', type: 'noun', category: 'pet', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/lizard.jpg', 'lessonpix': 'https://lessonpix.com/drawings/9480/150x150/9480.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31972/8d723a14cb15475c9d2ff9196827a5cb83f40e877587981468c0864aa9c759867c1ce8dc7888cc28d3717c9a68e51e4ebe63ba9a5291221cee6a59b68a415c97/31972.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/06018/7a8818e5d8573609bec75c746955430760a1a5137e1627f69c338d1a4b03e1627b3ab8b21e1e2b6b4157323fda7de4f80375cfa0132d6d9bf7aa6141e60c1de8/06018.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001189/6189be773c344f059f939b07e3a17ed6f55356cc6d9026a4be91b002bb1c75d36f643e4c71b390821a4953cef813821561716e61e6ec34f8b3d2be799e270b7e/c-animals-symbol00001189.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f98e.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/lizard.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'hamster', type: 'noun', category: 'pet', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/hamster.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1292/150x150/1292.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31967/d6393eb441633057c158c3ad82e5360ad1125ea5c4a9118136259394c9ee54f00ca18921bacf3dd84d6b7bc1ae915c2270b37f4dcba59524f0c6040b0d33e166/31967.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02093/9dccf60c281243389d1ae134ef988d0d94fc16e53e72a54b2d3c3fd95a2ee23c24430057eb6686196e82818ebb613ac2a8cc631fb3714c3d9bdb0913046b3a29/02093.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001142/f46ccc34abc341a8f5ce06fa9c400d6a7561b4d027f389395a513483598a1ae2781d9130ce07c2d00797713ec7d21dfdebda00be4c6c33f5f16934f778c554fb/c-animals-symbol00001142.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f439.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hamster.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'bird', type: 'noun', category: 'pet', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/bird.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1208/150x150/1208.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31948/f7159824c5bfe6ce41a2f687a65eb5c2bc7ec15c74bfddaabf8a4208b5cee8ca0b9976a627e203717077e6a03ca8f3bb3016ba630b65e48b79f17ea967e8f705/31948.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02063/c0d39867031dc6f7aad62a1c5da45f615e1c558617e7e761d8c6d97824f48b3c8523ab978e6dafd1637a85dd3a887a04a0e93f801f2e43720e54168aae97c5ae/02063.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000810/f8e469cdeae3c67651e53068a00ac414de34a0343edfb402021bf16aeb4be9d1d0470811aae9c761599954673600da38169876716c36f5607b3c2088e1dafd11/c-animals-birds-symbol00000810.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f426.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bird.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'snake', type: 'noun', category: 'pet', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/snake-2.jpg', 'lessonpix': 'https://lessonpix.com/drawings/688/150x150/688.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31982/cdf98136f8253b25d0b2d623fbddeba00d2125b66425eea75c43aff8ff1791d1f309f5cf5aed9434fdda30a1b077fbd1c22f76ea9427b346a1a096ce306fcf05/31982.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02117/03d072ca45f5d93c394de6689ec4169e5207ba028d9ca2c02496b62dfaf1803a40968007cda922f4a748c22ac39cd1d81bf023bbbc8ab4e36adc6653827e2b3b/02117.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001318/b91ed4c38a96396c04636b1acb166b9bddd24b3409e71a82362bb51abdbfa3c6ff23f4d864db7b49955a4a9fe8e2daac9a4638a3c5da9c6f8954d52c606f9764/c-animals-symbol00001318.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f40d.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/snake.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'apple', type: 'noun', category: 'fruit', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/apple-3.jpg', 'lessonpix': 'https://lessonpix.com/drawings/443/150x150/443.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31645/b3b1d56bf64ebbb1dc5ce272a0217919fcafc92acae8c6de787a0488e7bd0dd40728b4979dc2507e6291548993f801a845f32098cc6a90694a8a731e0fc8937d/31645.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00551/002ea858bd90350542a16f0e2346e4a84c72cc8c8a5bcc045647788465739607a7ef344dab5f8d9659ffa4fd2f7413334d4891f64700c0c3699f07ca30e00238/00551.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003261/937bebe5382e15def3bc3d221c5da0f9ba80a52c1ec58ce2fd8305cacc2da986b3cf5a154454c324dce1f7045b897567c6f61caa5436cf415cd1bc5b3d9ffb58/c-food_drink-fruits-apple.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f34e.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/apple_2.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'peach', type: 'noun', category: 'fruit', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/peach.jpg', 'lessonpix': 'https://lessonpix.com/drawings/635/150x150/635.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00562/f2ae05ef99ee193735b9bd547880a894ff94b4e9cefcccf240513baa0f864a6534f7d95819f5fa7fedec6dff51ec59d5c88979ed72257104af9cbc5719943d4a/00562.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00562/f2ae05ef99ee193735b9bd547880a894ff94b4e9cefcccf240513baa0f864a6534f7d95819f5fa7fedec6dff51ec59d5c88979ed72257104af9cbc5719943d4a/00562.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003928/57fda609570ff61ebe79a817672bf7e2fd4326e3e11bc18b8e4bc5ae998d4fd7c6b5c5c2b9d71ee43867480168037880c31277f276a79b471f24a21fed922403/c-food_drink-fruits-peach.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f351.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f351.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'grapes', type: 'noun', category: 'fruit', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/grapes.jpg', 'lessonpix': 'https://lessonpix.com/drawings/447/150x150/447.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31649/f3868ef267723a6e4bc7a1ec830692637f300d49cd786d15386f274c3792679735bad4218aee3cbfb788b2ca9baaf2d5604506ea15bd4bce44bee1f6d73eb8c9/31649.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/12305/4c22e5b76632fb77798825859c6cf6053abff1bcfd2178a0f1446586e744ae7e3b5e80e39cc2cac20835b3a0552960a392f9756fa45b1f176fce88358111ecd3/12305.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003714/694d89f6288b1b34d3030ba72d9af7ec92c5f379d43621fa647f2ec407eb47343de937e6349e41070b7de5a0c822e37de693a1332f30d1b973f50123856516b3/c-food_drink-fruits-grapes.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f347.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f347.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'pear', type: 'noun', category: 'fruit', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/pear.jpg', 'lessonpix': 'https://lessonpix.com/drawings/636/150x150/636.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31652/81e8c5590fdbbf970de4310007aa838acd7b8d9bdffa9be3434e61116d061db48c75311ac795125189c97d152ca8627bb8a5bbf96c2ff1116a5203cdab724b08/31652.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00563/96356933db7d71e653c960e8143400d2d9e3f70724c48df93fabc3e2e3368080a788d232bcb49e73ce61349b2acf7ec57bbbb82c7ccad9ef980e6f34ad4d85fa/00563.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003937/cc1b65e5bd820311797eba89e3a7671d8962c604d0a18a26693f9059cea7ce5f3535d251598e249dca29e8254a8e3695d49dc3bd9fc346bce1be7674f1d09b46/c-food_drink-fruits-pear.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f350.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f350.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'banana', type: 'noun', category: 'fruit', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/banana.jpg', 'lessonpix': 'https://lessonpix.com/drawings/445/150x150/445.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31646/ff54cd3040bf0797d451a5b4b104e1a9e2853348756e025e69609a2297a8706eb87d6f5eff81a8a3cd4a5b7120b298668ec8d62a7a42f77147424909efbec263/31646.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00554/6cb78c114f5c5baa6c8d8f30ae10aaaaa031d3b85a2be0aa19254c65c8676cdb4e0cc612987e8c51697e807cc6dcbb12b09ad3e77c1a2bbbf379fe8b4898ac61/00554.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003303/4bffb4a34e3bb53cb0ee16fb0110b940c2825348f81482a60e8844fbe9425d2f14267103fa11c725337bd6dac4df32e45142499d4a78fb03fbf38d145f4e94c7/c-food_drink-fruits-banana.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f34c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f34c.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'strawberry', type: 'noun', category: 'fruit', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/strawberry.jpg', 'lessonpix': 'https://lessonpix.com/drawings/2889/150x150/2889.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31653/d55dd62877154f5fdd97409c2430a93ef4b2ff11ae8641dd4b26ec49107f1d6f347094d83ed1f92318d2227f3dcbee9e355508b3497b95866928d3275d241b2c/31653.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00566/924d89a1b9aae45a76ffdb55c1631621dfefaee7eaef5f621ee2f7fe16698b721257a460f0b77cd4345f806833f673c7655e3cea3d5cb80e1213a15a7cf313d8/00566.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004137/0a9cf0444072f8217ca9ecc20942404144c7e23251d3343859fc35a24adb9999c234f8e9e551aa8e82e7a9bfea5463e554dc50f25907f845d19827c260bd9d31/c-food_drink-fruits-strawberry2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f353.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/strawberry.png'}, distractors: [], simple_adjectives: ['red', 'food', '-blue', '-heavy', '-excited', '-angry', '-steep', '-green', '-tall', '-flat'], difficult_adjectives: ['sweet', 'juicy']},
  {label: 'blueberry', type: 'noun', category: 'fruit', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/blueberries.jpg', 'lessonpix': 'https://lessonpix.com/drawings/117238/150x150/117238.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31653/d55dd62877154f5fdd97409c2430a93ef4b2ff11ae8641dd4b26ec49107f1d6f347094d83ed1f92318d2227f3dcbee9e355508b3497b95866928d3275d241b2c/31653.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/06357/133f630fda75dd304ff327e9bf30c4fc824922e4d68ab01e5f67c97e118424c614e043aaef922ef8967d01d1ff4af88e4a414d62e8e52a79cbe9ba10da1c7db0/06357.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010060/d04a249a692e74f019cd946015fb38abec567e9aea8f5e464082cffa6347657bc9f4398af0103a32762abcb91f550674da55ace570a812adc77f8b138443bebf/c-food_drink-fruits-blueberry.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f535.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/blueberry.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'cherry', type: 'noun', category: 'fruit', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/cherries.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1451/150x150/1451.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55973/3138c07c16104de10b02704699e37d46141f28e9e3e7ca2e63f4584431163b50f2ce675440ae2b6e2b13b2988a8e549870f915cf37ff85a7a78f5d00a3451dac/55973.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00555/e526c0eef3c7d8489a76f3d4d25b19898b7fc9cc314f5753de6710fe8c4ab746529d8b54372fcbbe37fafba21a87d1351172c5c2902bb7587c977e52476ac4e2/00555.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003472/7900c1205f092adccf7be6c3f0ff951beb92861be72463409db52f4cbe3dd9aba100b31b4e9f9b1e3ee92e85e211648e8c8b7fbfa245efaab59c98c9d52f0fc5/c-food_drink-fruits-cherry.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f352.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f352.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'car', type: 'noun', category: 'vehicle', literacy_level: 3, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/car.jpg', 'lessonpix': 'https://lessonpix.com/drawings/579/150x150/579.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32003/27e969f656e5ef9d230977b33a29cbca94c30f50567916b6475a54f5428cac34a75e22f6517004b42bfeb6dbab5e79266b767e73bf3e3e663989fa821a31ac3a/32003.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02245/068cb574cf97186ac15e17c5fabf807db3d9d07459a063348eb5bfb4e8d0440b3423c76bb43985026a21a29647f115e4a59872a951fda3d2e1d5470c4556f726/02245.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009497/65640bc0939528baf7f2e452037a38535a6bac9da6741d32057510f6ca7ebe1da7808c7a93e708347778867ffb35ce8efe63b70d8b5279c53d736a339d9db4f1/c-transportation-car.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f697.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/car.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'truck', type: 'noun', category: 'vehicle', literacy_level: 1, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/truck.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1316/150x150/1316.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32013/ff8d531315cb44f06cab0a0b2b7df54bfbe0bca633f5ed96d99cddbd909e382137dd34c45441d7d5fea2e0dfc1a8d5c97d793391db7f572fa5ee1b65663ab7de/32013.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02267/2d1ffa37839d89aa550bf6587872183295cfda128a3aac54698e23e94cfaa278f5aeb54f56e270cb1d9c33df9b60c7604e083f13c1f446864b3e4a7fa29a36e6/02267.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009720/ec8a22b06a07d85c405c3830bb5080ee40bda148c72d20bab11a529cafaa66572a4511fe46c860e0e75ce6a9ba5f0fe7e6fb9aa4930b5b8c91f2e2186f34bac4/c-transportation-truck.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f69b.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/truck.png'}, distractors: ['table', 'time', 'trombone', 'tomato', 'trash', 'tribe', 'trust', 'trunk'], simple_adjectives: ['red', 'heavy', '-confused', '-bored', '-purple', '-deep', '-soft', '-round', '-little', '-awake'], difficult_adjectives: ['shiny']},
  {label: 'airplane', type: 'noun', category: 'vehicle', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/airplane.jpg', 'lessonpix': 'https://lessonpix.com/drawings/470808/150x150/470808.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31998/7f88cef3ec8280887f30897410413e73ed16a3a586ec6e453543cecbd3cb2de9c542aed2a933c29f70f0cd17a629c84afd55a917a1efcff9ae47d9b0d9771a7a/31998.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02240/2b8ce9d2709f7818c17e8ef39d0deb196a30e8a6a95d47340a7a5a88c2ecd973ea7ff321137a5e986752695aa7f85c6723cb824eaae8cf4180d8a73cb3f8c620/02240.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009447/c33f9282793953f6550447a2fcb27bc8a767d767337a4cb4a50d60d3c36065e68ea43d21b6203ee6f1d7d001635e7cd0df61b9491044ece95736098f914e3c4a/c-transportation-airplane.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2708.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/aeroplane_1.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'motorcycle', type: 'noun', category: 'vehicle', literacy_level: 5, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/motorcycle.jpg', 'lessonpix': 'https://lessonpix.com/drawings/3667/150x150/3667.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32006/a7060d5dfd52c90c4c39b9b95ec82084f03a7d86caa8ce8fdb18510787e65697f94a140b0129efe060f5462ba3de5cd028ee748c22520ba529e97a21ab0813e5/32006.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02253/51c0ec862a7fa9447b78d29e07162562e5f6046b7d0d6f7795da71c4dda98e1403fda43830cdc425ec769278145a69053dd927067e479d1f8fb8ce052e3da0f9/02253.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009568/8530b024d2815b52e4c307beb63af7a78b2f8f3e68efd7a02f555efe33c37ec03514b03ba387586db20d4e9a2c8e9b8ba6c0267b88842b2aa2f5bb2b76acc27a/c-transportation-symbol00009568.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3cd.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/motorbike_2.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'train', type: 'noun', category: 'vehicle', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/train.jpg', 'lessonpix': 'https://lessonpix.com/drawings/558/150x150/558.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32012/e583384e4339bb4e85f79f278aa5dd1d7b6982db712dac7864e47212ad4df4ea2f9fedcd52b61a5628606dcf331514d0092b5bc362b77ba5411ea0d890a37b6f/32012.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02265/7234c0094aa6e9bcd7b41f8893647636d682d6f675cdc22e5964783efb196eba204e99ecdcb1f5bc6519a40d9afb4b17ba3d34b2cce6bd9f8cf3e79c2ca4b70d/02265.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009698/410d751d0e3eddd31bad4b38bb08d377180cf73f1c0ce775354555903362ad76747760aaa8641dd7df9c857e568fdf4859f2e3fd786940cb297074972cfcd7fa/c-transportation-train.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f689.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/steam%20train.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'bus', type: 'noun', category: 'vehicle', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/bus.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1181/150x150/1181.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32779/70324a46034417f89e393e9e791e27ff893770ac1823f5c2a7dd0f50fe3a6549f69f7794a23cd8091990f88cd2a09a7339c6bc8cd429a73e0ef2bd2e5a7917ed/32779.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/07121/09a1647651d7a5814c7456966bf9e84c85708c07fa9a6d25e565d8b3431da1669b994ed7042efaecb83fb1bf6b9d0afccec70cba2a2ce6fdfc70e3fbd306b682/07121.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009491/72f5f19e23d7a8895aae144e64ba01aac1229b043fc7c6e8879ed47f2d015d47f67d144576b8cf31984299df290d810d37cd56762dda9cfead476c0870675455/c-transportation-bus_rosa_parks.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f68d.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/bus.svg'}, distractors: ['butter', 'bring', 'blast', 'best', 'bit', 'bust', 'bun', 'but'], simple_adjectives: ['yellow', 'long', '-pretty', '-blue', '-pink', '-happy', '-small', '-flat'], difficult_adjectives: []},
  {label: 'van', type: 'noun', category: 'vehicle', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/van.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1328/150x150/1328.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32778/919b9e53f1756b50813630b0b362be8dd8bcb419fb2541349a6d5b6895bc3485861362521579de15c0e60da21ced184a874f81992ca312cc2e283983bfa3cf2f/32778.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/08328/1921d41d6edd382a5d1436ad6f1b3167791edba5ab9d3fb0009e3722c95515ee64ba05d3782a2b5729e22c268daccd2fde39c481dffac485e58974a4b0c44ade/08328.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009724/65e36723667eaef2539d0c5f9fdc18f1bbd1423ad9925efc517229dcbb48d42928593d35cf39d52f653bd97be799fc81f602fb19a759107232433ce34345dac9/c-transportation-van_1.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f68c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/van_1.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'tractor', type: 'noun', category: 'vehicle', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/tractor.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1856/150x150/1856.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32011/f53770ee124e9bbc5e090d343e0de5d08d03a3475ef680fdc169de9c632020078229b44390d8c46df0f4c02b514d197069f727ddfd051468765a3ed1cd25b933/32011.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/02263/32a5c8d4641a5e48d894e1a9d99aad9d5a09f74e09c3dc7f6c01431b9a572ab08b389175e165646bb0e9e223d1557b174d373f1973d16f206223b1a930436302/02263.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009691/59f17233fd5f6fb5b046e81baa169c02a8fdff5489e241bde9e208c8e9dad1a29d354bdcb242173183625f118912ffd50d236170a185523b894e0be69ef3f6d9/c-transportation-tractor.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f69c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/tractor.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'eat', type: 'verb', category: 'action', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/eat.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1978/150x150/1978.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32126/caae2bacf734adb746746759eb5a68ab60cffa53e26899a09331e025e5d69f9e42422496cf1e9c6f284d00bba438fd179fd58296044a5435b81e00ae8ca62476/32126.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03142/b3f72f92f65dcb3e336004dd3094658457f47cc1bcac48f8182956a98c7670cc4d40b0c00f3c4ec014321329a3905a6af5ad40c7ecc478f499dde2512301310f/03142.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000184/2fa8c0e550e7c39b06e8d44fafda1bd38f30faf922d2f881e413d9ab92f1a246fd04086a6102d70c4b326fa48b54d7bb4980522859ac483c11b0e6dd8b99f373/c-actions-eating-eat.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20eat_1.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'drink', type: 'verb', category: 'action', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/drink.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1975/150x150/1975.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31632/15d18dc60bf29c10b4ac5ca099a67a2d5bf6c94468a9372ff4a759a429d33ebd7f5f3935a973c914a227531da49341e29eac8aa95718c42b70192d4ea1910a74/31632.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03564/bb9141078b228976361f14094e2c08372b11ccdefd3b00d5c9953ca849a3778c6e22bc119edf2afcc3d05d9c8b6f673733f5a8b6a1db63f7383c1cae739e4c51/03564.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000170/e0d1c044fe25db2cb254c7d3c1dffdaebc7c1844b2badc8a9fce622959f22a4bf6cd36d103e07000f25d76e1f4017a8b5220d391875dc48fce9d9805915018e5/c-actions-eating-drink.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f379.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20drink.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'run', type: 'verb', category: 'action', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/run.jpg', 'lessonpix': 'https://lessonpix.com/drawings/645/150x150/645.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32239/60575a84c46deddb899df9cf3d114cede7d98962a478bab4ef4c58a4b97242174379cf2329e23f351bbf4342cfd7e7c63643cb405726df363a3db1ef8b1988b4/32239.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03365/39bc60797310db4077a1b638356390d6c2be4596806c5eaf83633bd40bb6f72809ff3eab01cd8546a9d57ce3b6ada4a3a64a45489289a46c2a87b99a2d2de999/03365.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000485/2d9ebf6970affa6974f06c866fe0a0c19adc68a5f2930a182e3507b230d736597956e82855cd3587a98ea1831e55cf51c64e8e64001824d14a00cd8d41aef9e6/c-actions-run.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3c3-1f3ff.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20run_4.png'}, distractors: ['rubble', 'radish', 'ring', 'rust', 'rub', 'rug', 'rain', 'rut'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'jump', type: 'verb', category: 'action', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/jump.jpg', 'lessonpix': 'https://lessonpix.com/drawings/478/150x150/478.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32212/354c53105150fad541a214f8244865878409e859737c260630501c52b8a6ec90eae1faedc0b166061969074bd3eb96fea00a1a63eb8f07cac3bdc017eca45070/32212.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03225/27ca0c523906b3185b4f9433863bf84c1fd9fbe0ee91746b892d9157d89b56591cb8e98c60fbee421da63d86ecf5bc9bdcd1516bc9cf4a0619565bc24d8f6b15/03225.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000297/866f83f24482beef3afff3138285e548d73149a3250408f1848d8959a018a0d78a0b54ae4f295c2af1d99b66b1ce0ca0131efa43fb10270978ad9f64c42cc385/c-actions-jump.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f93e-1f3fd.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/jump.png'}, distractors: ['jobs', 'jitter', 'jumpbe', 'jade', 'jury', 'jet', 'jut', 'junk'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'sleep', type: 'verb', category: 'action', literacy_level: 2, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/sleep.jpg', 'lessonpix': 'https://lessonpix.com/drawings/656/150x150/656.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32680/68079bc4363775d880142823ff73b76055ad67e3d5705b24005190e1738340e6ed5411c1d1efb7d63a0bfb2409e0f558964151c9213c5110aed93d108674e7d3/32680.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03397/ff62337dc76a373ba6305712c2d359c60ca786d9d78f3ee128a03a32a23655bb034525a3e58be22fd875f23d8b1d0f537293875b07ce1a753057005528af7044/03397.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000529/d2517a6f9652bd9c68a4d6677ba9cdf1675ac7d455ce5ab03f6e79962f71e1cabed42a7e10106d4cbd1ba66635e8c726160319861d5538c07612072d1274c17e/c-actions-sleep2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6cc-1f3fb.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20sleep_2.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'play', type: 'verb', category: 'action', literacy_level: 3, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/play.jpg', 'lessonpix': 'https://lessonpix.com/drawings/2024/150x150/2024.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32227/248b2b8d653a6bfbfdb40f0aad2dd40ada065a6eb27f421127b824bebd27d748a6e6353fe0325b9be51d77aa3d0cd27dad2dd2202fd54bf96891f37ed6f0bff9/32227.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03684/308b02dd58660755de543301936ec42bb25d0960d51487de693ed8827dcac626f25771a305546eedb3160f1a7f3d6eaca84bb9ba23613a8add7c56759fa7d938/03684.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000414/5cd455185450478432a7b8422b1f4a2b2e095ecda55d7524c5e43782462ece92557cad4004a7040903ae76822e9c7301353b799bb46476c84e1beaa961ae9301/c-actions-play.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f938.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/tawasol/Play.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'climb', type: 'verb', category: 'action', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/climb.jpg', 'lessonpix': 'https://lessonpix.com/drawings/13084/150x150/13084.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32190/cf29dcc08a8161c556f65f3d41b80cce887b279f48e707fbbe8de521f3d4401d0ca579c0d94b8f000cab1bd701d35a0770176bb904c5be273722970f8a7249fe/32190.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03097/c8108d97527c4aaadac465936e2ccb8765f4a8a0812619c79da780bf1a7bd61e50e979f60c30f83a4c7fdd12e0379c61f63fe49f236c4f1d436230d59c092a38/03097.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000100/831483afbd31a5ec7ab5ff0dd122210ecc524b77cc28a3016021efed6aac41e3c6af57e7d4925f8678cf2307a724dedbe73ffd1e89cd6efcefeb62b7306875d6/c-actions-climb.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9d7-1f3fd-200d-2642-fe0f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20climb_5.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'push', type: 'verb', category: 'action', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/push.jpg', 'lessonpix': 'https://lessonpix.com/drawings/641/150x150/641.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32230/02e336e3e907008ede55b7ca9711eb421d18138c5dcf7eac9cd615916765f0a813086d52af0bec96df4a681dd7bddfe0aea74517118a6fb4f16cecc9642d6ce0/32230.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03328/58733d4eee6cd6c51d58a3d410800e93b988af77c8098b04a8a905b4906b3c3a0b3117d9053e78b2ea31345352b741c7ce822f3ef2a94844aaeebc29b0889e98/03328.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000439/7cc8bbd64e2f854646562d47efec50d0f71dc103838d24b4283003859f455dcac61ba6f7826f6606c3d23b888a5d3532a7f52c75a9d7b8c142350d2cb62915f4/c-actions-push.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6d2.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/push_5.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'happy', type: 'adjective', category: 'feeling', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/happy.jpg', 'lessonpix': 'https://lessonpix.com/drawings/13748/150x150/13748.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31517/ba0f40648afbeeb045cc688bd2227a4abd7e23791d2b0c40e83b542179336a356990260267d4197f235632cc535694263d8bfe81ed4a03e13f1a6551eb670e94/31517.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00047/5fc50fd308c61df38e26e426845a6c055b9b900f2fec0936f916bf104172ab020da82c0a598c7df0d834310223644d93ffb2e802e0df75b6a6c0dcb61a6fe3f0/00047.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002699/0b24aa6bc7b215499770502b3595e645a251f1266bcaad3feb6b95e575258827768b6f4b4db355c0386fdf7c214517bcbe7ed358c31e900dc217ee5ef63926e9/c-descriptives-feelings-symbol00002699.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60a.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/happy.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'sad', type: 'adjective', category: 'feeling', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/sad.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1695/150x150/1695.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31523/09217e95b98a9b56a119d509f1e3f04c4f9d30d9af5ac32438121bdfaeef0f15792b0403bc249e595b1e60a59a6dee6976959c8ee5c47145daff9f97f12591a0/31523.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00075/5447142ec6f3342a1940d988c325d3bbf1e02cebd54c947d93759caf0a3a49bb36d7ff13a25092327a027cf88619c5fabf6e0f281b45a3bfa63b4f14e7d76cb1/00075.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002849/3245c04ddb9d8fb98a134bd048f8ed4d78cb352fd70a5cb9d6e86731f7aa1fe77a4112f4b3209ea5fc6517161350badd789bc94cbc0f135d2ca7a9e33eb114db/c-descriptives-feelings-symbol00002849.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f622.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sad.png'}, distractors: ['shine', 'supper', 'strong', 'small', 'sang', 'sun', 'sap', 'sag'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'angry', type: 'adjective', category: 'feeling', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/angry.jpg', 'lessonpix': 'https://lessonpix.com/drawings/124/150x150/124.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31521/02f7bb91e06f39f8eb31e02f5faec0d9f81d2c8b3fe64ddc15e0e1f97bbb935c35fb91b6d3431e66e86a0f550f0296e68d363182542778344650cd319dbe9209/31521.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00067/e0afb1eb5daa9550ca7bf2a2b1d8e695f9c375cb1477d13e8c83aaf0d7183c7c276ff711a5518cfe1a64d7bdf2af9200618f5a7dfe1c7fae6b702c18051c28a6/00067.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002533/02a71c83d1a813d02846613632354404689349f2f50bdb92e6bed5ba6f32cb025fb40d38c63554b78b8fbb01497e598d89dc5d29ae83cee59f67bd1a75e95310/c-descriptives-feelings-symbol00002533.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f621.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/angry.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'surprised', type: 'adjective', category: 'feeling', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/suprised.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1701/150x150/1701.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31526/36bffac158fcc53f75aa0dfb6a2c0b83901d21da5371da2018cc5d158e4a127cbd14ca92212515ef8fd858552e199a67a6fd70943bd64609258d2b124ae5f9d1/31526.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00085/dbdf67515134145ca01b09f9c4402df6993b32fe0d151afc95c7e55c01b9afe312b8050cbc25b1807348afa86834661b9522fa8b76e3464844d214485655c07c/00085.svg  ', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002909/33d6de6c68067b427c1de08f8edf5a3cc37998ace375cfbfb72db1266649c8092d0015a09c12a7ecfefc383d4b0008af850be50c7349a9b84f87e5c70a750651/c-descriptives-feelings-surpised.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f633.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/surprised.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'confused', type: 'adjective', category: 'feeling', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/confused.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1782/150x150/1782.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31509/fb7f7fd51af255cd442fd8a8880e14b203189295598c8f375432d07e29a4665f7d033b69c46256d4e8911590cfdfcff30cc6b3be1fabad2350fe47938d7d4311/31509.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00024/6582d8b2789fb8253f988f7ea667b50a0061be3ad9986b7460f6e9f49619b767a4b48435521f8943646bb1b6a4140bc886137a5ac389be158b648be9f3f792d8/00024.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002595/163423cb268fbcf4e7bfe3c111ea3d19a5de69f6f15d8df1635ae2f531b708b1eaafc9182fb9b3bc14c25ddb4020886e5f248ff46ba2d5929a4d111ed621fe89/c-descriptives-feelings-confused.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f615.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/confused.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'silly', type: 'adjective', category: 'feeling', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/silly.jpg', 'lessonpix': 'https://lessonpix.com/drawings/33597/150x150/33597.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32494/79b711041cdd057bfbb839c6c9f6563bfb54520905e2637e2b340ffea6342619fe65a4fe7c3a957059599129f4f4cfe337dc31928bd2f6e9497a344f1e863128/32494.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00081/2e433bf8b5c2ef17fcfd4dcc3ba1a7d6eee99582c3b9511a7c9fdddffe40946a9d88c9f0b037044d338083d1f391cb8ea76dea9d52dc9e76be1d74f5335a4545/00081.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002865/dd9c57074c7fa1f0917f5fcd695326c3ca8009b0cec7cdc2dab696b61961fdc35444f158eddb2427277fe114947e1ec70fb871117b784486ff9fc6df5af859de/c-descriptives-feelings-silly.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f643.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/silly_787_320383.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'bored', type: 'adjective', category: 'feeling', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/bored.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1697/150x150/1697.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31507/ecb4a645918864c47f5161e2d3d468227fd81e905aea04d1bdf9621d2e74b3fa8a3f73bd1120bb4bab18fb2161f408859161ab9971ee47662963a89e03ebdec1/31507.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00020/571a78b3d6f35444c92ee6579829718766d9714460bddc6ced30bf936e98b3e9ce68f6247a9b56ca9fddf07684dec608112562fac8d1c87eb3bd63c08121e09a/00020.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002987/1514e452b0caf120974fd1d45dd8cdce3ea40faab4258756fb4a43be029069028a344e4a481a8fab105df915746222a76180f0937a948a2bc39603e27b1c82e0/c-descriptives-feelings-bored_1.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4a4.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/boring_2.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'excited', type: 'adjective', category: 'feeling', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/excited.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1689/150x150/1689.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32438/8583ee624b4354bdf922b259c2085ae1a9f3bd3c3feb5dc6ace113e4b5a6a0293ed22d356cf44675250003676946c6359af8938e783df55bc2b9661d4cc09444/32438.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00043/a3eefa7a12103a82dbd943c9a49c9ba6ec5ecb0f0e4834a4938498f67a0ec6b8738c1e24fdc598e87c2acbc4307fd3f49d39f7772a0a7623702f020ca04ce468/00043.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002650/4fba018ff8abb4a986f9e2a538ba803e5ae5f1426e556f11824f64ecf82804f9c24129e7aa6b18328513bb04a166558c3800bd4a27e7a41f801610a5484c9ff0/c-descriptives-feelings-excited.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f604.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/excited_927_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'up', type: 'adverb', category: 'direction', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/up.jpg', 'lessonpix': 'https://lessonpix.com/drawings/557612/150x150/557612.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31691/c3b7d6569ac94b3e9b6975f25e524a888945dddf9bdb0840fe21fb93fad1bfa454587c2f861f39f79ebacd88e66fa8fa4ce5c4bcff5b97a751a02dbcba4946d3/31691.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00662/e0362453334e8cca897d5dc921067b5f64a7b570d83c86bd6b2272bd2e9234ba2013709ccbef20e8729497f56eca7e8889eaeb4e3ed8cbae02e2b6c61ddaf600/00662.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001423/b591d4d39af75cf96474accaa831690497c08ca1b7fa9373b3ef8817e91842f6aaf47fbf19e097bd1d6848321153789126543eb537f3e3fbd012119efe62eefd/c-articles_preps-up.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b06.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/up.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'down', type: 'adverb', category: 'direction', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/down.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1042/150x150/1042.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31670/7bf07f6d885a1a44c94edc5642bee4d2153e73b16565639912be6c2be0b09727b696d95cc36a9451ceca3be06c2ee663d84d450c8a077e2d65d7df0c3425df2c/31670.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00611/07c5b3278ec737ca50a00b9789471235c75d19a444623bec891a57357f2fbdf3a309beefc57b0805e77ad98d06ffdaaa1611ee4372c6d2aac015ad7e8a7ff3f3/00611.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001404/db28a038570c1ccfcb1891c05547d7f0578f7db01c9801ca57a636ee82cf1c2767eba72005049af96437cb8732087b73bcb9ff77de95f172f066c7e4b0e0dcec/c-articles_preps-down.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b07.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/down.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'left', type: 'adverb', category: 'direction', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/left.jpg', 'lessonpix': 'https://lessonpix.com/drawings/818/150x150/818.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32987/e9dfda2d720fa60d2b8bc95fa5f8e45ba17692afe727f7667870f009a49e3d57e0617519d4b926e0abb0001b7961e1879b073ff3f2efcf97dd9c637513fd7031/32987.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00627/8cb6d9be7f4832283e0f7e20043b7c84abadf2f6d2975dbf9ef55266a49f587aaeeab1a21485cffef7ede5aadbd874966c8d21d16c00b202b6b5bc0f28e91b42/00627.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010603/0293edd3e4b2987f771bbf80530438680e1405bd5ad01bc3d7cb7a368451c7559c6537193c92136d02a4f46526a8f6a3e05613c760cd89d39cd60b3484902dea/c-technology-computer-left_arrow.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b05.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Left_63_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'right', type: 'adverb', category: 'direction', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/right.jpg', 'lessonpix': 'https://lessonpix.com/drawings/821/150x150/821.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31578/7799f6812aa0f617a6362d52548240cd66f1c249aa0f7e2304181967ff53771cff068a8d34b7d8a0ba0289af260b5d6f6d1f1cad1ba1c2f9a9406f876006f87c/31578.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00643/7a8c24079a026e1d2a4b832a66d064f06bcbe5b561fd66717583170f2b02f921959e47f9c4cdec0b80dd5bd5a91f34aaf6b9943bd8aab615e52c6f7ab06a3b73/00643.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010615/bdcfd9ec084b4ea8db64996318fde11bb65dd5e84ca26cbddbed033aae53154eac818eabbf9333a4bd994c69d9e52f9d2f276061986cbdaf5f5936cf5e908817/c-technology-computer-right_arrow.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/27a1.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/right_854_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'in', type: 'adverb', category: 'direction', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/in.jpg', 'lessonpix': 'https://lessonpix.com/drawings/31874/150x150/31874.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31673/6938f04a954c2e8078a6d0d88561154e14a7d7f5bc31bb491a600cfd6be8a6f3741df4240c01c5b35cfbb601ce62f9d4e1898bea532d7c514d797bc79d4568be/31673.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00623/e6fbfbeef3f2e3652fe2575fe9871d55fed3b4d9e6636f7512f5b286007f5870b8c42db7c7a2c0afc304660bb6a101b32a8d1ce72d521793ad1c07e9c6d598fa/00623.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001407/06a34196685cd20afb2f67f6f4ead09e1cc861c2142473e78b103e8bee24953e872ee3bcbf3a8a55c15ab7cea29e8cfadcd3368d553d10c47b5acedbb1873bcd/c-articles_preps-in.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26f3.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/in.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'out', type: 'adverb', category: 'direction', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/out.jpg', 'lessonpix': 'https://lessonpix.com/drawings/31883/150x150/31883.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31680/5491115ee1b4dedc3e95e4e362612bd40d8427bf29eee20ae12df0ba4f82d3f3f206305e6f4c914cae7dfdb84c99f3370532b2eb691da1a455048c7b55f3ca1f/31680.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00638/77dc789fe383cad4bd90152f938473be896cb0bcfca2d33a4169549fe0a8ea92d8cde2b9c3902347868e9351490676379f8a7b7e691362120fb1a57ce358edce/00638.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002820/fd721d5d79270982148e144516828bf6bcf62fdc8f96aaff8e916a03c0b3212416f43f0d618022551fa88b63a0b04d7829cba5995def99503b43751ecb1b5557/c-articles_preps-out.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f423.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/out.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'over', type: 'adverb', category: 'direction', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/over.jpg', 'lessonpix': 'https://lessonpix.com/drawings/31886/150x150/31886.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32374/262fbee916a99cb8103034d16afc9996e02a92db7aeb63c104340b283531ed288925a99fb0110b99ddc05acd890aeb31a5e796ec539fd4ab5db9366083e73ff0/32374.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/07590/491e06987494a0df023ad56db3598c878c47dce03a57a5238fd53f52e79992646e8ed9f762cc72cc799e0be3e6c6403b69ce6526b6e71a5b62664edd43e38842/07590.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001415/9570a007d1425df9af705ec228410da412524a14b86cb2cce86def6d3bd41e85ce356dac79d673225f4397ba46ae0b81a239ec9b2be177d2257cf0be3e382def/c-articles_preps-over_above.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f308.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/over.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'under', type: 'adverb', category: 'direction', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/under.jpg', 'lessonpix': 'https://lessonpix.com/drawings/31889/150x150/31889.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31690/bd91339dd728bcd4d83ea54c841c2efdeb8fc94c6756c3702689f79463718d408572b4c50cace0f6a78237ec6ca010d28067b4ea833efe3f8d821e56e9942aeb/31690.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00661/948ae17b136e32d0d8074cc76d6f7bdf792ee2b7b07f032b12f1ef350d68f460fbfa7525d366236b5a8204e3bd18bf10ed68b5c0d283fa573179aff88a7339ec/00661.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001396/154591a3592dcbc95a04544069c7c2058a4cd2f20c5f0edb6f112004a0f7d27c3623d9fef950f04135ffe60424335d305b01259254ab3babc3ee628da72793e9/c-articles_preps-below2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/26f1.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/under.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'think', type: 'verb', category: 'school', literacy_level: 2, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/think.jpg', 'lessonpix': 'https://lessonpix.com/drawings/36149/150x150/36149.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32664/d99d0d9a9f9449f866fa6c57ca370f926a8fd0704ebe6d0e0e527d8990fc51736748381e00c42009225b071f191983f03c2bd3a3c7f875d546581e04b7ea0db2/32664.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03446/f324a5f7c232551054707ce4cfcf5224caa41526970f5cc8af2fd3de6c5f9975681aa4335756cc91ea9fe208fe4488e121ef3ebc7675532a42aab1ccae054d9d/03446.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000622/f4754186df39eb5779601842fe2f3956b6ad4c026473e88451d1572f639c11550c3cf684f6c52886d96c8c11cb9929109c57bfe08a6b31e1f7f5a90fa81bf0af/c-actions-think.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f914.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/think_118_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'write', type: 'verb', category: 'school', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/write.jpg', 'lessonpix': 'https://lessonpix.com/drawings/638/150x150/638.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32184/7bcb0edb2b9acdd5b28101487900ef84c5379000fd05b5a7fa31043c1d820140e53668aa0d5afaf001195a530b77bbe6fb0a7ac6eb402b85395bee7f5998803f/32184.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03500/be861d4a34aadd2fc39cdbd34a1bf079819d20d9b8f30dca135df35a72a00c765efc0d7d98551bc07aff6611509f78ba2640de31863369ea11da367d33cf7c32/03500.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000715/08755ae27d4e927fc507e307f753be23fe8c5d3c20953673ecc74853a20d0248a2e0d4bcb2540738c0951d063c769cff7f726f6dae1b0e77ba4c841be6536434/c-actions-write.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270d-1f3fd.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/write.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'wait', type: 'verb', category: 'school', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/wait.jpg', 'lessonpix': 'https://lessonpix.com/drawings/14783/150x150/14783.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32646/15cb6cc3dcf284e530e6a2630ce08f1c37fced725a63f02ab838febe37933376a8d1096f3d100efff6fb5e66fd167ba530b3cfc83a08ce4b61ea65de42bce1d6/32646.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03473/51ed4a3dc26d9466c86653d47a379d556fceb1514187e97cab850e45fb4ff3412ca324dfcc295134f05e7db2c63ba0d2d128136859070f9897a75a91b6c2bbf5/03473.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000673/d708dadc7c4f9348f5f512f29ab63a9612a77ebb4e35610c5014fc71d0ae23a6cecc54ed8c036d34d9287ebab5b7bd9b014ba2ab0c0ca60db7eb4d6b6dd481f4/c-actions-wait3.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3ac.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/wait.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'tell', type: 'verb', category: 'school', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/tell.jpg', 'lessonpix': 'https://lessonpix.com/drawings/34535/150x150/34535.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32546/90f40904f097e1a8d67fc722b7df409657f8ebf3c3a61a744af6704c0bf81aa27e03eb8e0a5e65dffdf3e15c258bc15f79edf8251cec726eb0c8664733ce8b0a/32546.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05666/a787abd008a406b7c5c0a5f00f427a27c52282f9b9634128d70634adbe4448216c351a24406cc557293b3e843c7d8bc6e1361bfc38e7f8b8833be9c1c89c3c73/05666.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000620/c5b49745e65490cc166695f027ac10fb74a23226fc6a4b916ccd4109dd96f59bb7380ab715c38d361c5c0596863464d0a5c3a36f5a2d00f33d95864a413ad356/c-actions-tell2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5e3.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/tell.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'ask', type: 'verb', category: 'school', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/ask.jpg', 'lessonpix': 'https://lessonpix.com/drawings/6802/150x150/6802.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32309/d109f7388163f132615ffcc3ab72b10f8aeee0d451083b2d7a6d3af64d02fc8737412b4a0df6e27c29d10346a3e3d1635ae7a7a83b4d5ac8f16a9e717ff5bbdb/32309.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05571/3d3923664222d7d3beebedbe928c10b716db6cd2a738eab14b77f9151a586ee998d439bdac8f3f44f15767040a5a2dcd37570d1e372b3589466e3e9878fcc84a/05571.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000008/7418e06078ba31a6cf4123ae6fbf86a4a15afb0a0d2c6a59123a6f36c36e5ad8680c5598fe20562fa02fa1d805d773d03f3282e323cb87625353dbe5f4113300/c-actions-ask.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64b-200d-2640-fe0f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/ask.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'share', type: 'verb', category: 'school', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/share.jpg', 'lessonpix': 'https://lessonpix.com/drawings/129/150x150/129.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32171/0f9e20e175e99ee987c45f778a11937b10ec88aa551dfec6e6ea02f154a080334f6cf80f45b01e4d4d63eb022b371b58ca760c3513eb59053e1ffb8cff51ff3f/32171.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03380/a9406a59b57a726d596985f57ff409a6386c2ce6dbff25aab2e9805ed5141d7be50af67731e42987d93a4f9f2fe099a49e3f15bf98bbd71ae7c4740e3fcbc151/03380.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000505/a23df9b59b1e45cd33d909843815a2b3937827fd7ac90ede63f251ab17f2b2da6329fb901d292f9c656459c34a60f329283b660c36f357d118dae111517e90be/c-actions-share.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f49e.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Share_36_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'get', type: 'verb', category: 'school', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/get.jpg', 'lessonpix': 'https://lessonpix.com/drawings/216312/150x150/216312.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32137/3f8fe80fb3fa4deaccc98a753884b455d2e3827b8b5bcc2a2b272d0c6aa742fd626e33c58527ea699fa46c18ec6e4e6cceb6edb13088e8ff03e466e3217fbd31/32137.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03181/32ee0bd58819b5b8bc6fc4d85a4fd6c349bb4c5f1431079322cc0e5fc146778e9fcd7e6052c45cdb48542b643f21bb74f369a3a169afda2b99cf0f6291622979/03181.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000243/61cdf025ca9c684813e29488eb86e6721d76a1670c58a591cd246984ee45bf08a9c182b55211b106f4f964129de09ba306ca230134fddab93b25cb1c8a2edd3f/c-actions-get.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f381.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Get-Water_431_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'make', type: 'verb', category: 'school', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/make.jpg', 'lessonpix': 'https://lessonpix.com/drawings/52213/150x150/52213.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32219/73384a9e57bee6d6d83a44cff48fb879f89ebcfe076d4831d7c6144379f18b5e613c6ddaf037a1d65e624cfc4a3ee5dbc284011ce45526e60db4c7196a0fc53d/32219.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03267/6f580802165466e73b731922da7052de9695cceb59255c78b7deae2e7e54067cb246ef7fed8f6c59967a463db7d86acba3cab5c026b936006e7f347032583e50/03267.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000352/e9df1c9a0892ff36b94bdfb4801f930f6a7cabda9dfe88195cde6c2815082bedb7f07e2510df45384bd6cec150121cb30a102b0e0973bd9998c193942e967f7b/c-actions-make.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3d7.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/make%20-%20do%20-%20write.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'heavy', type: 'adjective', category: 'describe', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/heavy.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5316/150x150/5316.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31559/24fae3178bb2f74357d59a302fd306ea06d0afe8655fc2f0f6b12c30e2854fd2e7fe24f7e2c0a40870e97edc768fd780491d2bb02c077b6c7c305c8fa1caaeac/31559.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00173/c1ff859c1a11fb287ab57ade8a7e39f2ee8a763191da444fd50eaac264f4c65deea8a29e9da42be7211cb05168900405ae90d9466a54eeb1ecc1f51a445a2007/00173.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002703/bfd49517fc9060bac057a15f9de4a949084f4f2ffb14616d12c0f148f8b0652c1f7872c84b71185a02d636b9398cdfb00951bd840e5fe82e169534955cf5e406/c-descriptives-hard_heavy.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2693.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/heavy.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'tall', type: 'adjective', category: 'describe', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/tall.jpg', 'lessonpix': 'https://lessonpix.com/drawings/879/150x150/879.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31593/d1c083b9f2a703f37e9c324ae182b686bf6aecb514436cd91ff79a7b20b71d2842449d160735446d23645383f8525b981e2f5d85eff080937a3e9a7878c40e3c/31593.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00265/a6e8dc121bc1b50033ed059cf4e83b1e052ab6670aa66ed37e16ff7e5dc1a1c4901fcc24c32199c5d7c17361e6dcb6485070299459312040813e3e41977ae3dc/00265.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002911/e8c8dfc4cf0315838d94bbca5f215b799fe5bf94b973483ee75db72f63c95cae0c8bfb4eeea1dca7c831d98aad70535888fd0e4c40f71f2ad80eba85dfd43e2f/c-descriptives-tall.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5fc.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/tall.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'deep', type: 'adjective', category: 'describe', literacy_level: 2, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/deep.jpg', 'lessonpix': 'https://lessonpix.com/drawings/12872/150x150/12872.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/07561/3dd6b58f348655469f8936cababec0dcf94564058d97aa9e14e0510513db700de9ad6732df9bfd9ed27a7f20c3af5dcb8ca3910be721c0d2b383d70c715ad62f/07561.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/07561/3dd6b58f348655469f8936cababec0dcf94564058d97aa9e14e0510513db700de9ad6732df9bfd9ed27a7f20c3af5dcb8ca3910be721c0d2b383d70c715ad62f/07561.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002612/f35f0a60274b6a43c33a1eb02ff6985ab146941beaf9aaddb054b45eaee1065df8ee40c5ad9cb061e268c10b4feeb006bd9b80b215e057633787fb8433c80aeb/c-descriptives-deep.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f93d-1f3fc-200d-2642-fe0f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/deep.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'tight', type: 'adjective', category: 'describe', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/tight.jpg', 'lessonpix': 'https://lessonpix.com/drawings/47885/150x150/47885.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/56657/95e8a77442f543e2be893c798b20d15413acc0792041ab3929e51c3eb8b0d086196993f35f90642970ccba3171e2e9ae5f66ed590362e6bfcb2dd98c2350ccbf/56657.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09170/8e20abe95c50bf2aaf5acecc807105d755125f1b311b356c273dda10fef38b951a3018b6c8b1dead8e12440c5300c70de8941e7618e4ff0c40dba5dcb2edca54/09170.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00122761/3eed7bb8b687f94c039c0903936a27228f6b061163543bf7b68163c73b94191d63b90c89188cc2685f5b02c6accc3cc222e69404e14a7176b2cb2c9ac6e2b93e/c-descriptives-symbol00122761.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270a.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20knot.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'steep', type: 'adjective', category: 'describe', literacy_level: 2, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/steep.jpg', 'lessonpix': 'https://lessonpix.com/drawings/2232/150x150/2232.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32436/de6b633157e3cefbd9a4abede7ae017cf126a297bffa95ba2dd8850037e52a35166ade5120434d9d181ad25e1f7a6311dd8d46c5518ad03ddb62dc19bf678a7a/32436.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09168/6ef993de14f6ee3799b2bfcfe0aa4203584d22eeb1bc239bf4e6bf3988e1cfb925d0a1060c827b7ebbdeb711d14aedc4dab30dece399ea080bf33c042f90ae65/09168.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002898/8180346261706f02a801881db7a8c52b084c54fc0d3902d2c43b4e298a3f4f48cd2920d110b0028223f11049431005c8719e51f6806cb40283d659151f974fa1/c-descriptives-steep_hill.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6a0.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/mountain.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'soft', type: 'adjective', category: 'describe', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/soft.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5542/150x150/5542.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31588/bfff52dee7dfa0c8cd4e9c29dd3db1e0faab3a36307bcdfe810792ee56732feeb76edb12c2b6f8c2deb3707e0d31384e9b67b6a9d8a729d28b35e3537c8d0e74/31588.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00252/46fca4a68c2a25a83c8fcd30ef17828e613d072e5d0bae8dad09c2d136d7bcc2fda632b36e2be972d026aa5c68af38323080574899c19c94762b327ec4ed077c/00252.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002883/9f47f1eaec1e01f5941b1b575fa7e54792d33eda1df6014335c1a7fb2edf862fe87df10b04d0eed301c3f4f8bc3c0e4b88a8a75921ef0a227f8bd61db1a62fd8/c-descriptives-soft.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f366.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/soft.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'wet', type: 'adjective', category: 'describe', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/wet.jpg', 'lessonpix': 'https://lessonpix.com/drawings/233893/150x150/233893.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31597/d41ca9e13a0e03872237f046d12a79a325a3d3a9ef389e36e9ba09408252df992639bd8eec36367863b14d66209d1e2e48b861dd7c65592db25a6e0a41f74dc9/31597.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00282/855129366a637e6348ed6fd5d2aefa7cf8c8cf7efd4e6d515c6b5b6b49b94de366e73eb5eb01cb76d06d22bfa869ca90d0983b5716a68271c50ebc7ac7c266c1/00282.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002959/03213f9ecc8980306657f8db6b58894b06db198b0ec2badd0842d7873774c093bf3f76e726dd607ed5caeb3d779b9550bc0c95d9301ced4c673c9c1df83dec47/c-descriptives-wet.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4a7.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/wet.png'}, distractors: ['willow', 'where', 'what', 'winter', 'went', 'welt', 'west', 'wit'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'empty', type: 'adjective', category: 'describe', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/empty.jpg', 'lessonpix': 'https://lessonpix.com/drawings/24788/150x150/24788.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31549/4625602ff9c56c9c6a033a5486bef2c6de9317e5396bceb82ff4932e026f82daa6bf76f0c39d86d430efd6a75ce00db501f7358b909406312ae2a125e5ec2e4c/31549.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00143/e7ee7aa8c84df1d7e6aa78d7b5e264f5c642a0184ae595f162962ba96da972818e60c52c3dba8dbc4e2342bdb50f9e2af64a8f194b7eda073963d5adafbbeadf/00143.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002637/8cccfcf4da604099751011695bf515c8b50e35041bc1634326426e6491457260477451cf0de3a3e6e31f1dd02e4a2c8cf7bd1c88c77f1f71afe2db5a8c31f7c3/c-descriptives-empty.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f37c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/empty.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'bowl', type: 'noun', category: 'meal', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/bowl.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5589/150x150/5589.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31858/2cda60b2081b45354568456f324f4d97ff2c6494307bc3b502f4fcacd6f2f2903c43264fcf0de8ef8404e69325b8fd3ac557d41ba18c26228136665fee48a7e5/31858.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01668/9c57e034342d24ba65d31240b59f4a4753d11458172ef477fdf838b759a88e2726c7344c502f0e347d1a3f6384e425340f712bcf5ea4538f19543ff0dc3451e5/01668.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00011257/7b4fb103fb3651efab554573b70e495003313d150c175cdf0842b9049db212e5e949fb9210f4392f840916c7eaf4fe72b6d6e2658476b7d5f9a831cf5923f373/c-home-kitchen-bowl.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f963.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bowl_1.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'spoon', type: 'noun', category: 'meal', literacy_level: 2, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/spoon.jpg', 'lessonpix': 'https://lessonpix.com/drawings/661/150x150/661.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31869/a99405ca2a171cb3f43e1409982b6e2847771c5147d9becffcaad8b31aabf48ff511a01770307d5bd4363dfaf8b30cf85946a25d79c7d13ed9a2078b62476c4f/31869.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01722/9a2101f50766af56f9ff86f5b9ba401c534ac56d3063e9bce9f7d08017d27bf2f42f7bb75aee3514b7ba91d07fe52d000766da9d03c904e74ebac632e686b280/01722.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010223/26688543824bc9a2bc2eb7c039b124ee178c60bf7bf2bf9f2e35529091b738d9405041eadfdb630e548bed4c66a07b2f0319ee2d6897183e4efec00ae74a7bf4/c-home-kitchen-spoon2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f944.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/spoon.png'}, distractors: [], simple_adjectives: ['hard', 'small', '-wet', '-green', '-pink', '-big', '-heavy', '-deep', '-angry', '-surprised'], difficult_adjectives: ['round', 'metal', 'shiny']},
  {label: 'fork', type: 'noun', category: 'meal', literacy_level: 4, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/fork.jpg', 'lessonpix': 'https://lessonpix.com/drawings/604/150x150/604.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31861/7fe5818cbb999c4aad83283905b46d3163ae834a70c9a3c1b4299e9d6bddc02d0cc8a8af6d0d14415df1b2c5348a4d832d914d8af6df2641fba046fab3fa7e67/31861.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01688/ac61401d66b0d93eb29d04cbb737503b32c47b5bb177159f2c8d93893ca87a7106091163126501c6b61506d54da599196be6319c6f85129aeed216fbf63dd8ef/01688.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00005387/21a7543c17d7716aa914e2497a1664d56aa25b080da18fa3705629c488c4638e65b5dc7eab0a6bbf13a3a62707f0a7faf6f41fb0f158f2be85fb8b36daecc359/c-home-kitchen-fork.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f374.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/fork.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'knife', type: 'noun', category: 'meal', literacy_level: 5, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/knife.jpg', 'lessonpix': 'https://lessonpix.com/drawings/549/150x150/549.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32409/8cec8bfb231222a994003514cf25e26b56903acb73130ca831b90a6b86a6242294c7b03fa93e153ae5478e37962e22cb85ba9dfa7558edfe08278f7efc7b7138/32409.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01695/485c613d3c9dd3b566c72a239c1e80ab80e4a1ffb030d0ff8fe12b97c43e3ea919cdacd608dd65e8319e336a512e55a9dc09842bc0785dc4e5fbd50d712a865e/01695.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00005437/e71b49971a3497764b32414e69de3650fad70f6f216b36782585447ab793c094b8d0237f7a02ecb9e78eda8eff1c731d8ae9b6765f4982565b8a8f20a1d19d9d/c-home-kitchen-knife_3.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f52a.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/knife_3.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'plate', type: 'noun', category: 'meal', literacy_level: 4, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/plate.jpg', 'lessonpix': 'https://lessonpix.com/drawings/543/150x150/543.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31866/9c2f004ba83a4bfb1d5404863f9f0b9f32c1805470d77b2c58376c1a1588ad81dac8005aa462586cdce433fc4858aafe50f1ec81ea1f737c17e6f3cb2e2f2e05/31866.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01713/d30b4156f6e840f1dc90542b71e04837dd6fbae7c27eb3e004d2f24e7a6119b84922462e9e7f8fb4b0a5b254f384ed61067d0e19ad70f1c069b6740b8b5f7b27/01713.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00011372/7c38c34c0ee1d0945253c3ffee5777aced9bef07c0900e4c1a5bea75d3d605b6a6b1e796a7ade098b986cd413737f52b79f2e7348354666a8c120f41e74ff20a/c-home-kitchen-plate.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f37d.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/plate_2.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'cup', type: 'noun', category: 'meal', literacy_level: 1, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/cup.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1681/150x150/1681.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31859/3b5e7f036d9193ca136156949f5f59e46171e7cc0d8762c9e3651159eaa94d534ee9269d701e562d14506c7ac69d6faf99d52aab0edfef9270a5c0a7a504c8d8/31859.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01680/792996e8ec3a15daac50b83fe014b266ab2dcd323eda349138fab40fcd1bbc2af90cdf60fc33da663e50488bff12b4407af625d33c216b122758dd29912c3772/01680.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00005331/8358ed3e5a731d8b53530282d11cc920ce2b73920833f76442e17aa72d70b82f3a7bbc00eec47d3b06afdd48cac1d9fa2f10af720cd0e2f32291321f6512b266/c-home-kitchen-cup.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f964.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Cup-35dae4d6c2.svg'}, distractors: ['crayon', 'crown', 'cover', 'clap', 'cog', 'crop', 'cat', 'cut'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'napkin', type: 'noun', category: 'meal', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/napkin.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1717/150x150/1717.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01705/8dad58cbae9b72bb7ae3c8c7771e52d41037ecc811829b3e32c1092cb65e9eb401a7b62d9188c551a6886ea524fc88f9a7892ca02e1a0ef084fb10e5c5445c5d/01705.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01705/8dad58cbae9b72bb7ae3c8c7771e52d41037ecc811829b3e32c1092cb65e9eb401a7b62d9188c551a6886ea524fc88f9a7892ca02e1a0ef084fb10e5c5445c5d/01705.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00011322/d15d11edaac0f9ace3fddffb614ea653667da4214361e8e5ed1e4153fac07a818a7ff27f97dc095a2f9058bc2e6c34bd4bd83f503a2e756a699d485518b889a5/c-home-kitchen-napkin.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f533.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/napkin.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'crayon', type: 'noun', category: 'art', literacy_level: 3, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/crayons.jpg', 'lessonpix': 'https://lessonpix.com/drawings/494/150x150/494.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55927/9270c994602654929c712b3034e90b6461eecdc0148152fb591b094c09acb921bb114ac806521b861dfe971d18f0dd32535e99aacfeb2a922e5370836b300565/55927.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01302/33c240fc9e602dc39f5d8c1a31bc55b7a37fb5ed16487d88b1d7acf3c31b8274ac71bd88cf603d8676fff79492e1a7d43df9b6b721c7a1e4b7301d92018f93da/01302.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001432/75e955ca5244a49176fcf60794142a31d37fdfa87c9e8e496eddd01cf14bc8257c8530066f612f2873135afa030f06cbe172b3824e1f7264e1c5a479fa05dad6/c-arts_crafts-crayon.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f58d.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f58d.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'pencil', type: 'noun', category: 'art', literacy_level: 4, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/pencil.jpg', 'lessonpix': 'https://lessonpix.com/drawings/128/150x150/128.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55884/41cf278845d909d83415d5138541c28e4b4c42742bf987bbacde128c894c4e97beaa6229d043ac21f80b135be5a9847edcbd694b6ef86c354071233ccec97263/55884.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01984/34737ebea2de00c06c24e7883963d8f06121e896d03edc3da8908d01df30300ad074796991afdf21328b91292f6dfd99220da641b1ba43178213db188a778f4b/01984.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001456/284db5d8ef3e278ab5fc30c2836c27bb906f8d993bb5113d785ad9f508a6518e8046fb1dbce1da7e39e759c5ad220200bdef35031a0339cd1b6fc1fce8c70e86/c-arts_crafts-pencil.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270f.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'paintbrush', type: 'noun', category: 'art', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/paintbrushes.jpg', 'lessonpix': 'https://lessonpix.com/drawings/625/150x150/625.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31810/9a7024d09f0e1a9f69312d01ce3e2e423682dda8e2552fdd5c9f94e6ecff081df7fddafd921b3e6d14404fb46270602c1d7c0caed78d87212ded983d1e6e3e12/31810.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01306/822aa3647d91bb8f67b89aa6b55b21582c5f320cee562bf3b2558f85df7d065c02683b202dddea700a2a32935290dbf14241db83978edeadf97eb480ad2cb9b3/01306.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001452/7fffc094f691f2a7be9036e7cc5e2949c1bce64a36275cfa128a97f648f212367b0c7f282d50f0f12550aa1cce0c89f2f9e98f8adb47d7f1be8ee5509622b29e/c-arts_crafts-paintbrush.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f58c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f58c.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'chalk', type: 'noun', category: 'art', literacy_level: 5, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/chalk.jpg', 'lessonpix': 'https://lessonpix.com/drawings/13431/150x150/13431.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31937/2cf2f66da28fc844577f05a008142f72ea9014ee3805d80af1a9b8ef889301b5af6045de0734dfcc7253209011e17841b42759a3485ebebda09db4fcce7d433c/31937.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01995/26c225d3e44cbff5c0851e29ec127c4ecae7fa4590b7bea195983e4f61c4c5c721b957dd0ec333a13c633bccb8086bbe315ae03a453e63f43ab6c6ba6316b4c7/01995.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00008407/533e74e502b842a2aa883c9cfd4c59dcf4724b0f26e59db4d05e861bb4630a5fdab8d86a7a5ecd7a21e97509994ec36ec1de95ff49749a1fe1342f5d2367b248/c-school-chalk.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/25ab.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/chalk.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'paper', type: 'noun', category: 'art', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/paper.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1247/150x150/1247.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31935/5b7e149910f2d8b386249c23e6f54e864dc7bef2d81d7b9ed2e72c7968d4f613352b3069a2ead4b33d642fb4cd8b48fdeb86b0bb9563c3b9f33cb364cd98f3ef/31935.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01978/cc7fdcc958dfef8ba8bc9d37c3cb0fc68574cfeadfd22b8433bb00d7ce870ff3eb97fca050635ad7f97541a33b9cc32517455fb67be480dfb28ef81364452e0e/01978.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001453/a3fdaf45013377caabc96cd2be6fee049487063ce5a57c720d5d66fb0d77354be58610caba6ee1b9468a24b720e8e2dde90f921546f1a2a26cc7b87fe365d609/c-arts_crafts-paper.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4c4.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/paper.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'scissors', type: 'noun', category: 'art', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/scissors.jpg', 'lessonpix': 'https://lessonpix.com/drawings/647/150x150/647.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32407/6c104f1ce8f0c55b9227065aa1d10417442c70692544acc105ff749ed38e17004e6742f96aa2cd18c0973ccc2f663cfe9f766bf6e6b47597587d40fcb4047aa9/32407.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/08164/a10db812b6790a2c0d8c885b6d3dd0627650501320421ec0c272c978c033136f577f36d337767ab2847cf0da6a660d6a5f9b12f25039c4705385ad5827c615b5/08164.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001461/51828166b06cc15040f766ea3159cab18653b1c87d9e92b18f8a9b9fe4400ee07c48c096a505ff6eb6299d53c1a58ac59c25d7b447e2238230a6241cb803d60d/c-arts_crafts-scissors2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2702.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/scissors.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'stickers', type: 'noun', category: 'art', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/stickers.jpg', 'lessonpix': 'https://lessonpix.com/drawings/7205/150x150/7205.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31820/d154b7b2c6af9734f2da0bbd4d69841b2eaa88c3797385e3099f1e430be9e693b952e8ec38525aa538ce609beb794ed59f79398380527b16cb3b27cd4981cd95/31820.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55527/1cc93683c78d9e8fd248de5d493d43981b954ffa0a5a8a2a1c21ee42a4950348f76c0871fabd00844014e18f39738114abf09fd69689d7643c9aa72acc9f50d3/55527.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00001470/4ba6ae1d1eae0e852ce8dfd3da704479a65526d24a0718f07824816a055e05737f5f4b1aeb3a3f19991d23544f01867df20d6ccde33604e25fc79c27a682ac7e/c-arts_crafts-stickers.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b55.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/stickers.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'paint', type: 'noun', category: 'art', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/paint.jpg', 'lessonpix': 'https://lessonpix.com/drawings/464492/150x150/464492.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32159/edea27d7097eb666251a800c948c9901052aeaa89d3ffb4f81a275b69d53548d0482a668029e14e968e7a22b53facf128f8e5a829ae840c4eaac623a043c6e09/32159.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01944/46baf6d260a63a727cac19cc03fcbbd4a86b8cd66122432c1e90c971c899b952f6ef513ad3015b1fb2522f141a568ca2c45bdf2124b5ac428ed6a99465fd4d3c/01944.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00011329/4044cab52cba98419ef1b613e9dcd646f2f448550059762247b580938e06b7942e4da38539f553773db7e1991bd87b1cad729f8bec73b2562d9ff219dddfaff1/c-home-tools-paint_1.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f485-1f3fd.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/paint_3.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'twist', type: 'verb', category: 'move', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/twist.jpg', 'lessonpix': 'https://lessonpix.com/drawings/7424/150x150/7424.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/10829/238a718fa345289e18280583c87fd7a077d961dd1f2d82d03f380e51b383c032f4a456ecb8b0f4d299ea2a0cd605a45c6867df049df50c479ca5f3808fb5353f/10829.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/07681/f7cac8bc3d492f8368c3e2831980f4a6e0a2a33b4d24ebafd9d293c35a1591b292deb02ec761ff43d6ab59c306a9d0274521f33f93b07324099393e8705f6aec/07681.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002608/a80b45ccb8479f9edf918c7eeba65e4569d78a8c6c360ef8b0956692be72152b32d1847c9ae8c251e6c62e5969238c47e4b4be0171eec35018fc3957d85e548b/c-descriptives-curly.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f500.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/icon_archive/tornado_twister.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'pull', type: 'verb', category: 'move', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/pull.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5339/150x150/5339.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32229/9d3bf3acba995f5ba643230124fd27f87257f27de0d32d881e6086381f9b5d2bd26bef121d6a49acab5aedc1344ae39effa871391c765098af087e786c310e5b/32229.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03324/0243f6c0dca2f0952d33147eee72f331a12691dd0db2cbddffedea782cdc2df6d79e57172030ee38fb70080ce176124d53ce3e96d295a9d1ad41f22493d9bbea/03324.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000434/957838003d6f7900bf0548e64e0b3489a3827c7fbe595761eba368b4f338e0b342410246b7e7c72479d0ed007f1a883755ba4f67d592b15597e9373af48e0dd9/c-actions-pull.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f682.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/pull_238_g.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'lift', type: 'verb', category: 'move', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/lift.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1155981/150x150/1155981.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32589/cd5963811128f78b1731d7545ce77eec58ca09d677edcd782d9c33cf795d5d983d1222c9e43675dbba195aac6f5edd45798eb0b3a489379568047c42f63015f9/32589.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05709/6cc67f276dd0b3327f1b1916d308c0254b023c96502020e3157a2facc5d68cba666d7d0aae2a5b18aeddfcda615fc45e3ccdd14d8052436381e7075d609a5110/05709.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000324/b523dbccc4f2c246781a3c692d69cb363f04f4fbf6ec82bcd590c31b3d72dca398bc8c18f251d0fe8fcb20604d79908aad5526c2f7874b5bb228d22fda161330/c-actions-lift2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3cb-1f3fd-200d-2640-fe0f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20lift%20the%20toilet%20seat.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'carry', type: 'verb', category: 'move', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/carry.jpg', 'lessonpix': 'https://lessonpix.com/drawings/37737/150x150/37737.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/11391/ed16f477b99b03f3f0402137a132521cfce4974854e2702b9024d7258c869da6557a960b3c830207dba6cb5f2271afdead741a25c9e0c4e98c58386d4c1cf0d6/11391.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03081/e10cca5e50c907f6212140ad389933257259b3dd5f5c8f2cd7986e1d8ea6e9e751778c66440a0ebe01d8b36a6a0612b8c706fde4db1f4542fd1e0a462f67b6af/03081.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000065/a429358dafe98202e13be2c219203dea9b0039f875aac10c8ea40d4eb1c338284054fe43a5d5e4f6c8d04be84f27710310fa960cd600a8bc5fcfbe3ba1e0ced1/c-actions-carry.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f392.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20load_1.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'open', type: 'verb', category: 'move', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/open.jpg', 'lessonpix': 'https://lessonpix.com/drawings/55205/150x150/55205.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32158/01ef257946de107ab815dcb5803ca4bd9a421a430c08aad617c78a9c432eda4215c20bd99885d2ced3f856a5c36d42522c33a646bc1570bd07e6795104ff4f7a/32158.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03285/1153021a949bbd9d12e1f68a170834bd0d557d12a129080fd65d2150e62a7e8a27bc6f1078cd845ce000550e584f184d6ffd375e7c7903928df66c3d5e302862/03285.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000381/e9b40c1185ef3b0379b0cc665e2386dde4fe3b94e3839d015d8ec8a8577a4bc21540fba1fba3a0b402d67d96ab5951603c8637646c4057863da1d563492218df/c-actions-cooking-open_can.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ed.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/open.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'close', type: 'verb', category: 'move', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/close.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1207417/150x150/1207417.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32656/8797b94236647b8f76e2b6ce2459113b6aa2bbfb538816bef022f883472cc3122f0ffb05ac4785cdfa973a2bc90fc2cda57695fe257101770368ac7ce70d03b9/32656.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03101/a1a1c0a95cbb8af18992ef3fd7e655005a9463fa41fd1a59a90251112b989267c4ff023d8ef1ed868fefc8e3e8af7855b06ce96eb15cddb6e52b2b23741464fa/03101.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00011644/ce37502d8a610a1d6cf30c40f130869abe70d5e623c3d68865bae9369ea892e93824bdc4cbadd660b9523f40c029ba7bea05c7e87ea7d26b968ed19b72807582/c-actions-cooking-jar_close.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ea.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Close_164_755939.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'break', type: 'verb', category: 'move', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/break.jpg', 'lessonpix': 'https://lessonpix.com/drawings/4098/150x150/4098.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/33026/c0ef4fb39cc99bcf6aa3312bacc9648a141026c4f4bcda645af44c6456675fc3ffa459b78a83a5a6e25efc7085d761b3ef3bc5e13b4af49c2979f711476ea552/33026.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03063/3f8117e5b1354a92016b0c7cc315b1b3b122fb7a96559c85618c0fe83fc6c42cf291edefb4a3ef0669311586b6aaf3c87e725c5bef97fc3f1cdad3f56f855801/03063.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000041/6c12772946e4f5ef53cb084b2dde908f3d731f2c433460d69c1460408ed2f2c81a6ac7f02989ef10572b2951e11df9803d76c45b4b975f44dfca5531cc12b859/c-actions-break_1.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f494.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/break.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'fold', type: 'verb', category: 'move', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/fold.jpg', 'lessonpix': 'https://lessonpix.com/drawings/126939/150x150/126939.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03175/d9c9020f29d95e448728670b526b25ee0718b9a36d230f0c3f83ab09aed3d534ec06ad3c4729461120eacf86fa2f26391f4087e6270eb3a02b2029f94073ea21/03175.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/03175/d9c9020f29d95e448728670b526b25ee0718b9a36d230f0c3f83ab09aed3d534ec06ad3c4729461120eacf86fa2f26391f4087e6270eb3a02b2029f94073ea21/03175.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00000235/3be8369de4f6a08ada055d320446ab6a4a80e347bb234e4056f909288ebaaace53637c65fc2dd2243d9d55192f54fd209186dab4f7ec28e3d0fe33ee157e629c/c-actions-fold.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64f-1f3fc.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/fold.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'circle', type: 'noun', category: 'shape', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/circle.jpg', 'lessonpix': 'https://lessonpix.com/drawings/224/150x150/224.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31714/236bd6105677523f1164b32682c90ebb1461251810da2aaec08f2db9cbc7002f6bce66b9304592465c187a26d36ac5af3a0ad363a1331febbb1ed0e522fd748b/31714.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00794/4619e33bfa959fcefe5258aee6a4744dca9f0780d2e29b9ff0f94a433c42bef060fa4c008829093075455c734581b6b03e160104c07dff26ab63f78da1a8386b/00794.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002048/2bec74c72663f44d45f4370cfc4b0365ff4fd4de2230feef5acc13e9f8d74d2c5978329dac42dbe0e595b36502c5a398bbd0f295a04c93694e9a654f6160bccd/c-colors_shapes-circle.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f535.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/circle.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'triangle', type: 'noun', category: 'shape', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/triangle.jpg', 'lessonpix': 'https://lessonpix.com/drawings/172/150x150/172.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32810/f41a54cbe14ffeb13e1dd8298874e2ed8af4690eaced7a90ba67a7b4d02f1ad2964a25df64105a3527e01247bcbac0127d25a8725dfb8d3c882292164ea5df52/32810.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00801/5e068174782187963a956b3a1d76b58d455d37ca6e538d30b79c78014a85d0c99ab864379ecdd9dd5853530f577ad84d695335510295b38bd22a61a1ab65cdbb/00801.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002087/43f9824e505bbefd3563aa4389d40e47b66083e9a027f984fb323972765b24b87061bbab4dacc4deb020450e6ddde39d8e31e6900e5b0ddc913629bef25e939e/c-colors_shapes-triangle.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f53a.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/triangle%20equilateral.svg'}, distractors: [], simple_adjectives: ['red', 'small', '-heavy', '-round', '-blue', '-brown', '-wet', '-happy', '-silly', '-flying'], difficult_adjectives: ['plastic', 'bright']},
  {label: 'square', type: 'noun', category: 'shape', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/square.jpg', 'lessonpix': 'https://lessonpix.com/drawings/213/150x150/213.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31719/9f228377af2b42318c01108ff43a87b98510a4bbf3f86a3949819826fa72de8af6cce42e00785a805527803143d08eaec5cc4a0bf15099fd5e0239e768f489f6/31719.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00799/49e208aec201c92c6a319c6381734f23359f41836a80724ff73d5cd72dabe4c556bcfbdd3207d4bd90e9fe0048767edd86422c855fcc54055fe6c873c35954bf/00799.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002081/d7c7a19dd6c80431257dc4eb9ca16d22104edc966a175709af7d851ec7a0dda2e489d4c9f13c8f713bb5f817a35da9d0243ce1e22c7738ca2c32c5e8d3e97241/c-colors_shapes-square.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/25fc.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/square.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'oval', type: 'noun', category: 'shape', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/oval.jpg', 'lessonpix': 'https://lessonpix.com/drawings/2362/150x150/2362.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31717/a0fcf1a7f5a7b06163ad18878c86197cf83eae4e038c003663429358b9816ea5caac4161dbc55856457c23ed410a85a633a726e36301dd34b747340a7a38dd08/31717.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00797/3cdcb51e6e403c1107112c46e11cfa2f1e080608e2b28c0204920e3c3f4fe3607e2ca4308960a025c7f85235081af3e3b617af3477404e538ad632b6416e52c4/00797.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002066/48ea3939bc999f521b6453e3ebcc20e220185a093dc49e3817b961d47a9c40bbb38647167348742678d04286f4d48803fb905b7aabcee4b9b6999890503510d1/c-colors_shapes-oval.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3c8.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/oval.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'diamond', type: 'noun', category: 'shape', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/diamond.jpg', 'lessonpix': 'https://lessonpix.com/drawings/17100/150x150/17100.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31715/198bf906e8f7379aee94d3402cb34e40d4524b0f1a1cbde7daa585fc2895767bef54c01153d813b8bacb224718fe342d427d9121fb0cffb72cc6aacb89627fb3/31715.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00795/98df0c23253f957f62a288a37ed8d449f9fb362f92a1cea44edadeb13880ca1a63ca909e51b0d388ca86af8e6b179bad99afcee03159ea3f383e887ec45e21ed/00795.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002055/76487d9d91550bca550cd19d570b10cbe786fc5fecca6eb998980b38eae89b408b80846151a20561cfa5e1acbf01ccfda5148dd573307b8d8a58f10a642f6fef/c-colors_shapes-diamond_shape.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f536.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/diamond.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'pentagon', type: 'noun', category: 'shape', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/pentagon.jpg', 'lessonpix': 'https://lessonpix.com/drawings/184/150x150/184.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09692/ba1f71b6aade977123f597499fa0c093f9a8f20016ba1120cdc6039baf80c4a93f258593d71740b7829d6027acdd0d685c8f34c1eda1707a172c4149023bcf5f/09692.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09692/ba1f71b6aade977123f597499fa0c093f9a8f20016ba1120cdc6039baf80c4a93f258593d71740b7829d6027acdd0d685c8f34c1eda1707a172c4149023bcf5f/09692.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010408/00875d0b6c95a42ff02a54110df0137863369c527e2b072aaa59db02f2daeddf369b01f73c8c41fd1c767198b46746bf79a90810c7b559452a20bd9b4847a06f/c-places-landmarks-pentagon_2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3e0.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/pentagon.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'hexagon', type: 'noun', category: 'shape', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/hexagon.jpg', 'lessonpix': 'https://lessonpix.com/drawings/7566/150x150/7566.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09686/1c7337ce4ee46094146087d5c6d4aab08e095ce1e36cc377e2284510edb572bb82c10f1f77e89587d5998fdf265e9888f296d81798c0c411995bdb28d2c0fa40/09686.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09686/1c7337ce4ee46094146087d5c6d4aab08e095ce1e36cc377e2284510edb572bb82c10f1f77e89587d5998fdf265e9888f296d81798c0c411995bdb28d2c0fa40/09686.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002063/43404c32fb6040e876cc72980bfb9f1a466d9d8d436ef8bead411925f1546c63088a25c320449e4e0ae2fd8aa61ec4d3cca1504117b5ede3ef054b4b9173f950/c-colors_shapes-hexagon.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f41d.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/hexagon.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'crescent', type: 'noun', category: 'shape', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/crescent.jpg', 'lessonpix': 'https://lessonpix.com/drawings/111813/150x150/111813.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32297/1a705bc10508b30c3e08ff4ebd382be4f6e5cadb768c120d59c47b14b69ce2ee3115f61f7d3f226a8fc1fe5d0f9dd616ab32bb655cd115c6874e41888f4e993a/32297.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05343/c03ef6d4c6b937ff58a6ecab972c50c4f4b1b6d76a1a828d67e1f89d3d6662b2ffd6e12e3953803de9a405feb85243541c15549d1b760c9caac6883979921ce7/05343.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002051/f5cdbaff9418911825c6853dce0d0163a352eb9f106b06b0c267c4cdc02f83f245fcb0a1ac34053ca72c61a4fc1e9cf3f1fcc59728002eafe0d07b9aefcfbf74/c-colors_shapes-crescent.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f319.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Moon%20Waning%20Crescent-cfe195b0c3.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'red', type: 'adjective', category: 'color', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/red.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212310/150x150/212310.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19323/c7092fcd687dd6e56030e391c06f64d89ab6aabc44a5142b15474b5b5ccd518d52e2b9a253757c4d67fe0045015b1f5a495ce00af74b05faa725b81d2789b310/19323.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00694/02d4f32ccd57c4b8b3b3ebfa20ad7bb9c0620b8d16178db3374b1c92a18c67b3413a0a79affc8559dd6e0c0e29f035e7c1e24088aba0eb7df2ace80eb4214e9a/00694.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002072/45006b7e8a6f1f798287fe019922547e2d9cc0fa509ab46047391d847727236577700a1c256742ba4e125a4bf225fd968234efc17c023304cd027f70fb4b4678/c-colors_shapes-red.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f534.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/red.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'yellow', type: 'adjective', category: 'color', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/yellow.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212340/150x150/212340.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19326/64826610bcc9bb5e912b29fbdd11e61f7b7ae4d406574474ccc742695b2019625407bd3618e7b42afcb1b3dfc3f3c2868153e5335cd57a35a3c5e9d4e99a7def/19326.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00698/21072c74506467b016afbcee9deeb91c04c387867fd7c1bef06f060591481fbdf5a91704bf50422b9dc80a6afa59e97e82fe47b960edfb5aa9ab844ff85895d5/00698.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002091/4c085fca19b0bcc7cacfcb037200abcb940c942fa9469811f54edd0c7e9bdeefd9f0ae92922346b9e47c740d0e08084faf253fdd35c3c6b58994cee3203bd88a/c-colors_shapes-yellow.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2b50.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/yellow.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'blue', type: 'adjective', category: 'color', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/blue.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212315/150x150/212315.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19315/3113c5de172461a596559c8be57f189e55a861d87f2b3ec0d35393fdce8de3bc6311fe80d82277cc5284c5628a9b44b313d8858df1c46379a53f6a6c48ac8330/19315.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00686/a16a47b5a53da1be23e9fbad0a9559c55645eeeee65c5a8b4e305ae0222b5ccf1a5be0073046b91bb5b61bd280a5bd70007edf86ffbae987f201c32ef7e1e0f3/00686.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002040/5b01e631cb439d8ba8d1cc30c23a4e9df31e623822423f174210dee0ecacff2f7d43d02c958545366647a3e3e1a6b02685df2cb501579d0a2fe217d1e1d69f16/c-colors_shapes-blue.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f499.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/blue.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'gray', type: 'adjective', category: 'color', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/gray.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212322/150x150/212322.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19318/214069f66b4139162acd9b0c2b4732c83db7321c7a01653afa15ec945c265d769145be4531c24a3755fdae82621b634d9dd1b6d36d4b195e0c316c20d18a1bff/19318.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00689/8bd4a41e511ef530c79ba94217f9c8fa7a36e284eeacf66da699b9b4b7611e190d3f15edd9c640386b2dc67563954890f25673283319ee8f797a8c7ba69f4451/00689.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002058/c98c17993cacf32abae3aed3c333d2cffcd3e1af781f35f3490f92820a4b35dac8b54708e59918fd0bf8184310848bdf8087cf8de839ce66be9b39c7bdf05e69/c-colors_shapes-gray.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f988.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/gray.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'green', type: 'adjective', category: 'color', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/green.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212324/150x150/212324.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19319/ab20b02aaacae0e737868a8a450b9c4028fe20757ee2d73ca3cfdd8c4d4efc8799b5e650709be2b266ea92a660547a6c28eef82ac3f711ea513a966e3dfb1362/19319.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00690/7d8ce6a3ae1900cc7299e30e99fa4d3e771200e5a20f79618ed921f33f06260490ec3e447cfa1ac431e3f4e8d4c89512dce24d0ccabc061a4161e951a7bc008b/00690.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002060/d26de0fed6c5bd8d9802f967523d8990ca94265f2c06e3a8fb352df1f66429cb291cc66fa8e39d0ccd62ff99c608c5eff81058b5acb842e92c017fcf86554fe3/c-colors_shapes-green.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4d7.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/green.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'purple', type: 'adjective', category: 'color', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/purple.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212332/150x150/212332.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19322/e620e1371089c0f8343e6ef86ff14178fe5984fdaca290ce78cf3d24ebf0f6889bf1430fc728ec56ef701c4d0ff99f046e61bfc31770a643cc0c3eeca9f92eb0/19322.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00693/bef0d669a0edcda5e32436bd493aa08545e02bf434e25ef0d0dda663fc569b86a223e4bbed507d2e04cd69e551cec0d0518b2c764a6abeb6d05ece0594a5f77b/00693.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002069/c56cae57cf4786a6f5051dee67711ff73d1f925d37540237ebe99cdf6dd6d6061902cc620acf517e7b76201f4e52d39d3dc5f72210cfb11f1ebe6f8a9182a842/c-colors_shapes-purple.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f49c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/purple.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'pink', type: 'adjective', category: 'color', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/pink.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212328/150x150/212328.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19321/aada8b1bfe95ae155d3be2203961f93be95ef449bb721520fa858c42ba72f175cee7c156b51b0cb68e41144036986baf4c09d0c2c37aa7bb9568fe3a7926afdf/19321.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00692/a141b905bd3851a52fee81f29fd012d396860c57ad87189e93dab21250ee8ecfe8b3faa536e94c0525cf098bf028f60f5e837c0acf74c21a41edb0c551a56786/00692.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002067/5335b981ab2c48d205a71b617ed5fa3e748e5062e95d9d3a5e97bc1c17ad0fa9fa7c0a8d79aa55d80c362716900623cdb9f0ff2dfbf277c6b63d6759ed4969ff/c-colors_shapes-pink.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f338.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/pink.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'brown', type: 'adjective', category: 'color', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/brown.jpg', 'lessonpix': 'https://lessonpix.com/drawings/212319/150x150/212319.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19316/1828c2e5e15b6e9350b3c9ca447ac8019188014e7ce31a80f228fc28eb556689e7fadc2f4755412bdcaf3a2cbb3ae7c5e773d5d642a8d6fd09b3370466283640/19316.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00687/febb78724099116d43d9e25c85a0c94a5949360684e40def745091e8504a35e0ff3645dc976594a63c161324dfdaa6310f334a92fedeb84c8a960c4da669ba96/00687.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00002046/243f4dcb02bbe8c54224416178b1340fb4240106f66e32ab1004ced4cc6554cc640422a51ea4e75e82552bc3c95827ec04041bfd174a4b5bfba7b52c184c5d74/c-colors_shapes-brown.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f43b.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/brown.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'sandwich', type: 'noun', category: 'food', literacy_level: 3, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/sandwich.jpg', 'lessonpix': 'https://lessonpix.com/drawings/2035/150x150/2035.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55147/a71a193cfa605e2cd6e4dbe2bce1c1e71012f5e99abcea3259564e84ef0d9e09da19691398fbced68c66e869763bd829c32b82ef41d5a518261b0218808e653f/55147.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00428/ee6628c5dd784db143073d5a01b91ddf02e597b94c7463fc06fc0996b7134e53b565036e1d0848299f0c6172ae5e8b7292af1b70a1c628885f3a0befc5b574f0/00428.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004081/d155fc747df3c9cdd160b8f4f3d412d2c8e9b97dabbcd408c8754e21d38ad80a538170c58493c5549d72133d2f5d114686a928b4fee84870b61af31ca73e87e4/c-food_drink-Sandwiches-sandwich1.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f96a.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sandwich.png'}, distractors: [], simple_adjectives: ['food', 'soft', 'flat', '-blue', '-heavy', '-surprised', '-sad', '-tall', '-round', '-melted', '-hot'], difficult_adjectives: ['healthy', 'meal']},
  {label: 'burrito', type: 'noun', category: 'food', literacy_level: 5, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/burrito.jpg', 'lessonpix': 'https://lessonpix.com/drawings/13745/150x150/13745.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/56221/d49090393c67d6b684787acb537f8c8d6ca64090793dc0257389e9f66d93f00df47f55d67405e80b84277cae106b9dbe8e515bcb449a3503d6c446049b7d86ee/56221.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00323/683f8bb1594d0acda92b5fad0ecc4d4c2649aac2537867e0a461ebab003335c934d309e3f9a08bd7db181b0acff0bc2186d262bacfd0b6a30e02cd0c6e56bc5b/00323.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003382/59b6c1cbcfe478f0fc4425adb61eeada0aa85434b8ad6479648bb0bfa91c9247b7d159b66970efe9b1f4c2c835656e453aa18947f2184769933d21c3daa4b9f3/c-food_drink-symbol00003382.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f32f.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f32f.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'spaghetti', type: 'noun', category: 'food', literacy_level: 5, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/spaghetti.jpg', 'lessonpix': 'https://lessonpix.com/drawings/2046/150x150/2046.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55113/150c3bfb314733f381dbc3b116d4621576e49600bca46e989c1d5311cc1c0f72b0eb71b83ff3665d522d58413affa8431ad7c38ab7c757c0638be5361251c122/55113.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00406/ecc71f2d8aeccd8d87a9290cd610d3361ce16f136a83ba92f9f4f621d7fe785d5e67526f4c43f5da3b42a99533a6102b2916f0cb3976105c5173102787700df7/00406.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004117/9e72e850fd7004ade480b9a3cff2f0d6f799877c978810cdb77da989a103b71223b8a86afbcde91e47961ed67433aa30633a8c93d9f76f6d599a16634226e3c8/c-food_drink-spaghetti1.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35d.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35d.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'hamburger', type: 'noun', category: 'food', literacy_level: 5, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/hamburger.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1999/150x150/1999.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/56103/7baf58b62bb7d902a86182824e3fbfc47dbe5532148bc5970b5dc0edd9d1311d7136b6b75c9e80dceb1f2042584d6dd83b2d32a2d9368c7e50b16bf253be7f83/56103.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/09246/6af568e557598ad35217bb8782eb9648509f2176eaf2aeb664e1761822bc7bbcb2ce0ef1184206a2ff7079dd02cca6689b5fd146fbdd70986d3746c23241a11d/09246.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003740/582dd943ea370789639c76b301952bb486675148961d6792f89188e263b174859f1c3d3bba65ddbf4ac17645d36aec5abfcfb676147ae970456371099c45812d/c-food_drink-Sandwiches-hamburger2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f354.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f354.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'taco', type: 'noun', category: 'food', literacy_level: 4, functional: true, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/taco.jpg', 'lessonpix': 'https://lessonpix.com/drawings/3831/150x150/3831.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55073/3820fcbc8a86b9cd4d7cdfb8c32adf8cab7b481a8d62c23bbc6557ad67ba38fb4039a433623f28b91b7a9a9a1662c3c691923b31ae8e91c7145d69f6ab433df2/55073.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00412/9e2c34f619a80cabdc44b1b916c89a6c8cd98aea5afffa0eded660e1c96fe473f3e0d94a48a6b3662c15f3b5415efa04448595125c5730c962108df524884e7d/00412.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004152/d81fe44f13ffeca23732512f5c1dcee0dca02292d09fd62d1600971bb9d97593f06227865d1ccd41c30f382179945929ace70dfd7af6630cecdddff884f34745/c-food_drink-taco.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f32e.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f32e.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'rice', type: 'noun', category: 'food', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/rice.jpg', 'lessonpix': 'https://lessonpix.com/drawings/52207/150x150/52207.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55925/54cda89dfdda273ccbc013e1a418dc41fc08f46820c7b4be32f617f6725f37f70a5e6b7ae9005cd2a10f8e9a8d22ad35f0740a942dd5b908f0439450ecc632d7/55925.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05155/14e535a07c1532c046b6e697feef5c9e43af7ffce2c8cab6050b4b012142285e81737eaa99ceab22247c33c48295298845bfc27a1bd5135986136119956125c7/05155.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004055/255ec3765de9b8947c1841f43db73a1c59a1eb668f03c9b6f1bdd8f5e6aa1a6797493cc25d90ea52a7ef3d3a2ed86205ef19840a20eb4df6d4662b6ae03a94cd/c-food_drink-grains-rice2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35a.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35a.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'cheese', type: 'noun', category: 'food', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/cheese.jpg', 'lessonpix': 'https://lessonpix.com/drawings/1961/150x150/1961.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31613/0beb595b9461c963bc1baf23cf0a5e183d226fda4063dd8e1ff0ffca055c8c7e0e8b61d2c21f417a84e772998365c7e1d18b2f4d2120f5f7b4b504c90e663afc/31613.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00327/578480daabae7e22e332d9f93d9b531b389035c1c4273cd8c1db24790cc2b936361177a8dfb71da09f87be790ac84a5c1fb4ff8addb040fa5284a4a4aa54a53c/00327.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004601/24ab7394ce9faee1077523983300e5b98d494af201d26b9fda6b79a8e25fbd3357c439534dfe4c827bf174cc8ec9e2e0bcc3f6c88b4bb3a0ecdd94b6cc0b78c6/c-food_drink-dairy-kase.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9c0.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/cheese.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'noodles', type: 'noun', category: 'food', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/noodles.jpg', 'lessonpix': 'https://lessonpix.com/drawings/70699/150x150/70699.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/19277/8e68910742d617f61e6569cb32c45d7065e1f3489c4f1a40822cfa7a0b248cb861d79a0db7ceb8a6f3fe996826cebe79bd8c1a66001d80e780536780ac45f69d/19277.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00374/ec834a25052a76d7c5c541c237230aeb920a5d7ef31c3d98977bdc65344ddca81fbada8085041ad8d77972afebb6e275ddcfbf7d5be97cb2bb26dfbca15e0690/00374.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00003883/a5cadff76f6bcf3fc63e10b45cb1efd7286eb99de67ca2a705d3b6324284d519b68c6850829edebf30456ba197d0b4174200f82062cbc1ab83fc3b40b1092210/c-food_drink-grains-noodles.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/noodles.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'mouth', type: 'noun', category: 'body', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/mouth.jpg', 'lessonpix': 'https://lessonpix.com/drawings/6961/150x150/6961.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32633/2ac9c74497650cfd14d3a70ea32b0774a5fb4ed9955e32e1226782acaadee328a73aba16c14e8e7bd1540f2705a99be0eaba3da22203f6740f19532cf8b94ffe/32633.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01101/c894f93b793ffe890616e765c106770344c8df809d7ccd5f1690bcc82a86ce9c3808c309c41953bfeb0858cb10ffbca3a9c03be5aab193d09873ab43015677d9/01101.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010180/8f1d1a3ee4719197b80b4f60db1f2942df1975e471cdd6ee869848af1f22497d3a33f7f0995451e1f3013f1c553e191ef7386ddb97b22564d091e1b3a6ab7665/c-health-body_parts-mouth2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f444.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/mouth.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'ear', type: 'noun', category: 'body', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/ear.jpg', 'lessonpix': 'https://lessonpix.com/drawings/18490/150x150/18490.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31771/70227b8c1710b8f16f453f7850dcf692e77c7a21d364d4e25783b457e8379651142beb27b55538daa7146200b083810246ad1b10f71295d187fb8824027319ef/31771.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01071/7187c871318387b706a07720db1323c1de290c79aa51714e29dd6309480abe971e67235a27b95678173b50e45b010d5a85c55d7c686c1ff4d165ef839ab4b2a9/01071.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010178/020030c36f63a9ed5102f13680d8f7c32d8b8b01c7033499c02c97bbf138834ba4fc18f5b555d2789508d7ef8a95f1e46700e630be0249e2beff346b4342cd68/c-health-body_parts-ear_2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f442-1f3ff.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/ear.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'nose', type: 'noun', category: 'body', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/nose-2.jpg', 'lessonpix': 'https://lessonpix.com/drawings/500/150x150/500.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31782/705243e190fef774d15a7faa7ccb52c559eba97e0cc8f070c999f53a301f7ae59e1e68da9399baa17318b14e4d843be23d5c542d17dce59fe0ee69b421b24a7e/31782.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01106/899960014b8555de967038b1e5df4839a8fa277e6b8285dd4025740c9b2dcca9c0599849afdfd607e5ce99322bfd70348939f93da2ac9c31928d80eb8bfd602d/01106.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00010181/0da12c777720c66cdbfe379702ad8e5e447d440191def6dcd63a3f639b52a0ea650ffd48d7483348a94ec6e3725113b36af507400abe80c71dc0435504a93f03/c-health-body_parts-nose_2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f443-1f3fd.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/nose.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'hand', type: 'noun', category: 'body', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/hand.jpg', 'lessonpix': 'https://lessonpix.com/drawings/467/150x150/467.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31777/816d5a0a652a30915b396d80cbc5b4d2d3797ac5e02a6ea10bd9d24c0ba7c9009d838103385867597949d75f976bc4b28947a01d1f380c9643f08b5783633757/31777.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01089/5e18c3687bb76937d63c2cec1c789e582d54382cf02c32bf6a83bedc6fb50d0cc52dcfaa17a26f65b7139b089e5a91e2c6f81de114152f06e0d3a5a2921d1df7/01089.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004869/f11961f54596b287df376bdf4dba64ad3e13f1be1affc4e0f1f918e4826df407de236f53edf1df62547dd65cb5529faa8a8ca8ffdec551da703d49e425ad5536/c-health-body_parts-hand_2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270b.svg   ', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hand.png'}, distractors: ['hippo', 'hollow', 'however', 'hound', 'harm', 'have', 'hat', 'had'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'foot', type: 'noun', category: 'body', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/feet.jpg', 'lessonpix': 'https://lessonpix.com/drawings/33653/150x150/33653.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/31775/4c1fc1a32772436dbc84a82e7d13db4fe7edc20782112acf7edb152738ee7028ae0bd75dc354ae7af8f79f1c46a43b24af77066188a01a291fdf1d336d0149a6/31775.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01083/6ddf6bdc255f1b554e4a31b4be7f18cb028505911f760541412b9c0d9af5ec368f0862df5aad3324135d0addcd90c6c0bf7d44bc4bec37da918a3c843fa8fb8e/01083.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004830/eff9a22d65955fcaf11d0fbf14be35c61fa7efbf09a88ef2c3cc29ddf9f089e1682088164e83f48cb9badddfd88d1c018bc113e22e29bdb17e08f64fb2ae92d1/c-health-body_parts-foot_2.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9b6-1f3fd.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/feet_2.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'shoulder', type: 'noun', category: 'body', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/shoulder.jpg', 'lessonpix': 'https://lessonpix.com/drawings/525/150x150/525.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01108/07a5304848c216b5c9fc04693e1e4c3b4f4762694f53dd00695f0274777a23caa98bab29e691d435ad73ac5a079bfafa6b8c7fcdb5151f96e5b8435c16698be5/01108.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01109/6a336920eec3a3ef358521b2b96e1c5efe7776ceb555fc7a0b8aa7cb77232e38230385756caf2fbe72c9ad09866636686426a0bd7ead766231e5e9c646b80fc0/01109.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004974/cc13afb3a24f346cbe44ea4ed3e9af8f32070ac18c927967e9335dfbe9048fb0a62bdb9574efe83f2b7c9bd1033eea69dfa99cc2e9bf0fdca70f1a0d51529d17/c-health-body_parts-shoulder.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f937.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/shoulder.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'eye', type: 'noun', category: 'body', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/eye.jpg', 'lessonpix': 'https://lessonpix.com/drawings/431/150x150/431.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/32630/f1193621221dbe741e21c613e9a5cbdba24a2aee514d60881027357000fa3e930f86d53bd2165ab1d4f5c81dbf266963c9fd847e2ca88e5f12c52e9dd3291c55/32630.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05059/860945f247254e523af91789f2057ab9a8269e6bc626e9286abc63683d7e930339846e2f760116fdf3d434b19a0f431ebf59fedfc8c594f4978e1e17c045fdcb/05059.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00006588/6d2b91b406fdab58fe5392082e75e760e3ebcf31ce5ea7a4eeea3e48e4b6b329d3a567c511f04791c3357a9903775bbf10fbe07e8e31983b05e1ab2763673084/c-health-body_parts-oye.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f441.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/eye.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'knee', type: 'noun', category: 'body', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/knee.jpg', 'lessonpix': 'https://lessonpix.com/drawings/409/150x150/409.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/07791/348723ef539c709d49cb27c2cb728af5c379090059df045d642a7c854a9e106ebf68f9d5051118215c0c35002e0cfd76829066657bd020cfea134e2ca8ed30d6/07791.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01095/fe6e8f0e7cac2629648fefef893683ce5fb565caf2e82da28ac2a1f45d669b739a7edf5a118ffbacfbe32f1b74026b0ef7e5feb2c41377725b14abd32bef6976/01095.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00004898/e213736de71ab1724b8432ae1cede703226bfb8e5306a6e7b70437cb39b7156725e25e273e95f76b5c8be257ea4490d35db9e12f175a97daf3a6d4c6aeea88c5/c-health-body_parts-knee.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6d0.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/knee.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'sun', type: 'noun', category: 'space', literacy_level: 1, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/sun.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5660/150x150/5660.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/55285/e1bfb49a1f570e48fe1dfcb7ccde9d6ce84c8d72a7b7ed09f254789357a4d73f1e884c08eae2aad5170070a978f6aea77433b467691bbb3b33bbe951be7fb6fa/55285.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/00306/d7fa10532a5fa0806017f2edc7d2e5961fccd6531ce42bc3bdf87bbb850059e77d81e3ab8102abbe9b9f4d2b2ffbc9f073a2dc590f2e74f24c14e4119b43f72d/00306.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00006225/08763c82b621abc4bba840c431ce2ba0d2a69a8b81301d71ac843e5434423aa7e9dbee44a800cba38dae92510bd4d97d5dd2838e7cd5cd5ae8b1df70edd7756b/c-nature-sun.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2600.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2600.svg'}, distractors: ['stranded', 'seven', 'split', 'spring', 'sang', 'spun', 'soon', 'sit'], simple_adjectives: [], difficult_adjectives: []},
  {label: 'moon', type: 'noun', category: 'space', literacy_level: 2, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/moon.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5033/150x150/5033.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05343/c03ef6d4c6b937ff58a6ecab972c50c4f4b1b6d76a1a828d67e1f89d3d6662b2ffd6e12e3953803de9a405feb85243541c15549d1b760c9caac6883979921ce7/05343.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/05341/87e55bd1a1b976d1bfdf01d762c68a5f8b7ae818b0d2beab49d5796c85c88eaf3b1d99d84ded89a7cce466d0dad60146929553298e55a48475e4423882f267f7/05341.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00008082/7cae2a2e822ddbd378328fc7b7623eaf92aaf50f0985f97d361f61ed06e9a442d88a7b38709bc2eb76840b50d1c5f93a32d3081b25c9bc0a915a0320d51154e2/c-places-outer_space-moon.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f314.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f31b.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'asteroid', type: 'noun', category: 'space', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/asteroid.jpg', 'lessonpix': 'https://lessonpix.com/drawings/594817/150x150/594817.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/13055/9079d5018a306192c9b5c855e9d5a7251c9f10a672aa432e79667b79962a581547f60bc3934da2ed9c3a8369bd23fb31b570ce097bd362e00151d99bf5b422e9/13055.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/13055/9079d5018a306192c9b5c855e9d5a7251c9f10a672aa432e79667b79962a581547f60bc3934da2ed9c3a8369bd23fb31b570ce097bd362e00151d99bf5b422e9/13055.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00008082/7cae2a2e822ddbd378328fc7b7623eaf92aaf50f0985f97d361f61ed06e9a442d88a7b38709bc2eb76840b50d1c5f93a32d3081b25c9bc0a915a0320d51154e2/c-places-outer_space-moon.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f94c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/rock.png'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'planet', type: 'noun', category: 'space', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/planet.jpg', 'lessonpix': 'https://lessonpix.com/drawings/5236/150x150/5236.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/08215/c1082cc4e41a6f67bb31f9aeebb304b7d8a670a0bb55ea4e9485c920f562cef139cf58200fac9d51f828ddac2ccae6a3f1d9eb9efe0d7888a0e81e4144efaf82/08215.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/08215/c1082cc4e41a6f67bb31f9aeebb304b7d8a670a0bb55ea4e9485c920f562cef139cf58200fac9d51f828ddac2ccae6a3f1d9eb9efe0d7888a0e81e4144efaf82/08215.svg', 'symbolstix': '', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f534.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Planet-309280db81.svg'}, distractors: [], simple_adjectives: ['red', 'big', '-flat', '-green', '-purple', '-tired', '-new', '-wet', '-surprised', '-hungry'], difficult_adjectives: ['round', 'heavy']},
  {label: 'earth', type: 'noun', category: 'space', literacy_level: 4, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/earth.jpg', 'lessonpix': 'https://lessonpix.com/drawings/4052/150x150/4052.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/33017/721f98731d34d64041aea6e179284d644b65f3ac6032caed1c14be2736ded18ccf42fed7729faeacf0ef6d20c4c1ebe4c46e86cc101e022eed3ac1ed172af388/33017.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01858/9591770218751523794c29514aed4f0ec255e327654c3d8b159c20828264aa7530f82fa922728ff77c78cda809b4675855167c674df9f4a2e76833f586498c32/01858.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00008149/40b72b680d78e5bf5c9dae14e7244706ba4268205d3bbcc16999cbd4e73c0ba085736526483da7a74d72253b895d4098467812703ff0b35758ce94d4583c84e2/c-places-outer_space-planet.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f30e.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f30e.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'galaxy', type: 'noun', category: 'space', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/galaxy.jpg', 'lessonpix': 'https://lessonpix.com/drawings/47704/150x150/47704.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/01835/de7d934a6b759bb98eb85297fba022654a463cb884be365487c0bf33f37e8e0abe5e3c96e9514f6472cee6e59d3d205a20aaa4e1dee3a3a232670fa06eea524e/01835.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/13623/b659e739e7250ff052c0c76fbb5f2db3c8389c95916f37b15b4a2579bc50a4f3858575728734b9fe8c69794d08c91638512f7ee006e7937c89c39435160a2ff9/13623.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00008076/c4bd8f17eb9d8eb616a8782cd88a02c4765f948a55bff76431081b4d00a7b589469393dfa92efcbc70e43d659219062ed93b68a6b0f4028df9edd976d908e083/c-places-outer_space-milky_way_galaxy.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f30c.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/Milky%20Way.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'satellite', type: 'noun', category: 'space', literacy_level: 5, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/satellite.jpg', 'lessonpix': 'https://lessonpix.com/drawings/592029/150x150/592029.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/06887/c4a44d084e37fd7a7f088197609759b914a33d2c4b05a249cf84461cd9c301dea03ba5e91cb5c4f4bade3c5ca2aca151ff0cd29a0ea06185e289851955bcab4c/06887.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/06887/c4a44d084e37fd7a7f088197609759b914a33d2c4b05a249cf84461cd9c301dea03ba5e91cb5c4f4bade3c5ca2aca151ff0cd29a0ea06185e289851955bcab4c/06887.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00009628/fdd3a88654c8a6a8ae8dea5891fc02e57a99d0740044af192ecd8fef67ddf092c170e4b9fd2fa0f77f3d6d80e444b7f4430519e86e421b0f0f7bda456fc4dd9e/c-transportation-space_earth_satellite.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f6f0.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/satellite.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'comet', type: 'noun', category: 'space', literacy_level: 3, urls: {'photos': 'https://d18vdu4p71yql0.cloudfront.net/libraries/photos/comet.jpg', 'lessonpix': 'https://lessonpix.com/drawings/594891/150x150/594891.png', 'pcs_hc': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/08190/8d28e493771f54f4e1392a1ee8af05382aa745dbd1e7eb51fd0321740a811da832358d6dd461b43ebaed7fe8de96e6392cb409a1916502f59609c08efdc988d3/08190.svg', 'pcs': 'https://d18vdu4p71yql0.cloudfront.net/libraries/pcs/08190/8d28e493771f54f4e1392a1ee8af05382aa745dbd1e7eb51fd0321740a811da832358d6dd461b43ebaed7fe8de96e6392cb409a1916502f59609c08efdc988d3/08190.svg', 'symbolstix': 'https://d18vdu4p71yql0.cloudfront.net/libraries/symbolstix/00069821/1f5b2af2c8d4c5e876f53cf5abc24e6e05cd90072530d8270128242c5f05a7c8ae090e6444a4d0f5cbb397e6e5497ff48e586f19bc190fea1c8c8e664a377c86/c-places-outer_space-symbol00069821.png', 'twemoji': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2604.svg', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2604.svg'}, distractors: [], simple_adjectives: [], difficult_adjectives: []},
  {label: 'he', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/he.png'}},
  {label: 'she', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/she.png'}},
  {label: 'they', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/they.png'}},
  {label: 'the', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Point%20of%20Interest-d99669a635.svg'}},
  {label: 'it', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/it.png'}},
  {label: 'is', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/is.png'}},
  {label: 'go', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20go_3.png'}},
  {label: 'are', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/be.png'}},
  {label: 'not', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/former.png'}},
  {label: 'like', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20like.png'}},
  {label: 'want', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20want.png'}},
  {label: 'read', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20read_1.png'}},
  {label: 'ball', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/ball.svg'}},
  {label: 'book', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/book.png'}},
  {label: 'treat', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sweets.png'}},
  {label: 'good', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/good.png'}},
  {label: 'bad', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bad_1.png'}},
  {label: 'nest', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/nest.svg'}},
  {label: 'shoes', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sports%20shoes.png'}},
  {label: 'socks', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/socks.png'}},
  {label: 'tennis ball', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/tennis%20ball.png'}},
  {label: 'racquet', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/racquet_1.png'}},
  {label: 'basketball', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/basketball_2.png'}},
  {label: 'hoop', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hoop_2.png'}},
  {label: 'bow', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bow.png'}},
  {label: 'arrow', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/arrow.png'}},
  {label: 'hair', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hair_1.png'}},
  {label: 'brush', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hairbrush.png'}},
  {label: 'horse', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/horse.png'}},
  {label: 'saddle', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/saddle.svg'}},
  {label: 'wheel', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Wheel-5611c5a88d.svg'}},
  {label: 'salad', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/salad.png'}},
  {label: 'pants', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/trousers_1.png'}},
  {label: 'belt', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/belt.png'}},
  {label: 'flower', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/flower.svg'}},
  {label: 'vase', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/vase.png'}},
  {label: 'cookie', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f36a.svg'}},
  {label: 'milk', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/glass%20of%20milk.png'}},
  {label: 'hammer', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f528.svg'}},
  {label: 'nail', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/nail.svg'}},
  {label: 'tv', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4fa.svg'}},
  {label: 'remote', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/remote%20control_1.png'}},
  {label: 'fish food', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/fish%20food.png'}},
  {label: 'carrot', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/carrot.png'}},
  {label: 'bone', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9b4.svg'}},
  {label: 'tissue', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/tissues.svg'}},
  {label: 'fire', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/fire_2.png'}},
  {label: 'match', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/match.png'}},
  {label: 'thread', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f9f5.svg'}},
  {label: 'needle', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/needle%20and%20thread.png'}},
  {label: 'bread', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/bread.svg'}},
  {label: 'butter', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/butter.svg'}},
  {label: 'lock', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/icomoon/lock2.svg'}},
  {label: 'key', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/key.png'}},
  {label: 'toothbrush', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/toothbrush.svg'}},
  {label: 'toothpaste', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/toothpaste.png'}},
  {label: 'pillow', type: 'filler', category: 'sleep', functional: true, urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/bed-pillow_54_g.svg'}},
  {label: 'blanket', type: 'filler', category: 'sleep', functional: true, urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/blanket_2.png'}},
  {label: 'bath', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bath.png'}},
  {label: 'towel', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/towel_142_g.svg'}},
  {label: 'ice cream', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/ice-cream.png'}},
  {label: 'cone', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/cone_1.png'}},
  {label: 'drive', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20drive.png'}},
  {label: 'race', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/race.png'}},
  {label: 'fly', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20fly.png'}},
  {label: 'pop', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/puncture_2.png'}},
  {label: 'button', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/button_2.png'}},
  {label: 'window', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/window.svg'}},
  {label: 'bubble', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bubble.png'}},
  {label: 'soap', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/soap.png'}},
  {label: 'wash', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20wash%20one\'s%20hands.png'}},
  {label: 'shovel', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/spade_2.png'}},
  {label: 'dig', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/tawasol/Dig.png'}},
  {label: 'see', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20see_4.png'}},
  {label: 'smell', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/smell.png'}},
  {label: 'hands', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hands.png'}},
  {label: 'clap', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg'}},
  {label: 'cut', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20cut%20the%20bread.png'}},
  {label: 'laundry', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Laundry_131_28865.svg'}},
  {label: 'fold', type: 'filler', category: 'filler', urls: {'photos': '', 'lessonpix': '', 'pcs_hs': '', 'pcs': '', 'symbolstix': '', 'twemoji': '', 'default': 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/fold.png'}},
  {label: 'pets', group: 'pet', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/pet.png"}},
  {label: 'fruit', group: 'fruit', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/fruit.png"}},
  {label: 'body', group: 'body', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/body_4.png"}},
  {label: 'space', group: 'space', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/space.png"}},
  {label: 'shapes', group: 'shape', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/shapes.svg"}},
  {label: 'colors', group: 'color', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/Which%20color%20is%20it.png"}},
  {label: 'art', group: 'art', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/art.svg"}},
  {label: 'feelings', group: 'feeling', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/feelings.png"}},
  {label: 'vehicles', group: 'vehicle', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/vehicle.png"}},
  {label: 'utensils', group: 'meal', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/dinner%20time%201.svg"}},
  {label: 'dinner', group: 'food', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/food.png"}},
  {label: 'sleep', group: 'sleep', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20sleep_2.png"}},
  {label: 'done', type: 'filler', urls: {photos: "", lessonpix: "", pcs_hc: "", pcs: "", twemoji: "", default: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2705.svg"}},
  {label: 'backgrounds', type: 'filler', urls: {intro: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20enter_1.png", intro2: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/service_235_g.svg", find_target: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Magnifying-Glass_918_708000.svg", diff_target: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/choose.png", symbols: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f5bc.svg", find_shown: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/point.png", open_ended: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/tell.png", categories: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/living%20thing.png", inclusion_exclusion_association: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/groups.png", literacy: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20read_2.png", done: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f389.svg"}},
];
evaluation.words = words;

evaluation.level_prompt = function(step) {
  var res = "blank";
  if(step.intro == 'intro') {
    res = evaluation.i18n.t('eval_intro', "Welcome to the Eval Tool! This tool helps evaluate a communicator's ability to access and understand buttons, symbols and concepts.");
  } else if(step.intro == 'intro2') {
    res = evaluation.i18n.t('eval_intro_2', "You can use the top right menu to end or configure the evaluation any time. You can also add notes once the evaluation has completed.");
  } else if(step.intro == 'find_target') {
    res = evaluation.i18n.t('find_target_intro', "This section shows a single target at different locations and sizes to help assess ability to identify and access targets.");
  } else if(step.intro == 'diff_target') {
    res = evaluation.i18n.t('diff_target_intro', "This section shows multiple targets at different sizes and layouts to determine ability to differentiate.");
  } else if(step.intro == 'symbols') {
    res = evaluation.i18n.t('symbols_intro', "This section shows different styles of pictures to see if the user has more success with one style over another");
  } else if(step.intro == 'find_shown') {
    res = evaluation.i18n.t('find_show_intro', "This section shows a photograph or concept and prompts the user to find the corresponding symbol below");
  } else if(step.intro == 'open_ended') {
    res = evaluation.i18n.t('open_ended_intro', "This section shows simple scenes. Encourage the user to make observations or discuss the scene using the buttons/keys provided");
  } else if(step.intro == 'categories') {
    res = evaluation.i18n.t('categories_intro', "This section shows photographs and prompts the user to classify them based on their category");
  } else if(step.intro == 'inclusion_exclusion_association') {
    res = evaluation.i18n.t('inclusion_exclusion_association_intro', "This section shows photographs and prompts the user to identify related or unrelated items");
  } else if(step.intro == 'literacy') {
    res = evaluation.i18n.t('literacy_intro', "This section shows an image and a list of possible words (without images) to check for reading skills");
  } else if(step.intro == 'done') {
    res = evaluation.i18n.t('done_eval', "Done! Hit the final button to save the evaluation and see the results!");
  }
  return res;
};

evaluation.step_description = function(id, library) {
  var long_name = null;
  if(id == 'find-2') { long_name = evaluation.i18n.t('find-2-name', "Find in a field of 2"); }
  else if(id == 'find-3') { long_name = evaluation.i18n.t('find-3-name', "Find in a field of 3"); }
  else if(id == 'find-4') { long_name = evaluation.i18n.t('find-4-name', "Find in a field of 4"); }
  else if(id == 'find-8') { long_name = evaluation.i18n.t('find-8-name', "Find in a field of 8"); }
  else if(id == 'find-15') { long_name = evaluation.i18n.t('find-15-name', "Find in a field of 15"); }
  else if(id == 'find-6-24') { long_name = evaluation.i18n.t('find-6-24-name', "Find in a 24-button grid with a visible field of 6"); }
  else if(id == 'find-24') { long_name = evaluation.i18n.t('find-24-name', "Find in a field of 24"); }
  else if(id == 'find-6-60') { long_name = evaluation.i18n.t('find-6-60-name', "Find in a 60-button grid with a visible field of 6"); }
  else if(id == 'find-15-60') { long_name = evaluation.i18n.t('find-15-60-name', "Find in a 60-button grid with a visible field of 15"); }
  else if(id == 'find-30-60') { long_name = evaluation.i18n.t('find-30-60-name', "Find in a 60-button grid with a visible field of 30"); }
  else if(id == 'find-60') { long_name = evaluation.i18n.t('find-60-name', "Find in a field of 60"); }
  else if(id == 'find-6-112') { long_name = evaluation.i18n.t('find-6-112-name', "Find in a 112-button grid with a visible field of 6"); }
  else if(id == 'find-28-112') { long_name = evaluation.i18n.t('find-28-112-name', "Find in a 112-button grid with a visible field of 28"); }
  else if(id == 'find-56-112') { long_name = evaluation.i18n.t('find-56-112-name', "Find in a 112-button grid with a visible field of 56"); }
  else if(id == 'find-112') { long_name = evaluation.i18n.t('find-112-name', "Find in a field of 112"); }
  else if(id == 'diff-2') { long_name = evaluation.i18n.t('diff-2-name', "Discriminate in a field of 2"); }
  else if(id == 'diff-3') { long_name = evaluation.i18n.t('diff-3-name', "Discriminate in a field of 3"); }
  else if(id == 'diff-4') { long_name = evaluation.i18n.t('diff-4-name', "Discriminate in a field of 4"); }
  else if(id == 'diff-8') { long_name = evaluation.i18n.t('diff-8-name', "Discriminate in a field of 8"); }
  else if(id == 'diff-15') { long_name = evaluation.i18n.t('diff-15-name', "Discriminate in a field of 15"); }
  else if(id == 'diff-6-24') { long_name = evaluation.i18n.t('diff-6-24-name', "Discriminate in a 24-button grid with a visible field of 6"); }
  else if(id == 'diff-24') { long_name = evaluation.i18n.t('diff-24-name', "Discriminate in a field of 24"); }
  else if(id == 'diff-24-shuffle') { long_name = evaluation.i18n.t('diff-24-shuffle-name', "Discriminate in a field of 24 (shuffled targets)"); }
  else if(id == 'diff-6-60') { long_name = evaluation.i18n.t('diff-6-60-name', "Discriminate in a 60-button grid with a visible field of 6"); }
  else if(id == 'diff-15-60') { long_name = evaluation.i18n.t('diff-15-60-name', "Discriminate in a 60-button grid with a visible field of 15"); }
  else if(id == 'diff-30-60') { long_name = evaluation.i18n.t('diff-30-60-name', "Discriminate in a 60-button grid with a visible field of 30"); }
  else if(id == 'diff-60') { long_name = evaluation.i18n.t('diff-60-name', "Discriminate in a field of 60"); }
  else if(id == 'diff-60-shuffle') { long_name = evaluation.i18n.t('diff-60-shuffle-name', "Discriminate in a field of 60 (shuffled targets)"); }
  else if(id == 'diff-6-112') { long_name = evaluation.i18n.t('diff-6-112-name', "Discriminate in a 112-button grid with a visible field of 6"); }
  else if(id == 'diff-28-112') { long_name = evaluation.i18n.t('diff-28-112-name', "Discriminate in a 112-button grid with a visible field of 28"); }
  else if(id == 'diff-56-112') { long_name = evaluation.i18n.t('diff-56-112-name', "Discriminate in a 112-button grid with a visible field of 56"); }
  else if(id == 'diff-112') { long_name = evaluation.i18n.t('diff-112-name', "Discriminate in a field of 112"); }
  else if(id == 'diff-112-shuffle') { long_name = evaluation.i18n.t('diff-112-shuffle-name', "Discriminate in a field of 112 (shuffled targets)"); }
  else if(id == 'symbols-below') { long_name = '(' + library.key + ') ' + evaluation.i18n.t('symbols-below-name', "Find symbol at a simpler-than-mastered grid size"); }
  else if(id == 'symbols-at') { long_name = '(' + library.key + ') ' + evaluation.i18n.t('symbols-at-name', "Find symbol at a mastered grid size"); }
  else if(id == 'symbols-above') { long_name = '(' + library.key + ') ' + evaluation.i18n.t('symbols-above-name', "Find symbol at a more difficult mastered grid size"); }
  else if(id == 'noun-find') { long_name = evaluation.i18n.t('noun-find-name', "Find nouns by name"); }
  else if(id == 'adjective-find') { long_name = evaluation.i18n.t('adjective-find-name', "Find adjectives by name"); }
  else if(id == 'verb-find') { long_name = evaluation.i18n.t('verb-find-name', "Find verbs by name"); }
  else if(id == 'core-find') { long_name = evaluation.i18n.t('core-find-name', "Find core words by name"); }
  else if(id == 'core-find+') { long_name = evaluation.i18n.t('core-find+-name', "Find core words by name on a larger grid size"); }
  else if(id == 'open-core') { long_name = evaluation.i18n.t('open-core-name', "Make observations about picture prompts using core words"); }
  else if(id == 'open-keyboard') { long_name = evaluation.i18n.t('open-keyboard-name', "Make observations about picture prompts using a keyboard"); }
  else if(id == 'functional') { long_name = evaluation.i18n.t('functional-name', "Find based on a prompt of functional usage"); }
  else if(id == 'functional-association') { long_name = evaluation.i18n.t('functional-association-name', "Find action for the named object"); }
  else if(id == 'find-the-group') { long_name = evaluation.i18n.t('find-the-group-name', "Find group for the named object or concept"); }
  else if(id == 'what-kind') { long_name = evaluation.i18n.t('what-kind-name', "Find object based on a photograph and group-based prompt"); }
  else if(id == 'inclusion') { long_name = evaluation.i18n.t('inclusion-name', "Find which belongs in the named category"); }
  else if(id == 'exclusion') { long_name = evaluation.i18n.t('exclusion-name', "Find which does not belong in the named category"); }
  else if(id == 'association') { long_name = evaluation.i18n.t('association-name', "Find which is associated with the named object"); }
  else if(id == 'word-description') { long_name = evaluation.i18n.t('word-description-name', "Find the word that matches the picture's name"); }
  else if(id == 'word-category') { long_name = evaluation.i18n.t('word-category-name', "Find the word that is a category the picture belongs to"); }
  else if(id == 'word-descriptor') { long_name = evaluation.i18n.t('word-descriptor-name', "Find the word that describes the picture"); }
  return long_name;
};

export default evaluation;
