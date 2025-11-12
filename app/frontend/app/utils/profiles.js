/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

import Ember from 'ember';
import EmberObject from '@ember/object';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import RSVP from 'rsvp';
import { htmlSafe } from '@ember/string';
import i18n from './i18n';
import LingoLinq from '../app';

// TODO: track locale of response
// TODO: place to store translations of labels and prompts and placeholders

var sample_profile = {
  name: "Sample Profile",
  id: "sample",
  version: "0.1",
  description: "blah blah blah",
  type: 'communicator',
  score_categories: {
    total: {
      label: "Total Score",
      function: "sum",
      border: [71, 91, 172],
      background: [212, 227, 255]
    },
    sleep: {
      label: "Sleep Section",
      function: "avg",
      border: [153, 63, 60],
      background: [255, 207, 206]
    },
    eating: {
      label: "Eating",
      function: "mastery_cnt",
      border: [77, 128, 62],
      background: [187, 240, 170]
    },
    eating2: {
      label: "Eating 2",
      function: "mastery_avg",
      brackets: [
        [0, "F", [0, 0, 0], [255, 255, 255]],
        [0.5, "C", [100, 100, 100], [155, 155, 155]],
        [0.8, "A", [255, 255, 255], [0, 0, 0]]
      ],
    },
    a: {
      label: "A Value",
      function: "sum",
      brackets: [
        [0, "F"], [1, "D"], [1.3, "C"], [4, "B"], [5, "A"]
      ]
    },
    b: {
      label: "B Value",
      function: "sum",
      brackets: [
        [0, "Z"], [1, "Y"], [2, "X"], [3, "W"], [4, "V"]
      ]
    },
    c: {
      label: "C Value",
      function: "sum",
      brackets: [
        [0, "F"], [1, "D"], [1.3, "C"], [4, "B"], [5, "A"]
      ]
    },
    d: {
      label: "D Value",
      function: "sum",
      brackets: [
        [0, "Z"], [1, "Y"], [2, "X"], [3, "W"], [4, "V"]
      ]
    }
  },
  answer_blocks: {
    frequency: {
      type: 'multiple_choice',
      answers: [
        {id: 'never', label: "Never", score: 0},
        {id: 'sometimes', label: "Sometimes", score: 1, mastery: true},
        {id: 'usually', label: "Usually", score: 2, mastery: true}
      ]
    },
    communication_modes: {
      type: 'check_all',
      answers: [
        {id: 'eyes', label: "Eyes", score: 1},
        {id: 'hands', label: "Hands", score: 1},
        {id: 'voice', label: "Voice", score: 2}
      ]
    },
    free_response: {
      type: 'text',
      hint: "Notes/Explanation/etc."
    }
  },
  question_groups: [
    {
      id: "sleep",
      label: "Sleep",
      repeatable: "on_mastery",
      mastery_threshold: "all",
      questions: [
        {
          id: "naps",
          label: "Takes naps during the day",
          answer_block: "frequency",
          score_categories: {
            total: 1.0,
            sleep: 0.5,
            a: 1.0,
            b: 1.0,
            c: 1.0,
            d: 1.0
          }
        },
        {
          id: "eats",
          label: "Takes bites of food by mouth",
          answer_block: "frequency",
          score_categories: {
            total: 1.0,
            eating: 0.5,
            c: 1.0,
            d: 1.0
          }
        },
        {
          id: "expl",
          label: "Notes",
          answer_block: "free_response",
        }
      ]
    }
  ],
  report_segments: [
    {
      type: "score",
      score_category: "total",
      summary: true,
    },
    {
      type: "score",
      score_category: "b"
    },
    {
      type: "weights",
      score_categories: ["sleep", "eating"]
    },
    {
      type: 'concat',
      label: "A-B Score",
      score_categories: ['a', 'b'],
      border: [255, 91, 172],
      join: '.'
    },
    {
      type: 'table',
      rows: [
        "Level 1", "Level 2", "Level 3"
      ],
      columns: [
        "Sleep", "Sleep", "Eat", "Eat", "Eat", "Other"
      ],
      cells: [
        ['a', 'a', 'b', 'b', null, null],
        ['a', 'a', null, null, null, null],
        [null, null, null, 'c', 'd']
      ]
    },
    {
      type: 'raw'
    }
  ]
};

var Profile = EmberObject.extend({
  init: function() {
    this.set('started', this.get('started') || this.get('template.started') || (new Date()).getTime() / 1000);
    this.set('encrypted_results', this.get('encrypted_results') || this.get('template.encrypted_results'));
    this.set('history', this.get('history') || this.get('template.history'));
  },
  readable_type: computed('template.type', function() {
    var type = this.get('template.type');
    if(type == 'supervisor') {
      return i18n.t('supervisor', "Supervisor");
    // } else if(type == 'self_assessment') {
    //   return i18n.t('self_assessment', "Self-Assessment");
    } else {
      return i18n.t('communicator', "Communicator");
    }
  }),
  questions_layout: computed('template.score_categories', 'template.answer_blocks', 'template.question_groups', 'results', function() {
    var list = [];
    var blocks = this.get('template.answer_blocks');
    var results = (this.get('results') || {}).responses || {};
    var show_results = Object.keys(results).length > 0;
    this.get('template.question_groups').forEach(function(group) {
      var style = "";
      if(group.border) {
        var rgb = group.border.map(function(n) { return parseInt(n, 10); }).join(', ');
        style = style + "border-color: rgb(" + rgb + "); ";
      }
      if(group.background) {
        var rgb = group.background.map(function(n) { return parseInt(n, 10); }).join(', ');
        style = style + "background-color: rgb(" + rgb + "); ";
        var avg = (group.background[0] + group.background[1] + group.background[2]) / 3;
        if(avg < 150) {
          style = style + "color: #fff; ";
        }
      }
      var item = {
        id: group.id,
        header: true,
        header_style: htmlSafe(style),
        label: group.label
      };
      if(group.sub_label || group.header) {
        item.sub_label = group.sub_label || group.header
      }
      list.push(item);
      var max_options = 0;
      group.questions.forEach(function(question) {
        var block = blocks[question.answer_block];
        if(block && block.answers && block.answers.length) {
          max_options = Math.max(max_options, block.answers.length);
        }
      });
      group.questions.forEach(function(question) {
        var block = blocks[question.answer_block];
        var answers = [];
        if(!block) { debugger; return; }
        (block.answers || []).forEach(function(answer) {
          var ans = {
            id: answer.id,
            label: answer.label,
            score: answer.score,
            mastery: !!answer.mastery
          };
          if(answer.skip) { ans.skip = true; }
          if(show_results) {
            if(results[question.id] && results[question.id].answers && results[question.id].answers[answer.id]) {
              ans.selected = true;
            }
          }
          // ans.selected = true if showing results, or question_group.repeatable
          answers.push(ans);
        });
        max_options = Math.max(max_options, answers.length || 0);
        var answer_type = {};
        if(block.type == 'text') {
          answer_type.hint = block.hint;
          if(block.extra) {
            answer_type.extra = true;
          }
        }
        answer_type[block.type] = true;
        var question_item = {
          id: question.id,
          group_id: group.id,
          label: question.label,
          hint: question.hint,
          manual_selection: block.manual_selection,
          prompt_class: htmlSafe(max_options > 6 ? 'prompt many' : 'prompt'),
          answer_type: answer_type,
          has_more: question.has_more,
          answers: answers
        }
        if(show_results) {
          if(results[question.id] && results[question.id].text) {
            question_item.text_response = results[question.id].text;
          }
          if(results[question.id] && results[question.id].manual) {
            question_item.manual = true;
          }
        }
        list.push(question_item);
      })
    });
    return list; 
  }),
  started_at: computed('started', function() {
    return window.moment(this.get('started') * 1000);
  }),
  minutes: computed('results.started', 'results.submitted', function() {
    var diff = this.get('results.submitted') - this.get('results.started');
    return Math.round(diff / 60);
  }),
  communicator_type: computed('template.type', function() {
    return (this.get('template.type') || 'communicator') == 'communicator';
  }),
  reports_layout: computed('template.report_segments', 'template.score_categories', 'questions_layout', 'history', 'template.history', 'started_at', function() {
    var reports = this.get('template.report_segments') || [];
    var cats = this.get('template.score_categories') || {};
    var date = this.get('started_at');
    var history = this.get('history') || this.get('template.history') || [];
    var res = [];
    var _this = this;
    reports.forEach(function(report) {
      // include history if available
      if(report.type == 'score') {
        var data = {
          score: true,
          history: [],
          date: date
        };
        if(report.score_category && cats[report.score_category]) {
          data.label = cats[report.score_category].label;
          data.value = cats[report.score_category].value;
          data.pre_value = cats[report.score_category].pre_value;
          if(cats[report.score_category].border) {
            var rgb = cats[report.score_category].border.map(function(n) { return parseInt(n, 10); }).join(', ');
            data.circle_style = htmlSafe("border-color: rgb(" + rgb + ");");
            data.summary_color = cats[report.score_category].border;
          }
          if(report.summary) {
            data.summary = data.summary || data.value;
          }
        }
        history.slice(-3).forEach(function(prof) {
          var started = prof.started && window.moment(prof.started * 1000);
          var age_days = (date - started) / 1000 / 60 / 60 / 24;
          var age_class = 'age_recent';
          if(age_days > 365 * 2) {
            age_class = 'age_twoyear';
          } else if(age_days > 365) {
            age_class = 'age_year';
          } else if(age_days > 365 / 2) {
            age_class = 'age_halfyear';
          } else if(age_days > 60) {
            age_class = 'age_twomonth';
          } else if(age_days > 30) {
            age_class = 'age_month';
          }
          var value = ((prof.score_categories || {})[report.score_category] || {}).value;
          var pre_value = ((prof.score_categories || {})[report.score_category] || {}).pre_value;
          if(value != null) {
            data.history.push({
              age: age_days,
              value: value,
              pre_value: pre_value,
              date: started,
              circle_class: "score_circle prior " + age_class
            });  
          }
        });
        res.push(data);
      } else if(report.type == 'weights') {
        var data = {
          weights: true,
          categories: [],
          date: date
        };
        report.score_categories.forEach(function(cat) {
          var score_cat = {
            label: cats[cat].label,
            value: cats[cat].value,
            max: cats[cat].max,
            history: []
          };
          score_cat.bar_style = "";
          var pct = Math.round(cats[cat].value / (cats[cat].max || 1) * 100);
          score_cat.bar_style = "width: " + pct + "%; ";

          if(cats[cat].border) {
            if(cats[cat].background) {
              score_cat.bar_style = score_cat.bar_style + htmlSafe("border-color: rgb(" + cats[cat].border.map(function(n) { return parseInt(n, 10); }).join(', ') + "); background: rgb(" + cats[cat].background.map(function(n) { return parseInt(n, 10); }).join(', ') + ");");
              score_cat.bar_bg_style = htmlSafe("border-top-color: rgb(" + cats[cat].background.map(function(n) { return parseInt(n, 10); }).join(', ') + ");");
            }
          }
  
          history.slice(-2).forEach(function(prof) {
            var value = ((prof.score_categories || {})[cat] || {}).value;
            var max = ((prof.score_categories || {})[cat] || {}).max;
            var pct = Math.round(value / (max || 1) * 100);
            var started = prof.started && window.moment(prof.started * 1000);
            if(value != null) {
              score_cat.prior = value;
            }
            score_cat.history.push({
              value: value,
              bar_style: "width: calc(" + (pct) + "% - 4px);",
              max: max,
              date: started
            });
          });
          data.categories.push(score_cat);
        });
        res.push(data);
      } else if(report.type == 'manual_categories') {
        var data = {
          manual_categories: true,
          label: report.label,
          categories: [],
          date: date
        };
        var max_manuals = 0;
        report.score_categories.forEach(function(cat) {
          var something_here = false;
          var score_cat = {
            label: cats[cat].label,
            manuals: cats[cat].manuals || 0,
            max: cats[cat].max,
            history: []
          };
          max_manuals = Math.max(score_cat.manuals, max_manuals);
          if(score_cat.manuals > 0) { something_here = true; }
          score_cat.bar_style = "";

          if(cats[cat].border) {
            if(cats[cat].background) {
              score_cat.bar_style = score_cat.bar_style + htmlSafe("border-color: rgb(" + cats[cat].border.map(function(n) { return parseInt(n, 10); }).join(', ') + "); background: rgb(" + cats[cat].background.map(function(n) { return parseInt(n, 10); }).join(', ') + "); ");
              score_cat.bar_bg_style = htmlSafe("border-top-color: rgb(" + cats[cat].background.map(function(n) { return parseInt(n, 10); }).join(', ') + ");");
            }
          }
  
          history.slice(-2).forEach(function(prof) {
            var manuals = ((prof.score_categories || {})[cat] || {}).manuals || 0;
            max_manuals = Math.max(max_manuals, manuals);
            var started = prof.started && window.moment(prof.started * 1000);
            if(manuals > 0) { something_here = true; }
            score_cat.history.push({
              manuals: manuals,
              date: started
            });
          });
          if(something_here) {
            data.any_categories = true;
            data.categories.push(score_cat);
          }
        });
        data.categories = data.categories.sortBy('manuals').reverse();
        data.categories.forEach(function(cat) {
          var pct = Math.round(cat.manuals / (max_manuals || 1) * 100);
          cat.bar_style = cat.bar_style + 'width: ' + pct + '%; ';
          (cat.history || []).forEach(function(hist) {
            var pct = Math.round(hist.manuals / (max_manuals || 1) * 100);
            hist.bar_style = 'width: calc(' + (pct) + '% - 4px);';
          });
        });
        res.push(data);
      } else if(report.type == 'concat') {
        var data = {
          concat: true,
          label: report.label,
          scores: [],
          history: [],
          date: date
        };
        if(report.border) {
          var rgb = report.border.map(function(n) { return parseInt(n, 10); }).join(', ');
          data.border_style = htmlSafe("border-color: rgb(" + rgb + ");");
        }
        (report.score_categories || []).forEach(function(cat) {
          data.scores.push(cats[cat].value || "?");
        });
        data.value = data.scores.join(report.join || '-');
        if(report.summary) {
          data.summary_color = report.border;
          data.summary = data.summary || data.value;
        }

        history.slice(-3).forEach(function(prof) {
          var started = prof.started && window.moment(prof.started * 1000);
          var age_days = (date - started) / 1000 / 60 / 60 / 24;
          var age_class = 'age_recent';
          if(age_days > 365 * 2) {
            age_class = 'age_twoyear';
          } else if(age_days > 365) {
            age_class = 'age_year';
          } else if(age_days > 365 / 2) {
            age_class = 'age_halfyear';
          } else if(age_days > 60) {
            age_class = 'age_twomonth';
          } else if(age_days > 30) {
            age_class = 'age_month';
          }
          var scores = [];
          (report.score_categories || []).forEach(function(cat) {
            var value = ((prof.score_categories || {})[cat] || {}).value;
            scores.push(value || "?");
          });
          data.history.push({
            age: age_days,
            value: scores.join(report.join || '-'),
            date: prof.started && window.moment(prof.started * 1000),
            circle_class: "score_circle wide prior " + age_class
          });  
        });
        res.push(data);
      } else if(report.type == 'grid') {
        // columns - list of column names
        // rows - list of row names
        // grid - array of arrays with score_categories in each cell
        // color rules for each cell should come from score_category's brackets or styling rules
      } else if(report.type == 'raw') {
        res.push({
          raw: true,
          questions: _this.get('questions_layout')
        });
      }
    });
    return res;
  }),
  decrypt_results: function(nonce) {
    // For a new profile, if the last attempt was less than
    // 18 months ago, use it to pre-populate repeatable sections
    this.set('results', []);
    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      var enc = _this.get('encrypted_results');
      if(enc.nonce_id != nonce.id) { 
        debugger 
        reject({error: 'nonce mismatch'});
      }
      _this.decrypt(enc.msg, enc.iv, nonce).then(function(str) {
        var json = JSON.parse(str);
        console.log('decrypted:', json);
        _this.set('results', json);
        resolve(json);
      }, function(err) { 
        debugger 
        reject(err);
      });
    });
  },
  encryption_key: function(nonce) {
    var te = new TextEncoder();
    return new RSVP.Promise(function(resolve, reject) {
      window.crypto.subtle.importKey(
        "raw",
        te.encode(nonce.key),
        {   //this is the algorithm options
            name: "AES-GCM",
        },
        false, //whether the key is extractable (i.e. can be used in exportKey)
        ["encrypt", "decrypt"] //can "encrypt", "decrypt", "wrapKey", or "unwrapKey"
      ).then(function(res) { resolve(res); }, function(err) { reject(err); });
    });
  },
  decrypt: function(msg_64, iv_64, nonce) {
    var te = new TextEncoder();
    var bytes = Uint8Array.from(atob(msg_64), c => c.charCodeAt(0));
    var iv_arr = Uint8Array.from(atob(iv_64), c => c.charCodeAt(0));
    var _this = this;

    return new RSVP.Promise(function(resolve, reject) {
      _this.encryption_key(nonce).then(function(key) {
        window.crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: iv_arr,
            additionalData: te.encode(nonce.extra),
            tagLength: 128
          },
          key,
          bytes
        ).then(function(res) {
          resolve(String.fromCharCode.apply(null, new Uint8Array(res)));
        }, function(err) { reject(err); });
      }, function(err) { reject(err); });
    });
  },
  encrypt: function(msg, nonce) {
    var now = (new Date()).getTime() / 1000;
    var iv_arr = new Uint8Array(12);
    window.crypto.getRandomValues(iv_arr);
    var iv = btoa(String.fromCharCode.apply(null, new Uint8Array(iv_arr)));
    var te = new TextEncoder();
    var _this = this;

    return new RSVP.Promise(function(resolve, reject) {
      _this.encryption_key(nonce).then(function(key) {
        window.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: iv_arr,
            additionalData: te.encode(nonce.extra),
            tagLength: 128
          },
          key,
          te.encode(msg)
        ).then(function(res) {
          var str = btoa(String.fromCharCode.apply(null, new Uint8Array(res)));
          resolve({nonce_id: nonce.id, iv: iv, msg: str, ts: now});
        }, function(err) { reject(err); });
      }, function(err) { reject(err); });
    });
  },
  output_json: function(nonce) {
    // try to submit directly or add it to the user's log
    // doesn't have to be complete, can be resumed later if not finished
    // once finished can't be revised?
    // need a way to save locally if offline and paused for a minute
    // maybe need a way to save to logs multiple times
    // to prevent losing data or confusing save options
    var template = this.get('template');
    var json = JSON.parse(JSON.stringify(template));
    json.results = {
      started: this.get('started'),
      submitted: (new Date()).getTime() / 1000,
      responses: {}
    };
    json.started = this.get('started');
    json.type = json.type || 'communicator';
    json.guid = nonce.id + "-" + Math.round(json.results.submitted) + "-" + Math.round(999999 * Math.random());
    if(this.get('with_communicator')) {
      json.with_communicator = true;
    }
    if(this.get('feedback')) {
      json.feedback = this.get('feedback');
    }
    var questions = this.get('questions_layout');
    var responses = json.results.responses;
    questions.forEach(function(question) {
      var template_group = json.question_groups.find(function(g) { return g.id == question.group_id; });
      var template_question = ((template_group || {}).questions || []).find(function(q) { return q.id == question.id; });
      var template_block = json.answer_blocks[question.answer_block];
      if(!question.header && question.id) {
        responses[question.id] = {};
        if(question.text_response) {
          responses[question.id].text = question.text_response;
        }
        if(question.manual) {
          responses[question.id].manual = true;
          for(var cat_id in template_question.score_categories) {
            var cat = json.score_categories[cat_id];
            if(cat) {
              cat.manuals = (cat.manuals || 0) + 1;
            }
          }
        }
        if(question.answers) {
          responses[question.id].answers = {};
          question.answers.forEach(function(answer) {
            responses[question.id].answers[answer.id] = !!answer.selected;
            if(answer.selected && answer.mastery) {
              responses[question.id].mastered = true;
            }
            if(answer.selected) {
              responses[question.id].score = (responses[question.id].score || 0) + answer.score;
            }
            if(answer.selected && !answer.skip && template_question.score_categories) {
              for(var cat_id in template_question.score_categories) {
                var cat = json.score_categories[cat_id];
                if(cat) {
                  cat.tally = (cat.tally || 0) + (template_question.score_categories[cat_id] * answer.score)
                  cat.cnt = (cat.cnt || 0) + 1;
                  if(answer.mastery) {
                    cat.mastery_cnt = (cat.mastery_cnt || 0) + 1;
                  }
                }
              }
            }
          });
          var max_score = Math.max.apply(null, question.answers.map(function(a) { return a.score; }));
          for(var cat_id in template_question.score_categories) {
            var mult = template_question.score_categories[cat_id] || 1.0;
            var cat = json.score_categories[cat_id];
            if(cat) {
              cat.max = (cat.max || 0) + (max_score * mult);
              if(cat.function == 'sum') {
                cat.value = cat.tally || 0;
              } else if(cat.function == 'avg') {
                cat.value = ((cat.tally || 0) / (cat.cnt || 1));
                cat.max = cat.max / (cat.cnt || 1);
              } else if(cat.function == 'mastery_cnt') {
                cat.value = cat.mastery_cnt || 0;
                cat.max = cat.cnt;
              } else if(cat.function == 'mastery_avg') {
                cat.value = cat.mastery_cnt / (cat.cnt || 1);
                cat.max = 1.0;
              }
              if(cat.brackets) {
                cat.pre_value = cat.value;
                cat.brackets.forEach(function(b, idx) {
                  if(idx == 0 || (cat.pre_value / (cat.max || 1)) > b[0]) {
                    cat.value = b[1];
                    cat.bracket_border = b[2];
                    cat.bracket_background = b[3];
                  }
                });
              }
            }
          }
        }
      }
    });
    var throwaway = profiles.process(json);
    throwaway.get('reports_layout').forEach(function(r) { 
      if(r.summary && !json.summary) {
        json.summary = json.summary || r.summary;
        json.summary_color = r.summary_color;
      }
    });


    var _this = this;
    return new RSVP.Promise(function(resolve, reject) {
      _this.encrypt(JSON.stringify(json.results), nonce).then(function(enc) {
        delete json['results'];
        json['encrypted_results'] = enc;
        // _this.decrypt(enc.msg, enc.iv, nonce).then(function(str) {
        //   console.log('decrypted:', JSON.parse(str));
        // }, function(err) { debugger });
        resolve(json);
      }, function(err) {
        debugger
      });
    });
    // add answers to question_groups section (include answer timestamp?)
    // add numerical values to and date to report_segments
    // add date information (encrypted?)
    // do not add user information
    // demographic information must be stored separately
    // consider encrypting all answers, but not report summaries
    // keep a table of user_id-seed mappings
    // the encryption key uses the seed and also the server encryption, so a db dump isn't enough to compromise it
    // encrypt and decrypt profile responses client-side (server-side could do it, but this gets us in the habit of doing it client-side)
    // in the future it should be possible to move the mapping table to a third-party site
    // this would prevent future server access to profile data without consent from the third party
    // when adding as a logmessage, instead of storing an id, store the seed that can be used to generate the id (same table?)
    // to store to the server:
    //   request an encryption key and map the key's prefix to its seed for future access
    //     salt: crypto.getRandomValues(new Uint8Array(16));
    //   encrypt with the key and a salt
    //   send the salt and key prefix along with the encrypted payload
    //   after an id is generated, lookup seed from prefix and map id to seed and remove any other seed references
    // to retrieve from the server:
    //   get the encryption key and payload in separate requests
    // https://github.com/mdn/dom-examples/blob/master/web-crypto/encrypt-decrypt/aes-gcm.js

  //   kkey = await window.crypto.subtle.importKey(
  //     "raw", //can be "jwk" or "raw"
  //     te.encode("12345678901234567890123456789012"),
  //     {   //this is the algorithm options
  //         name: "AES-GCM",
  //     },
  //     true, //whether the key is extractable (i.e. can be used in exportKey)
  //     ["encrypt", "decrypt"] //can "encrypt", "decrypt", "wrapKey", or "unwrapKey"
  // ) 
  //   msg = "TCWv4gdG2yP4fHvcB97Kn1dkJrtejobXYsQUn4j2+LaVSo9msQ==\n" 
  //   //bytes= [76, 37, 175, 226, 7, 70, 219, 35, 248, 124, 123, 220, 7, 222, 202, 159, 87, 100, 38, 187, 94, 142, 134, 215, 98, 196, 20, 159, 136, 246, 248, 182, 149, 74, 143, 102, 177]
  //   bytes = Uint8Array.from(atob(msg), c => c.charCodeAt(0))
  //   bb = new Uint8Array(bytes)
  //   res = await window.crypto.subtle.decrypt(
  //     {
  //       name: "AES-GCM",
  //       iv: te.encode(iv),
  //       additionalData: te.encode('bacon'),
  //       tagLength: 128
  //     },
  //     kkey,
  //     bb
  //   );
  //   td.decode(res)
  //   btoa(String.fromCharCode.apply(null, new Uint8Array(res)));

  //   res = await window.crypto.subtle.encrypt(
  //     {
  //       name: "AES-GCM",
  //       iv: te.encode(iv),
  //       additionalData: te.encode('bacon'),
  //       tagLength: 128
  //     },
  //     kkey,
  //     te.encode("whatever")
  //   );
  //   td.decode(res)
  //   btoa(String.fromCharCode.apply(null, new Uint8Array(res)));
  }
});


var profiles = {
  template: function(id) {
    return new RSVP.Promise(function(resolve, reject) {
      if(id == 'sample') {
        resolve(profiles.process(sample_profile));
      } else if(id == 'cole') {
        resolve(profiles.process(cole_profile));
      } else if(id == 'cpp') {
        resolve(profiles.process(cpp_profile));
      // } else if(id == 'apsr') {
      //   resolve(profiles.process(alpha_phon));
      // } else if(id == 'classchar') {
      //   resolve(profiles.process(class_char));
      // } else if(id == 'csicy') {
      //   resolve(profiles.process(csicy_profile));
      // } else if(id == 'com-ff') {
      //   resolve(profiles.process(com_forms_funcs)); 
      } else {
        LingoLinq.store.findRecord('profile', id).then(function(prof) {
          resolve(profiles.process(prof.get('template')));
        }, function(err) {
          reject(err);
        })
      }
    });
  },
  process: function(json) {
    if(typeof(json) == 'string') {
      json = JSON.parse(json);
    }
    return Profile.create({template: json});
  }
};

var cole_profile = {
  name: "COLE - LCPS Continuum Of Language Expression",
  id: "cole",
  version: "0.1",
  type: 'communicator',
  description: "The Interactive LCPS Continuum Of Language Expression",
  score_categories: {
    cole: {
      label: "COLE Score",
      function: "sum",
      border: [166, 83, 98],
      background: [255, 191, 203]
    },
    stage_1: {
      label: "Stage 1",
      function: "mastery_cnt",
      border: [26, 55, 130],
      background: [171, 194, 255]
    },
    stage_2: {
      label: "Stage 2",
      function: "mastery_cnt",
      border: [90, 117, 150],
      background: [173, 203, 240]
    },
    stage_3: {
      label: "Stage 3",
      function: "mastery_cnt",
      border: [103, 161, 184],
      background: [194, 236, 252]
    },
    stage_4: {
      label: "Stage 4",
      function: "mastery_cnt",
      border: [117, 195, 217],
      background: [196, 242, 255]
    },
    stage_5: {
      label: "Stage 5",
      function: "mastery_cnt",
      border: [119, 202, 209],
      background: [196, 250, 255]
    },
    stage_6: {
      label: "Stage 6",
      function: "mastery_cnt",
      border: [124, 217, 207],
      background: [207, 255, 250]
    },
    stage_7: {
      label: "Stage 7",
      function: "mastery_cnt",
      border: [110, 186, 165],
      background: [188, 245, 229]
    },
    stage_8: {
      label: "Stage 8",
      function: "mastery_cnt",
      border: [100, 179, 134],
      background: [171, 245, 203]
    },
    stage_9: {
      label: "Stage 9",
      function: "mastery_cnt",
      border: [83, 181, 108],
      background: [154, 230, 173]
    },
    stage_10: {
      label: "Stage 10",
      function: "mastery_cnt",
      border: [84, 156, 89],
      background: [162, 224, 166]
    },
    stage_11: {
      label: "Stage 11",
      function: "mastery_cnt",
      border: [77, 133, 72],
      background: [158, 224, 153]
    },
  },
  answer_blocks: {
    frequency: {
      type: 'multiple_choice',
      answers: [
        {id: 'never', label: "Not Observed", score: 0},
        {id: 'occasionally', label: "Occasionally", score: 1},
        {id: 'usually', label: "Usually", score: 2, mastery: true},
        {id: 'always', label: "Always", score: 3, mastery: true}
      ]
    },
    free_response: {
      type: 'text',
      hint: "Evidence/Documentation/Notes:"
    }

  },
  question_groups: [
    {
      id: "stage_1",
      label: "Stage 1",
      border: [26, 55, 130],
      background: [171, 194, 255],
      questions: [
        {
          id: "q11",
          label: "Cries when uncomfortable.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_1: 1.0,
          }
        },
        {
          id: "q12",
          label: "Smiles, coos, giggles, or otherwise shows enjoyment when attention is given.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_1: 1.0,
          }
        },
        {
          id: "q13",
          label: "Glances at a person or visual stimulation for one second.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_1: 1.0,
          }
        },
        {
          id: "q14",
          label: "Shows a physical response to noise (turns head, stops moving, jumps, etc.).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_1: 1.0,
          }
        },
        {
          id: "q1text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]      
    },
    {
      id: "stage_2",
      label: "Stage 2",
      border: [90, 117, 150],
      background: [173, 203, 240],
      questions: [
        {
          id: "q21",
          label: "Looks at a person or visual stimulation for a sustained time (3 seconds or more).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_2: 1.0,
          }
        },
        {
          id: "q22",
          label: "Makes one sound besides crying such as producing a vowel-like sound (Ah, Uh, Ee, gurgles, sighs, grunts, squeals).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_2: 1.0,
          }
        },
        {
          id: "q23",
          label: "Imitates a facial expression, such as a smile.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_2: 1.0,
          }
        },
        {
          id: "q2text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_3",
      label: "Stage 3",
      border: [103, 161, 184],
      background: [194, 236, 252],
      questions: [
        {
          id: "q31",
          label: "Anticipates what will happen next within a familiar routine (laughs, closes eyes, tenses body, etc.) ",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_3: 1.0,
          }
        },
        {
          id: "q32",
          label: "Protests by gesturing or vocalizing.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_3: 1.0,
          }
        },
        {
          id: "q33",
          label: "Vocalizes at least two different sounds such as /puh/, /guh/, /ee/, /ah/",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_3: 1.0,
          }
        },
        {
          id: "q34",
          label: "Reaches for, touches, or points to what is wanted when only one thing is present.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_3: 1.0,
          }
        },
        {
          id: "q35",
          label: "Imitates some vocalizations.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_3: 1.0,
          }
        },
        {
          id: "q3text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_4",
      label: "Stage 4",
      border: [117, 195, 217],
      background: [196, 242, 255],
      questions: [
        {
          id: "q41",
          label: "Gets attention from others using gestures or behaviors (such as leading an adult, purposefully throwing items, pushing an  item to an adult, etc.)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q42",
          label: "Babbles at least two syllables together (not necessarily with meaning) such as /gah gah/, /gah bee",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q43",
          label: "Takes two turns during playful interactions with another person (peekaboo, knocking blocks down, etc.)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q44",
          label: "Attempts to imitate some single words.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q45",
          label: "Reaches for, touches, or points to what is wanted when two options are presented (making a choice between two).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q4text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_5",
      label: "Stage 5",
      border: [119, 202, 209],
      background: [196, 250, 255],
      questions: [
        {
          id: "q51",
          label: "Spontaneously produces at least one word (or approximation) with any intent which includes verbalizing pointing at a picture, signing, or using a speech generating device.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_5: 1.0,
          }
        },
        {
          id: "q52",
          label: "Initiates a social exchange (including turn-taking, greetings, chasing games, show objects to others, etc.)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_5: 1.0,
          }
        },
        {
          id: "q5text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_6",
      label: "Stage 6",
      border: [124, 217, 207],
      background: [207, 255, 250],
      questions: [
        {
          id: "q61",
          label: "Produces a total of three different words (total number of words known in vocabulary/lexicon).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q62",
          label: "Produces a single word to indicate location (ex. up, there, here, down, on, in).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q63",
          label: "Produces a single word to ask a question (ex. go? where? mine? more?).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q64",
          label: "Produces a single word to answer a question (ex. yes, no, here, there, it, mine, that, this).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q65",
          label: "Produces a single word to make a request (ex. mine, want, help, go, finished, come, look).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q66",
          label: "Produces a single word to label (ex. it, that, this, you, me).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q67",
          label: "Produces a single word to indicate ownership (ex. mine, you, your, me).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q68",
          label: "Produces a single word to protest (ex. no, stop, finished, mine).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q69",
          label: "Produces a single word to give directions (ex. go, up, down, stop, play, get, read, put).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_6: 1.0,
          }
        },
        {
          id: "q6text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_7",
      label: "Stage 7",
      border: [110, 186, 165],
      background: [188, 245, 229],
      questions: [
        {
          id: "q71",
          label: "Produces a total of four to ten different words (total number of words known in vocabulary/lexicon)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_7: 1.0,
          }
        },
        {
          id: "q7text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_8",
      label: "Stage 8",
      border: [100, 179, 134],
      background: [171, 245, 203],
      questions: [
        {
          id: "q81",
          label: "Produces a total of 11 to 25 different words.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_8: 1.0,
          }
        },
        {
          id: "q82",
          label: "Produces a single word to comment on a person, environment, or activity. (ex. good, bad, like, love)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_8: 1.0,
          }
        },
        {
          id: "q8text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_9",
      label: "Stage 9",
      border: [83, 181, 108],
      background: [154, 230, 173],
      questions: [
        {
          id: "q91",
          label: "Produces a total of 26 to 50 different words.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q92",
          label: "Produces at least two different single words to indicate location (ex. up, there, here, down, on, in)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q93",
          label: "Produces a variety of single words to ask a question (ex. go? where? mine? more?) ",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q94",
          label: "Produces a variety of single words to answer a question (ex. yes, no, here, there, it, mine, that, this)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q95",
          label: "Produces a variety of single words to make a request (ex. mine, want, help, go, finished, come, look)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q96",
          label: "Produces a variety of single words to label (ex. it, that, this, you, me) ",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q97",
          label: "Produces a variety of single words to indicate ownership (ex. mine, you, your, me)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q98",
          label: "Produces a variety of single words as a greeting",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q99",
          label: "Produces a variety of single words to protest (ex. no, stop, finished, mine)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q910",
          label: "Produces a variety of single words to give directions (ex. go, up, down, stop, play, get, read, put)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q911",
          label: "Produces a variety of single words to comment on a person, environment, or activity. (ex. good, bad, like, love)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_9: 1.0,
          }
        },
        {
          id: "q9text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_10",
      label: "Stage 10",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "qa1",
          label: "Produces a total of more than 50 words.",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa2",
          label: "Combines two words to indicate location (ex. up there, it in, it there, come here, she out)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa3",
          label: "Combines two words to ask a question (ex. where go?, my turn?, I have?, eat this? drink it?)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa4",
          label: "Combines two words to answer a question (ex. read more, go fast, its here)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa5",
          label: "Combines two words to make a request (ex. want more, I have, go slow, you sit, watch me)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa6",
          label: "Combines two words to label, comment, or describe (ex. that big, it fast, that bad, it good, red one, it blue).",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa7",
          label: "Combines two words to indicate ownership (ex. it mine, my turn, it hers, it his)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa8",
          label: "Combines two words to deny, reject, or protest (ex. no go, stop it, stop that, you stop, I finished, not me, not like, that bad, you bad) ",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa9",
          label: "Combines two words to give directions (ex. put in, you up, go there, eat it, get that, go fast, slow down, you look)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa10",
          label: "Uses the plural s",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa11",
          label: "Uses present progressive verb forms - ing (ex. eating, finding, putting, making, looking, loving, helping, going, stopping, turning)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa12",
          label: "Uses at least three pronouns (ex. I, you, me, my",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa13",
          label: "Uses words to express quantity (ex. more, big, little, some, a lot, many, all)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qa14",
          label: "Uses phrases which changes the meaning of the individual words in that phrase (ie, phrasal verbs such as slow down, get out,  go on, I get it!)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_10: 1.0,
          }
        },
        {
          id: "qatext",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "stage_11",
      label: "Stage 11",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "qb1",
          label: "Combines three or more words to indicate location (ex.go up there, it is in, it is there, you come here, she goes out)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb2",
          label: "Combines three or more words to ask a question (ex. where it go?, it is my turn?, Can I have?, you eat this? Can I drink it?)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb3",
          label: "Combines three or more words to answer a question (ex. I read more, it goes fast, it is here)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb4",
          label: "Combines three or more words to make a request (ex. I want more, I have it, I go slow, I sit there, watch me do it)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb5",
          label: "Combines three or more words to label, comment, or describe (ex. that is big, it is fast, that is bad, it is good, that red one, it is blue)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb6",
          label: "Combines three or more words to indicate ownership (ex. it is mine, it is my turn, this is hers, that is his)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb7",
          label: "Combines three or more words to deny, reject, or protest (ex. do not go, you stop it, stop that please, you stop that, I finished it, it is not mine, do not like it, that is bad, you are bad) ",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb8",
          label: "Combines three or more words to give directions (ex. put it in, you go up, you go there, you eat it, you get that, go there fast, slow it down, you look at it)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb9",
          label: "Uses two irregular past tense verbs (ex. went, came, heard, felt, did, saw, got, said, thought, made, took, knew)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb10",
          label: "Uses the possessive s ('s) (ex. his, hers, yours, ours, theirs)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qb11",
          label: "Uses \"is\" and \"are\" as the main verb (ex. It is there, where is it?, there it is, he is fast, she is big)",
          answer_block: "frequency",
          score_categories: {
            cole: 1.0,
            stage_11: 1.0,
          }
        },
        {
          id: "qbtext",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
  ],
  report_segments: [
    {
      type: "score",
      score_category: "cole",
      summary: true,
    },
    {
      type: "weights",
      score_categories: ["stage_1", "stage_2", "stage_3", "stage_4", "stage_5", "stage_6", "stage_7", "stage_8", "stage_9", "stage_10", "stage_11"]
    },
    {
      type: "raw",
    }
  ]
};

var cpp_profile = {
  name: "CPP - Communication Partner Profile",
  id: "cpp",
  version: "1.0",
  type: 'supervisor',
  description: ["Communication Partner Profile (CPPv1) AAC-Related Self-Reflection",
    "This profile should take less than 15 minutes to complete. It is a tool for self-reflection and to help find opportunities for improvement in supporting people who use AAC (AAC users). If you find yourself thinking “that doesn’t apply to me”, please reconsider – AAC users benefit most when their entire circle of support helps them learn to communicate.",
    "This form is not meant as a metric to compare the performance between multiple communication partners. So no need to feel disappointed if you’re answering “never” in many areas -- don’t worry! Very few of us manage to do all of this all of the time. Just pick a few spots for improvement; don’t try to do everything at once. It’s also worth thinking of communicator profiling forms you may have seen, and how lists of “never” responses affect attitudes towards AAC users and their access to robust systems.",
  ],
  instructions: [
    "For each row, select the option that best matches your experience. This form can be filled out once or on a regular basis, as a tool to help you think about areas where you are doing well or could improve, in supporting, teaching, modeling for, and acting as a communication partner for one or more AAC users.",
    "The phrase “communication suite”, as used in this form, refers to the full range of communication strategies used by the AAC user. That may include high-tech or paper-based products, but may also include speech or non-verbal actions. Please remember that all of us use multiple modes of communication regularly, and honoring communication in whatever form someone is using helps build the trust, understanding, and motivation needed to continue developing communication skills.",
    "The phrase “communication partner”, as used in this form, refers to any person who is interacting with or responding to the AAC user, regardless of whether they have received any formal training."
  ],
  score_categories: {
    autonomy: {
      label: "Autonomy",
      function: 'mastery_cnt',
      border: [62, 118, 163],
      background: [122, 195, 255]
    },
    skills: {
      label: "Skills",
      function: 'mastery_cnt',
      border: [72, 168, 98],
      background: [99, 255, 141]
    },
    resilience: {
      label: "Resilience",
      function: 'mastery_cnt',
      border: [176, 174, 70],
      background: [255, 253, 128]
    },
    advocacy: {
      label: "Advocacy",
      function: 'mastery_cnt',
      border: [150, 72, 66],
      background: [255, 136, 128]
    },
    everywhere: {
      label: "Communiction Everywhere",
      function: "mastery_cnt",
      border: [26, 55, 130],
      background: [171, 194, 255]
    },
    goals: {
      label: "Setting Goals",
      function: "mastery_cnt",
      border: [90, 117, 150],
      background: [173, 203, 240]
    },
    choice: {
      label: "Communicator Choice",
      function: "mastery_cnt",
      border: [103, 161, 184],
      background: [194, 236, 252]
    },
    respect: {
      label: "Individual Respect",
      function: "mastery_cnt",
      border: [117, 195, 217],
      background: [196, 242, 255]
    },
    planning: {
      label: "Personalization/Planning",
      function: "mastery_cnt",
      border: [119, 202, 209],
      background: [196, 250, 255]
    },
    train: {
      label: "Train Others",
      function: "mastery_cnt",
      border: [124, 217, 207],
      background: [207, 255, 250]
    },
    modeling: {
      label: "Modeling",
      function: "mastery_cnt",
      border: [110, 186, 165],
      background: [188, 245, 229]
    },
    vocab: {
      label: "Expanding Vocabulary",
      function: "mastery_cnt",
      border: [100, 179, 134],
      background: [171, 245, 203]
    },
    literacy: {
      label: "Literacy",
      function: "mastery_cnt",
      border: [83, 181, 108],
      background: [154, 230, 173]
    },
    multi_modal: {
      label: "Mutli-Modal Communication",
      function: "mastery_cnt",
      border: [84, 156, 89],
      background: [162, 224, 166]
    },
    social: {
      label: "Social",
      function: "mastery_cnt",
      border: [77, 133, 72],
      background: [158, 224, 153]
    },
  },
  answer_blocks: {
    frequency: {
      type: 'multiple_choice',
      answers: [
        {id: 'never', label: "Never", score: 0},
        {id: 'occasionally', label: "Occasionally", score: 1},
        {id: 'usually', label: "Usually", score: 2, mastery: true},
        {id: 'consistently', label: "Consistently", score: 3, mastery: true}
      ]
    },
    ensure_frequency: {
      type: 'multiple_choice',
      answers: [
        {id: 'forget', label: "I forget about that", score: 0},
        {id: 'notice', label: "I notice a problem but don’t say anything", score: 0.5},
        {id: 'sometimes', label: "Sometimes", score: 1},
        {id: 'usually', label: "Usually", score: 2, mastery: true},
        {id: 'consistently', label: "Consistently", score: 3, mastery: true}
      ]
    },
    setting_frequency: {
      type: 'multiple_choice',
      answers: [
        {id: 'proficient', label: "Currently Proficient", score: 3},
        {id: 'na', label: "Not Applicable", score: 0, skip: true},
        {id: 'never', label: "Never", score: 0},
        {id: 'occasionally', label: "Occasionally", score: 1},
        {id: 'usually', label: "Usually", score: 2, mastery: true},
        {id: 'consistently', label: "Consistently", score: 3, mastery: true}
      ]
    },
    free_response: {
      type: 'text',
      hint: "Personal Notes"
    },
    user_list: {
      type: 'text',
      hint: "List of AAC users (respecting privacy)"
    }
  },
  question_groups: [
    {
      id: "preface",
      label: "Profile Details",
      border: [67, 30, 148],
      background: [202, 179, 255],
      questions: [
        {
          id: "q0text",
          label: "List of all AAC users I'm thinking about (respecting privacy):",
          answer_block: 'user_list'
        },
      ]
    },
    {
      id: "aac_user",
      label: "When I am interacting with an AAC user, I make sure that:",
      border: [26, 55, 130],
      background: [171, 194, 255],
      questions: [
        {
          id: "q11",
          label: "I speak naturally and directly to the AAC user, regardless of how or whether they respond.",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q12",
          label: "I respect AAC user autonomy, and ensure I’ve been given permission before touching their device, providing physical support, or crowding them.",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q13",
          label: "I respond to all communication attempts, regardless of whether they were on the “desired” device or style (gestures, sounds, etc.).",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q14",
          label: "I accept that “no response”, or rejection, is a valid way for AAC users to express themselves.",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q15",
          label: "I give AAC users my full attention & don’t interrupt, or I wait for them to signal completion before I respond.",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q16",
          label: "I have spent time getting to know AAC users so I can better personalize my interactions to their experience.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q17",
          label: "I include AAC users in meaningful decision-making that will affect them in the short term (meals or activities, clothing choice, daily schedule, etc.).",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q18",
          label: "I include AAC users in meaningful decision-making that will affect them in the long term (device layout, medical decisions, topics for study, etc.)",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q19",
          label: "I am familiar enough with their vocabulary layout to be able to effectively show AAC users how to select different options using their communication suite.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q110",
          label: "I show (or model, on a separate device if possible) examples of words or phrases beyond what the AAC user has already mastered.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q111",
          label: "I look for natural communication opportunities instead of expecting a specific “correct” response or withholding activities/items to force communication.",
          answer_block: "frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
      ]      
    },
    {
      id: "partners",
      label: "As I observe or coach others interacting with AAC user(s), I ensure that:",
      border: [90, 117, 150],
      background: [173, 203, 240],
      questions: [
        {
          id: "q21",
          label: "AAC users receive proper explanations about things that are happening to and around them, and are given opportunities to decide about or to direct those experiences.",
          answer_block: "ensure_frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q22",
          label: "AAC users have access to their personalized communication suite at all times.",
          answer_block: "ensure_frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q23",
          label: "AAC users are asked for permission before others touch their device or adjust settings.",
          answer_block: "ensure_frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q24",
          label: "AAC user’s preference in partner’s role (where to stand, whether to wait for completion, etc.) is known and respected.",
          answer_block: "ensure_frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q25",
          label: "Communication partners respond to all attempts, regardless of whether they were on the “desired” device or style (not “if you want that then use your talker to say it”).",
          answer_block: "ensure_frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q26",
          label: "Communication happens naturally, and is not just question-answer sessions or asking for clarification after each comment.",
          answer_block: "ensure_frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
        {
          id: "q27",
          label: "AAC users are shown examples (on a separate device where possible) of how to express their thoughts and ideas using their communication suite or a similar system.",
          answer_block: "ensure_frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q28",
          label: "Physical control (i.e. hand-over-hand) is avoided for selection, unless the AAC user’s express permission is given each time",
          answer_block: "ensure_frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q29",
          label: "Empowering rather than dismissive language is used about and around the AAC user (not “you can ignore her”, “he’s just babbling”, “that didn’t mean anything”).",
          answer_block: "ensure_frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
      ]
    },
    {
      id: "team",
      label: "As I collaborate with other members of the support team, I ensure that:",
      border: [103, 161, 184],
      background: [194, 236, 252],
      questions: [
        {
          id: "q31",
          label: "All attempts to use the AAC system are responded to as meaningful communication, including looking at a device, babbling (selecting symbols without clear intent), or using an unexpected symbol.",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q32",
          label: "Communication partners wait sufficient time (5-10 seconds or customized to the AAC user) after and between questions or communication invitations.",
          answer_block: "frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
        {
          id: "q33",
          label: "Team members are familiar with the AAC user and their AAC system and have specific examples of concepts they can model for the AAC user.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q34",
          label: "Literacy exposure/learning happens in all settings and at the same time as other communication aspects (not “communication first, literacy later”)",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q35",
          label: "The AAC user’s external environment is set up to foster diverse and interesting communication opportunities.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q36",
          label: "All team members understand their opportunity to teach or encourage communication in every environment and context.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q37",
          label: "All team members are given opportunities to review and practice strategies before implementing them in-person.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q38",
          label: "AAC users are included in decisions about their therapy, development, and learning activities.",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q39",
          label: "The goal-setting process includes participation and approval by the AAC user (and their family if desired by the AAC user).",
          answer_block: "frequency",
          score_categories: {
            autonomy: 1.0,
          }
        },
        {
          id: "q310",
          label: "All team members are aware of goals that have been set with the AAC user, and are updated on progress being made toward those goals.",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
      ]
    },
    {
      id: "watch",
      label: "I pay attention for:",
      border: [117, 195, 217],
      background: [196, 242, 255],
      questions: [
        {
          id: "q41",
          label: "New words or phrases the AAC user is starting to use, so I can find opportunities to model other examples with the word or phrase.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q42",
          label: "Communication attempts that others may have missed, and I point them out so everyone can learn to support each unique AAC user.",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q43",
          label: "Instances when people talk about the AAC user to caregivers or staff, so I can help them learn to speak directly with the AAC user.",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q44",
          label: "Times when AAC user voices aren’t given equal weight or aren’t being included in decisions that affect their lives.",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q45",
          label: "Opportunities to introduce literacy (both reading and writing) learning to AAC users who have not yet shown mastery.",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q46",
          label: "New communication partners, and I share with those partners simple concepts that can help them be a more effective partner (honoring attempts, wait time, eye contact, etc.).",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q47",
          label: "Positive experiences I can point out to AAC users to help them identify their own communication growth.",
          answer_block: "frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
        {
          id: "q48",
          label: "Success stories that I can share with others to help keep everyone engaged in AAC users’ progress.",
          answer_block: "frequency",
          score_categories: {
            advocacy: 1.0,
          }
        },
        {
          id: "q49",
          label: "Other AAC users that may be a good network or mentor for the AAC users that I work with.",
          answer_block: "frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
      ]
    },
    {
      id: "settings",
      label: "In the following settings, I look for opportunities to encourage (but not force) communication attempts for AAC user(s): (Please mark “not applicable” for contexts where you do not interact with any AAC users)",
      border: [119, 202, 209],
      background: [196, 250, 255],
      questions: [
        {
          id: "q51",
          label: "Learning Settings",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q52",
          label: "Shared Reading",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q53",
          label: "Playing Games",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q54",
          label: "Meal Time",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q55",
          label: "Outdoors/Playground",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q56",
          label: "Leisure/Relaxing/Break Time",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q57",
          label: "Entertainment",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q58",
          label: "Social Settings",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q59",
          label: "Places of Worship",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q510",
          label: "Travel/Transit",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q511",
          label: "Restaurants/Shopping",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
        {
          id: "q512",
          label: "Arrivals/Departures",
          answer_block: "setting_frequency",
          score_categories: {
          }
        },
      ]
    },
    {
      id: "goals",
      label: "I discuss with the whole team -- including the AAC user -- goals related to the following aspects of communication:",
      border: [124, 217, 207],
      background: [207, 255, 250],
      questions: [
        {
          id: "q61",
          label: "Linguistic – understanding what words mean, and how to organize and use them",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q62",
          label: "Literacy (Reading) – shared reading, learning to read, comprehend and analyze written text",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q63",
          label: "Literacy (Writing) – learning word sounds, rules of spelling, creative and formal writing, organizing a statement",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q64",
          label: "Operational – how to navigate the device, switch between apps or pages, use the keyboard or autocomplete, control volume, charge the device, managing switches or other hardware",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q65",
          label: "Social – following social cues and effectively participating in real-time conversations, staying on topic, keeping listener’s attention, developing relationships through communication, what is appropriate to talk about when",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q66",
          label: "Strategic – working around limited available vocabulary, requesting new vocabulary, correcting misunderstandings, getting time to craft a response",
          answer_block: "frequency",
          score_categories: {
            skills: 1.0,
          }
        },
        {
          id: "q67",
          label: "Emotional – self-advocacy and resilience, recognition and regulation of emotions, talking through feelings, confidence in communication, learning from mistakes",
          answer_block: "frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
        {
          id: "q68",
          label: "Mentoring – beneficial communication partners, identifying AAC users who would be good mentors, empowering AAC users to develop their own network",
          answer_block: "frequency",
          score_categories: {
            resilience: 1.0,
          }
        },
      ]
    },
    {
      id: "notes",
      label: "Notes or observations you would like to remember as part of this profile:",
      border: [48, 128, 72],
      background: [179, 255, 202],
      questions: [
        {
          id: "q7text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "personal_goals",
      label: "Goals you would like to set for yourself after filling out this profile:",
      border: [48, 128, 72],
      background: [179, 255, 202],
      questions: [
        {
          id: "q8text",
          label: "Notes:",
          answer_block: 'free_response'
        },
      ]
    },
  ],
  report_segments: [
    {
      type: "weights",
      score_categories: ["autonomy", "skills", "resilience", "advocacy"]
    },
    {
      notes: "Responses",
      type: "raw",
    }
  ]
};

// var class_char = {
//   name: "Classroom Characteristics Form",
//   id: "classchar",
//   version: "0.1",
//   type: "supervisor",
//   url: "http://www.project-core.com/instructional-planning-and-reflection/",
//   description: [
//     "This form was created for Project Core. The questions are designed to help you and the implementation team consider the characteristics of classrooms and the supports that may be needed to fully implement Project Core and the Universal Core vocabulary. This is not an evaluation of the classroom but a planning tool for support. | www.project-core.com | © 2019 Center for Literacy and Disability Studies, Department of Allied Health Sciences, UNC-Chapel Hill"
//   ],
//   instructions: [
//     "Classroom teachers and other school representatives should complete the following questions.",
//   ],
//   answer_blocks: {
//     status: {
//       type: 'multiple_choice',
//       answers: [
//         {id: 'not_implemented', label: "Not In Place"},
//         {id: 'partial', label: "Partially In Place"},
//         {id: 'in_place', label: "In Place"},
//       ]
//     },
//     priority: {
//       type: 'multiple_choice',
//       answers: [
//         {id: 'low', label: "Low Priority", score: 0},
//         {id: 'medium', label: "Medium Priority", score: 1},
//         {id: 'hight', label: "High Prioerity", score: 2}
//       ]
//     },
//     notes: {
//       type: 'text',
//       hint: "Notes"
//     },
//   },
//   question_groups: [
//     {
//       id: "char",
//       label: "Classroom Characteristics",
//       border: [84, 156, 89],
//       background: [162, 224, 166],
//       header_border: [84, 156, 89],
//       header_background: [162, 224, 166],
//       questions: [
//         {
//           id: "q1",
//           has_more: true,
//           label: "1. The instructional environment gives students interesting things to communicate about.",
//           answer_block: "status"
//         },
//         {
//           id: "q1a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q2",
//           has_more: true,
//           label: "2. Meaningful, interactive academic instruction is happening in ways that is accessible to all students.",
//           answer_block: "status"
//         },
//         {
//           id: "q2a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q3",
//           has_more: true,
//           label: "3. The teacher collaborates with other school professionals to plan and implement instruction and assessment.",
//           answer_block: "status"
//         },
//         {
//           id: "q3a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q4",
//           has_more: true,
//           label: "4. There are regularly scheduled times when professionals meet to discuss student progress and collaborate around next steps and solutions.",
//           answer_block: "status"
//         },
//         {
//           id: "q4a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q5",
//           has_more: true,
//           label: "5. The teacher has time and administrative support to pursue professional development.",
//           answer_block: "status"
//         },
//         {
//           id: "q5a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q6",
//           has_more: true,
//           label: "6. The teacher is committed to completing professional development.",
//           answer_block: "status"
//         },
//         {
//           id: "q6a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q7",
//           has_more: true,
//           label: "7. The teacher believes all students can learn and communicate.",
//           answer_block: "status"
//         },
//         {
//           id: "q7a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q8",
//           has_more: true,
//           label: "8. The teacher has experience using symbols to support student communication.",
//           answer_block: "status"
//         },
//         {
//           id: "q8a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q9",
//           has_more: true,
//           label: "9. The teacher has basic background in using the Universal Core vocabulary.",
//           answer_block: "status"
//         },
//         {
//           id: "q9a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q10",
//           has_more: true,
//           label: "10. The teacher has dedicated time to work with classroom staff.",
//           answer_block: "status"
//         },
//         {
//           id: "q10a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q11",
//           has_more: true,
//           label: "11. The teacher values support from others to inform instruction and practice.",
//           answer_block: "status"
//         },
//         {
//           id: "q11a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q12",
//           has_more: true,
//           label: "12. The teacher is willing to implement AAC with all students who require it.",
//           answer_block: "status"
//         },
//         {
//           id: "q12a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q13",
//           has_more: true,
//           label: "13. The teacher understands that teaching children to communicate is part of his/her job.",
//           answer_block: "status"
//         },
//         {
//           id: "q13a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q14",
//           has_more: true,
//           label: "14. The teacher knows how to model the use of symbols on communication displays to teach children to communicate.",
//           answer_block: "status"
//         },
//         {
//           id: "q14a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q15",
//           has_more: true,
//           label: "15. The teacher knows how to respond to students’ (unconventional) attempts to communicate.",
//           answer_block: "status"
//         },
//         {
//           id: "q15a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q16",
//           has_more: true,
//           label: "16. Tools are provided to students to support their learning and communication.",
//           answer_block: "status"
//         },
//         {
//           id: "q16a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q17",
//           has_more: true,
//           label: "17. Support is provided to address the vision and hearing needs of students.",
//           answer_block: "status"
//         },
//         {
//           id: "q17a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q18",
//           has_more: true,
//           label: "18. Support is provided to address the motor and positioning needs of students.",
//           answer_block: "status"
//         },
//         {
//           id: "q18a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//         {
//           id: "q19",
//           has_more: true,
//           label: "19. Classroom staff has access to professionals with expertise in assistive technology and computer/AAC system access.",
//           answer_block: "status"
//         },
//         {
//           id: "q19a",
//           label: "",
//           hint: "Priority for Improvement",
//           answer_block: "priority"
//         },
//       ]
//     },
//     {
//       id: "notes",
//       label: "Notes",
//       border: [84, 156, 89],
//       background: [162, 224, 166],
//       header_border: [84, 156, 89],
//       header_background: [162, 224, 166],
//       questions: [
//         {
//           id: "comments",
//           label: "Additional Comments/Questions",
//           answer_block: "notes"
//         }
//       ]
//     }
//   ],
//   report_segments: [
//     {
//       type: "raw",
//     }
//   ]
// };

// var alpha_phon = {
//   name: "Alphabet and Phonological Awareness Self-Reflection and Observation Form",
//   id: "apasr",
//   version: "0.1",
//   type: "supervisor",
//   url: "http://www.project-core.com/alphabet-and-phonological-awareness-facilitated-module/",
//   description: [
//     "This form was created for Project Core, and supports efforts to teach alphabetical and phonological awareness while they are learning to communicate using core vocabulary. Training materials related to this assessment can be found on the web site, http://www.project-core.com/alphabet-and-phonological-awareness-facilitated-module/ | www.project-core.com | © 2019 Center for Literacy and Disability Studies, Department of Allied Health Sciences, UNC-Chapel Hill"
//   ],
//   instructions: [
//     "Observe or reflect on practice with all students for whom AAC is appropriate.",
//   ],
//   answer_blocks: {
//     systems: {
//       type: 'multiple_choice',
//       answers: [
//         {id: 'printed', label: "Printed Core Board"},
//         {id: '3d', label: "3D Symbols"},
//         {id: 'app', label: "Communication App or Device"},
//         {id: 'other', label: "Other"}
//       ]
//     },
//     frequency: {
//       type: 'multiple_choice',
//       answers: [
//         {id: 'consistenly', label: "Consistently", score: 3, mastery: true},
//         {id: 'occasionally', label: "Occasionally", score: 1, mastery: true},
//         {id: 'never', label: "Never", score: 0}
//       ]
//     },
//     notes: {
//       type: 'text',
//       hint: "Notes"
//     },
//     examples: {
//       type: 'text',
//       extra: true,
//       hint: "Comments and Examples"
//     }
//   },
//   question_groups: [
//     {
//       id: "preface",
//       label: "Details",
//       border: [84, 156, 89],
//       background: [162, 224, 166],
//       header_border: [84, 156, 89],
//       header_background: [162, 224, 166],
//       questions: [
//         {
//           id: "p1",
//           label: "# of Students",
//           answer_block: "notes"
//         },
//         {
//           id: "p2",
//           label: "Brief Description of Activity",
//           answer_block: "notes"
//         }
//       ]
//     },
//     {
//       id: "evidence",
//       label: "Evidence",
//       border: [84, 156, 89],
//       background: [162, 224, 166],
//       header_border: [84, 156, 89],
//       header_background: [162, 224, 166],
//       questions: [
//         {
//           id: "q1",
//           has_more: true,
//           label: "ALL students have access to their own personal communication system with core vocabulary.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q1a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q2",
//           has_more: true,
//           label: "Adults recognize and respond to student’s efforts to communicate.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q2a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q3",
//           has_more: true,
//           label: "Adults tell students very clearly what they did to communicate.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q3a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q4",
//           has_more: true,
//           label: "Adults show students how to use core vocabulary using each student’s personal communication system (or a system that is very similar).",
//           answer_block: "frequency"
//         },
//         {
//           id: "q4a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q5",
//           has_more: true,
//           label: "Adults encourage students to communicate in any way they can.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q5a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q6",
//           has_more: true,
//           label: "Adults invite students to use their core vocabulary system, without requiring use.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q6a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q7",
//           has_more: true,
//           label: "Adults provide wait time for students to initiate and respond.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q7a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q8",
//           has_more: true,
//           label: "Adults do not provide students with physical support (e.g., hand-over- hand) to communicate.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q8a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q9",
//           has_more: true,
//           label: "An adult clearly describes the purpose of the lesson.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q9a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q10",
//           has_more: true,
//           label: "The lesson connects to the theme or a topic being studied in some way.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q10a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q11",
//           has_more: true,
//           label: "The lesson focuses on alphabet letters in a format that is accessible to ALL students (e.g., high contrast; large print; braille)",
//           answer_block: "frequency"
//         },
//         {
//           id: "q11a",
//           label: "",
//           answer_block: "examples"
//         },
//         {
//           id: "q12",
//           has_more: true,
//           label: "The lesson focuses on letter names, letter sounds, or other aspects of phonological awareness (rhyme, alliteration, segmenting and blending sounds).",
//           answer_block: "frequency"
//         },
//         {
//           id: "q12a",
//           label: "",
//           answer_block: "examples"
//         },                                                                                    
//         {
//           id: "q13",
//           has_more: true,
//           label: "Content and complexity of activity is appropriate for age/grade/ability level of students.",
//           answer_block: "frequency"
//         },
//         {
//           id: "q13a",
//           label: "",
//           answer_block: "examples"
//         },                                                                                    
//       ]
//     }
//   ],
//   report_segments: [
//     {
//       type: "raw",
//     }
//   ]
// }

// var com_forms_funcs = {
//   name: "Communication Forms and Functions Worksheet",
//   id: "com-ff",
//   version: "0.1",
//   type: "communicator",
//   description: [
//     "Communication Forms and Functions Worksheet can be used to log examples of communication based on different communicative functions. It has been adapted from the work of Amy Weatherby (1995) and Kathleen Quill (1995) by the Bridge School"
//   ],
//   instructions: [
//     "Fill in each section to the best of your ability, including specific examples of communication you have observed. Communication can be accomplished through speech, but also through sounds, guestures, \"behaviors\", refusal to respond, etc.",
//     "Communication *forms* are the behaviors we use to communicate (the \"how\")",
//     "Communication *functions* are the reasons we communicate (the \"why\")",
//     "Communication *partners* are the people we communicate with (the \"who\")",
//     "Communication *contexts* are the places where we communicate (the \"where\")",
//     "Communication *opportunities* are the times we have the chance to communicate (the \"when\")",
//     "Communication *messages* are the meanings in what people communication (the \"what\")"
//   ],
//   answer_blocks: {
//     examples: {
//       type: 'text',
//       hint: "Record what student says/does. Please include information about partners, forms, contexts, messages and opportunities"
//     }
//   },
//   question_groups: [
//     {
//       id: "examples",
//       label: "Examples",
//       border: [26, 55, 130],
//       background: [171, 194, 255],
//       sub_label: "What student says/does. Please include information about partners, forms, contexts, messages and opportunities",
//       header_border: [26, 55, 130],
//       header_background: [171, 194, 255],
//       questions: [
//         {
//           id: "q1",
//           label: "Protest",
//           hint: "Observe opposition when initiating an activity or transition",
//           answer_block: "examples"
//         },
//         {
//           id: "q2",
//           label: "Refuse, Reject",
//           hint: "Offer options or opportunity and wait for expression of choice",
//           answer_block: "examples"
//         },
//         {
//           id: "q3",
//           label: "Request more of an action",
//           hint: "Expectant pause during activity to give requesting opportunity",
//           answer_block: "examples"
//         },
//         {
//           id: "q4",
//           label: "Request a new action",
//           hint: "Shows fatigue or boredom, or actively requests a change",
//           answer_block: "examples"
//         },
//         {
//           id: "q5",
//           label: "Request more of an object",
//           hint: "Guestures, acts or speaks to show desire for more food, game, toy, etc.",
//           answer_block: "examples"
//         },
//         {
//           id: "q6",
//           label: "Communicates a choice between 2 or more",
//           hint: "Partner-assisted scanning or other choice-making opportunities",
//           answer_block: "examples"
//         },
//         {
//           id: "q7",
//           label: "Request new object",
//           hint: "Desire for object out of immediate focus",
//           answer_block: "examples"
//         },
//         {
//           id: "q8",
//           label: "Request absent object",
//           hint: "Asks for object out of sight or vicinity",
//           answer_block: "examples"
//         },
//         {
//           id: "q9",
//           label: "Request attention",
//           hint: "Noises, guestures, speech to draw attention to work, experience, statement, etc.",
//           answer_block: "examples"
//         },
//         {
//           id: "q10",
//           label: "Show affection",
//           hint: "Hugs, kisses, contact, expressions, statements, etc.",
//           answer_block: "examples"
//         },
//         {
//           id: "q11",
//           label: "Greets people",
//           hint: "Clear reaction when a familiar person arrives or leaves",
//           answer_block: "examples"
//         },
//         {
//           id: "q12",
//           label: "Offers, shares",
//           hint: "Clear desire to share something of interest with others",
//           answer_block: "examples"
//         },
//         {
//           id: "q13",
//           label: "Directs attention",
//           hint: "Sees an interesting object or person, or needs help with a task",
//           answer_block: "examples"
//         },
//         {
//           id: "q14",
//           label: "Polite social forms",
//           hint: "Asks permissions, expresses gratitude, takes turns, etc.",
//           answer_block: "examples"
//         },
//         {
//           id: "q15",
//           label: "Answers yes/no questions",
//           hint: "Uses guestures, actions or speech to respond",
//           answer_block: "examples"
//         },
//         {
//           id: "q16",
//           label: "Asks questions",
//           hint: "Expresses interest or curiosity in an object, event or person",
//           answer_block: "examples"
//         },
//         {
//           id: "q17",
//           label: "Names things or people",
//           hint: "Says the names of recognized items or subjects",
//           answer_block: "examples"
//         },
//         {
//           id: "q18",
//           label: "Makes comments",
//           hint: "Additional statements when observies objects, people or actions",
//           answer_block: "examples"
//         },
//       ]
//     }
//   ],
//   report_segments: [
//     {
//       type: "raw",
//     }
//   ]
// }
/*
var csicy_profile = {
  name: "Communication Supports Inventory-Children and Youth (CSI-CY)",
  id: "csicy",
  version: "0.1",
  type: 'communicator',
  description: ["Communication Supports Inventory-Children and Youth (CSI-CY) for children who rely on augmentative and alternative communication (AAC), Charity Rowland, Ph. D., Melanie Fried-Oken, Ph. D., CCC-SLP and Sandra A. M. Steiner, M. A., CCC-SLP",
    "WHAT IS THIS? The Communication Supports Inventory-Children and Youth (CSI-CY ) is a tool designed to make goal writing easier for teachers and speech-language pathologists who work with students who rely on augmentative and alternative communication (AAC) to communicate effectively. It is not an assessment, but a guide to organize your understanding of the impact of a student’s communication strengths and limitations on participation at school and at home. The idea is that you would use the CSI-CY to prepare for the IEP meeting by prioritizing areas that should be targeted in IEP goals related to communication.",
    "CSI-CY? WHO? Yes, exactly, WHO (the World Health Organization) developed the International Classification of Functioning, Disability and Health-Children and Youth Version (ICF-CY) in 2007 to provide a global common language for describing the impact of health conditions and disabilities on human functioning. The CSI-CY uses that same global common language, deriving most of its items from the ICF-CY. To see exactly what items came from the ICF-CY please look at the “code set” available at http://icfcy.org/aac#ui-tabs-4",
    "This tool is based on the International Classification of Functioning, Disability and Health-Children & Youth Version, or the ICF-CY (World Health Organization, 2007). To view the ICF-CY codes related to each item, please see www.csi-cy.org. We would like to acknowledge the contributions of Gayl Bowser, Dr. Mats Granlund, Dr. Don Lollar, Dr. Randall Phelps and Dr. Rune Simeonsson to the development of this tool."
  ],
  instructions: [
    "SO, HOW DOES IT WORK? It’s all about the student’s participation in life at school and at home! First, you rate the major areas in which the child’s participation is restricted because of communication limitations. Then you rate the child’s specific communication limitations and functional impairments that affect communication. Then you identify environmental facilitators and barriers that affect communication. After you have rated all of these items, go back through them and use the \"Prioritize for Instruction\" checkboxes to check off the items that you think should be high priority areas for potential IEP goals.",
  ],
  score_categories: {
    school: {
      label: "School Related Activities",
      function: "mastery_cnt",
      border: [26, 55, 130],
      background: [171, 194, 255]
    },
    interpersonal: {
      label: "Interpersonal Interaction and Relationships",
      function: "mastery_cnt",
      border: [90, 117, 150],
      background: [173, 203, 240]
    },
    receptive: {
      label: "Receptive Language and Literacy",
      function: "mastery_cnt",
      border: [103, 161, 184],
      background: [194, 236, 252]
    },
    expressive: {
      label: "Expressive Language and Literacy",
      function: "mastery_cnt",
      border: [117, 195, 217],
      background: [196, 242, 255]
    },
    functions: {
      label: "Functions of Communication",
      function: "mastery_cnt",
      border: [119, 202, 209],
      background: [196, 250, 255]
    },
    rules: {
      label: "Rules of Social Interaction in Conversation",
      function: "mastery_cnt",
      border: [124, 217, 207],
      background: [207, 255, 250]
    },
    aac_receptive: {
      label: "AAC: Receptive Strategies",
      function: "mastery_cnt",
      border: [110, 186, 165],
      background: [188, 245, 229]
    },
    aac_expressive: {
      label: "AAC: Expressive Modes and Strategies",
      function: "mastery_cnt",
      border: [100, 179, 134],
      background: [171, 245, 203]
    },
    aac_motor: {
      label: "AAC: Motor Access",
      function: "mastery_cnt",
      border: [83, 181, 108],
      background: [154, 230, 173]
    },
    impairments: {
      label: "Impairments in Body Functions that Limit Communication",
      function: "mastery_cnt",
      border: [84, 156, 89],
      background: [162, 224, 166]
    },
    physical: {
      label: "Physical Environment",
      function: "mastery_cnt",
      border: [77, 133, 72],
      background: [158, 224, 153]
    },
    at: {
      label: "Assistive Technology",
      function: "mastery_cnt",
      border: [77, 133, 72],
      background: [158, 224, 153]
    },
    people: {
      label: "People",
      function: "mastery_cnt",
      border: [77, 133, 72],
      background: [158, 224, 153]
    },
    services: {
      label: "Services and Policies",
      function: "mastery_cnt",
      border: [77, 133, 72],
      background: [158, 224, 153]
    },
  },
  answer_blocks: {
    limitations: {
      type: 'multiple_choice',
      manual_selection: "Prioritize for Instruction",
      answers: [
        {id: 'dunno', label: "Don't Know", score: 0, skip: true},
        {id: 'na', label: "Not Applicable", score: 0, skip: true},
        {id: 'above', label: "Skills Above Typical Peer", score: 6, mastery: true},
        {id: 'none', label: "No Limitation", score: 5, mastery: true},
        {id: 'mild', label: "Mild Limitation", score: 4, mastery: true},
        {id: 'moderate', label: "Moderate Limitation", score: 3},
        {id: 'severe', label: "Severe Limitation", score: 2},
        {id: 'complete', label: "Complete Limitation", score: 1},
      ]
    },
    help_hindrance: {
      type: 'multiple_choice',
      manual_selection: "Prioritize for Instruction",
      answers: [
        {id: 'na', label: "Not Applicable", score: 0, skip: true},
        {id: 'help', label: "Facilitator/Help", score: 1, mastery: true},
        {id: 'hindrance', label: "Barrier/Hindrance", score: 0},
      ]
    },
    free_response: {
      type: 'text',
      manual_selection: "Prioritize for Instruction",
      hint: "Other examples, and observations"
    }
  },
  question_groups: [
    {
      id: "school",
      label: "School-Related Activities",
      border: [26, 55, 130],
      background: [171, 194, 255],
      sub_label: "Restrictions in Participation Caused by Communication Limitations",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q1",
          label: "Playing with others as an educational activity",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q2",
          label: "Classroom activities (eg.,attending classes and interacting appropriately to fulfill the duties of being a student)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q3",
          label: "Communal activities (classroom games, assemblies, eating in the cafeteria, field trips)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q4",
          label: "Recreation (physical education, recess, playground games)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q5",
          label: "Creative activities (art classes, orchestra/band, chorus)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q6",
          label: "Civic activities (school paper, student government, school club, serving as student aid, safety patrol member)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q7",
          label: "Other academic activities (computer labs, science labs, library use, gifted/talented classes)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q8",
          label: "Social activities (school dances, pep rallies, hanging out with friends at school)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q9",
          label: "Social independence activities (driver's ed., home economics/shop, after school organized sports)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q10",
          label: "Vocational training (community work experience, community college, community based recreation)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q11",
          label: "Transition planning (independent living skills practicum, transportation training)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q12",
          label: "Looking after one's safety at school (avoiding risks that can lead to injury or harm)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q13",
          label: "Maintaining one's health (caring for oneself by being aware of and doing what is required for one's health)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q14",
          label: "Other school related activities? (describe)",
          answer_block: "free_response",
          score_categories: {
            school: 1.0,
          }
        },
      ]      
    },
    {
      id: "interpersonal",
      label: "Interpersonal Interaction and Relationships",
      border: [90, 117, 150],
      background: [173, 203, 240],
      questions: [
        {
          id: "q15",
          label: "Relating to teachers and other adults at school",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q16",
          label: "Relating to peers at school",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q17",
          label: "Making and maintaining friendships",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q18",
          label: "Dating or engaging in romantic relationships",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q19",
          label: "Relating to persons in the home (family or other coinhabitants)",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q20",
          label: "Relating to new people",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q21",
          label: "Other interaction and relationships? (describe)",
          answer_block: "free_response",
          score_categories: {
            interpersonal: 1.0,
          }
        },
      ]
    },
    {
      id: "receptive",
      label: "Receptive Language and Literacy",
      border: [103, 161, 184],
      background: [194, 236, 252],
      sub_label: "Communication Limitations",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q22",
          label: "Intentionally attending to human touch, face and/or voice",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q23",
          label: "Comprehending the meaning of single spoken words",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q24",
          label: "Comprehending the meaning of 2-3 spoken word phrases",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q25",
          label: "Comprehending the meaning of spoken sentences",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q26",
          label: "Comprehending the meaning of a spoken narrative",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q27",
          label: "Understanding sound/symbol relationships (sounding out letters)",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q28",
          label: "Comprehending the meaning of single written words",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q29",
          label: "Comprehending the meaning of written sentences",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q30",
          label: "Comprehending the meaning of a written narrative",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q31",
          label: "Other receptive skills? (describe)",
          answer_block: "free_response",
          score_categories: {
            receptive: 1.0,
          }
        },
      ]
    },
    {
      id: "expressive",
      label: "Expressive Language and Literacy",
      border: [117, 195, 217],
      background: [196, 242, 255],
      questions: [
        {
          id: "q32",
          label: "Using body language, facial expressions and gestures to communicate",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q33",
          label: "Using non-speech vocalizations for communication (e.g. laughing, cooing, \"hmmm\")",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q34",
          label: "Using single spoken words to communicate (includes word approximations)",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q35",
          label: "Combining spoken words into 2-3 word phrases",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q36",
          label: "Using sentences with appropriate syntax in spoken communication",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q37",
          label: "Combining sentences to convey a cohesive topic in spoken communication",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q38",
          label: "Choosing correct spoken and/or written words",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q39",
          label: "Demonstrating knowledge of sound/symbol relationships (writing a letter for a given sound)",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q40",
          label: "Using single written words to communicate",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q41",
          label: "Using written sentences to communicate",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q42",
          label: " Using a written narrative to communicate",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q43",
          label: " Using correct spelling conventions",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q44",
          label: "Other expressive skills? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "functions",
      label: "Functions of Communication",
      border: [119, 202, 209],
      background: [196, 250, 255],
      questions: [
        {
          id: "q45",
          label: " Refusing or rejecting something",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q46",
          label: "Gaining the attention of another person",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q47",
          label: "Requesting more",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q48",
          label: "Requesting something specific",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q49",
          label: " Directing another person's attention",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q50",
          label: " Using social conventions (e.g., hello, good-bye, polite forms of address, please and thank you)",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q51",
          label: "Exchanging information (e.g. asking, answering, naming, or commenting)",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q52",
          label: "Telling someone to do something",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q53",
          label: "Conveying an abstract idea",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q54",
          label: "Other purposes for communication? (describe)",
          answer_block: "free_response",
        },
      ]
    },
    {
      id: "rules",
      label: "Rules of Social Interaction in Conversation",
      border: [124, 217, 207],
      background: [207, 255, 250],
      questions: [
        {
          id: "q55",
          label: " Orienting towards communication partner through eye contact or body positioning",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q56",
          label: " Making and responding to physical contact appropriately",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q57",
          label: "Keeping socially appropriate distance between oneself and others",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q58",
          label: "Adjusting language according to one's social role when interacting with others (e.g., \"What's up?\" to a friend versus \"How are you, sir?\" to an authority)",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q59",
          label: " Starting a conversation appropriately",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q60",
          label: " Sustaining a conversation appropriately (includes turn taking skills)",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q61",
          label: " Revising conversation or repairing breakdowns during interaction appropriately (e.g., able to repeat, restate, or explain so as to successfully communicate)",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q62",
          label: " Ending a conversation appropriately",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q63",
          label: "Conversing in a group",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q64",
          label: "Other social interaction rules? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "aac_receptive",
      label: "Augmentation & Alternative Communication: Receptive Strategies",
      border: [110, 186, 165],
      background: [188, 245, 229],
      questions: [
        {
          id: "q65",
          label: " Comprehending the meaning of body gestures (e.g., facial expressions, posture, hand gestures, movements)",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q66",
          label: "Comprehending 3-dimensional objects/representations used to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q67",
          label: "Comprehending the meaning of drawings and photographs used to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q68",
          label: "Comprehending the meaning of manual sign language (e.g., ASL, finger spelling, signed English)",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q69",
          label: "Comprehending the meaning of AAC signs/symbols (e.g., MinSpeak icons, Bliss symbols, Rebus symbols, PECS)",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q70",
          label: "Other AAC receptive strategies? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "aac_expressive",
      label: "Augmentative & Alternative Communication: Expressive Modes and Strategies",
      border: [100, 179, 134],
      background: [171, 245, 203],
      questions: [
        {
          id: "q71",
          label: "Using 3-dimensional objects/representations to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q72",
          label: "Using drawings, pictures or photographs to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q73",
          label: "Using manual sign language to communicate (e.g., ASL, finger spelling, signed English)",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q74",
          label: "Using Braille to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q75",
          label: "Using communication devices and technologies",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q76",
          label: "Using single AAC signs/symbols to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q77",
          label: "Combining AAC signs/symbols to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q78",
          label: "Conveying a cohesive topic with AAC signs/symbols ",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q79",
          label: "Operating a communication device correctly (e.g., on/off, volume, speed of scanning, rate enhancement)",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q80",
          label: " Knowing how to access needed vocabulary",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q81",
          label: "Changing communication strategies depending on social and physical environment (e.g., partner feedback and skills; background noise)",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q82",
          label: " Giving partner instructions when necessary",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q83",
          label: "Expressing the need for additional vocabulary",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q84",
          label: "Other AAC expressive strategies? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "aac_motor",
      label: "Augmentative & Alternative Communication: Motor Access",
      border: [83, 181, 108],
      background: [154, 230, 173],
      questions: [
        {
          id: "q85",
          label: "Control of involuntary movements that may interfere with communication such as tremors, tics, stereotypies, motor perseveration, or mannerisms",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q86",
          label: "Maintaining a body position as needed for communication purposes (including head control)",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q87",
          label: " Control of gross motor skills (upper and lower extremities) needed to use a communication device or materials (e.g., carrying, pushing, pulling, kicking, turning or twisting)",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q88",
          label: "Control of fine motor skills needed to use gestures, manual signs or a specific device to communicate (e.g., grasping, manipulating, picking up and releasing)",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q89",
          label: "Using eye gaze for message selection",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q90",
          label: " Other motor access skills? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "impairments",
      label: "Impairments in Body Functions that Limit Communication",
      border: [84, 156, 89],
      background: [162, 224, 166],
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q91",
          label: "Hearing function",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q92",
          label: "Vision function",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q93",
          label: "Touch functions (e.g., ability to sense surfaces, their texture or quality; includes numbness, anesthesia, or tingling)",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q94",
          label: "Oral motor function adequate for intelligible speech, including articulation, fluency, resonance, and rate of speech",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q95",
          label: "Respiratory function for communication",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q96",
          label: " Intellectual functions",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q97",
          label: "General gross and fine motor functions",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q98",
          label: "Other body functions? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "physical",
      label: "Physical Environment",
      border: [84, 156, 89],
      background: [162, 224, 166],
      sub_label: "Environmental Factors that Serve as Barriers or Facilitators for Communication",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q99",
          label: "Sound intensity and/or sound quality",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q100",
          label: "Light intensity or quality",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q101",
          label: "Arrangement of physical space",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q102",
          label: "Level of surrounding activity",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q103",
          label: "Other physical environment factors? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "at",
      label: "Assistive Technology",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "q104",
          label: "Adapted or specially designed HIGH tech products/technology developed for the purpose of improving communication (e..g., speech generating device, FM system, specialized writing device)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q105",
          label: "Adapted or specially designed LOW tech products/technology developed for the purpose of improving communication (e.g., systems that have no electricity/battery requirement, such as a picture communication board)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q106",
          label: " General products and technology for communication (e.g., computers, telephones) used by the general public",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q107",
          label: "Assistive products and technology for education (for acquisition of knowledge, expertise or skills)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q108",
          label: "Assistive products and technology for mobility and transportation",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q109",
          label: "Assistive products and technology for generalized use in school (e.g., prosthetic and orthotic devices; glasses, hearing aides, cochlear implants)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q110",
          label: "Other assistive technology? (describe)",
          answer_block: 'free_response'
        },
      ]
    },    {
      id: "people",
      label: "People",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "q111",
          label: "Providing physical support at school (e.g., supporting body posture appropriately, making glasses available)",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q112",
          label: "Providing emotional support at school",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q113",
          label: "Having skills needed to support communication in school (e.g., knowing manual sign language, knowing how to use the communication device)",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q114",
          label: "Providing physical support at home",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q115",
          label: "Providing emotional support at home",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q116",
          label: "Having skills needed to support communication at home (e.g., knowing manual sign language, knowing how to use the communication device)",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q117",
          label: "Other support by people at home or school? (describe)",
          answer_block: 'free_response'
        },
      ]
    },    {
      id: "services",
      label: "Services and Policies",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "q118",
          label: "Special education services (includes therapy and providers of services)",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q119",
          label: "Regular education services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q120",
          label: "School transportation services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q121",
          label: "School food services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q122",
          label: "School social services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q123",
          label: "Before and after school care services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q124",
          label: "School-based health services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q125",
          label: "Special education policies (e.g., school and/or family financial responsabilities for purchasing and maintaining AAC equipment)",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q126",
          label: "Other school services and/or policies? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
  ],
  report_segments: [
    {
      label: "Prioritized Categories",
      type: "manual_categories",
      score_categories: ["school", "interpersonal", "receptive", "expressive", "functions", "rules", "aac_receptive", "aac_expressive", "aac_motor", "impairments", "physical", "at", "people", "services"],
      summary: true,
    },
    {
      type: "weights",
      score_categories: ["school", "interpersonal", "receptive", "expressive", "functions", "rules", "aac_receptive", "aac_expressive", "aac_motor", "impairments", "physical", "at", "people", "services"]
    },
    {
      type: "raw",
    }
  ]
};
*/
var commgrid = {
  name: "CommGrid",
  id: "commgrid",
  version: "0.1",
  type: 'communicator',
  description: [""
  ],
  instructions: [""
  ],
  score_categories: {
    score_row_a: { each: 'circle' },
    score_row_b: { },
    score_row_c: { },
    score_row_d: { },
    score_row_e: { },
    score_col_1: { },
    score_col_2: { },
    score_col_3: { },
    score_col_4: { },
    score_col_5: { },
    score_col_6: { },
    score_col_7: { },
    score_col_8: { },
    score_cell_a1: { },
    score_cell_a2: { },
    score_cell_a3: { },
    score_cell_a7: { },
    score_cell_a8: { },
    score_cell_b1: { },
    score_cell_b2: { },
    score_cell_b3: { },
    score_cell_b4: { },
    score_cell_b5: { },
    score_cell_b6: { },
    score_cell_b7: { },
    score_cell_b8: { },
    score_cell_c1: { },
    score_cell_c2: { },
    score_cell_c3: { },
    score_cell_c4: { },
    score_cell_c5: { },
    score_cell_c6: { },
    score_cell_c7: { },
    score_cell_c8: { },
    score_cell_d1: { },
    score_cell_d2: { },
    score_cell_d3: { },
    score_cell_d4: { },
    score_cell_d5: { },
    score_cell_d6: { },
    score_cell_d7: { },
    score_cell_d8: { },
    score_cell_e1: { },
    score_cell_e2: { },
    score_cell_e3: { },
    score_cell_e4: { },
    score_cell_e5: { },
    score_cell_e6: { },
    score_cell_e7: { },
    score_cell_e8: { },
  },
  answer_blocks: {
    list_circles: {
      type: 'add_from_dropdown',
      answers: [
        {id: 'home', label: "Home"},
        {id: 'school', label: "School"},
        {id: 'work', label: "Work"},
      ],
      initial: ['home', 'paid', 'unfamiliar'],
      allow_other: true
    },
    // mastered across contexts, mastered across users, use inconsistently, not used
    // default: 'not_used'
  },
  clusters: [
    {
      id: 'circles',
      label: "For the social circle: %{val}",
      foreach: 'circles'
    }
  ],
  question_groups: [
    {
      id: 'preface',
      label: "Introduction",
      // TODO: checkbox saying whether you're a paid worker
      questions: [
        {
          id: 'circles',
          answer_block: 'list_circles'
        }
      ]
    },
    {
      id: 'circle_notes',
      cluster: 'circles',
    },
    {
      id: 'section_1',
      cluster: 'circles',
      questions: [

      ]
    },
    {
      id: 'section_2',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: 'section_3',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: 'section_4',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: 'section_5',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: 'section_6',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: 'section_7',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: 'section_8',
      cluster: 'circles',
      questions: [
        
      ]
    },
    {
      id: "school",
      label: "School-Related Activities",
      border: [26, 55, 130],
      background: [171, 194, 255],
      header: "Restrictions in Participation Caused by Communication Limitations",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q1",
          label: "Playing with others as an educational activity",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q2",
          label: "Classroom activities (eg.,attending classes and interacting appropriately to fulfill the duties of being a student)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q3",
          label: "Communal activities (classroom games, assemblies, eating in the cafeteria, field trips)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q4",
          label: "Recreation (physical education, recess, playground games)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q5",
          label: "Creative activities (art classes, orchestra/band, chorus)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q6",
          label: "Civic activities (school paper, student government, school club, serving as student aid, safety patrol member)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q7",
          label: "Other academic activities (computer labs, science labs, library use, gifted/talented classes)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q8",
          label: "Social activities (school dances, pep rallies, hanging out with friends at school)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q9",
          label: "Social independence activities (driver's ed., home economics/shop, after school organized sports)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q10",
          label: "Vocational training (community work experience, community college, community based recreation)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q11",
          label: "Transition planning (independent living skills practicum, transportation training)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q12",
          label: "Looking after one's safety at school (avoiding risks that can lead to injury or harm)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q13",
          label: "Maintaining one's health (caring for oneself by being aware of and doing what is required for one's health)",
          answer_block: "limitations",
          score_categories: {
            school: 1.0,
          }
        },
        {
          id: "q14",
          label: "Other school related activities? (describe)",
          answer_block: "free_response",
          score_categories: {
            school: 1.0,
          }
        },
      ]      
    },
    {
      id: "interpersonal",
      label: "Interpersonal Interaction and Relationships",
      border: [90, 117, 150],
      background: [173, 203, 240],
      questions: [
        {
          id: "q15",
          label: "Relating to teachers and other adults at school",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q16",
          label: "Relating to peers at school",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q17",
          label: "Making and maintaining friendships",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q18",
          label: "Dating or engaging in romantic relationships",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q19",
          label: "Relating to persons in the home (family or other coinhabitants)",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q20",
          label: "Relating to new people",
          answer_block: "limitations",
          score_categories: {
            interpersonal: 1.0,
          }
        },
        {
          id: "q21",
          label: "Other interaction and relationships? (describe)",
          answer_block: "free_response",
          score_categories: {
            interpersonal: 1.0,
          }
        },
      ]
    },
    {
      id: "receptive",
      label: "Receptive Language and Literacy",
      border: [103, 161, 184],
      background: [194, 236, 252],
      header: "Communication Limitations",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q22",
          label: "Intentionally attending to human touch, face and/or voice",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q23",
          label: "Comprehending the meaning of single spoken words",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q24",
          label: "Comprehending the meaning of 2-3 spoken word phrases",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q25",
          label: "Comprehending the meaning of spoken sentences",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q26",
          label: "Comprehending the meaning of a spoken narrative",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q27",
          label: "Understanding sound/symbol relationships (sounding out letters)",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q28",
          label: "Comprehending the meaning of single written words",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q29",
          label: "Comprehending the meaning of written sentences",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q30",
          label: "Comprehending the meaning of a written narrative",
          answer_block: "limitations",
          score_categories: {
            receptive: 1.0,
          }
        },
        {
          id: "q31",
          label: "Other receptive skills? (describe)",
          answer_block: "free_response",
          score_categories: {
            receptive: 1.0,
          }
        },
      ]
    },
    {
      id: "expressive",
      label: "Expressive Language and Literacy",
      border: [117, 195, 217],
      background: [196, 242, 255],
      questions: [
        {
          id: "q32",
          label: "Using body language, facial expressions and gestures to communicate",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q33",
          label: "Using non-speech vocalizations for communication (e.g. laughing, cooing, \"hmmm\")",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q34",
          label: "Using single spoken words to communicate (includes word approximations)",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q35",
          label: "Combining spoken words into 2-3 word phrases",
          answer_block: "limitations",
          score_categories: {
            expressive: 1.0,
          }
        },
        {
          id: "q36",
          label: "Using sentences with appropriate syntax in spoken communication",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q37",
          label: "Combining sentences to convey a cohesive topic in spoken communication",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q38",
          label: "Choosing correct spoken and/or written words",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q39",
          label: "Demonstrating knowledge of sound/symbol relationships (writing a letter for a given sound)",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q40",
          label: "Using single written words to communicate",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q41",
          label: "Using written sentences to communicate",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q42",
          label: " Using a written narrative to communicate",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q43",
          label: " Using correct spelling conventions",
          answer_block: "limitations",
          score_categories: {
            cole: 1.0,
            stage_4: 1.0,
          }
        },
        {
          id: "q44",
          label: "Other expressive skills? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "functions",
      label: "Functions of Communication",
      border: [119, 202, 209],
      background: [196, 250, 255],
      questions: [
        {
          id: "q45",
          label: " Refusing or rejecting something",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q46",
          label: "Gaining the attention of another person",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q47",
          label: "Requesting more",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q48",
          label: "Requesting something specific",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q49",
          label: " Directing another person's attention",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q50",
          label: " Using social conventions (e.g., hello, good-bye, polite forms of address, please and thank you)",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q51",
          label: "Exchanging information (e.g. asking, answering, naming, or commenting)",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q52",
          label: "Telling someone to do something",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q53",
          label: "Conveying an abstract idea",
          answer_block: "limitations",
          score_categories: {
            functions: 1.0,
          }
        },
        {
          id: "q54",
          label: "Other purposes for communication? (describe)",
          answer_block: "free_response",
        },
      ]
    },
    {
      id: "rules",
      label: "Rules of Social Interaction in Conversation",
      border: [124, 217, 207],
      background: [207, 255, 250],
      questions: [
        {
          id: "q55",
          label: " Orienting towards communication partner through eye contact or body positioning",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q56",
          label: " Making and responding to physical contact appropriately",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q57",
          label: "Keeping socially appropriate distance between oneself and others",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q58",
          label: "Adjusting language according to one's social role when interacting with others (e.g., \"What's up?\" to a friend versus \"How are you, sir?\" to an authority)",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q59",
          label: " Starting a conversation appropriately",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q60",
          label: " Sustaining a conversation appropriately (includes turn taking skills)",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q61",
          label: " Revising conversation or repairing breakdowns during interaction appropriately (e.g., able to repeat, restate, or explain so as to successfully communicate)",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q62",
          label: " Ending a conversation appropriately",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q63",
          label: "Conversing in a group",
          answer_block: "limitations",
          score_categories: {
            rules: 1.0,
          }
        },
        {
          id: "q64",
          label: "Other social interaction rules? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "aac_receptive",
      label: "Augmentation & Alternative Communication: Receptive Strategies",
      border: [110, 186, 165],
      background: [188, 245, 229],
      questions: [
        {
          id: "q65",
          label: " Comprehending the meaning of body gestures (e.g., facial expressions, posture, hand gestures, movements)",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q66",
          label: "Comprehending 3-dimensional objects/representations used to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q67",
          label: "Comprehending the meaning of drawings and photographs used to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q68",
          label: "Comprehending the meaning of manual sign language (e.g., ASL, finger spelling, signed English)",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q69",
          label: "Comprehending the meaning of AAC signs/symbols (e.g., MinSpeak icons, Bliss symbols, Rebus symbols, PECS)",
          answer_block: "limitations",
          score_categories: {
            aac_receptive: 1.0,
          }
        },
        {
          id: "q70",
          label: "Other AAC receptive strategies? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "aac_expressive",
      label: "Augmentative & Alternative Communication: Expressive Modes and Strategies",
      border: [100, 179, 134],
      background: [171, 245, 203],
      questions: [
        {
          id: "q71",
          label: "Using 3-dimensional objects/representations to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q72",
          label: "Using drawings, pictures or photographs to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q73",
          label: "Using manual sign language to communicate (e.g., ASL, finger spelling, signed English)",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q74",
          label: "Using Braille to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q75",
          label: "Using communication devices and technologies",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q76",
          label: "Using single AAC signs/symbols to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q77",
          label: "Combining AAC signs/symbols to communicate",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q78",
          label: "Conveying a cohesive topic with AAC signs/symbols ",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q79",
          label: "Operating a communication device correctly (e.g., on/off, volume, speed of scanning, rate enhancement)",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q80",
          label: " Knowing how to access needed vocabulary",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q81",
          label: "Changing communication strategies depending on social and physical environment (e.g., partner feedback and skills; background noise)",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q82",
          label: " Giving partner instructions when necessary",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q83",
          label: "Expressing the need for additional vocabulary",
          answer_block: "limitations",
          score_categories: {
            aac_expressive: 1.0,
          }
        },
        {
          id: "q84",
          label: "Other AAC expressive strategies? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "aac_motor",
      label: "Augmentative & Alternative Communication: Motor Access",
      border: [83, 181, 108],
      background: [154, 230, 173],
      questions: [
        {
          id: "q85",
          label: "Control of involuntary movements that may interfere with communication such as tremors, tics, stereotypies, motor perseveration, or mannerisms",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q86",
          label: "Maintaining a body position as needed for communication purposes (including head control)",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q87",
          label: " Control of gross motor skills (upper and lower extremities) needed to use a communication device or materials (e.g., carrying, pushing, pulling, kicking, turning or twisting)",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q88",
          label: "Control of fine motor skills needed to use gestures, manual signs or a specific device to communicate (e.g., grasping, manipulating, picking up and releasing)",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q89",
          label: "Using eye gaze for message selection",
          answer_block: "limitations",
          score_categories: {
            aac_motor: 1.0,
          }
        },
        {
          id: "q90",
          label: " Other motor access skills? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "impairments",
      label: "Impairments in Body Functions that Limit Communication",
      border: [84, 156, 89],
      background: [162, 224, 166],
      header: "Impairments in Body Functions that Limit Communication",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q91",
          label: "Hearing function",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q92",
          label: "Vision function",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q93",
          label: "Touch functions (e.g., ability to sense surfaces, their texture or quality; includes numbness, anesthesia, or tingling)",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q94",
          label: "Oral motor function adequate for intelligible speech, including articulation, fluency, resonance, and rate of speech",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q95",
          label: "Respiratory function for communication",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q96",
          label: " Intellectual functions",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q97",
          label: "General gross and fine motor functions",
          answer_block: "limitations",
          score_categories: {
            impairments: 1.0,
          }
        },
        {
          id: "q98",
          label: "Other body functions? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "physical",
      label: "Physical Environment",
      border: [84, 156, 89],
      background: [162, 224, 166],
      header: "Environmental Factors that Serve as Barriers or Facilitators for Communication",
      header_border: [26, 55, 130],
      header_background: [171, 194, 255],
      questions: [
        {
          id: "q99",
          label: "Sound intensity and/or sound quality",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q100",
          label: "Light intensity or quality",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q101",
          label: "Arrangement of physical space",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q102",
          label: "Level of surrounding activity",
          answer_block: "help_hindrance",
          score_categories: {
            physical: 1.0,
          }
        },
        {
          id: "q103",
          label: "Other physical environment factors? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
    {
      id: "at",
      label: "Assistive Technology",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "q104",
          label: "Adapted or specially designed HIGH tech products/technology developed for the purpose of improving communication (e..g., speech generating device, FM system, specialized writing device)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q105",
          label: "Adapted or specially designed LOW tech products/technology developed for the purpose of improving communication (e.g., systems that have no electricity/battery requirement, such as a picture communication board)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q106",
          label: " General products and technology for communication (e.g., computers, telephones) used by the general public",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q107",
          label: "Assistive products and technology for education (for acquisition of knowledge, expertise or skills)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q108",
          label: "Assistive products and technology for mobility and transportation",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q109",
          label: "Assistive products and technology for generalized use in school (e.g., prosthetic and orthotic devices; glasses, hearing aides, cochlear implants)",
          answer_block: "help_hindrance",
          score_categories: {
            at: 1.0,
          }
        },
        {
          id: "q110",
          label: "Other assistive technology? (describe)",
          answer_block: 'free_response'
        },
      ]
    },    {
      id: "people",
      label: "People",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "q111",
          label: "Providing physical support at school (e.g., supporting body posture appropriately, making glasses available)",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q112",
          label: "Providing emotional support at school",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q113",
          label: "Having skills needed to support communication in school (e.g., knowing manual sign language, knowing how to use the communication device)",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q114",
          label: "Providing physical support at home",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q115",
          label: "Providing emotional support at home",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q116",
          label: "Having skills needed to support communication at home (e.g., knowing manual sign language, knowing how to use the communication device)",
          answer_block: "help_hindrance",
          score_categories: {
            people: 1.0,
          }
        },
        {
          id: "q117",
          label: "Other support by people at home or school? (describe)",
          answer_block: 'free_response'
        },
      ]
    },    {
      id: "services",
      label: "Services and Policies",
      border: [84, 156, 89],
      background: [162, 224, 166],
      questions: [
        {
          id: "q118",
          label: "Special education services (includes therapy and providers of services)",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q119",
          label: "Regular education services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q120",
          label: "School transportation services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q121",
          label: "School food services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q122",
          label: "School social services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q123",
          label: "Before and after school care services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q124",
          label: "School-based health services",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q125",
          label: "Special education policies (e.g., school and/or family financial responsabilities for purchasing and maintaining AAC equipment)",
          answer_block: "help_hindrance",
          score_categories: {
            services: 1.0,
          }
        },
        {
          id: "q126",
          label: "Other school services and/or policies? (describe)",
          answer_block: 'free_response'
        },
      ]
    },
  ],
  report_segments: [
    {
      label: "Prioritized Categories",
      type: "manual_categories",
      score_categories: ["school", "interpersonal", "receptive", "expressive", "functions", "rules", "aac_receptive", "aac_expressive", "aac_motor", "impairments", "physical", "at", "people", "services"],
      summary: true,
    },
    {
      type: "weights",
      score_categories: ["school", "interpersonal", "receptive", "expressive", "functions", "rules", "aac_receptive", "aac_expressive", "aac_motor", "impairments", "physical", "at", "people", "services"]
    },
    {
      type: "raw",
    }
  ]
};

export default profiles;
