import { module, test } from 'qunit';
import editManager from 'frontend/utils/edit_manager';

// Non-regression contract for the Plan 01-04 schema-2 seam in edit_manager.js. These
// assertions document (they do not execute behaviorally -- ember unit specs don't run in
// this repo, see issue #314) that with multilingual_grammar off, inflection_for_types'
// lookback-rules resolution and grid_for's long-press overlay slot ordering are
// byte-identical to their pre-migration output, and that the new schema2_rules_override /
// schema2_slot_override seams are inert (return null) whether the flag is off or on.
function withMockAppStateAndController(appStateStub, controllerStub, fn) {
  var origServices = editManager._services;
  editManager._services = {};
  editManager.appState = appStateStub;
  editManager.controller = controllerStub;
  try {
    fn();
  } finally {
    editManager._services = origServices;
  }
}

function mockAppState(flagOn) {
  return {
    controller: {},
    get: function(key) {
      if(key == 'feature_flags.multilingual_grammar') { return !!flagOn; }
      if(key == 'speak_mode') { return false; }
      return null;
    }
  };
}

module('Unit | Utility | edit_manager schema2 seam', function() {
  test('schema2_rules_override is null when the flag is off or on (stub, no real resolver wired yet)', function(assert) {
    withMockAppStateAndController(mockAppState(false), {}, function() {
      assert.equal(editManager.schema2_rules_override('en'), null, 'null when flag off');
    });
    withMockAppStateAndController(mockAppState(true), {}, function() {
      assert.equal(editManager.schema2_rules_override('en'), null, 'null when flag on (stub)');
    });
  });

  test('schema2_slot_override is null when the flag is off or on (stub, no real resolver wired yet)', function(assert) {
    var button = {id: 'btn1', label: 'jump', part_of_speech: 'verb'};
    withMockAppStateAndController(mockAppState(false), {}, function() {
      assert.equal(editManager.schema2_slot_override(button, 'en'), null, 'null when flag off');
    });
    withMockAppStateAndController(mockAppState(true), {}, function() {
      assert.equal(editManager.schema2_slot_override(button, 'en'), null, 'null when flag on (stub)');
    });
  });

  test('flag off: inflection_for_types resolves the existing "he" pronoun overrides unchanged', function(assert) {
    // Mirrors the existing fixture at tests/utils/edit_manager-test.js ("he" pronoun ->
    // isn't/doesn't overrides), driven through the hardcoded EN rules[] fallback list.
    withMockAppStateAndController(mockAppState(false), {}, function() {
      var history = [{label: 'he', part_of_speech: 'pronoun'}];
      var res = editManager.inflection_for_types(history, 'en');
      assert.equal((res.not || {}).label, "isn't", '"not" override for he');
      assert.equal((res.no || {}).label, "doesn't", '"no" override for he');
    });
  });

  test('flag off: grid_for keeps the compass locs ordering for a sample verb button', function(assert) {
    var board = {
      get: function(key) {
        if(key == 'translations') { return {}; }
        if(key == 'locale') { return 'en'; }
        return null;
      }
    };
    var controllerStub = {
      get: function(key) {
        if(key == 'model') { return board; }
        return null;
      }
    };
    var appStateStub = mockAppState(false);
    appStateStub.get = function(key) {
      if(key == 'feature_flags.multilingual_grammar') { return false; }
      if(key == 'vocalization_locale') { return 'en'; }
      if(key == 'label_locale') { return 'en'; }
      return null;
    };
    withMockAppStateAndController(appStateStub, controllerStub, function() {
      var button = {id: 'btn1', label: 'jump', original_label: 'jump', part_of_speech: 'verb'};
      var grid = editManager.grid_for(button);
      assert.ok(grid, 'grid_for returns a non-null overlay grid for a verb button');
      var locations = grid.map(function(i) { return i.location; });
      // Order produced by the verb branch of grid_for's EN fallback block: simple_past (w),
      // present_participle (s), past_participle (sw), simple_present (n), infinitive (e),
      // base label (c), duplicate simple_past (nw), duplicate base label (ne), negation (se).
      assert.deepEqual(
        locations,
        ['w', 's', 'sw', 'n', 'e', 'c', 'nw', 'ne', 'se'],
        'verb overlay slots resolve to the same nine compass locations, in the same order, as today'
      );
    });
  });
});
