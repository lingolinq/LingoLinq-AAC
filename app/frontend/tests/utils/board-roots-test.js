import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import EmberObject from '@ember/object';
import {
  dedupeByName,
  dedupeBoardRows,
  filterBrandSetRootBoards,
  filterBoardsPageTopLevelRoots,
  isBrandSetRootBoard,
  boardOwnerName,
  boardsPagePreferUserNames,
  sortBySearchQuery,
  searchQueryRank
} from '../../utils/board-roots';

describe('board-roots', function() {
  function makeBoard(props) {
    return EmberObject.create(props);
  }

  function makeAppState(opts) {
    opts = opts || {};
    return EmberObject.create({
      currentUser: EmberObject.create({ user_name: opts.user_name || 'melis' }),
      feature_flags: { boards_page_owner_dedup: opts.boards_page_owner_dedup !== false },
      get: function(key) {
        if (key === 'currentUser.user_name') { return this.currentUser.user_name; }
        if (key === 'feature_flags.boards_page_owner_dedup') { return this.feature_flags.boards_page_owner_dedup; }
        return EmberObject.prototype.get.call(this, key);
      }
    });
  }

  describe('boardsPagePreferUserNames', function() {
    it('returns empty list when the feature flag is off', function() {
      expect(boardsPagePreferUserNames(makeAppState({ boards_page_owner_dedup: false }))).toEqual([]);
    });

    it('returns current user then lingolinq when the feature flag is on', function() {
      expect(boardsPagePreferUserNames(makeAppState({ user_name: 'melis' }))).toEqual(['melis', 'lingolinq']);
    });
  });

  describe('dedupeByName', function() {
    it('keeps the first board when no preferred owner matches', function() {
      var first = makeBoard({ id: '1', name: 'Quick Core 60', key: 'popular/quick-core-60' });
      var second = makeBoard({ id: '2', name: 'Quick Core 60', key: 'other/quick-core-60' });
      var result = dedupeByName([first, second]);
      expect(result.length).toEqual(1);
      expect(result[0].get('id')).toEqual('1');
    });

    it('prefers the current user copy over another owner', function() {
      var mine = makeBoard({ id: '1', name: 'Quick Core 60', key: 'melis/quick-core-60' });
      var other = makeBoard({ id: '2', name: 'Quick Core 60', key: 'other/quick-core-60' });
      var result = dedupeByName([other, mine], { preferUserNames: ['melis', 'lingolinq'] });
      expect(result.length).toEqual(1);
      expect(result[0].get('key')).toEqual('melis/quick-core-60');
    });

    it('prefers lingolinq over another owner when current user has no copy', function() {
      var canonical = makeBoard({ id: '1', name: 'Quick Core 60', key: 'lingolinq/quick-core-60' });
      var other = makeBoard({ id: '2', name: 'Quick Core 60', key: 'other/quick-core-60' });
      var result = dedupeByName([other, canonical], { preferUserNames: ['melis', 'lingolinq'] });
      expect(result.length).toEqual(1);
      expect(result[0].get('key')).toEqual('lingolinq/quick-core-60');
    });

    it('does not collapse boards with empty names', function() {
      var a = makeBoard({ id: '1', name: '', key: 'a/one' });
      var b = makeBoard({ id: '2', name: '', key: 'b/two' });
      var result = dedupeByName([a, b]);
      expect(result.length).toEqual(2);
    });

    it('collapses names that differ only by case', function() {
      var lower = makeBoard({ id: '1', name: 'CommuniKate alcohol', key: 'lingolinq/communikate-alcohol' });
      var upper = makeBoard({ id: '2', name: 'CommuniKate Alcohol', key: 'lingolinq/communikate-alcohol-2' });
      var result = dedupeByName([lower, upper]);
      expect(result.length).toEqual(1);
      expect(result[0].get('id')).toEqual('1');
    });
  });

  describe('boardOwnerName', function() {
    it('reads the owner slug from the board key', function() {
      var board = makeBoard({ key: 'lingolinq/vocal-flair-84', user_name: 'ignored' });
      expect(boardOwnerName(board)).toEqual('lingolinq');
    });
  });

  describe('filterBrandSetRootBoards', function() {
    it('keeps brand set roots and drops sub-board pages', function() {
      var root = makeBoard({
        id: '1',
        name: 'Vocal Flair 84',
        key: 'lingolinq/vocal-flair-84'
      });
      var sub = makeBoard({
        id: '2',
        name: 'Vocal Flair 84 - A Prefix',
        key: 'lingolinq/vocal-flair-84-categories-food'
      });
      var other = makeBoard({ id: '3', name: 'My Board', key: 'melis/custom-board' });
      var result = filterBrandSetRootBoards([root, sub, other]);
      expect(result.length).toEqual(2);
      expect(result[0].get('id')).toEqual('1');
      expect(result[1].get('id')).toEqual('3');
    });

    it('reports brand sub-board keys as non-roots', function() {
      var sub = makeBoard({
        name: 'Vocal Flair 84 - A Prefix',
        key: 'lingolinq/vocal-flair-84-categories-food'
      });
      expect(isBrandSetRootBoard(sub)).toEqual(false);
    });

    it('drops CommuniKate topic pages by key slug', function() {
      var root = makeBoard({
        id: '1',
        name: 'CommuniKate Top Page',
        key: 'lingolinq/communikate-home'
      });
      var topic = makeBoard({
        id: '2',
        name: 'CommuniKate alcohol',
        key: 'lingolinq/communikate-alcohol'
      });
      var result = filterBrandSetRootBoards([root, topic]);
      expect(result.length).toEqual(1);
      expect(result[0].get('id')).toEqual('1');
    });

    it('drops Quick Core 112 topic pages named "Core 112 - …"', function() {
      var root = makeBoard({
        id: '1',
        name: 'Quick Core 112',
        key: 'lingolinq/quick-core-112'
      });
      var topicByName = makeBoard({
        id: '2',
        name: 'Core 112 - American States',
        key: 'lingolinq/core-112-american-states'
      });
      var topicByKey = makeBoard({
        id: '3',
        name: 'Core 112 - Animal Sounds',
        key: 'lingolinq/quick-core-112-animal-sounds'
      });
      var result = filterBrandSetRootBoards([root, topicByName, topicByKey]);
      expect(result.length).toEqual(1);
      expect(result[0].get('id')).toEqual('1');
    });

    it('treats legacy core-112 slug as a Quick Core root when the name matches', function() {
      var root = makeBoard({
        name: 'Core 112',
        key: 'lingolinq/core-112'
      });
      expect(isBrandSetRootBoard(root)).toEqual(true);
    });

    it('does not classify incidental core-N slugs as Quick Core', function() {
      var custom = makeBoard({
        name: 'Weekly Planner',
        key: 'school/core-5'
      });
      expect(isBrandSetRootBoard(custom)).toEqual(true);
      expect(filterBrandSetRootBoards([custom]).length).toEqual(1);
    });

    it('returns false for a null board argument', function() {
      expect(isBrandSetRootBoard(null)).toEqual(false);
    });

    it('drops Core Blocks topic pages by key slug and display name', function() {
      var root = makeBoard({
        id: '1',
        name: 'Quick Core Blocks 112',
        key: 'lingolinq/core-blocks-112'
      });
      var topic = makeBoard({
        id: '2',
        name: 'Core Blocks 112 - Categories',
        key: 'lingolinq/core-blocks-112-categories'
      });
      var topic40 = makeBoard({
        id: '3',
        name: 'Core Blocks 40 - holidays',
        key: 'lingolinq/core-blocks-40-holidays'
      });
      var result = filterBrandSetRootBoards([root, topic, topic40]);
      expect(result.length).toEqual(1);
      expect(result[0].get('id')).toEqual('1');
    });
  });

  describe('filterBoardsPageTopLevelRoots', function() {
    it('combines copy-set roots with brand-set root filtering', function() {
      var copyRoot = makeBoard({
        id: '100',
        name: 'Quick Core 60',
        key: 'melis/quick-core-60',
        copy_id: '100'
      });
      var copySub = makeBoard({
        id: '200-100',
        name: 'Quick Core 60 - Food',
        key: 'melis/quick-core-60-food',
        copy_id: '100'
      });
      var ckTopic = makeBoard({
        id: '3',
        name: 'CommuniKate birds',
        key: 'melis/communikate-birds'
      });
      var ckRoot = makeBoard({
        id: '4',
        name: 'CommuniKate Top Page',
        key: 'melis/communikate-home'
      });
      var result = filterBoardsPageTopLevelRoots([copyRoot, copySub, ckTopic, ckRoot], '100');
      expect(result.length).toEqual(2);
      expect(result[0].get('id')).toEqual('100');
      expect(result[1].get('id')).toEqual('4');
    });
  });

  describe('dedupeBoardRows', function() {
    it('preserves children on the winning row', function() {
      var child = makeBoard({ id: 'child', name: 'Child', key: 'lingolinq/child' });
      var winner = makeBoard({ id: '1', name: 'Quick Core 60', key: 'lingolinq/quick-core-60' });
      var loser = makeBoard({ id: '2', name: 'Quick Core 60', key: 'other/quick-core-60' });
      var rows = [
        { board: loser, children: [] },
        { board: winner, children: [{ board: child }] }
      ];
      var result = dedupeBoardRows(rows, { preferUserNames: ['melis', 'lingolinq'] });
      expect(result.length).toEqual(1);
      expect(result[0].board.get('key')).toEqual('lingolinq/quick-core-60');
      expect(result[0].children.length).toEqual(1);
      expect(result[0].children[0].board.get('id')).toEqual('child');
    });

    it('merges children from duplicate-name rows onto the preferred winner', function() {
      var child = makeBoard({ id: 'child', name: 'Child', key: 'lingolinq/child' });
      var winner = makeBoard({ id: '1', name: 'Quick Core 60', key: 'lingolinq/quick-core-60' });
      var loser = makeBoard({ id: '2', name: 'Quick Core 60', key: 'other/quick-core-60' });
      var rows = [
        { board: winner, children: [] },
        { board: loser, children: [{ board: child }] }
      ];
      var result = dedupeBoardRows(rows, { preferUserNames: ['melis', 'lingolinq'] });
      expect(result.length).toEqual(1);
      expect(result[0].board.get('key')).toEqual('lingolinq/quick-core-60');
      expect(result[0].children.length).toEqual(1);
      expect(result[0].children[0].board.get('id')).toEqual('child');
    });

    it('preserves synthetic orphan rows without board ids', function() {
      var root = makeBoard({ id: '1', name: 'Quick Core 60', key: 'lingolinq/quick-core-60' });
      var duplicate = makeBoard({ id: '2', name: 'Quick Core 60', key: 'other/quick-core-60' });
      var orphanBoard = makeBoard({ name: 'Orphan Boards id:99' });
      var orphanChild = makeBoard({ id: 'child', name: 'Child', key: 'lingolinq/child' });
      var rows = [
        { board: root, children: [] },
        { board: duplicate, children: [] },
        { board: orphanBoard, children: [{ board: orphanChild }], orphan: true }
      ];
      var result = dedupeBoardRows(rows, { preferUserNames: ['melis', 'lingolinq'] });
      expect(result.length).toEqual(2);
      expect(result[0].board.get('key')).toEqual('lingolinq/quick-core-60');
      expect(result[1].orphan).toEqual(true);
      expect(result[1].board.get('name')).toEqual('Orphan Boards id:99');
      expect(result[1].children.length).toEqual(1);
    });
  });

  describe('sortBySearchQuery', function() {
    function names(list) {
      return list.map(function(b) { return b.get('name'); });
    }

    it('uses natural name order when the query is empty', function() {
      var a = makeBoard({ id: '1', name: 'Quick Core 112', key: 'lingolinq/quick-core-112' });
      var b = makeBoard({ id: '2', name: 'Quick Core 24', key: 'lingolinq/quick-core-24' });
      var c = makeBoard({ id: '3', name: 'CommuniKate Top Page', key: 'lingolinq/communikate-20' });
      expect(names(sortBySearchQuery([a, b, c], ''))).toEqual([
        'CommuniKate Top Page',
        'Quick Core 24',
        'Quick Core 112'
      ]);
    });

    it('puts name prefix matches first for a typed query', function() {
      var communikate = makeBoard({ id: '1', name: 'CommuniKate Top Page', key: 'lingolinq/communikate-20' });
      var jokes = makeBoard({ id: '2', name: 'jokes', key: 'lingolinq/jokes' });
      var qc24 = makeBoard({ id: '3', name: 'Quick Core 24', key: 'lingolinq/quick-core-24' });
      var qc60 = makeBoard({ id: '4', name: 'Quick Core 60', key: 'lingolinq/quick-core-60' });
      var project = makeBoard({ id: '5', name: 'Project Core-36 Universal Core', key: 'lingolinq/project-core' });
      expect(names(sortBySearchQuery([communikate, jokes, qc60, project, qc24], 'quick'))).toEqual([
        'Quick Core 24',
        'Quick Core 60',
        'CommuniKate Top Page',
        'jokes',
        'Project Core-36 Universal Core'
      ]);
    });

    it('ranks name-contains above key-only matches', function() {
      var named = makeBoard({ id: '1', name: 'Something Quick', key: 'lingolinq/other' });
      var keyed = makeBoard({ id: '2', name: 'Ocean', key: 'lingolinq/quick-core-60-ocean' });
      var other = makeBoard({ id: '3', name: 'jokes', key: 'lingolinq/jokes' });
      expect(names(sortBySearchQuery([other, keyed, named], 'quick'))).toEqual([
        'Something Quick',
        'Ocean',
        'jokes'
      ]);
      expect(searchQueryRank(named, 'quick')).toEqual(1);
      expect(searchQueryRank(keyed, 'quick')).toEqual(2);
      expect(searchQueryRank(other, 'quick')).toEqual(3);
    });
  });
});
