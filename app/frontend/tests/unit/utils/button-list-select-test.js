import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import scanner from 'frontend/utils/scanner';
import buttonTracker from 'frontend/utils/raw_events';
import modal from 'frontend/utils/modal';

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

  /* WITH "LISTEN TO THE KEYBOARD" ON (`keyboard_listen`), a keydown types into the sentence: the document
     keydown handler in raw_events.js turns Enter/Space into a typed space through app_state's
     activate_button, which blurs whatever has focus, so the bar lost focus before keyup and the keyup
     handler above never ran. Measured live (2026-10-13): keydown on the bar, keyup on BODY, nothing spoken. */
  function listening(typed) {
    // Every gate the typing branch reads, pinned: other suites leave scanning or dwell on, or a modal open,
    // and any one skips the typing branch, which would let these tests pass without exercising it.
    var prev = { appState: buttonTracker.appState, keyboard_listen: buttonTracker.keyboard_listen, scanning_enabled: buttonTracker.scanning_enabled, dwell_enabled: buttonTracker.dwell_enabled };
    buttonTracker.appState = EmberObject.create({
      speak_mode: true,
      // As the real one does in Speak Mode (services/app-state.js#activate_button): blur the focused element.
      activate_button: function() { typed.push(1); if (document.activeElement) { document.activeElement.blur(); } }
    });
    buttonTracker.keyboard_listen = true;
    buttonTracker.scanning_enabled = false;
    buttonTracker.dwell_enabled = false;
    var isOpen = modal.is_open;
    modal.is_open = function() { return false; };
    return function() { Object.keys(prev).forEach(function(k) { buttonTracker[k] = prev[k]; }); modal.is_open = isOpen; };
  }
  function press(key, code, repeat) {
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: code, keyCode: code === 'Enter' ? 13 : 32, repeat: !!repeat, bubbles: true, cancelable: true }));
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keyup', { key: key, code: code, keyCode: code === 'Enter' ? 13 : 32, bubbles: true }));
  }

  test('with keyboard listening on, Enter and Space on the focused bar speak it instead of typing', function(assert) {
    assert.expect(5);
    var typed = [];
    var restore = listening(typed);
    try {
      bar.focus();
      press('Enter', 'Enter');
      assert.strictEqual(typed.length, 0, 'Enter typed nothing into the sentence');
      assert.strictEqual(heard, 1, 'Enter spoke it');
      press(' ', 'Space');
      assert.strictEqual(typed.length, 0, 'Space typed nothing');
      assert.strictEqual(heard, 2, 'Space spoke it');
      assert.strictEqual(document.activeElement, bar, 'the bar keeps focus');
    } finally { restore(); }
  });

  test('with keyboard listening on, a held Enter on the bar does not type spaces', function(assert) {
    assert.expect(2);
    var typed = [];
    var restore = listening(typed);
    try {
      bar.focus();
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, repeat: true, bubbles: true, cancelable: true }));
      assert.strictEqual(typed.length, 0, 'no repeat typed a space');
      assert.strictEqual(document.activeElement, bar, 'the bar keeps focus');
    } finally { restore(); }
  });

  test('CONTROL: with keyboard listening on, a key pressed elsewhere still types', function(assert) {
    assert.expect(1);
    var typed = [];
    var restore = listening(typed);
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true, cancelable: true }));
      assert.strictEqual(typed.length, 1);
    } finally { restore(); }
  });

  test('a switch-scanning select of the bar speaks it', function(assert) {
    scanner.pick_elem(scanner.find_elem(bar));
    assert.strictEqual(heard, 1);
  });

  /* FINAL REVIEW (2026-10-13), Medium: for a SCANNING or dwell-key user, Space/Enter are the scanner's keys. When
     the bar held focus, the keyup handler spoke the whole sentence on top of the scan action, and Enter's native
     click on the <a> spoke it a second time. The scanner keeps those keys; the bar does not speak from them. */
  test('scanning: Enter and Space on the focused bar do not speak it, and Enter makes no click', function(assert) {
    assert.expect(4);
    var restore = listening([]);
    buttonTracker.scanning_enabled = true;
    try {
      bar.focus();
      var down = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
      bar.dispatchEvent(down);
      bar.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      assert.strictEqual(heard, 0, 'Enter did not speak it');
      assert.true(down.defaultPrevented, 'no click from Enter on the bar');
      bar.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true }));
      assert.strictEqual(heard, 0, 'Space did not speak it');
      buttonTracker.scanning_enabled = false;
      bar.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      assert.strictEqual(heard, 1, 'CONTROL: without scanning it speaks');
    } finally { restore(); }
  });
});
