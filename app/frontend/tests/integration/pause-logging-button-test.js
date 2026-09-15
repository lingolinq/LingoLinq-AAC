import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * PauseLoggingButton is the single rendering of the Pause / Resume Logging row.
 * It exists because that row now has TWO homes in board-detail.hbs: inside the
 * Session submenu (supporters, as it has always been) and as a top-level row for
 * a communicator-only account, whose Session section is hidden by
 * speak_section_visible_session (controllers/user/board-detail.js:4321).
 * Duplicating ~18 lines of markup across those two sites is what this avoids.
 */
QUnit.module('Integration | Component | pause-logging-button', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('unpaused: offers Pause, and reports itself unpressed', async function(assert) {
    this.set('paused', false);
    this.set('onToggle', function() {});
    await render(hbs`<PauseLoggingButton @paused={{this.paused}} @onToggle={{this.onToggle}} />`);
    var btn = document.querySelector('[data-bd-action="toggle_pause_logging"]');
    assert.ok(btn, 'the row renders');
    assert.strictEqual(btn.getAttribute('aria-pressed'), 'false', 'not pressed while logging runs');
    assert.notStrictEqual(btn.textContent.indexOf('Pause'), -1, 'offers Pause');
    assert.strictEqual(btn.textContent.indexOf('Resume'), -1, 'does not also offer Resume');
  });

  QUnit.test('paused: offers Resume, and reports itself pressed', async function(assert) {
    this.set('paused', true);
    this.set('onToggle', function() {});
    await render(hbs`<PauseLoggingButton @paused={{this.paused}} @onToggle={{this.onToggle}} />`);
    var btn = document.querySelector('[data-bd-action="toggle_pause_logging"]');
    assert.strictEqual(btn.getAttribute('aria-pressed'), 'true', 'pressed while logging is paused');
    assert.notStrictEqual(btn.textContent.indexOf('Resume'), -1, 'offers Resume');
    assert.strictEqual(btn.textContent.indexOf('Pause'), -1, 'does not also offer Pause');
  });

  QUnit.test('clicking it calls the passed action exactly once', async function(assert) {
    var calls = 0;
    this.set('paused', false);
    this.set('onToggle', function() { calls++; });
    await render(hbs`<PauseLoggingButton @paused={{this.paused}} @onToggle={{this.onToggle}} />`);
    await click('[data-bd-action="toggle_pause_logging"]');
    assert.strictEqual(calls, 1, 'the click reached the controller action');
  });
});
