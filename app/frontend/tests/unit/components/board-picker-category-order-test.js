import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import LingoLinq from 'frontend/app';

/*
 * /board-picker's category rail: All Available Boards sits LAST, and the page
 * lands on Robust Vocabularies.
 *
 * Both are scoped to the page by `searchAtTop`, which is passed by exactly one
 * caller (templates/board-picker.hbs). The other four BoardPicker call sites --
 * two in setup/board_category, tour-board-picker, home-boards -- never render
 * the All Available Boards entry at all, and already landed on 'robust' (or
 * 'mine'). The last test below pins that separation, because a change here that
 * leaked into the setup flow would be easy to miss.
 */
module('Unit | board-picker category order', function(hooks) {
  setupTest(hooks);

  function build(owner, attrs) {
    var c = owner.factoryFor('component:board-picker').create(attrs || {});
    c._scheduleExplainOverflowCheck = function() {};
    return c;
  }

  test('All Available Boards is LAST on the picker page', function(assert) {
    var c = build(this.owner, { searchAtTop: true });
    var ids = (c.get('categories') || []).map(function(x) { return x.id; });
    assert.strictEqual(ids[ids.length - 1], 'available_boards',
      'the whole catalogue comes after the curated categories, not before them');
    c.destroy();
  });

  test('the curated categories keep their canonical order ahead of it', function(assert) {
    var c = build(this.owner, { searchAtTop: true });
    var ids = (c.get('categories') || []).map(function(x) { return x.id; });
    var canonical = LingoLinq.board_categories.map(function(x) { return x.id; });
    assert.deepEqual(ids.slice(0, canonical.length), canonical,
      'moving All Available Boards must not reshuffle the rest');
    assert.strictEqual(ids[0], 'robust', 'and Robust Vocabularies leads');
    c.destroy();
  });

  test('the page lands on Robust Vocabularies', function(assert) {
    var c = build(this.owner, { searchAtTop: true });
    var sent = [];
    c.send = function(name, arg) { sent.push([name, arg]); };
    c.willInsertElement();
    assert.deepEqual(sent[0], ['set_category', 'robust'],
      'not available_boards -- someone choosing a home board should meet the curated sets first');
    c.destroy();
  });

  test('a supporter picking their own boards still lands on My Boards', function(assert) {
    // include_mine takes precedence over both, and is unaffected by this change.
    var c = build(this.owner, { searchAtTop: true, include_mine: true });
    var sent = [];
    c.send = function(name, arg) { sent.push([name, arg]); };
    c.willInsertElement();
    assert.deepEqual(sent[0], ['set_category', 'mine'], 'include_mine still wins');
    c.destroy();
  });

  test('non-page callers never render All Available Boards at all', function(assert) {
    // setup/board_category, tour-board-picker and home-boards pass no
    // searchAtTop, so the entry is absent rather than merely last.
    var c = build(this.owner, {});
    var ids = (c.get('categories') || []).map(function(x) { return x.id; });
    assert.notOk(ids.indexOf('available_boards') > -1,
      'the catalogue entry is page-only, so those flows are untouched');
    c.destroy();
  });
});
