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

  function build(context, log, extra) {
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend(Object.assign({ syncing: false, sync_log: log }, extra || {})));
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
    assert.strictEqual(c.get('headline'), '1 of 2 boards are ready offline', 'the drawer\'s wording, no percentage (Traci, 2026-11-16)');
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

  /* docs/task-management/2026-11-16_sync-details-no-percent.md (Traci, 2026-11-16): Sync Details never shows a
   * percentage; after a sync it says what the drawer says; while a sync runs, and after a sync that stopped with no
   * finished one before it, the cards carry no Ready labels and there are no tabs. */
  test('while a sync runs: no headline, no tabs, and cards without Ready labels', function(assert) {
    var c = build(this, [], { syncing: true, sync_progress: { board_statuses: statuses, board_roots: roots, visited: 3 } });
    assert.strictEqual(c.get('headline'), null);
    assert.false(c.get('show_tabs'));
    c.set('tab', 'ready');
    assert.deepEqual(c.get('cards').map(function(card) { return card.name; }), ['Quick Core 60', 'Keyboard'], 'every board, whatever tab was picked before');
    assert.deepEqual(c.get('cards').map(function(card) { return card.status; }), [null, null], 'no Ready labels');
    assert.strictEqual(c.get('cards')[0].count, '1 folder saved');
    assert.strictEqual(c.get('cards')[0].folders_inside, null, 'no total of folders while it is not known');
    assert.strictEqual(c.get('summary_line'), null, 'the status line says how many are saved so far');
  });

  test('a finished sync: the drawer\'s wording, and all ready when nothing is missing', function(assert) {
    var clean = statuses.filter(function(s) { return !s.error; });
    var c = build(this, [{ statuses: clean, roots: roots }]);
    assert.strictEqual(c.get('headline'), 'All your boards are ready offline');
    assert.true(c.get('show_tabs'));
    assert.strictEqual(c.get('cards')[0].status, 'Ready offline');
  });

  test('cards from an earlier finished sync carry no ready headline (Traci, 2026-11-16)', function(assert) {
    var c = build(this, [{ statuses: statuses, roots: roots, finished: new Date(1700000000000) }, { errored: true, statuses: [{ key: 'me/kb', status: 'cached' }], roots: roots, finished: new Date(1700000100000) }]);
    assert.true(c.get('summary.from_earlier'));
    assert.strictEqual(c.get('headline'), null);
    assert.true(c.get('show_tabs'), 'the earlier sync finished, so its cards keep their labels');
  });

  test('no finished sync: what the stopped sync saved, under its own heading', function(assert) {
    var c = build(this, [{ errored: true, statuses: statuses, roots: roots, finished: new Date(1700000000000) }]);
    assert.true(c.get('stopped'));
    assert.strictEqual(c.get('headline'), null);
    assert.false(c.get('show_tabs'));
    c.set('tab', 'attention');
    var cards = c.get('cards');
    assert.deepEqual(cards.map(function(card) { return card.name; }), ['Quick Core 60', 'Keyboard'], 'every board saved before the stop');
    assert.deepEqual(cards.map(function(card) { return card.status; }), [null, null], 'no Ready labels');
    assert.strictEqual(cards[0].count, '1 folder saved');
    assert.deepEqual(cards[0].folders_missing, ['Go'], 'a failure recorded before the stop still shows');
    assert.notOk(/\d+ boards open|saved separately/.test(cards[0].intro_text), 'no total of folders it did not reach');
    assert.strictEqual(cards[1].no_folders_text, 'No folders were saved before the sync stopped.');
    assert.strictEqual(c.get('summary_line'), '3 boards and folders are saved on this device.');
    assert.strictEqual(c.get('missing_count'), 0, 'no "Save the N now": only the failures it reached are known');
  });

  // Part 2 (2026-11-17): a cancelled sync now logs its rows (services/persistence.js end_canceled_sync); a download its
  // lookup never finished is 'not_saved', which reads as not saved, not as a failure.
  test('no finished sync, the last one cancelled: what it saved, under the stopped heading; an unfinished download is not counted', function(assert) {
    var parked_roots = Object.assign({ 'me/core-parked': { root: 'me/core', name: 'Parked', key: 'me/core-parked' } }, roots);
    var rows = statuses.concat([{ key: 'me/core-parked', status: 'not_saved' }]);
    var c = build(this, [{ canceled: true, statuses: rows, roots: parked_roots, finished: new Date(1700000000000) }]);
    assert.true(c.get('stopped'));
    assert.strictEqual(c.get('headline'), null);
    assert.false(c.get('show_tabs'));
    assert.strictEqual(c.get('summary_line'), '3 boards and folders are saved on this device.', 'the unfinished download is not counted');
    assert.deepEqual(c.get('cards')[0].folders_missing, ['Go', 'Parked']);
    assert.strictEqual(c.get('restored_lead'), 'The last sync was canceled.');
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
    assert.strictEqual(c.get('picture_warning_line'), "The picture for Keyboard couldn't be saved. It shows a placeholder picture until a later sync gets it.");
    assert.true(c.get('cards')[0].open, 'the board that needs attention is still the one opened');
    c.get('tabs')[2].pick();
    assert.strictEqual(c.get('picture_warning_line'), null, 'on All boards its card says it');
  });

  // Merge of develop (#1334) into this branch: while unfinished there are no tabs and every board is listed, so the
  // picture warning stays on its card, not above the cards, even though current_tab still reads 'attention'.
  test('no finished sync: a folder saved without its picture is named on its card, not above the cards', function(assert) {
    var mixed = [{ key: 'me/kb', status: 'cached', warning: 'w' }, { key: 'me/core', status: 'downloaded' }, { key: 'me/core-feel', status: 'downloaded' }, { key: 'me/core-go', error: 'failed retrieval' }];
    var c = build(this, [{ errored: true, statuses: mixed, roots: roots, finished: new Date(1700000000000) }]);
    assert.true(c.get('unfinished'));
    assert.strictEqual(c.get('current_tab'), 'attention', 'the tab still reads attention, as the guard expects');
    assert.strictEqual(c.get('picture_warning_line'), null);
    var kb = c.get('cards').find(function(card) { return card.name === 'Keyboard'; });
    assert.true(kb.has_picture_warning, 'its card names it');
  });

  // Round-1 review Low 4 (2026-11-20): a stopped sync that saved nothing says so, instead of "Saved before the sync
  // stopped" over "0 boards and folders are saved on this device."; its recorded failures still show.
  test('no finished sync, the stopped one saved nothing: it says nothing was saved, and its failures still show', function(assert) {
    var none = [{ key: 'me/kb', status: 'not_saved' }, { key: 'me/core', status: 'not_saved' }, { key: 'me/core-go', error: 'failed retrieval' }];
    var c = build(this, [{ canceled: true, statuses: none, roots: roots, finished: new Date(1700000000000) }]);
    assert.true(c.get('stopped'));
    assert.true(c.get('nothing_saved'));
    assert.strictEqual(c.get('summary_line'), 'No boards are saved on this device yet.');
    var core = c.get('cards').find(function(card) { return card.name === 'Quick Core 60'; });
    assert.deepEqual(core.folders_missing, ['Go'], 'the failure recorded before the stop still shows');
  });

  test('a stopped sync that saved something keeps its heading and count', function(assert) {
    var c = build(this, [{ errored: true, statuses: statuses, roots: roots, finished: new Date(1700000000000) }]);
    assert.false(c.get('nothing_saved'));
    assert.strictEqual(c.get('summary_line'), '3 boards and folders are saved on this device.');
  });
});
