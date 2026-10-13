import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import scanner from 'frontend/utils/scanner';
import 'frontend/utils/raw_events';

/* BASIC'S SENTENCE BAR MUST SPEAK WHEN IT IS SELECTED (2026-10-13). The bar listens with a native
   listener, `{{on "select" (this.ctrlAction "vocalize")}}` (templates/application.hbs and brief.hbs),
   but every path that selects it fired a jQuery-only event: `$elem.trigger('select')` on a tap and on
   Enter/Space (utils/raw_events.js), and `dom.select()` from switch scanning (utils/scanner.js).
   jQuery's trigger runs jQuery handlers and a native method of the same name, and an <a> has no
   select() method, so the native listener never heard it and the message was never spoken.
   Measured live on a tap: jQuery `select` 1, native 0, vocalize_list 0. */
module('Unit | Utility | the sentence bar hears select', function(hooks) {
  setupTest(hooks);
  var bar, heard;
  hooks.beforeEach(function() {
    heard = 0;
    bar = document.createElement('a');
    bar.id = 'button_list';
    bar.className = 'button_list';
    bar.href = '#';
    bar.textContent = 'hello';
    // The same kind of listener the template's {{on "select"}} adds.
    bar.addEventListener('select', function() { heard++; });
    document.body.appendChild(bar);
  });
  hooks.afterEach(function() { bar.remove(); });

  test('Enter on the bar speaks it (keyboard)', function(assert) {
    bar.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    assert.strictEqual(heard, 1);
  });

  test('a switch-scanning select of the bar speaks it', function(assert) {
    scanner.pick_elem(scanner.find_elem(bar));
    assert.strictEqual(heard, 1);
  });
});
