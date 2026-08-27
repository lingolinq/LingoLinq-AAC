import { module, test } from 'qunit';
import { gridLayoutState, reorderInsert, reorderForFocused, DEFAULT_ORDER, FOCUSED_DEFAULT_ORDER, FOCUSED_ACTION_KEYS, layoutPresentation, HOME_SECTIONS, AREA } from 'frontend/utils/dashboard_sections';

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
    // NO 'org' IN THIS SET (2026-08-16). Org managers deliberately no longer satisfy this
    // invariant, and the combination this test used to drive — org visible with a
    // 'caseload' hero — cannot occur anyway: `focusedHeroKey` returns 'org' whenever the
    // org card is available, so a user with org would always get the org hero.
    // The org exception is asserted separately below; this case keeps guarding the rule
    // for everyone else, which is what it was written for.
    var on = ['caseload', 'account', 'createboard', 'boards', 'speak', 'reports', 'editdashboard'];
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

  // ── ORG MANAGERS are a documented exception (2026-08-16) ────────────────────
  // Their two layouts were specified independently and do NOT share a reading order:
  //   gentle  — org, account+createboard, caseload, boards, then the rest
  //   focused — org hero, utility row, boards, then Caseload | Speak paired on the last row
  // So Caseload precedes Boards in Gentle and follows it in Focused. This test pins that
  // divergence deliberately, so the pair above cannot be "fixed" back into agreement by
  // someone who reads the invariant test and assumes it applies to everyone.
  test('org managers deliberately DIVERGE: caseload before boards in gentle, after in focused', function(assert) {
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
    var g = seq(gridLayoutState(vis, null, 'gentle'));
    var f = seq(gridLayoutState(vis, null, 'focused', 'org'));
    assert.ok(g.indexOf('org_mgmt') === 0, 'gentle leads with My Organizations');
    assert.ok(f.indexOf('org_mgmt') === 0, 'focused leads with My Organizations');
    assert.ok(g.indexOf('caseload') < g.indexOf('boards'), 'gentle: caseload before boards');
    assert.ok(f.indexOf('boards') < f.indexOf('caseload'), 'focused: boards before the caseload/speak pair');
    assert.ok(f.indexOf('speak') === f.indexOf('caseload') + 1, 'focused: speak sits immediately after caseload (the paired row)');
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

// Regression lock for layoutPresentation — the SINGLE description of a layout, shared by
// the live home page, the Dashboard Design clone, and the Display Style preview iframes.
// A preview shows the layout the user is NOT in, so it must re-derive every layout-
// dependent input; when each surface derived them separately they drifted, and these
// tests pin the two drifts that actually shipped.
function fakeUser(data) {
  var d = data || {};
  return {
    get: function(path) {
      return String(path).split('.').reduce(function(acc, k) {
        return (acc === null || acc === undefined) ? acc : acc[k];
      }, d);
    }
  };
}
// Every area token the grid places, as a Set of section KEYS.
function placedKeys(state) {
  var tokens = state.areasValue.replace(/["']/g, ' ').split(/\s+/).filter(Boolean);
  var keys = {};
  Object.keys(AREA).forEach(function(key) {
    if (tokens.indexOf(AREA[key]) !== -1) { keys[key] = true; }
  });
  return keys;
}

module('Unit | Utility | dashboard sections layoutPresentation', function() {
  test('the saved drag order is gated on the drag flag', function(assert) {
    // The bug: the Display Style preview iframes read preferences.dashboard_order
    // DIRECTLY while the live page and the Dashboard Design modal gated it on
    // `dashboard_drag_layout`. `dashboard_order` is only ever SET by the flagged drag
    // UI, so a user with a stale saved order and the flag off saw previews packed in
    // an order the real page would never render.
    var order = ['boards', 'account', 'speak', 'createboard', 'reports', 'editdashboard'];
    var user = fakeUser({ preferences: { dashboard_order: order } });

    var off = layoutPresentation(user, 'gentle', { dragEnabled: false });
    assert.equal(off.order, null, 'flag off → saved order ignored');

    var on = layoutPresentation(user, 'gentle', { dragEnabled: true });
    assert.deepEqual(on.order, order, 'flag on → saved order used');
    assert.notDeepEqual(off.grid.areas, on.grid.areas,
      'the gate actually changes the packing — so getting it wrong is user-visible');
    assert.deepEqual(off.grid.areas, layoutPresentation(user, 'gentle', {}).grid.areas,
      'omitting dragEnabled is treated as off, never as on');
  });

  // Speak and Extras are ALLOWED to sit outside grid-template-areas: app.scss
  // (`.md-grid--dashboard:not(.md-grid--hero-org) > .md-card--speak`, and the same for
  // `--extras`) full-spans them with `grid-column: 1 / -1`, which resolves to the
  // explicit grid's first/last lines and so cannot create a track. Focused deliberately
  // drops Speak from the areas whenever another section is the hero — a supervisor's
  // Speak card renders full-width underneath. Every OTHER visible card must be placed:
  // nothing else has a net, so it would get an implicit row of its own.
  var FULLSPAN_SAFETY_NET = ['speak', 'extras'];

  test('no section is visible but unplaced, in either layout', function(assert) {
    // The bug the user reported: Focused View drops Extras, but the preview only
    // re-packed the grid — it left the Extras card in the DOM. A visible card that is
    // not named in grid-template-areas is placed OUTSIDE the explicit grid, gets an
    // implicit row, and (via the full-span safety rule in app.scss) stretched across
    // the top. The preview advertised a card the real Focused page does not have.
    var users = {
      communicator: fakeUser({}),
      supervisor: fakeUser({ supporter_role: 'supporter' }),
      'org manager': fakeUser({
        supporter_role: 'supporter',
        organizations: [{ type: 'manager' }]
      })
    };
    Object.keys(users).forEach(function(role) {
      ['gentle', 'focused'].forEach(function(layout) {
        var pres = layoutPresentation(users[role], layout, {});
        var placed = placedKeys(pres.grid);
        // Filtered rather than guarded with early returns: qunit/no-early-return treats a
        // `return` anywhere in a test body as an early exit, and a filter says the same
        // thing more directly — these are the cards that MUST be placed.
        HOME_SECTIONS.filter(function(sec) {
          return pres.vis[sec.key] && FULLSPAN_SAFETY_NET.indexOf(sec.key) === -1;
        }).forEach(function(sec) {
          assert.ok(placed[sec.key],
            role + ' / ' + layout + ': "' + sec.key + '" is visible, so it must be placed');
        });
        // The half of the pair that actually broke: Extras must never be VISIBLE on
        // Focused View, safety net or not — the net makes an orphan full-width, which
        // is what put a phantom Extras card across the top of the Focused preview.
        // Asserted unconditionally (qunit/no-conditional-assertions): on Gentle the
        // left-hand side is false, so the claim holds vacuously and the assertion still
        // runs, keeping the per-run assertion count stable.
        assert.notOk(layout === 'focused' && pres.vis.extras,
          role + ' / ' + layout + ': Extras is never visible on Focused View');
      });
    });
  });

  test('Focused View forces Extras off, so vis and the grid agree', function(assert) {
    var user = fakeUser({});
    assert.equal(layoutPresentation(user, 'focused', {}).vis.extras, false,
      'focused hides extras — Speak takes the focal hero slot');
    assert.equal(layoutPresentation(user, 'gentle', {}).vis.extras, true,
      'gentle still shows extras');
    // Even when a caller hands in live UI state that says otherwise.
    assert.equal(layoutPresentation(user, 'focused', { vis: { extras: true } }).vis.extras, false,
      'a checkbox cannot re-enable Extras on Focused View');
  });

  test('live UI state wins over saved preferences when supplied', function(assert) {
    // The Dashboard Design modal passes the checkboxes the user is toggling RIGHT NOW.
    var user = fakeUser({ preferences: { dashboard_sections: { boards: false } } });
    assert.equal(layoutPresentation(user, 'gentle', {}).vis.boards, false,
      'no override → saved preference governs');
    assert.equal(layoutPresentation(user, 'gentle', { vis: { boards: true } }).vis.boards, true,
      'override → the live checkbox governs');
  });

  test('non-grid toggles follow the caller, and gentleOnly ones drop on Focused', function(assert) {
    var user = fakeUser({});
    assert.equal(layoutPresentation(user, 'gentle', {}).toggles.hero, true,
      'welcome banner shows on gentle by default');
    assert.equal(layoutPresentation(user, 'focused', {}).toggles.hero, false,
      'gentleOnly toggle is off on focused');
    assert.equal(layoutPresentation(user, 'gentle', { vis: { hero: false } }).toggles.hero, false,
      'a live checkbox turns it off');
    assert.equal(layoutPresentation(user, 'gentle', { vis: {} }).toggles.hero, undefined,
      'a caller whose UI does not offer the toggle gets undefined, and skips it — ' +
      'never a value driven from a preference its UI cannot see');
  });

  test('an unknown layout resolves to gentle rather than an empty grid', function(assert) {
    var pres = layoutPresentation(fakeUser({}), 'balanced', {});
    assert.equal(pres.layout, 'gentle', 'the retired "balanced" value falls back');
    assert.equal(pres.bodyClass, null, 'and carries no focused body class');
    assert.deepEqual(pres.grid.areas, layoutPresentation(fakeUser({}), 'gentle', {}).grid.areas);
  });
});
