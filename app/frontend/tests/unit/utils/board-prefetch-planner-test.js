import { module, test } from 'qunit';
import boardPrefetchPlanner from 'frontend/utils/board_prefetch_planner';

function mockUser(attrs) {
  attrs = attrs || {};
  return {
    get: function(k) {
      if (k === 'id') { return attrs.id || '1_50'; }
      if (k === 'preferences.home_board') { return attrs.home_board || null; }
      if (k === 'preferences.sync_starred_boards') { return attrs.sync_starred_boards; }
      if (k === 'stats.starred_board_refs') { return attrs.starred_board_refs || []; }
      return null;
    }
  };
}

module('Unit | Utility | board-prefetch-planner', function() {
  test('collectLikedLookups expands style.options and excludes home', function(assert) {
    var user = mockUser({
      home_board: { key: 'user/home', id: '1_1' },
      starred_board_refs: [
        { key: 'user/home', id: '1_1' },
        {
          key: 'user/style-board',
          style: {
            options: [
              { key: 'user/style-a' },
              { key: 'user/style-b' }
            ]
          }
        },
        { key: 'user/liked-z' }
      ]
    });
    var seen = {};
    boardPrefetchPlanner.collectHomeLookups(user).forEach(function(l) { seen[l] = true; });
    var liked = boardPrefetchPlanner.collectLikedLookups(user, seen);
    assert.deepEqual(liked, ['user/style-a', 'user/style-b', 'user/liked-z'], 'expands options and skips home');
  });

  test('collectLikedLookups skips suggested refs unless sync_starred_boards is true', function(assert) {
    var user = mockUser({
      starred_board_refs: [
        { key: 'user/suggested-pick', suggested: true },
        { key: 'user/real-like' }
      ]
    });
    assert.deepEqual(
      boardPrefetchPlanner.collectLikedLookups(user, {}),
      ['user/real-like'],
      'excludes suggested home-board picker refs by default'
    );
    var syncAllUser = mockUser({
      sync_starred_boards: true,
      starred_board_refs: [
        { key: 'user/suggested-pick', suggested: true },
        { key: 'user/real-like' }
      ]
    });
    assert.deepEqual(
      boardPrefetchPlanner.collectLikedLookups(syncAllUser, {}),
      ['user/suggested-pick', 'user/real-like'],
      'includes suggested refs when sync_starred_boards is true'
    );
  });

  test('collectOwnedRootLookups filters to root tiles only', function(assert) {
    var user = mockUser({ id: '1_50' });
    var boards = [
      { id: '1_10', key: 'user/root-a', copy_id: null },
      { id: '1_11', key: 'user/sub-copy', copy_id: '1_10' }
    ];
    var roots = boardPrefetchPlanner.collectOwnedRootLookups(user, boards, {});
    assert.equal(roots.length, 1, 'one root tile');
    assert.equal(roots[0], 'user/root-a');
  });

  test('buildPhasedLookups dedupes across phases', function(assert) {
    var user = mockUser({
      home_board: { key: 'user/home', id: '1_1' },
      starred_board_refs: [{ key: 'user/home' }, { key: 'user/liked' }]
    });
    var phased = boardPrefetchPlanner.buildPhasedLookups(user, {
      ownedBoards: [
        { id: '1_1', key: 'user/home' },
        { id: '1_2', key: 'user/mine-b' }
      ],
      catalogBoards: [{ key: 'lingolinq/cat' }],
      globalBoards: [{ key: 'lingolinq/cat' }, { key: 'other/public' }],
      includeLiked: true
    });
    assert.deepEqual(phased.phase1, ['user/home']);
    assert.deepEqual(phased.phase2, ['user/liked']);
    assert.deepEqual(phased.phase3, ['user/mine-b']);
    assert.deepEqual(phased.phase4, ['lingolinq/cat', 'other/public']);
  });

  test('collectPublicLookups keeps brand-set roots and drops child pages', function(assert) {
    var user = mockUser();
    var lookups = boardPrefetchPlanner.collectPublicLookups(user, [
      { key: 'lingolinq/vocal-flair-112', name: 'Vocal Flair 112' },
      { key: 'lingolinq/vocal-flair-112-adjectives-ij', name: 'Adjectives IJ' },
      { key: 'lingolinq/communikate-20', name: 'CommuniKate 20' },
      { key: 'lingolinq/communikate-bodyparts', name: 'Body Parts' },
      { key: 'lingolinq/custom-board', name: 'Custom Board' }
    ], [], {});
    assert.deepEqual(
      lookups,
      ['lingolinq/vocal-flair-112', 'lingolinq/communikate-20', 'lingolinq/custom-board'],
      'drops Vocal Flair / CommuniKate child keys when the parent root is in the list'
    );
  });

  test('lookupsToSyncSeeds produces sync queue entries', function(assert) {
    var seeds = boardPrefetchPlanner.lookupsToSyncSeeds(['user/a', '1_99'], 'owned root', 0);
    assert.equal(seeds.length, 2);
    assert.deepEqual(seeds[0], { key: 'user/a', depth: 0, visit_source: 'owned root' });
    assert.deepEqual(seeds[1], { id: '1_99', depth: 0, visit_source: 'owned root' });
  });
});
