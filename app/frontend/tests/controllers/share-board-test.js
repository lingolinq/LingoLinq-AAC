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

describe('ShareBoardController', 'controller:share-board', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import modal from '../utils/modal';
// import lingoLinqExtras from '../utils/extras';
// 
// export default modal.ModalController.extend({
//   needs: 'application',
//   show_share: function() {
//     if(this.get('board.link')) {
//       var _this = this;
//       emberRun.later(function() {
//         lingoLinqExtras.share.load({link: _this.get('board.link'), text: _this.get('board.name')});
//       });
//     }
//   },
//   opening: function() {
//     var controller = this;
//     var board = controller.get('board');
//     controller.set('model', {});
//     controller.set('board', board);
//     controller.show_share();
//   }
// });