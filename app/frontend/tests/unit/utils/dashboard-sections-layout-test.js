import { module, test } from 'qunit';
import { sectionsForLayout, availableHomeSections, layoutPresentation, gridLayoutState, AREA } from 'frontend/utils/dashboard_sections';

/* THE DASHBOARD DESIGN CHECKLIST MUST OFFER ONLY WHAT THE SELECTED LAYOUT ACTUALLY RENDERS.
 *
 * "Choose what appears on your home page" was built from `availableHomeSections(user)`, which
 * takes no layout — so it offered every section the USER has, whether or not the SELECTED view
 * places it. Focused View structurally drops two:
 *   - `extras`, always (dashboard_sections.js#focusedLayout: `Object.assign({}, vis, {extras:false})`)
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

  test('Focused View does not offer Speak when Speak is not the hero', function(assert) {
    assert.expect(4);
    var supervisor = SHAPES['a supervisor'];
    var orgOnly = SHAPES['an org manager who does not supervise'];
    [['a supervisor', supervisor], ['an org manager who does not supervise', orgOnly]].forEach(function(pair) {
      var keys = sectionsForLayout(pair[1], 'focused').map(function(s) { return s.key; });
      assert.strictEqual(keys.indexOf('speak'), -1, 'Focused hides the Speak toggle for ' + pair[0]);
      var gentle = sectionsForLayout(pair[1], 'gentle').map(function(s) { return s.key; });
      assert.notStrictEqual(gentle.indexOf('speak'), -1, 'Gentle still offers it to ' + pair[0]);
    });
  });

  test('Focused View still offers Speak to a communicator, whose hero it is', function(assert) {
    assert.expect(2);
    var keys = sectionsForLayout(SHAPES['a communicator'], 'focused').map(function(s) { return s.key; });
    assert.notStrictEqual(keys.indexOf('speak'), -1, 'Speak is the communicator hero, so the toggle stays');
    assert.strictEqual(keys.indexOf('extras'), -1, 'Extras is never rendered on Focused View');
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
    // Edit Dashboard shares the utility row with Create a Board near the TOP of the page, so
    // it comes before Attention and Rooms. Ranking by SUPERVISOR_DEFAULT_ORDER put it last.
    assert.deepEqual(
      sectionsForLayout(SHAPES['a supervisor with rooms and attention'], 'focused').map(function(s) { return s.key; }),
      ['caseload', 'createboard', 'editdashboard', 'attention', 'rooms'],
      'the collapsed utility row is listed at its rendered position'
    );
    // The org caseload+speak PAIR is emitted as the bottom row, after the utility row.
    assert.deepEqual(
      sectionsForLayout(SHAPES['an org manager who also supervises'], 'focused').map(function(s) { return s.key; }),
      ['org', 'createboard', 'editdashboard', 'caseload', 'speak'],
      'the bottom pair row is listed last'
    );
  });

  /* THE GENTLE DEFAULT CHANGED ON 2026-09-21, by request: "the edit dashboard button needs to
   * show to the right of the create a board button by default". Edit Dashboard used to trail
   * the order (last but one for a supervisor, after Speak); it now follows Create a Board
   * directly in all three Gentle orders so the two pack onto one row.
   * These expectations are updated to the NEW specification, not relaxed to accommodate the
   * change: they are still exact `deepEqual`s on the full reading order, and the supervisor
   * case still pins every other key's relative position. */
  test('Gentle View reads in its default order, with Edit Dashboard beside Create a Board', function(assert) {
    assert.expect(2);
    assert.deepEqual(
      sectionsForLayout(SHAPES['a supervisor with rooms and attention'], 'gentle').map(function(s) { return s.key; }),
      ['caseload', 'createboard', 'editdashboard', 'attention', 'rooms', 'speak', 'extras'],
      'Gentle reads in its default order, Edit Dashboard now paired with Create a Board'
    );
    assert.deepEqual(
      sectionsForLayout(SHAPES['a communicator'], 'gentle').map(function(s) { return s.key; }),
      ['speak', 'boards', 'createboard', 'editdashboard', 'extras'],
      'and for a communicator'
    );
  });

  /* THE PAIR IS A GUARANTEE, NOT A SIDE EFFECT OF THE ORDER ARRAY. Packing is positional --
   * it fills rows two at a time from whatever is VISIBLE -- so before this was named as a
   * pair, a communicator with Account visible packed `account createboard` and then
   * `editdashboard reports`, and the two cards the request is about never shared a row.
   * This pins the row itself rather than the order, which is the thing that was asked for. */
  test('Create a Board and Edit Dashboard share a row whatever else is visible', function(assert) {
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
      var row = areas.filter(function(r) { return r.indexOf('createboard') !== -1; })[0] || '';
      assert.strictEqual(row, 'createboard editdashboard',
        pair[0] + ': Create a Board shares its row with Edit Dashboard');
    });
  });

  test('an unknown layout name is treated as Gentle, not as "nothing is available"', function(assert) {
    assert.expect(1);
    var offered = sectionsForLayout(SHAPES['a supervisor'], 'nonsense').map(function(s) { return s.key; });
    var available = availableHomeSections(SHAPES['a supervisor']).map(function(s) { return s.key; });
    assert.deepEqual(offered.slice().sort(), available.slice().sort(), 'falls back to the full list');
  });
});
