import { module, test } from 'qunit';
import { gridLayoutState, reorderInsert, reorderForFocused, DEFAULT_ORDER, FOCUSED_DEFAULT_ORDER, FOCUSED_ACTION_KEYS } from 'frontend/utils/dashboard_sections';

// Regression lock for the dashboard LAYOUT ENGINE (utils/dashboard_sections.js).
// The engine is an ORDERED-LIST reorder model: the visible sections are packed in
// the saved order — small cards two-per-row, Boards a full-width row, a lone
// trailing small spanning full width. It drives every user's home grid AND the
// Dashboard Design preview, so these invariants must hold.

var ALL_KEYS = ['caseload', 'speak', 'extras', 'org', 'account', 'createboard', 'reports', 'editdashboard', 'boards'];

function visFor(on) {
  var vis = {};
  ALL_KEYS.forEach(function(k) { vis[k] = on.indexOf(k) !== -1; });
  return vis;
}

module('Unit | Utility | dashboard sections layout engine', function() {
  test('default communicator order packs to the expected layout', function(assert) {
    // No caseload/org → DEFAULT_ORDER filters to speak, boards, account,
    // createboard, reports, editdashboard, extras. Speak + Extras are full-width
    // showcase rows for communicators (md-grid--fullspan-*).
    var vis = visFor(['account', 'extras', 'boards', 'createboard', 'speak', 'reports', 'editdashboard']);
    var state = gridLayoutState(vis, null, 'gentle');
    assert.deepEqual(state.areas, [
      'speak speak',
      'boards boards',
      'account createboard',
      'reports editdashboard',
      'extras extras',
      '. sup'
    ], 'default communicator areas');
    assert.equal(state.rows, 'auto auto auto auto auto 0', 'rows');
    assert.ok(state.classes.indexOf('md-grid--fullspan-speak') !== -1, 'speak full-width styling');
    assert.ok(state.classes.indexOf('md-grid--fullspan-extras') !== -1, 'extras full-width styling');
  });

  test('Boards always renders full-width and flags md-grid--boards-full', function(assert) {
    var state = gridLayoutState(visFor(['account', 'boards']), null, 'gentle');
    assert.ok(state.areas.indexOf('boards boards') !== -1, 'boards spans both columns');
    assert.ok(state.classes.indexOf('md-grid--boards-full') !== -1, 'boards-full class');
  });

  test('a lone trailing small card spans full width + gets a fullspan flag', function(assert) {
    var state = gridLayoutState(visFor(['account']), ['account'], 'gentle');
    assert.deepEqual(state.areas, ['account account', '. sup'], 'lone card full-width');
    assert.ok(state.classes.indexOf('md-grid--fullspan-account') !== -1, 'fullspan-account class');
  });

  test('order controls placement; hidden cards are skipped', function(assert) {
    // Uses the small paired cards (account / createboard / reports) — Extras is a
    // full-width showcase now, so it no longer pairs.
    var vis = visFor(['account', 'createboard', 'reports']);
    var a = gridLayoutState(vis, ['account', 'createboard', 'reports'], 'gentle');
    assert.deepEqual(a.areas, ['account createboard', 'reports reports', '. sup'], 'account|createboard then reports');
    var b = gridLayoutState(vis, ['reports', 'account', 'createboard'], 'gentle');
    assert.deepEqual(b.areas, ['reports account', 'createboard createboard', '. sup'], 'reordered');
  });

  test('reorderInsert moves a card before/after a target in the full order', function(assert) {
    var after = reorderInsert(DEFAULT_ORDER, 'reports', 'account', true);
    assert.ok(after.indexOf('reports') === after.indexOf('account') + 1, 'reports lands right after account');
    var before = reorderInsert(DEFAULT_ORDER, 'reports', 'account', false);
    assert.ok(before.indexOf('reports') === before.indexOf('account') - 1, 'reports lands just before account');
    assert.equal(after.length, DEFAULT_ORDER.length, 'no card lost on reorder');
  });

  test('focused layout puts the Speak hero full-width on top, no Extras', function(assert) {
    var vis = visFor(['speak', 'extras', 'boards', 'account']);
    var state = gridLayoutState(vis, null, 'focused');
    // The hero spans the full row whatever the column count (here 1 utility card → 1 col).
    var hero = state.areas[0].split(' ');
    assert.ok(hero.length >= 1 && hero.every(function(t) { return t === 'speak'; }), 'speak hero on top, full width');
    assert.ok(!state.areasValue.includes('extras'), 'extras never shows in focused');
  });

  test('focused layout puts the four action cards on one 4-up row', function(assert) {
    var vis = visFor(['speak', 'boards', 'account', 'createboard', 'reports', 'editdashboard']);
    var state = gridLayoutState(vis, null, 'focused');
    assert.ok(state.areas.indexOf('account createboard reports editdashboard') !== -1, 'action cards share one row');
    assert.ok(state.areas.indexOf('boards boards boards boards') !== -1, 'boards is a full-width row');
    assert.equal(state.columns, 'repeat(4, 1fr)', '4 utility cards → 4 columns');
  });

  test('focused columns track the visible utility-card count — remaining cards fill the row', function(assert) {
    // Hide one utility card: 3 remain → 3 columns, the row fills with no empty cells.
    var vis = visFor(['speak', 'boards', 'account', 'createboard', 'reports']);
    var state = gridLayoutState(vis, null, 'focused');
    assert.equal(state.columns, 'repeat(3, 1fr)', '3 utility cards → 3 columns');
    assert.ok(state.areas.indexOf('account createboard reports') !== -1, 'utility row fills 3 cols');
    assert.ok(state.areas.indexOf('boards boards boards') !== -1, 'boards spans the 3 cols');
    // No "." padding cells in any content row (only the trailing sup spacer carries them).
    state.areas.slice(0, -1).forEach(function(row) {
      assert.ok(row.indexOf('.') === -1, 'no empty padding cells: ' + row);
    });
  });

  test('gentle layout leaves the column count to the stylesheet', function(assert) {
    var state = gridLayoutState(visFor(['account', 'boards']), null, 'gentle');
    assert.notOk(state.columns, 'gentle columns is null');
  });

  test('reorderForFocused: utility cards reorder within their row', function(assert) {
    var order = reorderForFocused(FOCUSED_DEFAULT_ORDER, 'reports', 'account', false);
    assert.ok(order, 'within-row reorder allowed');
    assert.equal(order.indexOf('reports'), order.indexOf('account') - 1, 'reports lands just before account');
  });

  test('reorderForFocused: a utility card cannot leave its row onto a full-width row', function(assert) {
    assert.equal(reorderForFocused(FOCUSED_DEFAULT_ORDER, 'account', 'boards', true), null, 'utility-onto-row drop rejected');
  });

  test('reorderForFocused: a full-width row snaps to the utility-block edge', function(assert) {
    var order = reorderForFocused(FOCUSED_DEFAULT_ORDER, 'boards', 'account', true);
    assert.ok(order, 'row reposition allowed');
    var actionIdxs = order.map(function(k, i) { return FOCUSED_ACTION_KEYS.indexOf(k) !== -1 ? i : -1; }).filter(function(i) { return i !== -1; });
    assert.ok(order.indexOf('boards') > Math.max.apply(null, actionIdxs), 'boards lands after the whole utility block, not between cards');
  });

  test('every layout ends with the 0-height ". sup" spacer row', function(assert) {
    [['account', 'boards'], ['speak', 'extras', 'reports'], []].forEach(function(on) {
      var state = gridLayoutState(visFor(on), null, 'gentle');
      assert.equal(state.areas[state.areas.length - 1], '. sup', 'sup row — ' + (on.join('+') || 'none'));
      assert.ok(/ 0$/.test(state.rows) || state.rows === '0', 'rows end at 0 — ' + (on.join('+') || 'none'));
    });
  });
});
