import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import actionLock from 'frontend/utils/action-lock';

// "Disable this link action for now" (`link_disabled`) enforcement.
//
// This is the test that actually matters for the flag. Every renderer — classic
// board, board-alt, board-detail — funnels its activation into
// app_state.activate_button, so a guard in any single caller is escapable by the
// others. board-detail used to hold the only guard, and its own fall-through
// re-entered activate_button, which launched the link anyway; the flag was inert
// everywhere despite looking guarded at the call site.
//
// The flag suppresses only the LINK action. The button still speaks / adds to the
// vocalization box like a plain talk button — that is the documented behavior of
// "disable this link action", not "disable this button".
//
// TEST MECHANICS: activate_button wraps both link branches in
// `actionLock.run(key, …, {timeout: 5000})`. Left real, that seam breaks the test two
// ways — its lock key is derived from the url / board key, so consecutive tests
// silently swallow each other's activation; and its 5s lease is a pending runloop
// timer, so `settled()` never resolves and every async assertion times out. actionLock
// is a singleton object, so replacing `.run` with a pass-through removes both problems
// and leaves exactly what we mean to test: whether the link branch is entered at all.
module('Unit | Service | app-state link_disabled', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    this._launched = [];
    this._jumped = [];
    this.svc.launch_url = (button) => { this._launched.push(button); };
    this.svc.jump_to_board = (opts) => { this._jumped.push(opts); return null; };
    this._orig_lock_run = actionLock.run;
    actionLock.run = function(key, callback) { return callback(); };
  });

  hooks.afterEach(function() {
    actionLock.run = this._orig_lock_run;
  });

  // The folder branch defers its jump_to_board through `runLater(…, 50)` inside a
  // promise, so folder assertions wait for real time to pass.
  const flush = function() { return new Promise(function(r) { setTimeout(r, 150); }); };

  const activate = function(svc, button) {
    // activate_button does a lot besides the link action (logging, highlighting,
    // speech). Those need a rendered board; we only care about the link branch, so
    // let anything else throw and assert on what the link branch recorded.
    try { svc.activate_button(button, { label: button.label, button_id: button.id }); } catch(e) { /* noop */ }
  };

  test('a url button with link_disabled does not launch', function(assert) {
    activate(this.svc, { id: '1', label: 'web', url: 'https://site.test/a', link_disabled: true });
    assert.equal(this._launched.length, 0, 'launch_url was not called');
  });

  test('a url button without link_disabled still launches', function(assert) {
    activate(this.svc, { id: '1', label: 'web', url: 'https://site.test/b' });
    assert.equal(this._launched.length, 1, 'launch_url was called');
    assert.equal(this._launched[0].url, 'https://site.test/b', 'with the button');
  });

  // Legacy/copied boards persist these flags as the STRINGS "true"/"false"
  // (Button.LEVEL_BOOL_ATTRS documents this). `!!"false"` is `true`, so an
  // uncoerced check would suppress a link the author left ENABLED.
  test('the STRING "true" suppresses the launch', function(assert) {
    activate(this.svc, { id: '1', label: 'web', url: 'https://site.test/c', link_disabled: 'true' });
    assert.equal(this._launched.length, 0, 'treated as disabled');
  });

  test('the STRING "false" does NOT suppress the launch', function(assert) {
    activate(this.svc, { id: '1', label: 'web', url: 'https://site.test/d', link_disabled: 'false' });
    assert.equal(this._launched.length, 1, 'the string "false" was not treated as truthy');
  });

  test('a folder button with link_disabled does not navigate', async function(assert) {
    activate(this.svc, { id: '2', label: 'go', load_board: { id: 'b1', key: 'me/one' }, link_disabled: true });
    await flush();
    assert.equal(this._jumped.length, 0, 'jump_to_board was not called');
  });

  test('a folder button without link_disabled still navigates', async function(assert) {
    activate(this.svc, { id: '2', label: 'go', load_board: { id: 'b2', key: 'me/two' } });
    await flush();
    assert.equal(this._jumped.length, 1, 'jump_to_board was called');
    assert.equal(this._jumped[0].key, 'me/two', 'for the linked board');
  });

  test('the STRING "true" suppresses folder navigation too', async function(assert) {
    activate(this.svc, { id: '2', label: 'go', load_board: { id: 'b3', key: 'me/three' }, link_disabled: 'true' });
    await flush();
    assert.equal(this._jumped.length, 0, 'treated as disabled');
  });
});
