import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* SYNC DETAILS GROUPS FOLDERS UNDER THEIR BOARD (Traci's combined design, 2026-11-14): tabs Needs attention /
 * Ready offline / All boards, one card per board, the first card that needs attention opened, and the old
 * line-by-line log behind "Technical details (for support)". */
module('Unit | Component | sync-details grouped view', function(hooks) {
  setupTest(hooks);

  var roots = {
    'me/core': { root: 'me/core', name: 'Quick Core 60', role: 'home board', key: 'me/core' },
    'me/core-feel': { root: 'me/core', name: 'Feel', key: 'me/core-feel' },
    'me/core-go': { root: 'me/core', name: 'Go', key: 'me/core-go' },
    'me/kb': { root: 'me/kb', name: 'Keyboard', role: 'sidebar board', key: 'me/kb' }
  };
  var statuses = [
    { key: 'me/kb', status: 'cached' },
    { key: 'me/core', status: 'downloaded' },
    { key: 'me/core-feel', status: 'downloaded' },
    { key: 'me/core-go', error: 'failed retrieval' }
  ];

  function build(context, log) {
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ syncing: false, sync_log: log }));
    return context.owner.factoryFor('component:sync-details').create();
  }

  test('opens on Needs attention, with that board opened and its folders split', function(assert) {
    var c = build(this, [{ statuses: statuses, roots: roots }]);
    assert.strictEqual(c.get('current_tab'), 'attention');
    assert.deepEqual(c.get('tabs').map(function(t) { return [t.id, t.count, t.aria_selected]; }), [['attention', 1, 'true'], ['ready', 1, 'false'], ['all', 2, 'false']]);
    var cards = c.get('cards');
    assert.deepEqual(cards.map(function(card) { return card.name; }), ['Quick Core 60']);
    assert.true(cards[0].open, 'the first board that needs attention is opened');
    assert.strictEqual(cards[0].role, 'Home board');
    assert.strictEqual(cards[0].count, '1 of 2 folders saved');
    assert.strictEqual(cards[0].status, '1 folder waiting');
    assert.deepEqual(cards[0].folders_missing, ['Go']);
    assert.deepEqual(cards[0].folders_saved, ['Feel']);
    assert.strictEqual(c.get('save_missing_label'), 'Save it now');
    assert.strictEqual(c.get('summary_pct'), 75);
  });

  test('switching tabs and opening a card', function(assert) {
    var c = build(this, [{ statuses: statuses, roots: roots }]);
    c.get('tabs')[2].pick();
    assert.strictEqual(c.get('current_tab'), 'all');
    assert.deepEqual(c.get('cards').map(function(card) { return card.name; }), ['Quick Core 60', 'Keyboard'], 'home board first');
    var kb = c.get('cards')[1];
    assert.false(kb.open);
    kb.toggle();
    assert.true(c.get('cards')[1].open);
    assert.strictEqual(c.get('cards')[1].expanded, 'true');
    c.get('tabs')[1].pick();
    assert.deepEqual(c.get('cards').map(function(card) { return card.name; }), ['Keyboard']);
  });

  test('a board with many saved folders shows the first few, then all', function(assert) {
    var many = [{ key: 'me/core', status: 'cached' }];
    var r = Object.assign({}, roots);
    for(var i = 0; i < 12; i++) {
      var key = 'me/core-' + (10 + i);
      many.push({ key: key, status: 'cached' });
      r[key] = { root: 'me/core', name: 'F' + (10 + i), key: key };
    }
    var c = build(this, [{ statuses: many, roots: r }]);
    assert.strictEqual(c.get('current_tab'), 'all', 'nothing needs attention');
    var card = c.get('cards')[0];
    assert.strictEqual(card.folders_saved.length, 8);
    assert.true(card.has_more_saved);
    card.toggle_more();
    assert.strictEqual(c.get('cards')[0].folders_saved.length, 12);
  });

  test('no grouped view before a first sync, and the technical log toggles', function(assert) {
    var c = build(this, []);
    assert.strictEqual(c.get('summary'), null);
    assert.deepEqual(c.get('cards'), []);
    assert.false(c.get('show_technical'));
    c.send('toggle_technical');
    assert.true(c.get('show_technical'));
  });

  /* docs/task-management/2026-11-15_persist-sync-log.md: a cancelled sync has no rows; the cards stay on the last
   * sync that checked the boards, and say it is an earlier one. */
  test('a cancelled last sync keeps the earlier result on the cards', function(assert) {
    var c = build(this, [{ statuses: statuses, roots: roots, finished: new Date(1700000000000) }, { canceled: true, statuses: [], finished: new Date(1700000100000) }]);
    assert.deepEqual(c.get('cards').map(function(card) { return card.name; }), ['Quick Core 60']);
    assert.true(c.get('summary.from_earlier'));
    assert.strictEqual(c.get('summary.finished').getTime(), 1700000000000);
  });

  test('after a restart the status line says how the last sync ended', function(assert) {
    assert.strictEqual(build(this, [{ statuses: statuses, roots: roots, canceled: true }]).get('restored_lead'), 'The last sync was canceled.');
    assert.strictEqual(build(this, [{ statuses: statuses, roots: roots, errored: true }]).get('restored_lead'), "The last sync didn't finish. Some boards may not be ready offline.");
    assert.strictEqual(build(this, [{ statuses: statuses, roots: roots, issues: true }]).get('restored_lead'), "The last sync finished, but some boards didn't save.");
    assert.strictEqual(build(this, [{ statuses: statuses, roots: roots }]).get('restored_lead'), null, 'a clean sync keeps the usual line');
  });

  test('a board saved without its picture: ready, opened, and its picture named with Try again', function(assert) {
    var warned = [{ key: 'me/kb', status: 'cached', warning: 'board me/kb saved without its picture: x' }, { key: 'me/core', status: 'downloaded' }, { key: 'me/core-feel', status: 'downloaded' }, { key: 'me/core-go', status: 'downloaded' }];
    var c = build(this, [{ statuses: warned, roots: roots }]);
    var cards = c.get('cards');
    var kb = cards.find(function(card) { return card.name === 'Keyboard'; });
    assert.true(kb.ready, 'still ready offline');
    assert.strictEqual(kb.status, 'Ready offline');
    assert.true(kb.open, 'with nothing that needs attention, the board with a warning is opened');
    assert.true(kb.has_picture_warning);
    assert.deepEqual(kb.pictures_missing, ['Keyboard']);
    var core = cards.find(function(card) { return card.name === 'Quick Core 60'; });
    assert.false(core.has_picture_warning);
    assert.false(core.open);
  });

  test('on Needs attention, a folder saved without its picture is named above the cards', function(assert) {
    var mixed = [{ key: 'me/kb', status: 'cached', warning: 'w' }, { key: 'me/core', status: 'downloaded' }, { key: 'me/core-feel', status: 'downloaded' }, { key: 'me/core-go', error: 'failed retrieval' }];
    var c = build(this, [{ statuses: mixed, roots: roots }]);
    assert.strictEqual(c.get('current_tab'), 'attention');
    assert.strictEqual(c.get('picture_warning_line'), "1 folder's picture couldn't be saved. It shows a plain square until a later sync gets it.");
    assert.true(c.get('cards')[0].open, 'the board that needs attention is still the one opened');
    c.get('tabs')[2].pick();
    assert.strictEqual(c.get('picture_warning_line'), null, 'on All boards its card says it');
  });
});
