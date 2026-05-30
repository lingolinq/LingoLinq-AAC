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

  /*
   * Mine-tab sort ordering — Scot #3 pre-merge review (test coverage gap).
   * Replaces the orphaned `sorts favorite boards before other boards` coverage
   * that was deleted from application-test.js when the old My Boards modal
   * was removed. The behavior moved into the boards-page board_list computed
   * (controllers/user/index.js#L762-L789) — the new sort is:
   *   1. Home Board first (matches model.preferences.home_board.key)
   *   2. Liked/favorite boards next, alphabetical by name (starred_for_current_user)
   *   3. Everything else, alphabetical by name
   * Scoped to the Mine tab only — Public, Liked, Root, Shared tabs keep the
   * server's popularity order.
   *
   * See docs/task-management/2026-05-27-pr281-test-coverage.md.
   */
  describe('board_list Mine-tab sort', function() {
    function makeBoard(props) {
      return EmberObject.create(props);
    }

    function setupModel(controller, my_boards, homeKey) {
      controller.set('model', EmberObject.create({
        id: 'larry',
        my_boards: my_boards,
        preferences: { home_board: homeKey ? { key: homeKey } : {} },
        permissions: { edit: true }
      }));
    }

    it('places the home board first regardless of name', function() {
      var controller = testOwner.lookup('controller:user/index');
      var home    = makeBoard({ key: 'larry/zzz-home', name: 'Z Home', starred_for_current_user: false });
      var apple   = makeBoard({ key: 'larry/apple',     name: 'Apple',  starred_for_current_user: false });
      var banana  = makeBoard({ key: 'larry/banana',    name: 'Banana', starred_for_current_user: false });
      setupModel(controller, [{ board: apple }, { board: banana }, { board: home }], 'larry/zzz-home');
      controller.set('selected', 'mine');

      var list = controller.get('board_list');

      expect(list.results.length).toEqual(3);
      expect(list.results[0].board.get('key')).toEqual('larry/zzz-home');
    });

    it('puts starred (favorite) boards before non-starred, alphabetical within each group', function() {
      var controller = testOwner.lookup('controller:user/index');
      var liked_z    = makeBoard({ key: 'larry/z', name: 'Zoo',   starred_for_current_user: true  });
      var liked_a    = makeBoard({ key: 'larry/a', name: 'Apple', starred_for_current_user: true  });
      var plain_b    = makeBoard({ key: 'larry/b', name: 'Bread', starred_for_current_user: false });
      var plain_y    = makeBoard({ key: 'larry/y', name: 'Yellow',starred_for_current_user: false });
      setupModel(controller, [{ board: plain_b }, { board: liked_z }, { board: plain_y }, { board: liked_a }], null);
      controller.set('selected', 'mine');

      var list = controller.get('board_list');

      expect(list.results.length).toEqual(4);
      // Starred first, alpha
      expect(list.results[0].board.get('name')).toEqual('Apple');
      expect(list.results[1].board.get('name')).toEqual('Zoo');
      // Then non-starred, alpha
      expect(list.results[2].board.get('name')).toEqual('Bread');
      expect(list.results[3].board.get('name')).toEqual('Yellow');
    });

    it('home board wins even when it would lose the favorite/alpha tiebreaker', function() {
      var controller = testOwner.lookup('controller:user/index');
      // home is non-starred and named "Z" — would normally sort LAST.
      var home  = makeBoard({ key: 'larry/home',  name: 'Z',     starred_for_current_user: false });
      var liked = makeBoard({ key: 'larry/liked', name: 'A',     starred_for_current_user: true  });
      setupModel(controller, [{ board: liked }, { board: home }], 'larry/home');
      controller.set('selected', 'mine');

      var list = controller.get('board_list');

      expect(list.results[0].board.get('key')).toEqual('larry/home');
      expect(list.results[1].board.get('key')).toEqual('larry/liked');
    });

    it('does not apply Mine-tab sort on Public tab — server order preserved', function() {
      var controller = testOwner.lookup('controller:user/index');
      // On Public tab the controller reads `model.public_boards`, not my_boards,
      // and the sort branch at user/index.js#L767 is `selected == 'mine' || !selected`.
      var first  = makeBoard({ key: 'larry/first',  name: 'Z', starred_for_current_user: true  });
      var second = makeBoard({ key: 'larry/second', name: 'A', starred_for_current_user: false });
      controller.set('model', EmberObject.create({
        id: 'larry',
        public_boards: [{ board: first }, { board: second }],
        preferences: { home_board: { key: 'larry/first' } },
        permissions: { edit: true }
      }));
      controller.set('selected', 'public');

      var list = controller.get('board_list');

      expect(list.results.length).toEqual(2);
      // Server order preserved — first should stay first regardless of name/starred.
      expect(list.results[0].board.get('key')).toEqual('larry/first');
      expect(list.results[1].board.get('key')).toEqual('larry/second');
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