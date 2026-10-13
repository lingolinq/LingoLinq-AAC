import { module, test } from 'qunit';
import { gridLayoutState } from 'frontend/utils/dashboard_sections';

/* FOCUSED VIEW: MY CASELOAD WITH EXTRAS ON ITS RIGHT (requested 2026-10-12: "modern focused show my
   caseload to the left of extras (like it does on gentle view)"). The same side-by-side row Speak
   leads for a communicator, led by Caseload for a supervisor (Caseload hero) and an admin (org hero). */
module('Unit | Utility | dashboard sections | Focused caseload beside Extras', function() {
  var SIX = function(a, b) { return [a, a, a, b, b, b].join(' '); };

  test('a supervisor: Caseload and Extras share the first row, a half each', function(assert) {
    var state = gridLayoutState({ caseload: true, attention: true, rooms: true, extras: true }, null, 'focused', 'caseload');
    assert.strictEqual(state.areas[0], SIX('caseload', 'extras'), 'Caseload left, Extras right');
    assert.strictEqual(state.columns, 'repeat(6, 1fr)', 'six columns');
    assert.notStrictEqual(state.classes.indexOf('md-grid--caseload-beside'), -1, 'flagged for the stylesheet');
    assert.strictEqual(state.classes.indexOf('md-grid--speak-beside'), -1, 'not the Speak row');
    assert.deepEqual([state.orderIndices.caseload, state.orderIndices.extras], [0, 1], 'small screens keep Caseload then Extras');
  });

  test('an admin: the row sits directly below My Organizations', function(assert) {
    var state = gridLayoutState({ org: true, caseload: true, attention: true, rooms: true, extras: true }, null, 'focused', 'org');
    assert.strictEqual(state.areas[0], 'org_mgmt org_mgmt org_mgmt org_mgmt org_mgmt org_mgmt', 'My Organizations leads');
    assert.strictEqual(state.areas[1], SIX('caseload', 'extras'), 'then Caseload | Extras');
  });

  test('with Extras hidden, Caseload keeps its full row', function(assert) {
    var state = gridLayoutState({ caseload: true, attention: true }, null, 'focused', 'caseload');
    assert.true(state.areas[0].split(' ').every(function(c) { return c === 'caseload'; }), 'full row');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-beside'), -1, 'no beside row');
  });

  test('a communicator is unchanged: Speak leads its own row', function(assert) {
    var state = gridLayoutState({ speak: true, boards: true, extras: true }, null, 'focused', 'speak');
    assert.strictEqual(state.areas[0], SIX('speak', 'extras'), 'Speak | Extras');
    assert.notStrictEqual(state.classes.indexOf('md-grid--speak-beside'), -1, 'the Speak row');
    assert.strictEqual(state.classes.indexOf('md-grid--caseload-beside'), -1, 'not the Caseload row');
  });
});
