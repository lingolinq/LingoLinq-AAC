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
import 'frontend/tests/helpers/ember_helper';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';

describe('UserIndexController', 'controller:user-index', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  it('loads global public boards with the same query as /search/en/_', function() {
    var controller = testOwner.lookup('controller:user/index');
    var queryArgs = null;

    controller.set('store', {
      query: function(type, args) {
        queryArgs = args;
        expect(type).toEqual('board');
        return RSVP.resolve([]);
      }
    });
    controller.set('persistence', EmberObject.create({
      online: true,
      meta: function() { return null; }
    }));
    controller.set('model', EmberObject.create({
      id: 'larry',
      permissions: { edit: false, model: true },
      preferences: { home_board: { key: 'larry/home' } }
    }));
    controller.set('selected', 'public');

    controller.update_selected();

    waitsFor(function() { return queryArgs; });
    runs(function() {
      expect(queryArgs).toEqual({q: '', locale: 'en', sort: 'popularity'});
    });
  });
});
// import Ember from 'ember';
// import persistence from '../../utils/persistence';
// import modal from '../../utils/modal';
// 
// export default EmberObjectController.extend({
//   needs: 'application',
//   title: function() {
//     return "Profile for " + this.get('user_name');
//   }.property('user_name'),
//   sync_able: function() {
//     return this.get('extras.ready');
//   }.property('extras.ready'),
//   needs_sync: function() {
//     var now = (new Date()).getTime();
//     return (now - persistence.get('last_sync_at')) > (7 * 24 * 60 * 60 * 1000);
//   }.property('persistence.last_sync_at'),
//   blank_slate: function() {
//     return !this.get('preferences.home_board.key') &&  
//         (!this.get('boards') || this.get('boards.content.length') === 0) && 
//         (!this.get('private_boards') || this.get('private_boards.content.length') === 0) &&
//         (!this.get('starred_boards') || this.get('starred_boards.content.length') === 0);
//   }.property('preferences.home_board.key', 'boards.content.length', 'private_boards.content.length', 'starred_boards.content.length'),
//   shortened_list_of_prior_home_boards: function() {
//     var list = this.get('prior_home_boards') || [];
//     if(this.get('show_all_prior_home_boards')) {
//       return list;
//     } else {
//       if(list.length < 10) {
//         this.set('show_all_prior_home_boards', true);
//       }
//       return list.slice(0, 10);
//     }
//   }.property('prior_home_boards', 'show_all_prior_home_boards'),
//   public_boards_shortened: function() {
//     var list = this.get('boards') || [];
//     if(this.get('show_all_public_boards')) {
//       return list;
//     } else {
//       if(list.content && list.content.length <= 6) {
//         this.set('show_all_public_boards', true);
//       }
//       return list.slice(0, 6);
//     }
//   }.property('boards', 'show_all_public_boards'),
//   private_boards_shortened: function() {
//     var list = this.get('private_boards') || [];
//     if(this.get('show_all_private_boards')) {
//       return list;
//     } else {
//       if(list.content && list.content.length <= 6) {
//         this.set('show_all_private_boards', true);
//       }
//       return list.slice(0, 6);
//     }
//   }.property('private_boards', 'show_all_private_boards'),
//   starred_boards_shortened: function() {
//     var list = this.get('starred_boards') || [];
//     if(this.get('show_all_starred_boards')) {
//       return list;
//     } else {
//       if(list.content && list.content.length <= 6) {
//         this.set('show_all_starred_boards', true);
//       }
//       return list.slice(0, 6);
//     }
//   }.property('starred_boards', 'show_all_starred_boards'),
//   actions: {
//     sync: function() {
//       persistence.sync(this.get('id'));
//     },
//     add_supervisor: function() {
//       modal.open('add-supervisor');
//     },
//     view_devices: function() {
//       modal.open('device-settings', this.get('model'));
//     },
//     supervision_settings: function() {
//       modal.open('supervision-settings');
//     },
//     show_more_prior_home_boards: function() {
//       this.set('show_all_prior_home_boards', true);
//     },
//     show_more_public_boards: function() {
//       this.set('show_all_public_boards', true);
//     },
//     show_more_private_boards: function() {
//       this.set('show_all_private_boards', true);
//     },
//     show_more_starred_boards: function() {
//       this.set('show_all_starred_boards', true);
//     }
//   }
// });