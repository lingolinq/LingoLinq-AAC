import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { A } from '@ember/array';
import { setupTest } from '../../helpers';

/* THE HOME BOARD'S NAME in a menu row (components/home-board-name.js), shared by Modern's account
 * rail and Basic's rail. Moved here with the logic from account-rail-org-mode-test.js on 2026-11-09,
 * when Basic's rail started using it too. */
module('Unit | Component | home-board-name', function(hooks) {
  setupTest(hooks);

  /* THE HOME BOARD ROW SHOWS THE BOARD'S NAME (requested 2026-11-08), read from the board record;
     `preferences.home_board` carries only id, key, locale and level. The store is stubbed: a board
     found by id, a board found only by key, and none (the template then shows the key's slug). */
  function nameWithBoards(context, user, boards) {
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord(type, id) { return boards.find(function(b) { return b.id === id; }) || null; },
      peekAll() { return boards; }
    }));
    var c = context.owner.factoryFor('component:home-board-name').create();
    c.set('user', user);
    return c;
  }
  function board(id, key, name) { return { id: id, key: key, get(k) { return { id: id, key: key, name: name }[k]; } }; }
  test('the Home Board row names the board, from its record', function(assert) {
    var user = { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } };
    assert.strictEqual(nameWithBoards(this, user, [board('1_9', 'someone/vocal-flair-84', "Vocal Flair")]).get('homeBoardName'), "Vocal Flair", 'by id');
    var noId = { preferences: { home_board: { key: 'someone/vocal-flair-84' } } };
    assert.strictEqual(nameWithBoards(this, noId, [board('1_9', 'someone/vocal-flair-84', "Vocal Flair")]).get('homeBoardName'), "Vocal Flair", 'by key');
    assert.strictEqual(nameWithBoards(this, user, []).get('homeBoardName'), null, 'not loaded: null, so the slug shows');
  });

  /* THE NAME FOLLOWS THE RECORD (review 2026-11-09): renaming the home board while the rail is up
     must reach the row, so the name is read through the record, not cached beside it. */
  test('the Home Board row follows a rename of the board', function(assert) {
    var rec = EmberObject.create({ id: '1_9', key: 'someone/vocal-flair-84', name: "Vocal Flair" });
    var c = nameWithBoards(this, { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } }, [rec]);
    assert.strictEqual(c.get('homeBoardName'), "Vocal Flair");
    rec.set('name', "Core Words");
    assert.strictEqual(c.get('homeBoardName'), "Core Words", 'renamed while the rail is up');
  });

  /* NEVER A FETCH (decided 2026-11-09 after the red-team review; replaces the "one fetch" tests):
     labelling a row must not download, cache or list a board, least of all a communicator's. A board
     that is not loaded leaves the slug, and nothing is requested; a board that loads LATER (the store's
     live list grows) names the row then. */
  function nameWatching(context, boards, findRecord) {
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord(type, id) { return boards.find(function(b) { return b.get('id') === id; }) || null; },
      peekAll() { return boards; },
      findRecord: findRecord
    }));
    var c = context.owner.factoryFor('component:home-board-name').create();
    c.set('user', { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } });
    return c;
  }
  test('a board that is not loaded is never fetched; the slug shows', function(assert) {
    var calls = 0;
    var c = nameWatching(this, A([]), function() { calls++; return Promise.resolve(); });
    assert.strictEqual(c.get('homeBoardName'), null, 'the slug shows');
    assert.strictEqual(calls, 0, 'no request for the board');
  });
  test('a board that loads later names the row', function(assert) {
    var boards = A([]);
    var c = nameWatching(this, boards, function() { throw new Error('must not fetch'); });
    assert.strictEqual(c.get('homeBoardName'), null, 'not loaded yet');
    boards.pushObject(EmberObject.create({ id: '1_9', key: 'someone/vocal-flair-84', name: "Vocal Flair" }));
    assert.strictEqual(c.get('homeBoardName'), "Vocal Flair", 'named once it is in the store');
  });
});
