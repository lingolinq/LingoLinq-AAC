import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';

describe('NewBoardController', 'controller:new-board', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import modal from '../utils/modal';
// import LingoLinq from '../app';
// import app_state from '../utils/app_state';
// import i18n from '../utils/i18n';
// import editManager from '../utils/edit_manager';
// 
// export default modal.ModalController.extend({
//   needs: 'application',
//   license_options: LingoLinq.licenseOptions,
//   attributable_license_type: function() {
//     if(this.get('license') && this.get('license.type') != 'private') {
//       this.set('license.author_name', app_state.get('currentUser.name'));
//       this.set('license.author_url',app_state.get('currentUser.profile_url'));
//     }
//     return this.get('license.type') != 'private';
//   }.property('license.type'),
//   label_count: function() {
//     console.log("count!");
//     var str = this.get('grid.labels') || "";
//     var lines = str.split(/\n|,\s*/);
//     return lines.filter(function(l) { return l && !l.match(/^\s+$/); }).length;
//   }.property('grid', 'grid.labels'),
//   too_many_labels: function() {
//     return (this.get('label_count') || 0) > (parseInt(this.get('grid.rows'), 10) * parseInt(this.get('grid.columns'), 10));
//   }.property('label_count', 'grid.rows', 'grid.columns'),
//   speech_enabled: function() {
//     return this.get('speech');
//   }.property('speech'),
//   opening: function() {
//     this.set('model', LingoLinq.store.createRecord('board', {public: true, license: {type: 'private'}, grid: {rows: 2, columns: 4}}));
//     if(window.webkitSpeechRecognition) {
//       var speech = new window.webkitSpeechRecognition();
//       if(speech) {
//         speech.continuous = true;
//         this.set('speech', {engine: speech});
//       }
//     }
//   },
//   closing: function() {
//     this.send('stop_recording');
//   },
//   actions: {
//     plus_minus: function(direction, attribute) {
//       var value = parseInt(this.get(attribute), 10);
//       if(direction == 'minus') {
//         value = value - 1;
//       } else {
//         value = value + 1;
//       }
//       value = Math.min(Math.max(1, value), 20);
//       this.set(attribute, value);
//     },
//     more_options: function() {
//       this.set('more_options', true);
//     },
//     pick_core: function() {
//       this.send('stop_recording');
//       this.set('core_lists', i18n.get('core_words'));
//       this.set('core_words', i18n.core_words_map());
//     },
//     record_words: function() {
//       var speech = this.get('speech');
//       var _this = this;
//       if(speech && speech.engine) {
//         speech.engine.onresult = function(event) {
//           var result = event.results[event.resultIndex];
//           if(result && result[0] && result[0].transcript) {
//             var text = result[0].transcript.replace(/^\s+/, '');
//             _this.send('add_recorded_word', text);
//           }
//         };
//         speech.engine.onaudiostart = function(event) {
//           if(_this.get('speech')) {
//             _this.set('speech.recording', true);
//           }
//         };
//         speech.engine.onend = function(event) {
//           console.log("you are done talking");
//           if(_this.get('speech') && _this.get('speech.resume')) {
//             _this.set('speech.resume', false);
//             speech.engine.start();
//           }
//         };
//         speech.engine.onsoundstart = function() {
//           console.log('sound!');
//         };
//         speech.engine.onsoundend = function() {
//           console.log('no more sound...');
//         };
//         speech.engine.start();
//         if(this.get('speech')) {
//           this.set('speech.almost_recording', true);
//           this.set('speech.words', []);
//           this.set('core_lists', null);
//           this.set('core_words', null);
//         }
//       }
//     },
//     stop_recording: function() {
//       if(this.get('speech') && this.get('speech.engine')) {
//         this.set('speech.resume', false);
//         this.get('speech.engine').abort();
//       }
//       if(this.get('speech')) {
//         this.set('speech.recording', false);
//         this.set('speech.almost_recording', false);
//       }
//     },
//     next_word: function() {
//       if(this.get('speech') && this.get('speech.engine')) {
//         var _this = this;
//         this.set('speech.resume', true);
//         this.get('speech.engine').stop();
//       }
//     },
//     remove_word: function(id) {
//       var lines = (this.get('grid.labels') || "").split(/\n|,\s*/);
//       var words = [].concat(this.get('speech.words') || []);
//       var new_words = [];
//       var word = {};
//       for(var idx = 0; idx < words.length; idx++) {
//         if(words[idx].id == id) {
//           word = words[idx];
//         } else {
//           new_words.push(words[idx]);
//         }
//       }
//       var new_lines = [];
//       var removed = false;
//       for(var idx = 0; idx < lines.length; idx++) {
//         if(!lines[idx] || lines[idx].match(/^\s+$/)) {
//         } else if(!removed && lines[idx] == word.label) {
//           // only remove once I guess
//           removed = true;
//         } else {
//           new_lines.push(lines[idx]);
//         }
//       }
//       if(this.get('speech')) {
//         this.set('speech.words', new_words);
//         this.set('grid.labels', new_lines.join("\n"));
//       }
//     },
//     add_recorded_word: function(str) {
//       var lines = (this.get('grid.labels') || "").split(/\n|,\s*/);
//       var words = [].concat(this.get('speech.words') || []);
//       var id = Math.random();
//       words.push({id: id, label: str});
//       var new_lines = [];
//       for(var idx = 0; idx < lines.length; idx++) {
//         if(!lines[idx] || lines[idx].match(/^\s+$/)) {
//         } else {
//           new_lines.push(lines[idx]);
//         }
//       }
//       new_lines.push(str);
//       if(this.get('speech')) {
//         this.set('speech.words', words);
//         this.set('grid.labels', new_lines.join("\n"));
//       }
//     },
//     enable_word: function(id) {
//       var words = this.get('core_words');
//       var enabled_words = [];
//       var disable_word = null;
//       for(var idx = 0; idx < words.length; idx++) {
//         if(words[idx].id == id) {
//           if(Ember.get(words[idx], 'active')) {
//             Ember.set(words[idx], 'active', false);
//             disable_word = words[idx].label;
//           } else {
//             Ember.set(words[idx], 'active', true);
//           }
//         }
//         if(Ember.get(words[idx], 'active')) {
//           enabled_words.push(words[idx].label);
//         }
//       }
//       var lines = (this.get('grid.labels') || "").split(/\n|,\s*/);
//       var new_lines = [];
//       var word_filter = function(w) { return w != lines[idx]; };
//       for(var idx = 0; idx < lines.length; idx++) {
//         if(disable_word && lines[idx] == disable_word) {
//           // only remove once I guess
//           disable_word = null;
//         } else if(!lines[idx] || lines[idx].match(/^\s+$/)) {
//         } else {
//           new_lines.push(lines[idx]);
//           if(enabled_words.indexOf(lines[idx]) != -1) {
//             enabled_words = enabled_words.filter(word_filter);
//           }
//         }
//       }
//       for(var idx = 0; idx < enabled_words.length; idx++) {
//         new_lines.push(enabled_words[idx]);
//       }
//       // TODO: one-per-line is long and not terribly readable. maybe make commas the default?
//       // in that case it might make sense to invert the button-population algorithm 
//       // (right now it's vertical-first)
//       this.set('grid.labels', new_lines.join("\n"));
//     },
//     saveBoard: function(event) {
//       var _this = this;
//       if(this.get('license')) {
//         this.set('license.copyright_notice_url', LingoLinq.licenseOptions.license_url(this.get('license.type')));
//       }
//       this.get('model').save().then(function(board) {
//         modal.close(true);
//         editManager.auto_edit(board.get('id'));
//         _this.transitionToRoute('board', board.get('key'));
//       });
//     },
//     hoverGrid: function(row, col) {
//       this.set('previewRows', row);
//       this.set('previewColumns', col);
//     },
//     hoverOffGrid: function() {
//       this.set('previewRows', this.get('grid.rows'));
//       this.set('previewColumns', this.get('grid.columns'));
//     },
//     setGrid: function(row, col) {
//       this.set('grid.rows', row);
//       this.set('grid.columns', col);
//     },
//     pickImageUrl: function(url) {
//       this.set('image_url', url);
//     }
//   },
//   updatePreview: function() {
//     this.set('previewRows', this.get('grid.rows'));
//     this.set('previewColumns', this.get('grid.columns'));
//   }.observes('grid.rows', 'grid.columns'),
//   updateShow: function() {
//     var grid = [];
//     var maxRows = 6, maxColumns = 12;
//     var previewEnabled = this.get('previewRows') <= maxRows && this.get('previewColumns') <= maxColumns;
//     for(var idx = 1; idx <= maxRows; idx++) {
//       var row = [];
//       for(var jdx = 1; jdx <= maxColumns; jdx++) {
//         row.push({
//           row: idx,
//           column: jdx,
//           preview: (previewEnabled && idx <= this.get('previewRows') && jdx <= this.get('previewColumns'))
//         });
//       }
//       grid.push(row);
//     }
//     this.set('showGrid', grid);
//   }.observes('previewRows', 'previewColumns'),
//   iconUrls: LingoLinq.iconUrls
// });