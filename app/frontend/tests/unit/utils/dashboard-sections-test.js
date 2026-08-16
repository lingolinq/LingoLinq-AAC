import { module, test } from 'qunit';
import { gridLayoutState, reorderInsert, reorderForFocused, DEFAULT_ORDER, FOCUSED_DEFAULT_ORDER, FOCUSED_ACTION_KEYS } from 'frontend/utils/dashboard_sections';

// Regression lock for the dashboard LAYOUT ENGINE (utils/dashboard_sections.js).
// The engine is an ORDERED-LIST reorder model: the visible sections are packed in
// the saved order — small cards two-per-row, Boards a full-width row, a lone
// trailing small spanning full width. It drives every user's home grid AND the
// Dashboard Design preview, so these invariants must hold.

var AREA_CASELOAD = 'caseload';
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
  // ── Focused View now shares Gentle's default ORDER (2026-08-15) ─────────────
  // Focused used to carry its own FOCUSED_DEFAULT_ORDER, so the same user saw two
  // unrelated arrangements. Both layouts now start from the same role-aware base
  // and Focused only promotes its hero to the front. These lock that in.

  test('focused and gentle agree on the relative order of the FULL-WIDTH cards', function(assert) {
    // The shared thing is the base ORDER LIST, not the rendered reading order. Two
    // documented packing rules make focused's reading order legitimately differ:
    //   1. all four utility cards collapse into ONE row at the first utility's slot,
    //      which pulls editdashboard/reports earlier than gentle shows them;
    //   2. Speak is dropped entirely when it is not the hero (focusedLayout) —
    //      it has no non-hero presentation in Focused.
    // So the invariant is the relative order of the full-width, non-Speak cards.
    var on = ['caseload', 'account', 'createboard', 'org', 'boards', 'speak', 'reports', 'editdashboard'];
    var vis = visFor(on);
    var seq = function(state) {
      var seen = [], out = [];
      state.areas.forEach(function(row) {
        row.split(' ').forEach(function(tok) {
          if (tok === '.' || tok === 'sup' || seen.indexOf(tok) !== -1) { return; }
          seen.push(tok); out.push(tok);
        });
      });
      return out;
    };
    var structural = function(state) {
      return seq(state).filter(function(k) {
        return FOCUSED_ACTION_KEYS.indexOf(k) === -1 && k !== 'extras' && k !== 'speak';
      });
    };
    assert.deepEqual(
      structural(gridLayoutState(vis, null, 'focused', 'caseload')),
      structural(gridLayoutState(vis, null, 'gentle')),
      'caseload/org/boards keep the same relative order in both layouts'
    );
  });

  test('focused drops Speak when it is not the hero', function(assert) {
    // Regression lock for the supervisor Focused View: Speak has no non-hero
    // presentation there (app.scss hides .md-card--speak-as-button in focused), so
    // leaving its key in would reserve a full-width row for an invisible card.
    var vis = visFor(['caseload', 'account', 'boards', 'speak']);
    var supervisor = gridLayoutState(vis, null, 'focused', 'caseload');
    assert.notOk(supervisor.areasValue.includes('speak'),
      'no speak row for a caseload hero');
    var communicator = gridLayoutState(vis, null, 'focused', 'speak');
    assert.ok(communicator.areasValue.includes('speak'),
      'but Speak IS present when it is the hero');
  });

  test('focused keeps the utility cards contiguous in one row', function(assert) {
    var vis = visFor(['caseload', 'account', 'createboard', 'org', 'boards', 'speak', 'reports', 'editdashboard']);
    var state = gridLayoutState(vis, null, 'focused', 'caseload');
    var rowsWithUtility = state.areas.filter(function(row) {
      return row.split(' ').some(function(t) { return FOCUSED_ACTION_KEYS.indexOf(t) !== -1; });
    });
    assert.equal(rowsWithUtility.length, 1,
      'all four utility cards share a single row — that collapse is why the reading ' +
      'order differs from gentle even though the base order is shared');
  });

  test('focused promotes the role hero to the top row', function(assert) {
    var vis = visFor(['caseload', 'account', 'boards', 'speak']);
    var state = gridLayoutState(vis, null, 'focused', 'caseload');
    var first = state.areas[0].split(' ');
    assert.ok(first.every(function(t) { return t === AREA_CASELOAD; }),
      'caseload hero occupies the whole first row for a supervisor');
  });

  test('a communicator\'s focused layout is unchanged by the shared-order switch', function(assert) {
    // Regression lock: DEFAULT_ORDER and the retired FOCUSED_DEFAULT_ORDER filter to
    // the SAME list for a communicator (no caseload/rooms/attention/org), so this
    // change must be a no-op for them. If this fails, communicators were affected.
    var vis = visFor(['speak', 'boards', 'account', 'createboard', 'reports', 'editdashboard']);
    var state = gridLayoutState(vis, null, 'focused');
    assert.ok(state.areas.indexOf('account createboard reports editdashboard') !== -1,
      'utility cards still share one row');
    assert.equal(state.columns, 'repeat(4, 1fr)', 'still 4 columns');
    assert.ok(!state.areasValue.includes('extras'), 'extras still hidden in focused');
  });
});
