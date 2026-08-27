import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* Regression guard for the 2026-08-16 `@compactRow` behaviour leak.
 *
 * `compactRow` used to mean BOTH "render the compact row look" AND "a click on this
 * card opens the board preview instead of activating the board". That second half is
 * picker-only: the picker's whole card is the preview target and the board is chosen
 * from inside the preview. When the Boards page started reusing `@compactRow` purely
 * for the compact LOOK, it silently inherited the behaviour and EVERY card on that
 * page stopped opening its board (components/board-icon.js:362-377).
 *
 * The flags are now split — `compactRow` = look, `pickOpensPreview` = behaviour — and
 * the preview branch requires BOTH. These tests pin that gate, so re-merging the two
 * (or passing `pickOpensPreview` from a non-picker surface) fails here instead of on
 * the page.
 *
 * SCOPE: this drives the `pick_board` action directly and stubs `send`, so it tests
 * the ROUTING DECISION in isolation. It deliberately does not exercise the real
 * `board_preview` action (which schedules a runLater and opens a modal) nor the
 * template's click/Enter/Space bindings. Those need a rendering test.
 */
module('Unit | Component | board-icon (compactRow vs pickOpensPreview)', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:app-state', Service.extend({}));
    this.owner.register('service:router', Service.extend({}));
  });

  // Builds the component plus the two spies the routing decision lands on:
  // `sent` records dispatched actions (the preview branch), `picked` records
  // onAction calls (the normal activation branch).
  function build(owner, attrs) {
    var sent = [];
    var picked = [];
    var record = EmberObject.create({ key: 'someone/my-board', id: '1_1' });
    var comp = owner.factoryFor('component:board-icon').create(Object.assign({
      board_record: record,
      onAction: function(arg) { picked.push(arg); }
    }, attrs || {}));
    comp.send = function(actionName) { sent.push(actionName); };
    return { comp: comp, record: record, sent: sent, picked: picked };
  }

  test('compactRow AND pickOpensPreview: the click opens the preview', function(assert) {
    var t = build(this.owner, { compactRow: true, pickOpensPreview: true });

    t.comp.actions.pick_board.call(t.comp, t.record);

    assert.deepEqual(t.sent, ['board_preview'], 'dispatched board_preview');
    assert.equal(t.picked.length, 0, 'did not activate the board');
  });

  test('compactRow WITHOUT pickOpensPreview: the click activates the board', function(assert) {
    // This is the Boards page. Before the split it hit the preview branch above,
    // which is the bug that shipped.
    var t = build(this.owner, { compactRow: true });

    t.comp.actions.pick_board.call(t.comp, t.record);

    assert.deepEqual(t.sent, [], 'did NOT dispatch board_preview');
    assert.equal(t.picked.length, 1, 'activated the board');
    assert.strictEqual(t.picked[0], t.record, 'handed back the board record');
  });

  test('pickOpensPreview WITHOUT compactRow: the click activates the board', function(assert) {
    // The gate is an AND on purpose: detailed picker cards pick directly.
    var t = build(this.owner, { compactRow: false, pickOpensPreview: true });

    t.comp.actions.pick_board.call(t.comp, t.record);

    assert.deepEqual(t.sent, [], 'did NOT dispatch board_preview');
    assert.equal(t.picked.length, 1, 'activated the board');
  });

  test('neither flag: the click activates the board', function(assert) {
    var t = build(this.owner, {});

    t.comp.actions.pick_board.call(t.comp, t.record);

    assert.deepEqual(t.sent, [], 'did NOT dispatch board_preview');
    assert.equal(t.picked.length, 1, 'activated the board');
  });

  test('no board record: nothing is dispatched or activated', function(assert) {
    // The synthetic "Orphan Boards id:…" cluster row is an unsaved record with no
    // key — the safety check has to hold, or a dead row throws on click.
    var t = build(this.owner, { compactRow: true, pickOpensPreview: true, board_record: null });

    t.comp.actions.pick_board.call(t.comp, null);

    assert.deepEqual(t.sent, [], 'no action dispatched');
    assert.equal(t.picked.length, 0, 'nothing activated');
  });
});
