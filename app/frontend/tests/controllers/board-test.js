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
import EmberObject from '@ember/object';

describe('BoardController', 'controller:board', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import boundClasses from '../utils/bound_classes';
// import word_suggestions from '../utils/word_suggestions';
// import editManager from '../utils/edit_manager';
// import LingoLinq from '../app';
// import app_state from '../utils/app_state';
// import capabilities from '../utils/capabilities';
// import i18n from '../utils/i18n';
// import modal from '../utils/modal';
//
// export default EmberObjectController.extend({
//   title: function() {
//     var name = this.get('name');
//     var title = "Board";
//     if(name) {
//       title = title + " - " + name;
//     }
//     return title;
//   }.property('name'),
//   needs: 'application',
//   ordered_buttons: null,
//   processButtons: function() {
//     boundClasses.add_rules(this.get('buttons'));
//     this.computeHeight();
//     if(this.get('word_suggestions')) {
//       var _this = this;
//       _this.set('suggestions', {loading: true});
//       word_suggestions.load().then(function() {
//         _this.set('suggestions', {ready: true});
//         _this.updateSuggestions();
//       }, function() {
//         _this.set('suggestions', {error: true});
//       });
//     }
//     editManager.process_for_displaying();
//   },
//   updateSuggestions: function() {
//     if(!this.get('word_suggestions')) { return; }
//     var _this = this;
//
//     var button_list = this.get('app_state.button_list');
//     var last_button = button_list[button_list.length - 1];
//     var current_button = null;
//     if(last_button && last_button.in_progress) {
//       current_button = last_button;
//       last_button = button_list[button_list.length - 2];
//     }
//     var last_finished_word = ((last_button && (last_button.vocalization || last_button.label)) || "").toLowerCase();
//     var word_in_progress = ((current_button && (current_button.vocalization || current_button.label)) || "").toLowerCase();
//
//     word_suggestions.lookup({
//       last_finished_word: last_finished_word,
//       word_in_progress: word_in_progress
//     }).then(function(result) {
//       _this.set('suggestions.list', result);
//     }, function() {
//       _this.set('suggestions.list', []);
//     });
//   }.observes('app_state.button_list', 'app_state.button_list@each'),
//   saveButtonChanges: function() {
//     var state = editManager.process_for_saving();
//
//     if(this.get('license')) {
//       this.set('license.copyright_notice_url', LingoLinq.licenseOptions.license_url(this.get('license.type')));
//     }
//
//     this.set('buttons', state.buttons);
//     this.set('grid', state.grid);
//     boundClasses.setup(true);
//     this.processButtons();
//     var board = this.get('model');
//     board.save();
//
//     // TODO: on commit, only send attributes that have changed
//     // to prevent stepping on other edits if all you're doing is
//     // updating the name, for example. Side note: this is one
//     // of the things that stresses me out about ember-data, changes
//     // made out from underneath without you knowing. It happened
//     // before, but with all the local caching it's more likely to
//     // happen more often.
//   },
//   height: 400,
//   computeHeight: function() {
//     var height = window.innerHeight;
//     var width = window.innerWidth;
//     this.set('window_inner_width', window.innerWidth);
//     var show_description = !app_state.get('edit_mode') && !app_state.get('speak_mode') && this.get('long_description');
//     var topHeight = LingoLinq.headerHeight + 5;
//     this.set('show_word_suggestions', this.get('word_suggestions') && app_state.get('speak_mode'));
//     if(this.get('show_word_suggestions')) {
//       topHeight = topHeight + 50;
//     }
//     if((!this.get('public') || this.get('license.type') != 'private') && !app_state.get('edit_mode') && !app_state.get('speak_mode')) {
//       show_description = show_description || this.get('name');
//       if(!this.get('public')) {
//         show_description = show_description + " - private";
//       }
//     }
//     if(show_description) {
//       topHeight = topHeight + 30;
//     }
//     this.set('height', height - topHeight);
//     this.set('width', window.innerWidth);
//     this.get('controllers.application').set('sidebar_style', "height: " + (height - topHeight + 20) + "px;");
//     this.set('teaser_description', show_description);
//   }.observes('app_state.speak_mode', 'app_state.edit_mode', 'description'),
//   redraw: function() {
//     var foundy = Math.round(10 * Math.random());
//     var draw_id = Math.random();
//     this.set('last_draw_id', draw_id);
//     var grid = this.get('current_grid');
//     if(!grid) {
//       this.set('image_holder_style', '');
//       return;
//     }
//     var starting_height = Math.floor((this.get('height') / (grid.rows || 2)) * 100) / 100;
//     var starting_width = Math.floor((this.get('width') / (grid.columns || 2)) * 100) / 100;
//     var extra_pad = this.get('extra_pad');
//     var inner_pad = this.get('inner_pad');
//     var double_pad = inner_pad * 2;
//     var radius = 4;
//
//     var currentLabelHeight = this.get('base_text_height') - 3;
//     this.set('text_size', 'normal');
//     if(starting_height < 45) {
//       this.set('text_size', 'really_small_text');
//     } else if(starting_height < 75) {
//       this.set('text_size', 'small_text');
//     }
//
//     var $canvas = $("#board_canvas");
//     // TODO: I commented out the canvas element because, while it was a few
//     // seconds faster rendering a large board, it also causes a lot of headaches with
//     // things like tabindex, edit mode, switch access, etc.
//     if($canvas[0]) {
//       $canvas.attr('width', this.get('width') * 3);
//       $canvas.attr('height', this.get('height') * 3);
//       $canvas.css({width: this.get('width'), height: this.get('height')});
//       var context = $canvas[0].getContext('2d');
//       var width = $canvas[0].width;
//       var height = $canvas[0].height;
//       context.clearRect(0, 0, width, height);
//     }
//     var _this = this;
//     var stretchable = !app_state.get('edit_mode') && app_state.get('currentUser.preferences.stretch_buttons'); // not edit mode and user-enabled
//     var buttons = this.get('ordered_buttons');
//     var ob = this.get('ordered_buttons');
//     var directions = function(ob, i, j) {
//       var res = {};
//       res.up = ob[i - 1] && ob[i - 1][j] && ob[i - 1][j].get('empty_or_hidden');
//       res.upleft = ob[i - 1] && ob[i - 1][j - 1] && ob[i - 1][j - 1].get('empty_or_hidden');
//       res.left = ob[i][j - 1] && ob[i][j - 1].get('empty_or_hidden');
//       res.right = ob[i][j + 1] && ob[i][j + 1].get('empty_or_hidden');
//       res.upright = ob[i - 1] && ob[i - 1][j + 1] && ob[i - 1][j + 1].get('empty_or_hidden');
//       res.down = ob[i + 1] && ob[i + 1][j] && ob[i + 1][j].get('empty_or_hidden');
//       res.downleft = ob[i + 1] && ob[i + 1][j - 1] && ob[i + 1][j - 1].get('empty_or_hidden');
//       res.downright = ob[i + 1] && ob[i + 1][j + 1] && ob[i + 1][j + 1].get('empty_or_hidden');
//       return res;
//     };
//     ob.forEach(function(row, i) {
//       row.forEach(function(button, j) {
//         var button_height = starting_height - (extra_pad * 2);
//         var button_width = starting_width - (extra_pad * 2);
//         var top = extra_pad + (i * starting_height) + inner_pad;
//         var left = extra_pad + (j * starting_width) + inner_pad;
//
//         if(stretchable) {
//           var can_go = directions(ob, i, j);
//           var went_up = false;
//           var went_left = false;
//           if(can_go.up) {
//             if(stretchable == 'prefer_tall' || (can_go.upleft && can_go.upright)) {
//               top = top - (extra_pad + (button_height / 2));
//               button_height = button_height + extra_pad + (button_height / 2);
//               went_up = true;
//               var upper_can_go = directions(ob, i - 1, j);
//               if(upper_can_go.up !== false && stretchable == 'prefer_tall' && !can_go.upright && !can_go.upleft) {
//                 top = top - (extra_pad + (button_height / 2)) + (starting_height / 4);
//                 button_height = button_height + extra_pad + (button_height / 2) - (starting_height / 4);
//               }
//             }
//           }
//           if(can_go.down) {
//             if(stretchable == 'prefer_tall' || (can_go.downleft && can_go.downright)) {
//               button_height = button_height + extra_pad + (button_height / 2);
//               if(went_up) {
//                 button_height = button_height - (starting_height / 4);
//               }
//               var lower_can_go = directions(ob, i + 1, j);
//               if(lower_can_go.down !== false && stretchable == 'prefer_tall' && !can_go.downright && !can_go.downleft) {
//                 button_height = button_height + extra_pad + (button_height / 2) - (starting_height / 4);
//               }
//             }
//           }
//           if(can_go.left) {
//             if(stretchable == 'prefer_wide' || (can_go.upleft && can_go.downleft)) {
//               left = left - (extra_pad + (button_width / 2));
//               button_width = button_width + extra_pad + (button_width / 2);
//               went_left = true;
//               var lefter_can_go = directions(ob, i, j - 1);
//               if(lefter_can_go.left !== false && stretchable == 'prefer_wide' && !can_go.upleft && !can_go.downleft) {
//                 left = left - (extra_pad + (button_width / 2)) + (starting_width / 4);
//                 button_width = button_width + extra_pad + (button_width / 2) - (starting_width / 4);
//               }
//             }
//           }
//           if(can_go.right) {
//             if(stretchable == 'prefer_wide' || (can_go.upright && can_go.downright)) {
//               button_width = button_width + extra_pad + (button_width / 2);
//               if(went_left) {
//                 button_width = button_width - (starting_width / 4);
//               }
//               var righter_can_go = directions(ob, i, j + 1);
//               if(righter_can_go.right !== false && stretchable == 'prefer_wide' && !can_go.upright && !can_go.downright) {
//                 button_width = button_width + extra_pad + (button_width / 2) - (starting_width / 4);
//               }
//             }
//           }
//         }
//         var image_height = button_height - currentLabelHeight - LingoLinq.boxPad - (inner_pad * 2);
//         var image_width = button_width - LingoLinq.boxPad - (inner_pad * 2);
//
//         if(_this.get('text_size') == 'really_small_text') {
//           if(currentLabelHeight > 0) {
//             image_height = image_height + currentLabelHeight - LingoLinq.labelHeight + 25;
//           }
//         } else if(_this.get('text_size') == 'small_text') {
//           if(currentLabelHeight > 0) {
//             image_height = image_height + currentLabelHeight - LingoLinq.labelHeight + 10;
//           }
//         }
//
//         button.set('positioning', {
//           top: top,
//           left: left,
//           width: button_width,
//           height: button_height,
//           image_height: image_height,
//           image_width: image_width,
//           image_square: Math.min(image_height, image_width),
//           border: inner_pad
//         });
//
//         if(context) {
//           var image_left = (button_width - image_height) / 2 - inner_pad;
//           var image_top = inner_pad + 2;
//           var text_top = image_height + image_top + 3;
//
//           context.beginPath();
//           var w = (button_width - double_pad) * 3;
//           var h = (button_height - double_pad) * 3;
//           var x = left * 3;
//           var y = top * 3;
//           var r = radius * 3;
//           context.lineWidth = 3;
//
//           context.moveTo(x + r, y);
//           context.lineTo(x + w - r, y);
//           context.quadraticCurveTo(x + w, y, x + w, y + r);
//           context.lineTo(x + w, y + h - r);
//           context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
//           context.lineTo(x + r, y + h);
//           context.quadraticCurveTo(x, y + h, x, y + h - r);
//           context.lineTo(x, y + r);
//           context.quadraticCurveTo(x, y, x + r, y);
//           context.closePath();
//
//   //           context.rect(left * 3, top * 3, width * 3, height * 3);
//           context.strokeStyle = button.get('border_color') || '#ccc';
//           context.fillStyle = button.get('background_color') || '#fff';
//           if(foundy == j) {
//             context.fillStyle = 'rgb(255, 255, 170)';
//           }
//           context.fill();
//           context.stroke();
//
//           context.save();
//           context.textAlign = 'center';
//           context.textBaseline = 'top';
//           context.font = "30pt Arial";
//           context.rect(left * 3, (top + text_top) * 3, button_width * 3, 60);
//           context.clip();
//           context.fillStyle = '#000';
//           context.fillText(button.get('label'), (left + (button_width / 2) - inner_pad) * 3, (top + text_top) * 3);
//           context.restore();
//
//           var url = button.get('image.best_url');
//           var img = new Image();
//           img.draw_id = draw_id;
//           img.src = url;
//           img.onload = function() {
//             if(_this.get('last_draw_id') == img.draw_id) {
//               context.drawImage(img, (left + image_left) * 3, (top + image_top) * 3, image_height * 3, image_height * 3);
//             }
//           };
//         }
//       });
//     });
//   }.observes('id', 'extra_pad', 'inner_pad', 'base_text_height', 'text_style', 'ordered_buttons', 'border_style', 'height', 'width', 'app_state.edit_mode', 'nothing_visible', 'app_state.currentUser.preferences.stretch_buttons'),
//   long_description: function() {
//     var desc = "";
//     if(this.get('name') && this.get('name') != 'Unnamed Board') {
//       desc = this.get('name');
//       if(this.get('description')) {
//         desc = desc + " - ";
//       }
//     }
//     if(this.get('description')) {
//       desc = desc + this.get('description');
//     }
//     return desc;
//   }.property('description', 'name'),
//   cc_license: function() {
//     return (this.get('license.type') || "").match(/^CC\s/);
//   }.property('license.type'),
//   pd_license: function() {
//     return this.get('license.type') == 'public domain';
//   }.property('license.type'),
//   starImage: function() {
//     var prefix = capabilities.browserless ? "" : "/";
//     return prefix + (this.get('starred') ? 'star.png' : 'star_gray.png');
//   }.property('starred'),
//   starAlt: function() {
//     return this.get('starred') ? i18n.t('already_starred', "Already starred") : i18n.t('star_this_board', "Star this board");
//   }.property('starred'),
//   noUndo: true,
//   noRedo: true,
//   paint_mode: false,
//   paintColor: function() {
//     var mode = this.get('paint_mode');
//     if(mode) {
//       if(mode.hidden === true) {
//         return "<span class='glyphicon glyphicon-minus-sign'></span>";
//       } else if(mode.hidden === false) {
//         return "<span class='glyphicon glyphicon-ok-sign'></span>";
//       } else if(mode.close_link === true) {
//         return "<span class='glyphicon glyphicon-remove-sign'></span>";
//       } else if(mode.close_link === false) {
//         return "<span class='glyphicon glyphicon-plus-sign'></span>";
//       } else {
//         return "<span class='swatch' style='width: 14px; height: 14px; border-color: " + mode.border + "; background-color: " + mode.fill + ";'></span>";
//       }
//     } else {
//       return '';
//     }
//   }.property('paint_mode'),
//   current_grid: function() {
//     var ob = this.get('ordered_buttons');
//     if(!ob) { return null; }
//     return {
//       rows: ob.length,
//       columns: ob[0].length
//     };
//   }.property('ordered_buttons'),
//   extra_pad: function() {
//     var spacing = app_state.get('currentUser.preferences.device.button_spacing') || "small";
//     if(spacing == "extra-small") {
//       return 2;
//     } else if(spacing == "medium") {
//       return 10;
//     } else if(spacing == "large") {
//       return 20;
//     } else if(spacing == "huge") {
//       return 45;
//     } else {
//       return 5;
//     }
//   }.property('app_state.currentUser.preferences.device.button_spacing'),
//   inner_pad: function() {
//     var spacing = app_state.get('currentUser.preferences.device.button_border') || "small";
//     if(spacing == "none") {
//       return 0;
//     } else if(spacing == "medium") {
//       return 2;
//     } else if(spacing == "large") {
//       return 5;
//     } else if(spacing == "huge") {
//       return 10;
//     } else {
//       return 1;
//     }
//   }.property('app_state.currentUser.preferences.device.button_border'),
//   base_text_height: function() {
//     var spacing = app_state.get('currentUser.preferences.device.button_text') || "medium";
//     if(spacing == "small") {
//       return 14;
//     } else if(spacing == "none") {
//       return 0;
//     } else if(spacing == "large") {
//       return 22;
//     } else if(spacing == "huge") {
//       return 35;
//     } else {
//       return 18;
//     }
//   }.property('app_state.currentUser.preferences.device.button_text'),
//   text_style: function() {
//     var spacing = app_state.get('currentUser.preferences.device.button_text') || "medium";
//     return "text_" + spacing;
//   }.property('app_state.currentUser.preferences.device.button_text'),
//   border_style: function() {
//     var spacing = app_state.get('currentUser.preferences.device.button_border') || "small";
//     return "border_" + spacing;
//   }.property('app_state.currentUser.preferences.device.button_border'),
//   editModeNormalText: function() {
//     return app_state.get('edit_mode') && this.get('text_size') != 'really_small_text';
//   }.property('app_state.edit_mode', 'text_size'),
//   nothing_visible_not_edit: function() {
//     return this.get('nothing_visible') && !app_state.get('edit_mode');
//   }.property('nothing_visible', 'app_state.edit_mode'),
//   actions: {
//     buttonSelect: function(id, event) {
//       var board = this;
//       if(app_state.get('current_mode') == 'edit') {
//         if(editManager.finding_target()) {
//           editManager.apply_to_target(id);
//         } else {
//           modal.open('button-settings', {button: editManager.find_button(id)});
//         }
//       } else {
//         var button = editManager.find_button(id); //(board.get('buttons') || []).find(function(b) { return b.id == id; });
//         if(!button) { return; }
//         var app = board.get('controllers.application');
//         button.findContentLocally().then(function() {
//           app.activateButton(button, {image: button.get('image'), sound: button.get('sound'), board: board, event: event});
//         });
//       }
//     },
//     buttonPaint: function(id) {
//       editManager.paint_button(id);
//     },
//     complete_word: function(text) {
//       var button = editManager.fake_button();
//       button.label = ":complete";
//       button.completion = text;
//
//       var board = this;
//       var app = board.get('controllers.application');
//       app.activateButton(button, {board: board});
//     },
//     symbolSelect: function(id) {
//       var board = this;
//       if(!app_state.get('edit_mode')) { return; }
//       modal.open('button-settings', {button: editManager.find_button(id), state: 'picture'});
//     },
//     actionSelect: function(id) {
//       var board = this;
//       if(!app_state.get('edit_mode')) { return; }
//       modal.open('button-settings', {button: editManager.find_button(id), state: 'action'});
//     },
//     rearrangeButtons: function(dragId, dropId) {
//       editManager.switch_buttons(dragId, dropId);
//     },
//     clear_button: function(id) {
//       editManager.clear_button(id);
//     },
//     stash_button: function(id) {
//       editManager.stash_button(id);
//       alert(i18n.t('stashed', "stashed!"));
//     },
//     editBoardDetails: function() {
//       if(!app_state.get('edit_mode')) { return; }
//       modal.open('edit-board-details');
//     },
//     openButtonStash: function() {
//       if(!app_state.get('edit_mode')) { return; }
//       modal.open('button-stash');
//     },
//     boardDetails: function() {
//       modal.open('board-details');
//     },
//     toggleEditMode: function() {
//       app_state.toggle_edit_mode();
//     },
//     boardStats: function() {
//       modal.open('board-stats');
//     }
//   }
// });
