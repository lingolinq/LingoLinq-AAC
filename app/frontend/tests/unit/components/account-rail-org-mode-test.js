import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import i18n from 'frontend/utils/i18n';
import { setupTest } from '../../helpers';

/* THE MODERN RAIL'S ORG MODE (2026-11-08, requested: Modern org pages need "their own side menu").
 * Given an org it can edit, the rail swaps its account rows for the org's (account-rail-org-rows.hbs)
 * and names itself as Basic's org rail does. Given an org it cannot edit, or none, it is the
 * account rail exactly as before. */
module('Unit | Component | account-rail org mode', function(hooks) {
  setupTest(hooks);

  function rail(context, routeName, org) {
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({ get() { return undefined; }, persist() {} }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({}));
    return context.owner.factoryFor('component:account-rail').create({ org: org });
  }
  var EDITOR = { id: '1_1', permissions: { view: true, edit: true } };
  var VIEWER = { id: '1_1', permissions: { view: true } };

  test('an org editor gets the org menu, named as Basic\'s', function(assert) {
    var c = rail(this, 'organization.index', EDITOR);
    assert.true(c.get('orgNav'));
    assert.strictEqual(c.get('menuName'), i18n.t('classic_org_rail_aria', "Organization navigation"));
  });

  test('anyone else, and every non-org page, keeps the account rail', function(assert) {
    assert.false(rail(this, 'organization.index', VIEWER).get('orgNav'), 'view-only on an org page');
    assert.false(rail(this, 'user.stats', null).get('orgNav'), 'no org');
    assert.strictEqual(rail(this, 'user.stats', null).get('menuName'), i18n.t('account_menu', "Account menu"));
  });

  test('the org row lights for its page, Rooms on a room\'s page too, and nothing on the tab pages', function(assert) {
    assert.strictEqual(rail(this, 'organization.reports', EDITOR).get('orgRow'), 'reports');
    assert.strictEqual(rail(this, 'organization.rooms', EDITOR).get('orgRow'), 'rooms');
    assert.strictEqual(rail(this, 'organization.room', EDITOR).get('orgRow'), 'rooms', 'a room\'s page is a sibling route');
    assert.strictEqual(rail(this, 'organization.people', EDITOR).get('orgRow'), null, 'people sections are the tabs');
    assert.strictEqual(rail(this, 'organization.index', EDITOR).get('orgRow'), null, 'Admin is a tab');
  });

  /* THE HOME BOARD ROW SHOWS THE BOARD'S NAME (requested 2026-11-08), read from the board record;
     `preferences.home_board` carries only id, key, locale and level. The store is stubbed: a board
     found by id, a board found only by key, and none (the template then shows the key's slug). */
  function railWithBoards(context, user, boards) {
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord(type, id) { return boards.find(function(b) { return b.id === id; }) || null; },
      peekAll() { return boards; }
    }));
    var c = rail(context, 'user.goals', null);
    c.set('user', user);
    return c;
  }
  function board(id, key, name) { return { id: id, key: key, get(k) { return { id: id, key: key, name: name }[k]; } }; }
  test('the Home Board row names the board, from its record', function(assert) {
    var user = { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } };
    assert.strictEqual(railWithBoards(this, user, [board('1_9', 'someone/vocal-flair-84', "Vocal Flair")]).get('homeBoardName'), "Vocal Flair", 'by id');
    var noId = { preferences: { home_board: { key: 'someone/vocal-flair-84' } } };
    assert.strictEqual(railWithBoards(this, noId, [board('1_9', 'someone/vocal-flair-84', "Vocal Flair")]).get('homeBoardName'), "Vocal Flair", 'by key');
    assert.strictEqual(railWithBoards(this, user, []).get('homeBoardName'), null, 'not loaded: null, so the slug shows');
  });

  /* THE NAME FOLLOWS THE RECORD (review 2026-11-09): renaming the home board while the rail is up
     must reach the row, so the name is read through the record, not cached beside it. */
  test('the Home Board row follows a rename of the board', function(assert) {
    var rec = EmberObject.create({ id: '1_9', key: 'someone/vocal-flair-84', name: "Vocal Flair" });
    var c = railWithBoards(this, { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } }, [rec]);
    assert.strictEqual(c.get('homeBoardName'), "Vocal Flair");
    rec.set('name', "Core Words");
    assert.strictEqual(c.get('homeBoardName'), "Core Words", 'renamed while the rail is up');
  });

  /* THE ONE FETCH (review 2026-11-09: the fetch path had no test). A board not in the store is
     fetched by key once per key, its arrival names the row, and a failed fetch (offline, or a board
     the viewer cannot read) leaves the slug without throwing or retrying on every render. */
  function railFetching(context, boards, findRecord) {
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord(type, id) { return boards.find(function(b) { return b.get('id') === id; }) || null; },
      peekAll() { return boards; },
      findRecord: findRecord
    }));
    var c = rail(context, 'user.goals', null);
    c.set('user', { preferences: { home_board: { id: '1_9', key: 'someone/vocal-flair-84' } } });
    return c;
  }
  test('a board not in the store is fetched once by key, and names the row when it arrives', async function(assert) {
    var boards = [];
    var calls = [];
    var c = railFetching(this, boards, function(type, key) {
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
    var c = railFetching(this, [], function() { calls++; return Promise.reject(new Error('offline')); });
    c.didReceiveAttrs();
    await Promise.resolve();
    await Promise.resolve();
    c.didReceiveAttrs();
    assert.strictEqual(calls, 1, 'not retried');
    assert.strictEqual(c.get('homeBoardName'), null, 'the slug shows');
  });

  test('the narrow-screen trigger names the org row, else the org menu', function(assert) {
    var reports = rail(this, 'organization.reports', EDITOR);
    var menu = i18n.t('classic_org_rail_aria', "Organization navigation");
    assert.strictEqual(reports.get('activeLabel'), i18n.t('reports', "Reports"));
    assert.strictEqual(reports.get('menuTriggerLabel'), i18n.t('reports', "Reports") + ', ' + menu);
    var people = rail(this, 'organization.people', EDITOR);
    assert.strictEqual(people.get('activeLabel'), menu);
    assert.strictEqual(people.get('menuTriggerLabel'), menu, 'said once');
  });
});
