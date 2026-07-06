import { module, test } from 'qunit';
import i18n from 'frontend/utils/i18n';

// Non-regression contract for the Plan 01-04 schema-2 seam in i18n.js. These assertions
// document (they do not execute behaviorally -- ember unit specs don't run in this repo,
// see issue #314) that with multilingual_grammar off, pluralize/singularize/tense/
// verb_negation are byte-identical to their pre-migration output, and that the new
// schema2_morph wrapper is inert (delegates straight through) whether the flag is off or on.
module('Unit | Utility | i18n schema2 seam', function() {
  test('flag off: hardcoded English helpers produce their existing output unchanged', function(assert) {
    assert.equal(i18n.pluralize('box'), 'boxes', 'pluralize box');
    assert.equal(i18n.pluralize('baby'), 'babies', 'pluralize baby');
    assert.equal(i18n.singularize('boxes'), 'box', 'singularize boxes');
    assert.equal(i18n.tense('jump', {simple_past: true}), 'jumped', 'regular past tense');
    assert.equal(i18n.verb_negation('is'), "isn't", 'verb negation of is');
  });

  test('multilingual_grammar_enabled reads an injected app_state service (defaults false)', function(assert) {
    assert.equal(i18n.multilingual_grammar_enabled({get: function() { return false; }}), false, 'false when flag off');
    assert.equal(i18n.multilingual_grammar_enabled({get: function() { return true; }}), true, 'true when flag on');
    assert.equal(i18n.multilingual_grammar_enabled(null), false, 'false with no service available');
  });

  test('schema2_morph is inert when the flag is off: output matches the legacy helper exactly', function(assert) {
    var offState = {get: function() { return false; }};
    assert.equal(
      i18n.schema2_morph('pluralize', 'box', null, {schema2_stub: true}, offState),
      i18n.pluralize('box'),
      'pluralize seam matches legacy when off'
    );
    assert.equal(
      i18n.schema2_morph('tense', 'jump', {simple_past: true}, {schema2_stub: true}, offState),
      i18n.tense('jump', {simple_past: true}),
      'tense seam matches legacy when off'
    );
  });

  test('schema2_morph flag-on stub does not alter the flag-off output for the same word', function(assert) {
    var onState = {get: function() { return true; }};
    var onResult = i18n.schema2_morph('pluralize', 'box', null, {schema2_stub: true}, onState);
    assert.equal(onResult, i18n.pluralize('box'), 'flag-on stub still delegates to legacy pluralize (no real resolver wired yet)');
  });
});
