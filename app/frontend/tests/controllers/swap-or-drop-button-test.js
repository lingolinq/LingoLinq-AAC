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
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';

describe('SwapOrDropButtonController', 'controller:swap-or-drop-button', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import modal from '../utils/modal';
// import editManager from '../utils/edit_manager';
// import i18n from '../utils/i18n';
// 
// export default modal.ModalController.extend({
//   pending: function() {
//     return !!(this.get('status.message') || this.get('status.need_decision'));
//   }.property('status.message', 'status.need_decision'),
//   actions: {
//     swap_buttons: function() {
//       var a = this.get('button.id');
//       var b = this.get('folder.id');
//       editManager.switch_buttons(a, b, 'swap');
//       modal.close(true);
//     },
//     move_button: function(decision) {
//       var a = this.get('button.id');
//       var b = this.get('folder.id');
//       this.set('status', {message: i18n.t('moving_button', 'Moving button...')});
//       var _this = this;
//       editManager.move_button(a, b, decision).then(function(res) {
//         _this.set('status', null);
//         modal.close(true);
//         if(res.visible) {
//           modal.success(i18n.t('button_moved', "Button successfully added to the board!"));
//         } else {
//           modal.success(i18n.t('button_moved_to_stash', "Button successfully moved! You'll find it on the board's stash."));
//         }
//       }, function(err) {
//         if(err.error == 'view only' && !decision) {
//           _this.set('status', {need_decision: true});
//           return;
//         }
//         var message = i18n.t('button_move_failed', "Button failed to be saved to the new board, please try again.");
//         if(err.error == 'not authorized') {
//           message = i18n.t('button_move_unauthorized', "Button failed to be saved, you do not have permission to modify the specified board.");
//         }
//         if(modal.is_open('swap-or-drop-button')) {
//           _this.set('status', {error: message});
//         } else {
//           modal.error(message);
//         }
//       });
//     }
//   }
// });