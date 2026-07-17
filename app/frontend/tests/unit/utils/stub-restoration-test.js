import { module, test } from 'qunit';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

module('Unit | Utility | stub restoration protection', function () {
    test('it restores modified properties correctly', function (assert) {
        const obj = { foo: 'original' };

        // Stage 1: Apply stub
        stub(obj, 'foo', 'stubbed');
        assert.equal(obj.foo, 'stubbed', 'Property should be stubbed');

        // Stage 2: Restore (same path as global afterEach)
        restoreStubs();

        assert.equal(obj.foo, 'original', 'Property should be restored to original value');
    });

    test('it handles multiple stubs in reverse order', function (assert) {
        const obj = { bar: 'base' };

        stub(obj, 'bar', 'first-stub');
        stub(obj, 'bar', 'second-stub');

        assert.equal(obj.bar, 'second-stub', 'Latest stub should win');

        restoreStubs();

        assert.equal(obj.bar, 'base', 'All stubs should be cleared, returning to base');
    });
});
