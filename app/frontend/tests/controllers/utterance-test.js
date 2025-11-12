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

describe('UtteranceController', 'controller:utterance', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import speecher from '../utils/speecher';
// import utterance from '../utils/utterance';
// import i18n from '../utils/i18n';
// import lingoLinqExtras from '../utils/extras';
// import modal from '../utils/modal';
// 
// export default EmberObjectController.extend({
//   title: function() {
//     var sentence = this.get('sentence') || "something";
//     return "Someone Said: " + sentence;
//   }.property('sentence'),
//   show_share: function() {
//     this.set('speakable', speecher.ready);
//     lingoLinqExtras.share.load({link: this.get('link'), text: this.get('sentence')});
//   }.observes('sentence'),
//   user_showable: function() {
//     return this.get('show_user') && this.get('user.name') && this.get('user.user_name');
//   }.property('show_user', 'user.name', 'user.user_name'),
//   actions: {
//     vocalize: function() {
//       if(speecher.ready) {
//         utterance.speak_text(this.get('sentence'));
//       }
//     },
//     change_image: function(direction) {
//       var index = this.get('image_index');
//       if(!index) {
//         var _this = this;
//         this.get('button_list').forEach(function(b, idx) {
//           if(b.image == _this.get('image_url') && !index) {
//             index = idx;
//           }
//         });
//       }
//       
//       if(direction == 'next') {
//         index++;
//       } else {
//         index--;
//       }
//       if(index < 0) {
//         index = this.get('button_list').length - 1;
//       } else if(index >= this.get('button_list').length) {
//         index = 0;
//       }
//       var image = this.get('button_list')[index].image;
//       this.set('image_url', image);
//       this.set('image_index', index);
//     },
//     update_utterance: function() {
//       this.get('model').save().then(null, function() {
//         modal.error(i18n.t('utterance_update_failed', "Sentence update failed"));
//       });
//     }
//   }
// });