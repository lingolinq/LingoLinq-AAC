import { module, test } from 'qunit';
import EmberObject, { computed } from '@ember/object';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/*
 * restoreStubs must put each object back exactly as it was. A stub of an INHERITED method used to
 * be "restored" by assigning the original back, leaving an own copy on the object; through the
 * utils/persistence forwarding proxy that copy was bound to the test's (soon destroyed) service.
 */
module('Unit | Helper | stub restore', function() {
  test('a stubbed inherited method leaves no own copy behind', function(assert) {
    assert.expect(3);
    const proto = { greet() { return 'hi'; } };
    const obj = Object.create(proto);
    stub(obj, 'greet', () => 'stubbed');
    assert.strictEqual(obj.greet(), 'stubbed', 'the stub is in place');
    restoreStubs();
    assert.false(Object.prototype.hasOwnProperty.call(obj, 'greet'), 'no own copy is left on the object');
    assert.strictEqual(obj.greet(), 'hi', 'the inherited method answers again');
  });

  test('a stubbed own method is put back', function(assert) {
    assert.expect(2);
    const original = () => 'own';
    const obj = { greet: original };
    stub(obj, 'greet', () => 'stubbed');
    restoreStubs();
    assert.true(Object.prototype.hasOwnProperty.call(obj, 'greet'), 'still an own property');
    assert.strictEqual(obj.greet, original, 'holding the original');
  });

  test('restoring an inherited Ember property notifies what depends on it', function(assert) {
    assert.expect(2);
    const Owner = EmberObject.extend({
      level: 'base',
      shout: computed('level', function() { return `${this.get('level')}!`; })
    });
    const obj = Owner.create();
    stub(obj, 'level', 'stubbed');
    assert.strictEqual(obj.get('shout'), 'stubbed!', 'the computed saw the stub');
    restoreStubs();
    assert.strictEqual(obj.get('shout'), 'base!', 'and recomputes after the restore');
  });

  test('a stubbed accessor is restored through its setter', function(assert) {
    assert.expect(2);
    const proto = {
      get slot() { return this._slot; },
      set slot(v) { this._slot = v; }
    };
    const obj = Object.create(proto);
    obj.slot = 'original';
    stub(obj, 'slot', 'stubbed');
    assert.strictEqual(obj.slot, 'stubbed', 'the stub went through the setter');
    restoreStubs();
    assert.strictEqual(obj.slot, 'original', 'and so did the restore');
  });
});
