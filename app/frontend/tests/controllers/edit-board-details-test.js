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

describe('EditBoardDetailsController', 'controller:edit-board-details', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import LingoLinq from '../app';
// import app_state from '../utils/app_state';
// import modal from '../utils/modal';
//
// export default EmberObjectController.extend({
//   needs: ['board', 'application'],
//   licenseOptions: LingoLinq.licenseOptions,
//   iconUrls: LingoLinq.iconUrls,
//   cant_change_public: function() {
//     return this.get('originally_public') && app_state.get('currentUser.premium_disabled');
//   }.property('originally_public', 'app_state.currentUser.premium_disabled'),
//   attributable_license_type: function() {
//     if(!this.get('license')) { return; }
//     if(this.get('license') && this.get('license.type') != 'private') {
//       this.set('license.author_name', this.get('license.author_name') || app_state.get('currentUser.name'));
//       this.set('license.author_url',this.get('license.author_url') || app_state.get('currentUser.profile_url'));
//     }
//     return this.get('license.type') != 'private';
//   }.property('license.type'),
//   actions: {
//     close: function() {
//       modal.close();
//     },
//     pickImageUrl: function(url) {
//       this.set('image_url', url);
//     }
//   }
// });
