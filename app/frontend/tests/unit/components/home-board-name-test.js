import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* THE HOME BOARD'S NAME in a menu row (components/home-board-name.js), shared by Modern's account
 * rail and Basic's rail. Moved here with the logic from account-rail-org-mode-test.js on 2026-11-09,
 * when Basic's rail started using it too; the cases are unchanged. */
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

  /* THE ONE FETCH (review 2026-11-09: the fetch path had no test). A board not in the store is
     fetched by key once per key, its arrival names the row, and a failed fetch (offline, or a board
     the viewer cannot read) leaves the slug without throwing or retrying on every render. */
  function nameFetching(context, boards, findRecord) {
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
  test('a board not in the store is fetched once by key, and names the row when it arrives', async function(assert) {
    var boards = [];
    var calls = [];
    var c = nameFetching(this, boards, function(type, key) {
      calls.push(type + ':' + key);
      boards.push(EmberObject.create({ id: '1_9', key: key, name: "Vocal Flair" }));
      return Promise.resolve();
    });
    assert.strictEqual(c.get('homeBoardName'), null, 'slug until it arrives');
    c.didReceiveAttrs();
    c.didReceiveAttrs();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(calls, ['board:someone/vocal-flair-84'], 'one fetch, by key');
    assert.strictEqual(c.get('homeBoardName'), "Vocal Flair");
  });
  test('a failed fetch leaves the slug and is not retried on the next render', async function(assert) {
    var calls = 0;
    var c = nameFetching(this, [], function() { calls++; return Promise.reject(new Error('offline')); });
    c.didReceiveAttrs();
    await Promise.resolve();
    await Promise.resolve();
    c.didReceiveAttrs();
    assert.strictEqual(calls, 1, 'not retried');
    assert.strictEqual(c.get('homeBoardName'), null, 'the slug shows');
  });
});
