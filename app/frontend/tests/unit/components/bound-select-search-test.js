import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

function makeKeyEvent(key) {
  return {
    key: key,
    preventDefaultCount: 0,
    stopPropagationCount: 0,
    preventDefault: function() { this.preventDefaultCount++; },
    stopPropagation: function() { this.stopPropagationCount++; }
  };
}

/*
 * Translate Boards uses BoundSelect with searchable=true for the language
 * list. The search <input> lives inside the <ul>. Wiring that ul's keydown
 * through ctrlAction always preventDefault()s, so typed characters never
 * reach the input. These tests pin the dedicated handlers that replaced it.
 */
QUnit.module('Unit | Component | bound-select search typing', function(hooks) {
  setupTest(hooks);

  QUnit.test('onListKeydown and onSearchKeydown exist at construction', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create();
    assert.strictEqual(typeof c.onListKeydown, 'function',
      '{{on "keydown" this.onListKeydown}} binds during render, so the handler must exist in init');
    assert.strictEqual(typeof c.onSearchKeydown, 'function',
      '{{on "keydown" this.onSearchKeydown}} binds during render, so the handler must exist in init');
    c.destroy();
  });

  QUnit.test('a letter keydown on the search input is not preventDefaulted', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create();
    var ev = makeKeyEvent('s');
    c.onSearchKeydown(ev);
    assert.strictEqual(ev.preventDefaultCount, 0,
      'preventDefault on keydown would block the character from being inserted');
    assert.ok(ev.stopPropagationCount > 0,
      'stopPropagation keeps the ul list handler from seeing the keystroke');
    c.destroy();
  });

  QUnit.test('a letter keydown on the list is not preventDefaulted', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create();
    var ev = makeKeyEvent('s');
    c.onListKeydown(ev);
    assert.strictEqual(ev.preventDefaultCount, 0,
      'regression: ctrlAction used to preventDefault every list keydown');
    c.destroy();
  });

  QUnit.test('searchQuery filters options by name', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create({
      searchable: true,
      content: [
        { name: 'Spanish', id: 'es' },
        { name: 'French', id: 'fr' },
        { name: 'Afrikaans', id: 'af' }
      ]
    });
    c.set('searchQuery', 'span');
    var shown = c.get('renderContent').map(function(item) { return item.name; });
    assert.deepEqual(shown, ['Spanish']);
    c.destroy();
  });

  QUnit.test('grid layout still filters options by name', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create({
      searchable: true,
      grid: true,
      content: [
        { name: 'January', id: '1' },
        { name: 'June', id: '6' },
        { name: 'July', id: '7' }
      ]
    });
    c.set('searchQuery', 'ju');
    var shown = c.get('renderContent').map(function(item) { return item.name; });
    assert.deepEqual(shown, ['June', 'July']);
    c.destroy();
  });

  QUnit.test('grid layout omits empty-id placeholders from the option list', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create({
      grid: true,
      content: [
        { name: 'Month', id: '' },
        { name: 'January', id: '1' },
        { name: 'February', id: '2' }
      ]
    });
    var shown = c.get('renderContent').map(function(item) { return item.name; });
    assert.deepEqual(shown, ['January', 'February']);
    c.destroy();
  });

  QUnit.test('a letter keydown on the search input is not preventDefaulted in grid mode', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create({
      searchable: true,
      grid: true
    });
    var ev = makeKeyEvent('j');
    c.onSearchKeydown(ev);
    assert.strictEqual(ev.preventDefaultCount, 0,
      'grid mode must keep the dedicated search handler so typing still inserts');
    c.destroy();
  });

  QUnit.test('_gridNextIndex moves by one cell horizontally and by columns vertically', function(assert) {
    var c = this.owner.factoryFor('component:bound-select').create({
      grid: true,
      gridColumns: 3
    });
    // 12 cells, 3 columns (month grid).
    assert.strictEqual(c._gridNextIndex(0, 'ArrowRight', 3, 12), 1);
    assert.strictEqual(c._gridNextIndex(2, 'ArrowRight', 3, 12), 3);
    assert.strictEqual(c._gridNextIndex(11, 'ArrowRight', 3, 12), 0);
    assert.strictEqual(c._gridNextIndex(0, 'ArrowLeft', 3, 12), 11);
    assert.strictEqual(c._gridNextIndex(0, 'ArrowDown', 3, 12), 3);
    assert.strictEqual(c._gridNextIndex(9, 'ArrowDown', 3, 12), 0);
    assert.strictEqual(c._gridNextIndex(3, 'ArrowUp', 3, 12), 0);
    assert.strictEqual(c._gridNextIndex(0, 'ArrowUp', 3, 12), 9);
    assert.strictEqual(c._gridNextIndex(11, 'ArrowUp', 3, 12), 8);
    c.destroy();
  });
});
