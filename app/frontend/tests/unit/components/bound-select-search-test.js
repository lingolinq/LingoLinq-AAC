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
});
