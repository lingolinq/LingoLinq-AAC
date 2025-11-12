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

describe('InlineVideoController', 'controller:inline-video', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import modal from '../utils/modal';
// import LingoLinq from '../app';
// 
// export default modal.ModalController.extend({
//   opening: function() {
//     var _this = this;
//     LingoLinq.YT.track('video_preview', function(event_type) {
//       if(event_type == 'end') {
//         _this.send('close');
//       }
//     }).then(function(player) {
//       _this.set('player', player);
//     });
//   }
// });