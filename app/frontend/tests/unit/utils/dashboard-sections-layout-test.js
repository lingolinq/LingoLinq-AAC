import { module, test } from 'qunit';
import { sectionsForLayout, availableHomeSections, layoutPresentation, gridLayoutState, AREA } from 'frontend/utils/dashboard_sections';

/* THE DASHBOARD DESIGN CHECKLIST MUST OFFER ONLY WHAT THE SELECTED LAYOUT ACTUALLY RENDERS.
 *
 * "Choose what appears on your home page" was built from `availableHomeSections(user)`, which
 * takes no layout — so it offered every section the USER has, whether or not the SELECTED view
 * places it. Focused View structurally drops two:
 *   - `editdashboard`, always (focusedLayout; Extras took its place on 2026-10-10)
 *   - `speak`, whenever Speak is not the role hero and the org caseload+speak pair does not
 *     apply (same function, `if (heroKey && heroKey !== 'speak' && !orgPair) rest.speak = false`)
 * A section dropped from the areas is not merely unplaced: `gridLayoutState` flags it and
 * app.scss sets `display: none !important` on `.md-grid--speak-unplaced > .md-card--speak`.
 * So a supervisor on Focused View was shown a "Let's Communicate" checkbox that could not
 * change anything on their page.
 *
 * The oracle in the first test asks `layoutPresentation` — the function the real dashboard
 * renders through — which grid areas the layout emits when nothing is user-hidden, and requires
 * the offered list to match. It is a DIFFERENTIAL oracle, not an independent one:
 * `layoutPresentation` calls the same `gridLayoutState` the implementation does, so it cannot
 * catch a wrong layout ENGINE, only a wrong filter over it. Verified to catch: a layout-blind
 * filter, one comparing raw keys instead of `AREA[key]` (which drops Organizations), and one
 * that forgets to pass the hero key. The hard-coded expectations in the tests below carry the
 * independent weight.
 */
module('Unit | Utility | dashboard sections: per-layout availability', function() {
  // Plain object with `get`, because the registry only ever reads a user through that.
  function stubUser(props) {
    var p = props || {};
    return { get: function(k) { return p[k]; } };
  }

  var SHAPES = {
    'a communicator': stubUser({}),
    'a supervisor': stubUser({ supporter_role: true, supervisees: [], supervised_units: [] }),
    'a supervisor with rooms and attention': stubUser({
      supporter_role: true,
      supervised_units: [{ id: 'u1' }],
      supervisees: [{ org_status: { state: 'unchecked' } }]
    }),
    'an org manager who does not supervise': stubUser({
      organizations: [{ type: 'manager', restricted: false }]
    }),
    'an org manager who also supervises': stubUser({
      supporter_role: true,
      supervisees: [],
      supervised_units: [],
      organizations: [{ type: 'manager', restricted: false }]
    })
  };

  // Which section keys the layout PLACES when nothing is hidden — read off the areas matrix
  // the real grid is rendered from, not re-derived from the force-hide conditions.
  function placedKeys(user, layout) {
    var vis = {};
    availableHomeSections(user).forEach(function(s) { vis[s.key] = true; });
    var pres = layoutPresentation(user, layout, { vis: vis });
    var placed = {};
    pres.grid.areas.forEach(function(row) {
      row.split(' ').forEach(function(name) { placed[name] = true; });
    });
    return availableHomeSections(user)
      .filter(function(s) { return !!placed[AREA[s.key]]; })
      .map(function(s) { return s.key; });
  }

  test('every section offered for a layout is one that layout actually places', function(assert) {
    var shapeNames = Object.keys(SHAPES);
    assert.expect(shapeNames.length * 2);
    shapeNames.forEach(function(label) {
      ['gentle', 'focused'].forEach(function(layout) {
        var offered = sectionsForLayout(SHAPES[label], layout).map(function(s) { return s.key; });
        var placed = placedKeys(SHAPES[label], layout);
        assert.deepEqual(
          offered.slice().sort(), placed.slice().sort(),
          layout + ' offers exactly what it renders for ' + label
        );
      });
    });
  });

  // Updated 2026-10-13 (approved): a SUPPORTER's Focused view now PLACES Speak beside the Caseload hero
  // (dashboard-focused-caseload-beside-test), so Focused offers the Speak toggle to a supervisor. An org
  // manager (hero-org) still has no Speak on either layout ("on an admin user, hide the speak button").
  test('Focused View offers Speak to a supervisor (placed beside Caseload) but not to an org manager', function(assert) {
    assert.expect(4);
    var supervisor = SHAPES['a supervisor'];
    var orgOnly = SHAPES['an org manager who does not supervise'];
    [['a supervisor', supervisor, true], ['an org manager who does not supervise', orgOnly, false]].forEach(function(trio) {
      var focusedOffersSpeak = trio[2];
      var keys = sectionsForLayout(trio[1], 'focused').map(function(s) { return s.key; });
      assert.strictEqual(keys.indexOf('speak') !== -1, focusedOffersSpeak,
        'Focused ' + (focusedOffersSpeak ? 'offers' : 'hides') + ' the Speak toggle for ' + trio[0]);
      var gentle = sectionsForLayout(trio[1], 'gentle').map(function(s) { return s.key; });
      // An admin (org manager) has no Speak on either layout; a supervisor gets it on Gentle too.
      var gentleOffersSpeak = trio[1] !== orgOnly;
      assert.strictEqual(gentle.indexOf('speak') !== -1, gentleOffersSpeak,
        'Gentle ' + (gentleOffersSpeak ? 'still offers' : 'does not offer') + ' it to ' + trio[0]);
    });
  });

  test('Focused View still offers Speak to a communicator, whose hero it is', function(assert) {
    assert.expect(2);
    var keys = sectionsForLayout(SHAPES['a communicator'], 'focused').map(function(s) { return s.key; });
    assert.notStrictEqual(keys.indexOf('speak'), -1, 'Speak is the communicator hero, so the toggle stays');
    assert.strictEqual(keys.indexOf('editdashboard'), -1, 'Edit Dashboard is not on the Focused home (2026-10-10)');
  });

  // A supervisor's Speak is PINNED beside My Caseload (2026-10-14 request) — the hide toggle must not
  // drop it and leave Caseload a lone card. Scoped to non-org supervisors; an org manager keeps no Speak.
  test('a supervisor who hid Speak still gets it pinned beside Caseload, on both layouts', function(assert) {
    assert.expect(5);
    var slp = stubUser({ supporter_role: true, supervisees: [], supervised_units: [], 'preferences.dashboard_sections': { speak: false } });
    var focused = layoutPresentation(slp, 'focused');
    assert.true(focused.vis.speak, 'Speak is pinned visible in Focused even though the toggle hid it');
    assert.ok(focused.grid.areas.some(function(r) { return r.split(' ').indexOf('speak') !== -1; }), 'and Focused places Speak');
    var gentle = layoutPresentation(slp, 'gentle');
    assert.true(gentle.vis.speak, 'pinned in Gentle too');
    assert.notStrictEqual(gentle.grid.classes.indexOf('md-grid--caseload-row'), -1, 'so the Gentle Caseload | Speak row forms');
    var orgSlp = stubUser({ supporter_role: true, supervisees: [], organizations: [{ type: 'manager', restricted: false }] });
    assert.notOk(layoutPresentation(orgSlp, 'focused').vis.speak, 'an org manager still has no Speak (pin is scoped to non-org supervisors)');
  });

  test('Gentle View offers every section available to the user', function(assert) {
    var shapeNames = Object.keys(SHAPES);
    assert.expect(shapeNames.length);
    shapeNames.forEach(function(label) {
      var offered = sectionsForLayout(SHAPES[label], 'gentle').map(function(s) { return s.key; });
      var available = availableHomeSections(SHAPES[label]).map(function(s) { return s.key; });
      assert.deepEqual(offered.slice().sort(), available.slice().sort(), 'Gentle drops nothing for ' + label);
    });
  });

  /* ORDER — the checklist must read top-to-bottom the way the PAGE does.
   * It used to rank by the layout's default/saved ORDER ARRAY, which is not the rendered
   * order in Focused View: `focusedLayout` collapses every visible FOCUSED_ACTION_KEYS card
   * into ONE row emitted at the first one's slot, and moves the org caseload+speak pair to the
   * bottom row. The expectations below are the ACTUAL rendered reading order.
   */
  test('Focused View lists sections in the order the page renders them', function(assert) {
    assert.expect(2);
    // Updated 2026-10-12 (approved): Create a Board and Edit Dashboard are retired. Create a Board
    // anchored the utility row near the top; now Extras alone does, at its own (last) order slot.
    assert.deepEqual(
      sectionsForLayout(SHAPES['a supervisor with rooms and attention'], 'focused').map(function(s) { return s.key; }),
      // Updated 2026-10-13 (approved): a supporter's Focused lead row is Caseload | Speak; Extras moves to
      // the action row, last.
      ['caseload', 'speak', 'attention', 'rooms', 'extras'],
      'Speak is listed beside Caseload, where it renders; Extras moves to the action row'
    );
    // Updated 2026-10-12 (approved): an admin has no Speak, so there is no Caseload | Speak bottom pair;
    // Caseload is a full row at its order slot, directly after the My Organizations hero.
    assert.deepEqual(
      sectionsForLayout(SHAPES['an org manager who also supervises'], 'focused').map(function(s) { return s.key; }),
      ['org', 'caseload', 'extras'],
      'no Speak, so Caseload follows the hero and the utility row is last'
    );
  });

  /* THE GENTLE DEFAULT CHANGED ON 2026-09-21, by request: "the edit dashboard button needs to
   * show to the right of the create a board button by default". Edit Dashboard used to trail
   * the order (last but one for a supervisor, after Speak); it now follows Create a Board
   * directly in all three Gentle orders so the two pack onto one row.
   * These expectations are updated to the NEW specification, not relaxed to accommodate the
   * change: they are still exact `deepEqual`s on the full reading order, and the supervisor
   * case still pins every other key's relative position. */
  // Updated 2026-10-12 (approved): Create a Board and Edit Dashboard are retired from the home grid.
  test('Gentle View reads in its default order', function(assert) {
    assert.expect(2);
    assert.deepEqual(
      sectionsForLayout(SHAPES['a supervisor with rooms and attention'], 'gentle').map(function(s) { return s.key; }),
      // Updated 2026-10-13 (approved): a supporter's Caseload row is Caseload | Speak only; Extras drops
      // out of the lead row and packs last.
      ['caseload', 'speak', 'attention', 'rooms', 'extras'],
      'Gentle reads in its default order'
    );
    assert.deepEqual(
      sectionsForLayout(SHAPES['a communicator'], 'gentle').map(function(s) { return s.key; }),
      // `extras` moved up beside `speak` (extrasBesideSpeak, 2026-10-09 request).
      ['speak', 'extras', 'boards'],
      'and for a communicator'
    );
  });

  /* THE PAIR IS A GUARANTEE, NOT A SIDE EFFECT OF THE ORDER ARRAY. Packing is positional --
   * it fills rows two at a time from whatever is VISIBLE -- so before this was named as a
   * pair, a communicator with Account visible packed `account createboard` and then
   * `editdashboard reports`, and the two cards the request is about never shared a row.
   * This pins the row itself rather than the order, which is the thing that was asked for. */
  // Rewritten 2026-10-12 (approved): the pair this pinned was retired, so it now pins that neither
  // card is placed in any row, for the same three users.
  test('Create a Board and Edit Dashboard are in no row, whatever else is visible', function(assert) {
    var cases = [
      ['a supervisor with rooms and attention', SHAPES['a supervisor with rooms and attention']],
      ['a communicator', SHAPES['a communicator']],
      ['an org manager who also supervises', SHAPES['an org manager who also supervises']]
    ];
    assert.expect(cases.length);
    cases.forEach(function(pair) {
      // `gridLayoutState` takes a VISIBILITY map, not a user shape (vis, order, layout).
      var vis = {};
      availableHomeSections(pair[1]).forEach(function(s) { vis[s.key] = true; });
      var state = gridLayoutState(vis, null, 'gentle');
      var areas = (state && state.areas) || [];
      var placed = areas.filter(function(r) { return /\b(createboard|editdashboard)\b/.test(r); });
      assert.deepEqual(placed, [], pair[0] + ': neither card is placed');
    });
  });

  test('an unknown layout name is treated as Gentle, not as "nothing is available"', function(assert) {
    assert.expect(1);
    var offered = sectionsForLayout(SHAPES['a supervisor'], 'nonsense').map(function(s) { return s.key; });
    var available = availableHomeSections(SHAPES['a supervisor']).map(function(s) { return s.key; });
    assert.deepEqual(offered.slice().sort(), available.slice().sort(), 'falls back to the full list');
  });
});
