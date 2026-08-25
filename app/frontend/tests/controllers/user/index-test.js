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
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';

describe('UserIndexController', 'controller:user-index', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  afterEach(function() {
    boardsPageListCache.setBoardsPageActive(false);
  });

  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  it('skips logs badges and goals fetches while the boards page is active', function() {
    var queried = [];
    var controller = testOwner.lookup('controller:user/index');
    boardsPageListCache.setBoardsPageActive(true);
    controller.set('store', {
      query: function(type) {
        queried.push(type);
        return RSVP.resolve([]);
      }
    });
    controller.set('persistence', EmberObject.create({
      online: true,
      get: function(key) { return key === 'online' ? true : undefined; }
    }));
    controller.set('model', EmberObject.create({
      id: '1_1',
      permissions: { supervise: true }
    }));
    controller.reload_logs();
    controller.load_badges();
    controller.load_goals();
    expect(queried).toEqual([]);

    boardsPageListCache.setBoardsPageActive(false);
    controller.reload_logs();
    expect(queried.indexOf('log') !== -1).toEqual(true);
  });

  it('loads global public boards with the same query as /search/en/_', function() {
    var controller = testOwner.lookup('controller:user/index');
    var queryArgs = null;

    controller.set('store', {
      query: function(type, args) {
        if (type === 'goal' || type === 'badge') {
          return RSVP.resolve([]);
        }
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
      expect(queryArgs).toEqual({ q: '', locale: 'en', sort: 'popularity', per_page: 50 });
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
      props = props || {};
      if (props.id == null) {
        props.id = props.key || ('board-' + Math.random().toString(36).slice(2));
      }
      return EmberObject.create(props);
    }

    function stubAppState(controller, userName, opts) {
      opts = opts || {};
      var ownerDedup = opts.boards_page_owner_dedup !== false;
      var stub = EmberObject.create({
        currentUser: EmberObject.create({ user_name: userName || 'melis' }),
        feature_flags: { boards_page_owner_dedup: ownerDedup },
        get: function(key) {
          if (key === 'currentUser.user_name') { return this.currentUser.user_name; }
          if (key === 'feature_flags.boards_page_owner_dedup') { return this.feature_flags.boards_page_owner_dedup; }
          return EmberObject.prototype.get.call(this, key);
        }
      });
      // board_list reads appState via service injection — override the getter.
      Object.defineProperty(controller, 'appState', {
        configurable: true,
        get: function() { return stub; }
      });
    }

    function stubPersistenceOffline(controller) {
      var stub = EmberObject.create({
        online: false,
        meta: function() { return null; }
      });
      Object.defineProperty(controller, 'persistence', {
        configurable: true,
        get: function() { return stub; }
      });
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
      setupModel(controller, [apple, banana, home], 'larry/zzz-home');
      stubAppState(controller, 'larry');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);

      var list = controller.get('board_list');

      expect(list.filtered_results.length).toEqual(3);
      expect(list.filtered_results[0].board.get('key')).toEqual('larry/zzz-home');
    });

    it('puts starred (favorite) boards before non-starred, alphabetical within each group', function() {
      var controller = testOwner.lookup('controller:user/index');
      var liked_z    = makeBoard({ key: 'larry/z', name: 'Zoo',   starred_for_current_user: true  });
      var liked_a    = makeBoard({ key: 'larry/a', name: 'Apple', starred_for_current_user: true  });
      var plain_b    = makeBoard({ key: 'larry/b', name: 'Bread', starred_for_current_user: false });
      var plain_y    = makeBoard({ key: 'larry/y', name: 'Yellow',starred_for_current_user: false });
      setupModel(controller, [plain_b, liked_z, plain_y, liked_a], null);
      stubAppState(controller, 'larry');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);

      var list = controller.get('board_list');

      expect(list.filtered_results.length).toEqual(4);
      // Starred first, alpha
      expect(list.filtered_results[0].board.get('name')).toEqual('Apple');
      expect(list.filtered_results[1].board.get('name')).toEqual('Zoo');
      // Then non-starred, alpha
      expect(list.filtered_results[2].board.get('name')).toEqual('Bread');
      expect(list.filtered_results[3].board.get('name')).toEqual('Yellow');
    });

    it('home board wins even when it would lose the favorite/alpha tiebreaker', function() {
      var controller = testOwner.lookup('controller:user/index');
      // home is non-starred and named "Z" — would normally sort LAST.
      var home  = makeBoard({ key: 'larry/home',  name: 'Z',     starred_for_current_user: false });
      var liked = makeBoard({ key: 'larry/liked', name: 'A',     starred_for_current_user: true  });
      setupModel(controller, [liked, home], 'larry/home');
      stubAppState(controller, 'larry');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);

      var list = controller.get('board_list');

      expect(list.filtered_results[0].board.get('key')).toEqual('larry/home');
      expect(list.filtered_results[1].board.get('key')).toEqual('larry/liked');
    });

    it('does not apply Mine-tab sort on Public tab — server order preserved', function() {
      var controller = testOwner.lookup('controller:user/index');
      var first  = makeBoard({ id: '1', key: 'other/first',  name: 'Z Board', starred_for_current_user: true  });
      var second = makeBoard({ id: '2', key: 'other/second', name: 'A Board', starred_for_current_user: false });
      controller.set('model', EmberObject.create({
        id: 'larry',
        public_boards: [first, second],
        preferences: { home_board: { key: 'other/first' } },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'larry');
      controller.set('selected', 'public');
      controller.set('parent_object', null);

      var list = controller.get('board_list');

      expect(list.filtered_results.length).toEqual(2);
      expect(list.filtered_results[0].board.get('key')).toEqual('other/first');
      expect(list.filtered_results[1].board.get('key')).toEqual('other/second');
    });

    it('collapses same-name public boards preferring current user then lingolinq', function() {
      var controller = testOwner.lookup('controller:user/index');
      var other = makeBoard({
        id: '1',
        key: 'other/quick-core-60',
        name: 'Quick Core 60',
        search_string: 'Quick Core 60 other quick-core-60'
      });
      var canonical = makeBoard({
        id: '2',
        key: 'lingolinq/quick-core-60',
        name: 'Quick Core 60',
        search_string: 'Quick Core 60 lingolinq quick-core-60'
      });
      controller.set('model', EmberObject.create({
        id: 'larry',
        public_boards: [other, canonical],
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'melis');
      controller.set('selected', 'public');
      controller.set('parent_object', null);

      var list = controller.get('board_list');

      expect(list.filtered_results.length).toEqual(1);
      expect(list.filtered_results[0].board.get('key')).toEqual('lingolinq/quick-core-60');
    });

    it('keeps popularity order for same-name public boards when owner dedup flag is off', function() {
      var controller = testOwner.lookup('controller:user/index');
      var first = makeBoard({
        id: '1',
        key: 'other/quick-core-60',
        name: 'Quick Core 60',
        search_string: 'Quick Core 60 other quick-core-60'
      });
      var second = makeBoard({
        id: '2',
        key: 'lingolinq/quick-core-60',
        name: 'Quick Core 60',
        search_string: 'Quick Core 60 lingolinq quick-core-60'
      });
      controller.set('model', EmberObject.create({
        id: 'larry',
        public_boards: [first, second],
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'melis', { boards_page_owner_dedup: false });
      controller.set('selected', 'public');
      controller.set('parent_object', null);

      var list = controller.get('board_list');

      expect(list.filtered_results.length).toEqual(1);
      expect(list.filtered_results[0].board.get('key')).toEqual('other/quick-core-60');
    });

    it('hides CommuniKate topic pages on Mine tab default grid', function() {
      var controller = testOwner.lookup('controller:user/index');
      var homeRoot = makeBoard({
        id: 'ck-home',
        name: 'CommuniKate Top Page',
        key: 'lingolinq/communikate-home'
      });
      var topic = makeBoard({
        id: 'ck-alcohol',
        name: 'CommuniKate alcohol',
        key: 'lingolinq/communikate-alcohol'
      });
      var custom = makeBoard({
        id: 'custom',
        name: 'Adams Lunch',
        key: 'lingolinq/adams-lunch'
      });
      controller.set('model', EmberObject.create({
        id: 'lingolinq',
        my_boards: [homeRoot, topic, custom],
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'melis');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);

      var list = controller.get('board_list');
      var keys = (list.filtered_results || []).map(function(row) {
        return row.board.get('key');
      });

      expect(keys.indexOf('lingolinq/communikate-alcohol')).toEqual(-1);
      expect(keys.indexOf('lingolinq/communikate-home')).toBeGreaterThan(-1);
      expect(keys.indexOf('lingolinq/adams-lunch')).toBeGreaterThan(-1);
    });

    it('hides Core 112 topic pages on Mine tab default grid', function() {
      var controller = testOwner.lookup('controller:user/index');
      var root = makeBoard({
        id: 'qc-root',
        name: 'Quick Core 112',
        key: 'lingolinq/quick-core-112'
      });
      var topic = makeBoard({
        id: 'qc-topic',
        name: 'Core 112 - American States',
        key: 'lingolinq/core-112-american-states'
      });
      controller.set('model', EmberObject.create({
        id: 'lingolinq',
        my_boards: [root, topic],
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'melis');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);

      var list = controller.get('board_list');
      var keys = (list.filtered_results || []).map(function(row) {
        return row.board.get('key');
      });

      expect(keys).toEqual(['lingolinq/quick-core-112']);
    });

    it('hides Core Blocks topic pages on Mine tab default grid', function() {
      var controller = testOwner.lookup('controller:user/index');
      var root = makeBoard({
        id: 'cb-root',
        name: 'Quick Core Blocks 112',
        key: 'lingolinq/core-blocks-112'
      });
      var topic = makeBoard({
        id: 'cb-topic',
        name: 'Core Blocks 112 - Categories',
        key: 'lingolinq/core-blocks-112-categories'
      });
      controller.set('model', EmberObject.create({
        id: 'lingolinq',
        my_boards: [root, topic],
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'melis');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);

      var list = controller.get('board_list');
      var keys = (list.filtered_results || []).map(function(row) {
        return row.board.get('key');
      });

      expect(keys).toEqual(['lingolinq/core-blocks-112']);
    });

    it('search finds brand sub-boards hidden from default Mine grid', function() {
      var controller = testOwner.lookup('controller:user/index');
      var root = makeBoard({
        id: 'cb-root',
        name: 'Quick Core Blocks 40',
        key: 'lingolinq/core-blocks-40',
        search_string: 'Quick Core Blocks 40 lingolinq core-blocks-40'
      });
      var holidays = makeBoard({
        id: 'cb-holidays',
        name: 'Core Blocks 40 - holidays',
        key: 'lingolinq/core-blocks-40-holidays',
        search_string: 'Core Blocks 40 - holidays lingolinq core-blocks-40-holidays'
      });
      controller.set('model', EmberObject.create({
        id: 'lingolinq',
        my_boards: [root, holidays],
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      stubAppState(controller, 'melis');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);
      controller.set('filterStringDebounced', 'holidays');

      expect(controller.get('mineFoldersEnabled')).toEqual(true);
      var defaultKeys = (controller.get('board_list').filtered_results || []).map(function(row) {
        return row.board.get('key');
      });
      expect(defaultKeys).toEqual(['lingolinq/core-blocks-40']);

      var visible = controller.get('boards_page_visible_results');
      var searchKeys = visible.map(function(row) {
        return row.board.get('key');
      });
      expect(searchKeys).toEqual(['lingolinq/core-blocks-40-holidays']);
    });

    it('caps live filter results so short queries stay responsive', function() {
      var controller = testOwner.lookup('controller:user/index');
      var boards = [];
      for (var i = 0; i < 55; i++) {
        boards.push(makeBoard({
          id: 'b' + i,
          name: 'Holiday Board ' + i,
          key: 'lingolinq/holiday-' + i,
          search_string: 'Holiday Board ' + i + ' lingolinq holiday-' + i
        }));
      }
      controller.set('model', EmberObject.create({
        id: 'lingolinq',
        my_boards: boards,
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      controller.set('selected', 'mine');
      controller.set('parent_object', null);
      controller.set('filterStringDebounced', 'holiday');

      expect(controller.get('boards_page_visible_results').length).toEqual(50);
      expect(controller.get('boards_page_search_truncated')).toEqual(true);
    });

    it('marks live filter incomplete until the Mine list is done', function() {
      var controller = testOwner.lookup('controller:user/index');
      var boards = [makeBoard({
        id: 'b1',
        name: 'Holiday Board',
        key: 'lingolinq/holiday-1',
        search_string: 'Holiday Board lingolinq holiday-1'
      })];
      controller.set('model', EmberObject.create({
        id: 'lingolinq',
        my_boards: boards,
        preferences: { home_board: {} },
        permissions: { edit: true }
      }));
      controller.set('selected', 'mine');
      controller.set('parent_object', null);
      controller.set('filterStringDebounced', 'holiday');

      expect(controller.get('boards_page_search_incomplete')).toEqual(true);

      var doneList = boards.slice();
      doneList.done = true;
      controller.set('model.my_boards', doneList);
      expect(controller.get('boards_page_search_incomplete')).toEqual(false);
    });

    it('ignores live filter while drilled into a folder so the grid shows folder boards only', function() {
      var controller = testOwner.lookup('controller:user/index');
      var folderBoard = makeBoard({
        id: '42',
        global_id: '#1_42',
        name: 'Work Root',
        key: 'larry/work-root',
        search_string: 'Work Root larry work-root'
      });
      var holidayBoard = makeBoard({
        id: '99',
        name: 'Holiday Board',
        key: 'larry/holiday',
        search_string: 'Holiday Board larry holiday'
      });
      controller.set('model', EmberObject.create({
        id: 'larry',
        my_boards: [folderBoard, holidayBoard],
        board_tag_map: { Work: ['#1_42'] },
        preferences: { home_board: {} },
        permissions: { edit: true },
        goals: [{}],
        badges: [{}]
      }));
      controller.set('store', {
        query: function() { return RSVP.resolve([]); }
      });
      stubPersistenceOffline(controller);
      stubAppState(controller, 'melis');
      controller.set('selected', 'mine');
      controller.set('parent_object', null);
      controller.set('filterStringDebounced', 'holiday');
      controller.set('mineTagFolderDrillIn', 'Work');

      var bl = controller.get('board_list');
      controller.set('last_filtered_results_key', bl.filtered_results_key);
      controller.set('filtered_results', bl.filtered_results);

      var folderKeys = (bl.filtered_results || []).map(function(row) {
        return row.board.get('key');
      });
      expect(folderKeys).toEqual(['larry/work-root']);

      var visibleKeys = controller.get('boards_page_visible_results').map(function(row) {
        return row.board.get('key');
      });
      expect(visibleKeys).toEqual(['larry/work-root']);
      expect(controller.get('boards_page_search_truncated')).toEqual(false);
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