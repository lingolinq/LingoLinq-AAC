import { module, test } from 'qunit';
import { groupIdFor, groupsFor, groupFeatures } from 'frontend/utils/system_feature_groups';

/* System Settings' features page sections (utils/system_feature_groups.js, 2026-11-09). The server's
 * fine categories land in a few named sections, in a fixed order, sorted by name inside; a
 * category nobody listed goes to Other rather than disappearing from the page. */
module('Unit | Utility | system feature groups', function() {
  test('each category has a section; an unknown one is Other', function(assert) {
    assert.strictEqual(groupIdFor('Boards'), 'communication');
    assert.strictEqual(groupIdFor('Speak mode'), 'communication');
    assert.strictEqual(groupIdFor('Evaluations'), 'clinical');
    assert.strictEqual(groupIdFor('Billing'), 'billing');
    assert.strictEqual(groupIdFor('AI'), 'ai');
    assert.strictEqual(groupIdFor('Accessibility'), 'interface');
    assert.strictEqual(groupIdFor('Something New'), 'other', 'a new server category is not lost');
    assert.strictEqual(groupIdFor(undefined), 'other');
  });

  test('features come out in section order, each section sorted by name, empty sections left out', function(assert) {
    var groups = groupFeatures([
      { key: 'z', name: 'Zeta', category: 'AI' },
      { key: 'v', name: 'Video recording', category: 'Media' },
      { key: 'a', name: 'Assessments', category: 'Evaluations' },
      { key: 'c', name: 'Canvas render', category: 'Boards' },
      { key: 'n', name: 'New thing', category: 'Something New' }
    ]);
    assert.deepEqual(groups.map(function(g) { return g.id; }), ['communication', 'clinical', 'ai', 'other']);
    assert.deepEqual(groups[0].features.map(function(f) { return f.key; }), ['c', 'v'], 'sorted by name inside');
    assert.ok(groups.every(function(g) { return g.label && g.features.length; }), 'labelled, never empty');
  });

  test('the filter offers only the sections that have a category', function(assert) {
    assert.deepEqual(groupsFor(['Billing', 'Boards', 'Media']).map(function(g) { return g.id; }), ['communication', 'billing']);
    assert.deepEqual(groupsFor([]), []);
  });
});
