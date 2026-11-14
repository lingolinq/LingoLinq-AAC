import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import offlineSyncSeeds, { offline_sync_seeds, CRISIS_VOCABULARY_KEY } from 'frontend/utils/offline_sync_seeds';

// Which boards an offline sync starts from (#1221): home, sidebar, starred, and Crisis Vocabulary always.
function user(prefs, starred) {
  return EmberObject.create({ preferences: prefs || {}, stats: { starred_board_refs: starred || [] } });
}
const keys = (seeds) => seeds.map((s) => s.key || s.id);

module('Unit | Utility | offline_sync_seeds', function() {
  test('home, sidebar and starred boards, with their sources', function(assert) {
    const seeds = offline_sync_seeds(user(
      { home_board: { id: '1_1', key: 'kid/home' }, sidebar_boards: [{ key: 'kid/yesno', image: 'y.png' }, { key: 'kid/crisis-vocabulary' }] },
      [{ key: 'kid/starter', image_url: 's.png' }]
    ));
    assert.deepEqual(keys(seeds), ['kid/home', 'kid/yesno', 'kid/crisis-vocabulary', 'kid/starter']);
    assert.deepEqual(seeds.map((s) => s.visit_source), ['home board', 'sidebar board', 'sidebar board', 'starred board']);
    assert.strictEqual(seeds[0].depth, 0, 'the home board starts the tree');
  });

  test('the system\'s suggestions are not synced, unless the home board is the list of liked boards', function(assert) {
    const starred = [{ key: 'lingolinq/popular', suggested: true }, { key: 'kid/mine' }];
    assert.notOk(keys(offline_sync_seeds(user({}, starred))).includes('lingolinq/popular'));
    assert.ok(keys(offline_sync_seeds(user({ sync_starred_boards: true }, starred))).includes('lingolinq/popular'));
  });

  test('Crisis Vocabulary is always there, also when the sidebar was replaced', function(assert) {
    const seeds = offline_sync_seeds(user({ sidebar_boards: [{ key: 'kid/my-own' }] }));
    assert.ok(keys(seeds).includes(CRISIS_VOCABULARY_KEY));
    assert.strictEqual(seeds.filter((s) => /crisis-vocabulary$/.test(s.key)).length, 1, 'once');
  });

  test('a sidebar copy of Crisis Vocabulary counts, so it is not added twice', function(assert) {
    const seeds = offline_sync_seeds(user({ sidebar_boards: [{ key: 'kid/crisis-vocabulary' }] }));
    assert.strictEqual(seeds.filter((s) => /crisis-vocabulary$/.test(s.key)).length, 1);
  });

  test('a starred board with style options syncs each option', function(assert) {
    const seeds = offline_sync_seeds(user({}, [{ key: 'kid/set', style: { options: [{ key: 'kid/set-a' }, { key: 'kid/set-b' }] } }]));
    assert.deepEqual(keys(seeds).slice(0, 2), ['kid/set-a', 'kid/set-b']);
  });

  test('the home board preference is not changed', function(assert) {
    const home = { id: '1_1', key: 'kid/home' };
    offline_sync_seeds(user({ home_board: home }));
    assert.deepEqual(home, { id: '1_1', key: 'kid/home' });
  });

  test('no user, no seeds', function(assert) {
    assert.deepEqual(offline_sync_seeds(null), []);
  });

  // The sync loads a button set (the list Find a Button and word suggestions read offline) for the boards
  // it starts from, not for the boards they link to.
  test('every board the sync starts from gets its button set', function(assert) {
    assert.expect(6);
    var seeds = offline_sync_seeds(user(
      { home_board: { id: '1_1', key: 'me/home' }, sidebar_boards: [{ key: 'me/side' }], sync_starred_boards: true },
      [{ id: '1_2', key: 'me/liked' }, { id: '1_3', key: 'lib/suggested', suggested: true }]
    ));
    assert.deepEqual(seeds.map((s) => s.visit_source), ['home board', 'sidebar board', 'starred board', 'suggested board', 'crisis vocabulary']);
    seeds.forEach(function(seed) {
      assert.true(offlineSyncSeeds.gets_button_set(seed), seed.visit_source + ' at depth ' + seed.depth);
    });
  });

  test('a liked board that is also the home board is one seed, not two', function(assert) {
    var seeds = offline_sync_seeds(user(
      { home_board: { id: '1_1', key: 'me/home' } },
      [{ id: '1_1', key: 'me/home' }, { key: 'me/home' }, { id: '1_2', key: 'me/liked' }]
    ));
    assert.deepEqual(keys(seeds), ['me/home', 'me/liked', CRISIS_VOCABULARY_KEY]);
    assert.strictEqual(seeds[0].visit_source, 'home board');
  });

  test('a liked board with its own id is kept, also when its key matches the home board', function(assert) {
    var seeds = offline_sync_seeds(user(
      { home_board: { id: '1_1', key: 'me/home' } },
      [{ id: '1_2', key: 'me/home' }]
    ));
    assert.deepEqual(seeds.map((s) => s.visit_source), ['home board', 'starred board', 'crisis vocabulary']);
  });

  test('a board reached through a link does not get its own button set', function(assert) {
    assert.false(offlineSyncSeeds.gets_button_set({ key: 'me/folder', depth: 1, visit_source: 'me/home' }));
    assert.false(offlineSyncSeeds.gets_button_set({ key: 'me/deeper', depth: 2, visit_source: 'me/liked' }));
    assert.false(offlineSyncSeeds.gets_button_set({ key: 'me/deeper', depth: 2, visit_source: 'starred board' }));
    assert.false(offlineSyncSeeds.gets_button_set(null));
  });
});
