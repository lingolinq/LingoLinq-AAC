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
    /* CHANGED 2026-09-21 by request: "the edit dashboard button needs to show to the right of
       the create a board button by default" (Gentle). Create a Board and Edit Dashboard are
       now packed as a NAMED PAIR, so they own a row wherever they fall.
       THE COST IS VISIBLE HERE AND IS NOT AN OVERSIGHT: Account precedes the pair in the
       order, so it can no longer share a row with Create a Board and is flushed to a
       full-width row of its own; Reports, left alone after the pair, does the same. Pinning
       it means a later change to the packing cannot quietly re-pair them without this test
       saying so. */
    /* SPEC CHANGED 2026-10-09 by request: "do not allow any of the buttons to span the full
       row. put speak mode and extras next to each other (with speak mode on the left) and
       compact them" (Gentle View).
       Three consequences are pinned below, all deliberate:
         • `speak extras` — the two are now a NAMED PAIR (packOrder#pairedWith) and `extras` is
           moved beside `speak` by `extrasBesideSpeak`, so Speak is always the LEFT cell.
         • `account .` / `reports .` — a small card with no row-partner now occupies ONE column
           and leaves the other empty, where it used to stretch to 'X X'. The holes are the
           cost of the request and are what this assertion exists to make visible.
         • NO `md-grid--fullspan-*` for small cards — that class is emitted only for a row whose
           two cells are the same key, so it falls away on its own.
       `boards boards` is UNCHANGED: Boards is a content panel, not a button, and `fullWidth()`
       still returns true for it and the other panels. */
    var vis = visFor(['account', 'extras', 'boards', 'createboard', 'speak', 'reports', 'editdashboard']);
    var state = gridLayoutState(vis, null, 'gentle');
    assert.deepEqual(state.areas, [
      'speak extras',
      'boards boards',
      'account .',
      'createboard editdashboard',
      'reports .',
      '. sup'
    ], 'default communicator areas');
    assert.equal(state.rows, 'auto auto auto auto auto 0', 'rows');
    assert.strictEqual(state.classes.indexOf('md-grid--fullspan-speak'), -1, 'speak no longer a full-width showcase');
    assert.strictEqual(state.classes.indexOf('md-grid--fullspan-extras'), -1, 'extras no longer a full-width showcase');
  });

  test('Boards always renders full-width and flags md-grid--boards-full', function(assert) {
    var state = gridLayoutState(visFor(['account', 'boards']), null, 'gentle');
    assert.ok(state.areas.indexOf('boards boards') !== -1, 'boards spans both columns');
    assert.ok(state.classes.indexOf('md-grid--boards-full') !== -1, 'boards-full class');
  });

  /* RENAMED AND INVERTED 2026-10-09 with the request above: a lone trailing small card used to
     span both columns and take the fullspan showcase styling. It now keeps one column. */
  test('a lone trailing small card keeps one column and gets no fullspan flag', function(assert) {
    var state = gridLayoutState(visFor(['account']), ['account'], 'gentle');
    assert.deepEqual(state.areas, ['account .', '. sup'], 'lone card occupies one column');
    assert.strictEqual(state.classes.indexOf('md-grid--fullspan-account'), -1, 'no fullspan-account class');
  });

  test('order controls placement; hidden cards are skipped', function(assert) {
    // Uses the small paired cards (account / createboard / reports). Extras is deliberately
    // absent: as of 2026-10-09 it is pinned beside Speak as a named pair, so including it here
    // would test that pairing rather than positional packing. (This comment previously said
    // Extras was "a full-width showcase now, so it no longer pairs" — both halves are false
    // since that request; nothing is a full-width showcase among the buttons any more.)
    var vis = visFor(['account', 'createboard', 'reports']);
    var a = gridLayoutState(vis, ['account', 'createboard', 'reports'], 'gentle');
    assert.deepEqual(a.areas, ['account createboard', 'reports .', '. sup'], 'account|createboard then a one-column reports');
    var b = gridLayoutState(vis, ['reports', 'account', 'createboard'], 'gentle');
    assert.deepEqual(b.areas, ['reports account', 'createboard .', '. sup'], 'reordered; the odd card keeps one column');
  });

  test('reorderInsert moves a card before/after a target in the full order', function(assert) {
    var after = reorderInsert(DEFAULT_ORDER, 'reports', 'account', true);
    assert.ok(after.indexOf('reports') === after.indexOf('account') + 1, 'reports lands right after account');
    var before = reorderInsert(DEFAULT_ORDER, 'reports', 'account', false);
    assert.ok(before.indexOf('reports') === before.indexOf('account') - 1, 'reports lands just before account');
    assert.equal(after.length, DEFAULT_ORDER.length, 'no card lost on reorder');
  });

  test('focused layout puts the Speak hero on top, with Extras beside it', function(assert) {
    var vis = visFor(['speak', 'extras', 'boards', 'account']);
    var state = gridLayoutState(vis, null, 'focused');
    // Changed 2026-10-10 (approved): Extras shows on Focused and stacks beside the Speak hero.
    var hero = state.areas[0];
    assert.strictEqual(hero, 'speak extras', 'speak hero on top, Extras to its right');
    assert.strictEqual(state.areas[2], 'account account', 'the other action card keeps its row below Boards');
  });

  test('focused: Create a Board and Extras stack beside the Speak hero; no Edit Dashboard', function(assert) {
    var state = gridLayoutState(visFor(['speak', 'boards', 'account', 'createboard', 'reports', 'editdashboard', 'extras']), null, 'focused');
    // Changed 2026-10-10 by request: above 1024px Speak fills column 1, the pair stacked to its right.
    assert.deepEqual(state.areas.slice(0, 2), ['speak createboard', 'speak extras'], 'the pair stacks beside Speak');
    assert.notStrictEqual(state.areas.indexOf('account reports'), -1, 'the other action cards keep a row of their own');
    assert.strictEqual(state.columns, 'repeat(2, 1fr)', 'two columns: Speak, then the stack');
  });

  test('focused columns track the visible utility-card count — remaining cards fill the row', function(assert) {
    // On a CASELOAD hero since 2026-10-10 (approved): the Speak hero now stacks the pair beside itself.
    var vis = visFor(['caseload', 'boards', 'account', 'createboard', 'reports']);
    var state = gridLayoutState(vis, null, 'focused', 'caseload');
    assert.strictEqual(state.columns, 'repeat(3, 1fr)', '3 utility cards → 3 columns');
    assert.notStrictEqual(state.areas.indexOf('account createboard reports'), -1, 'utility row fills 3 cols');
    assert.notStrictEqual(state.areas.indexOf('boards boards boards'), -1, 'boards spans the 3 cols');
    // No "." padding cells in any content row (only the trailing sup spacer carries them).
    var padded = state.areas.slice(0, -1).filter(function(row) { return row.indexOf('.') !== -1; });
    assert.deepEqual(padded, [], 'no empty padding cells');
    assert.strictEqual(state.areas[0], 'caseload caseload caseload', 'the hero spans the row');
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

  /* SPEC CHANGED 2026-09-22 (requested). This test previously asserted that dropping a utility
     card onto a full-width row was REJECTED (returned null). It is now re-interpreted as the
     mirror gesture — as though the full-width row had been dragged onto the utility card — so
     the two rows exchange places. Rewritten to pin the new contract rather than deleted: same
     function, same code path, same drop being exercised.

     "Always swap": the direction comes from where the two already sit relative to each other,
     NOT from the pointer half. A row currently ABOVE the utility block lands below it and vice
     versa, so the gesture can never resolve to "no change". */
  test('reorderForFocused: a utility card dropped on a full-width row swaps the two rows', function(assert) {
    assert.expect(3);
    var order = reorderForFocused(FOCUSED_DEFAULT_ORDER, 'account', 'boards', true);
    assert.ok(order, 'utility-onto-row drop is accepted, not rejected');
    var actionIdxs = order.map(function(k, i) { return FOCUSED_ACTION_KEYS.indexOf(k) !== -1 ? i : -1; })
                          .filter(function(i) { return i !== -1; });
    // `boards` starts BEFORE the utility block in FOCUSED_DEFAULT_ORDER, so it must end after it.
    assert.ok(order.indexOf('boards') > Math.max.apply(null, actionIdxs),
      'boards moved to the far side of the whole utility block');
    assert.strictEqual(order.length, FOCUSED_DEFAULT_ORDER.length, 'no key gained or lost');
  });

  test('reorderForFocused: the swap works in the other direction too', function(assert) {
    assert.expect(2);
    // A full-width row sitting AFTER the utility block must end up before it.
    var start = ['speak', 'createboard', 'editdashboard', 'boards'];
    var order = reorderForFocused(start, 'createboard', 'boards', true, start);
    assert.ok(order, 'accepted');
    var actionIdxs = order.map(function(k, i) { return FOCUSED_ACTION_KEYS.indexOf(k) !== -1 ? i : -1; })
                          .filter(function(i) { return i !== -1; });
    assert.ok(order.indexOf('boards') < Math.min.apply(null, actionIdxs),
      'boards moved above the utility block');
  });

  test('reorderForFocused: the pointer half does not change the swap result', function(assert) {
    assert.expect(1);
    // "Always swap" means the release point within the row is irrelevant — both halves agree.
    var lower = reorderForFocused(FOCUSED_DEFAULT_ORDER, 'account', 'boards', true);
    var upper = reorderForFocused(FOCUSED_DEFAULT_ORDER, 'account', 'boards', false);
    assert.deepEqual(upper, lower, 'releasing on either half of the row gives the same order');
  });

  test('reorderForFocused: a full-width row snaps to the utility-block edge', function(assert) {
    var order = reorderForFocused(FOCUSED_DEFAULT_ORDER, 'boards', 'account', true);
    assert.ok(order, 'row reposition allowed');
    var actionIdxs = order.map(function(k, i) { return FOCUSED_ACTION_KEYS.indexOf(k) !== -1 ? i : -1; }).filter(function(i) { return i !== -1; });
    assert.ok(order.indexOf('boards') > Math.max.apply(null, actionIdxs), 'boards lands after the whole utility block, not between cards');
  });

  test('every layout ends with the 0-height ". sup" spacer row', function(assert) {
    var CASES = [['account', 'boards'], ['speak', 'extras', 'reports'], []];
    assert.expect(CASES.length * 2);
    CASES.forEach(function(on) {
      var state = gridLayoutState(visFor(on), null, 'gentle');
      assert.strictEqual(state.areas[state.areas.length - 1], '. sup', 'sup row — ' + (on.join('+') || 'none'));
      // Hoisted out of the assertion (qunit/no-assert-logical-expression): the rule reads an
      // `||` inside assert.ok as two claims smuggled into one, which reports the wrong half
      // on failure. Naming it keeps the message pointing at the thing being checked.
      var endsAtZero = / 0$/.test(state.rows) || state.rows === '0';
      assert.ok(endsAtZero, 'rows end at 0 — ' + (on.join('+') || 'none'));
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
    var on = ['caseload', 'account', 'createboard', 'org', 'boards', 'speak', 'reports', 'editdashboard', 'extras']; // + extras: 4 Focused action cards (2026-10-10)
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
    assert.strictEqual(g.indexOf('org_mgmt'), 0, 'gentle leads with My Organizations');
    assert.strictEqual(f.indexOf('org_mgmt'), 0, 'focused leads with My Organizations');
    assert.ok(g.indexOf('caseload') < g.indexOf('boards'), 'gentle: caseload before boards');
    assert.ok(f.indexOf('boards') < f.indexOf('caseload'), 'focused: boards before the caseload/speak pair');
    assert.strictEqual(f.indexOf('speak'), f.indexOf('caseload') + 1, 'focused: speak sits immediately after caseload (the paired row)');
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
    assert.strictEqual(rowsWithUtility.length, 1,
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
    // Expected layout updated 2026-10-10 (approved): Create a Board + Extras beside Speak.
    var state = gridLayoutState(visFor(['speak', 'boards', 'account', 'createboard', 'reports', 'editdashboard', 'extras']), null, 'focused');
    assert.deepEqual(state.areas.slice(0, 4), ['speak createboard', 'speak extras', 'boards boards', 'account reports'],
      'Speak with the pair beside it, then Boards, then the other utility cards');
    assert.strictEqual(state.columns, 'repeat(2, 1fr)', 'two columns');
    assert.notOk(state.areasValue.includes('editdashboard'), 'Edit Dashboard is not on the Focused home');
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
    assert.strictEqual(off.order, null, 'flag off → saved order ignored');

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
    var LAYOUTS = ['gentle', 'focused'];
    // COUNTED UP FRONT (qunit/require-expect). Every assertion below runs inside three
    // nested callbacks, which is exactly the shape `expect()` exists to guard: if a filter
    // silently returns nothing, the test passes having asserted nothing at all. The count is
    // derived the same way the loop derives it rather than hard-coded, so it tracks
    // HOME_SECTIONS instead of going stale the next time a section is added.
    var expected = 0;
    Object.keys(users).forEach(function(role) {
      LAYOUTS.forEach(function(layout) {
        var p = layoutPresentation(users[role], layout, {});
        expected += HOME_SECTIONS.filter(function(sec) {
          return p.vis[sec.key] && FULLSPAN_SAFETY_NET.indexOf(sec.key) === -1;
        }).length + 1;   // + the Edit Dashboard claim asserted once per role/layout
      });
    });
    assert.expect(expected);

    Object.keys(users).forEach(function(role) {
      LAYOUTS.forEach(function(layout) {
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
        // Edit Dashboard must never be VISIBLE on Focused View (2026-10-10, approved: it
        // left the Focused home; the navbar's Display Style button opens the same editor).
        // A visible card with no area is what once put a phantom Extras across the top.
        // Asserted unconditionally (qunit/no-conditional-assertions): on Gentle the
        // left-hand side is false, so the claim holds vacuously and the assertion still
        // runs, keeping the per-run assertion count stable.
        // Hoisted out of the assertion (qunit/no-assert-logical-expression), same reason as
        // the spacer-row test above: naming the claim keeps the failure message about the
        // claim rather than about one arbitrary half of an `&&`.
        var editVisibleOnFocused = layout === 'focused' && pres.vis.editdashboard;
        assert.notOk(editVisibleOnFocused,
          role + ' / ' + layout + ': Edit Dashboard is never visible on Focused View');
      });
    });
  });

  test('Focused View forces Edit Dashboard off, so vis and the grid agree', function(assert) {
    var user = fakeUser({});
    assert.false(layoutPresentation(user, 'focused', {}).vis.editdashboard,
      'focused hides Edit Dashboard (2026-10-10); Extras shows in its place');
    assert.true(layoutPresentation(user, 'focused', {}).vis.extras,
      'focused shows Extras');
    // Even when a caller hands in live UI state that says otherwise.
    assert.false(layoutPresentation(user, 'focused', { vis: { editdashboard: true } }).vis.editdashboard,
      'a checkbox cannot re-enable Edit Dashboard on Focused View');
  });

  test('live UI state wins over saved preferences when supplied', function(assert) {
    // The Dashboard Design modal passes the checkboxes the user is toggling RIGHT NOW.
    var user = fakeUser({ preferences: { dashboard_sections: { boards: false } } });
    assert.false(layoutPresentation(user, 'gentle', {}).vis.boards,
      'no override → saved preference governs');
    assert.true(layoutPresentation(user, 'gentle', { vis: { boards: true } }).vis.boards,
      'override → the live checkbox governs');
  });

  test('non-grid toggles follow the caller, and gentleOnly ones drop on Focused', function(assert) {
    var user = fakeUser({});
    assert.true(layoutPresentation(user, 'gentle', {}).toggles.hero,
      'welcome banner shows on gentle by default');
    assert.false(layoutPresentation(user, 'focused', {}).toggles.hero,
      'gentleOnly toggle is off on focused');
    assert.false(layoutPresentation(user, 'gentle', { vis: { hero: false } }).toggles.hero,
      'a live checkbox turns it off');
    assert.strictEqual(layoutPresentation(user, 'gentle', { vis: {} }).toggles.hero, undefined,
      'a caller whose UI does not offer the toggle gets undefined, and skips it — ' +
      'never a value driven from a preference its UI cannot see');
  });

  test('an unknown layout resolves to gentle rather than an empty grid', function(assert) {
    var pres = layoutPresentation(fakeUser({}), 'balanced', {});
    assert.strictEqual(pres.layout, 'gentle', 'the retired "balanced" value falls back');
    assert.strictEqual(pres.bodyClass, null, 'and carries no focused body class');
    assert.deepEqual(pres.grid.areas, layoutPresentation(fakeUser({}), 'gentle', {}).grid.areas);
  });
});

/* FOCUSED, ABOVE 1024px: CREATE A BOARD AND EDIT DASHBOARD STACK BESIDE THE SPEAK HERO (2026-10-10).
 *
 * Requested: "make the let's communicate button only fill the first column on the home page, and
 * stack the create board and edit dashboard buttons to its right (one on top of the other)", with
 * any other action cards (Account, Reports) shown "below the boards div (where the create board and
 * edit dashboard buttons currently are)". Below 1025px the grid is a flex column ordered by
 * `orderIndices` (the `--ord-*` properties), and that order must NOT change: it is read from the
 * stacked layout, not from the side-by-side areas.
 */
module('Unit | Utility | dashboard sections: Focused pair beside the Speak hero', function() {
  function isRectangular(areas) {
    var width = areas[0].split(' ').length, cells = {};
    var sameWidth = areas.every(function(row) { return row.split(' ').length === width; });
    areas.forEach(function(row, r) {
      row.split(' ').forEach(function(tok, c) {
        if (tok === '.') { return; }
        (cells[tok] = cells[tok] || []).push([r, c]);
      });
    });
    var rect = Object.keys(cells).every(function(tok) {
      var rs = cells[tok].map(function(p) { return p[0]; }), cs = cells[tok].map(function(p) { return p[1]; });
      var h = Math.max.apply(null, rs) - Math.min.apply(null, rs) + 1, w = Math.max.apply(null, cs) - Math.min.apply(null, cs) + 1;
      return h * w === cells[tok].length;
    });
    return sameWidth && rect;
  }

  test('the beside layout is flagged for the stylesheet, and only that layout', function(assert) {
    var beside = gridLayoutState(visFor(['speak', 'boards', 'createboard', 'extras']), null, 'focused');
    assert.notStrictEqual(beside.classes.indexOf('md-grid--speak-beside'), -1);
    var plain = gridLayoutState(visFor(['speak', 'boards', 'account']), null, 'focused');
    assert.strictEqual(plain.classes.indexOf('md-grid--speak-beside'), -1, 'no stack, no flag');
    var gentle = gridLayoutState(visFor(['speak', 'boards', 'createboard', 'extras']), null, 'gentle');
    assert.strictEqual(gentle.classes.indexOf('md-grid--speak-beside'), -1, 'never in Gentle');
  });

  /* DEFAULT SMALL-SCREEN ORDER FOLLOWS THE WIDE LAYOUT (2026-10-10, requested: "the default view for
     modern focused should then show create board and extras below the speak mode button on 1024px
     and smaller (unless the user changes the layout on their Display design)"). */
  test('by default the small-screen order matches the wide layout: Speak, the pair, then Boards', function(assert) {
    var state = gridLayoutState(visFor(['speak', 'boards', 'createboard', 'extras']), null, 'focused');
    assert.deepEqual(state.areas.slice(0, 3), ['speak createboard', 'speak extras', 'boards boards']);
    assert.deepEqual(state.orderIndices, { speak: 0, createboard: 1, extras: 2, boards: 3 },
      'the --ord-* values read Speak, Create a Board, Extras, Boards');
  });

  test('a saved Dashboard Design order still decides the small-screen order', function(assert) {
    var saved = ['boards', 'speak', 'createboard', 'extras'];
    var state = gridLayoutState(visFor(['speak', 'boards', 'createboard', 'extras']), saved, 'focused');
    assert.deepEqual(state.orderIndices, { boards: 0, speak: 1, createboard: 2, extras: 3 },
      'the user put Boards first, so Boards comes first');
    assert.notStrictEqual(state.classes.indexOf('md-grid--speak-beside'), -1, 'wide screens still stack the pair beside Speak');
  });

  test('one of the pair hidden: the other sits beside Speak on a single row', function(assert) {
    var state = gridLayoutState(visFor(['speak', 'boards', 'extras']), null, 'focused');
    assert.deepEqual(state.areas.slice(0, 2), ['speak extras', 'boards boards']);
    assert.strictEqual(state.columns, 'repeat(2, 1fr)');
  });

  test('both of the pair hidden: Speak keeps the full row, as before', function(assert) {
    var state = gridLayoutState(visFor(['speak', 'boards', 'account']), null, 'focused');
    assert.strictEqual(state.areas[0], 'speak');
    assert.strictEqual(state.areas.indexOf('account'), 2, 'Account keeps its own row after Boards');
  });

  test('a lone other action card spans both columns below Boards', function(assert) {
    var state = gridLayoutState(visFor(['speak', 'boards', 'createboard', 'extras', 'reports']), null, 'focused');
    assert.deepEqual(state.areas.slice(0, 4), ['speak createboard', 'speak extras', 'boards boards', 'reports reports']);
  });

  test('caseload and org heroes are untouched: the utility cards still share one row', function(assert) {
    var vis = visFor(['caseload', 'account', 'createboard', 'boards', 'speak', 'reports', 'editdashboard']);
    var caseload = gridLayoutState(vis, null, 'focused', 'caseload');
    assert.notStrictEqual(caseload.areas.indexOf('account createboard reports'), -1, 'one row, in SUPERVISOR_DEFAULT_ORDER, without Edit Dashboard');
    var org = gridLayoutState(visFor(['org', 'caseload', 'speak', 'account', 'createboard', 'boards', 'extras', 'reports']), null, 'focused', 'org');
    assert.false(org.areas.some(function(row) { return row.indexOf('speak createboard') !== -1; }), 'no pair beside Speak on an org dashboard');
  });

  test('every visibility combination and hero builds a valid grid (rectangular areas)', function(assert) {
    var heroes = ['speak', null, 'caseload', 'org'], bad = [];
    for (var m = 0; m < (1 << ALL_KEYS.length); m++) {
      var on = ALL_KEYS.filter(function(k, i) { return !!(m & (1 << i)); });
      heroes.forEach(function(hero) {
        var state = gridLayoutState(visFor(on), null, 'focused', hero);
        if (!isRectangular(state.areas)) { bad.push(hero + ' ' + on.join(',') + ' => ' + state.areas.join(' / ')); }
      });
    }
    assert.deepEqual(bad.slice(0, 3), [], 'no ragged rows or split areas');
  });
});
