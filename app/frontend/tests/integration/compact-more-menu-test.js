import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/* The Compressed View toolbar's labelled More menu (components/dashboard/compact-more-menu): a
 * disclosure button with aria-expanded; items get `close` and `onKeydown`; Escape and an outside
 * click close it.
 *
 * Driven with NATIVE DOM events and a short wait for the re-render, not the test-helpers' `click`
 * / `triggerKeyEvent`: those await settled(), which here waits on app-wide timers for several
 * seconds per interaction (the same slow-settle behaviour behind #1073) and ran one test past the
 * 15s timeout. */
QUnit.module('Integration | Component | dashboard/compact-more-menu', function(hooks) {
  setupRenderingTest(hooks);

  var tick = function() { return new Promise(function(resolve) { setTimeout(resolve, 60); }); };
  var q = function(sel) { return document.querySelector('#ember-testing ' + sel); };

  hooks.beforeEach(async function() {
    this.ran = 0;
    this.run = (close) => { this.ran++; close(); };
    await render(hbs`
      <button type="button" class="outside">outside</button>
      <Dashboard::CompactMoreMenu @label="More" as |menu|>
        <button type="button" class="item" {{on "click" (fn this.run menu.close)}} {{on "keydown" menu.onKeydown}}>Edit Dashboard</button>
      </Dashboard::CompactMoreMenu>`);
  });

  QUnit.test('a labelled button toggles it open and closed', async function(assert) {
    assert.dom('.md-compact-head__more-trigger').hasText('More');
    assert.dom('.md-compact-head__more-trigger').hasAttribute('aria-expanded', 'false');
    assert.dom('.md-compact-head__more-menu').doesNotExist('closed at first');
    q('.md-compact-head__more-trigger').click(); await tick();
    assert.dom('.md-compact-head__more-trigger').hasAttribute('aria-expanded', 'true');
    assert.dom('.md-compact-head__more-menu .item').exists('the item shows');
    q('.md-compact-head__more-trigger').click(); await tick();
    assert.dom('.md-compact-head__more-menu').doesNotExist('closed again');
  });

  QUnit.test('it closes when its item runs', async function(assert) {
    q('.md-compact-head__more-trigger').click(); await tick();
    q('.item').click(); await tick();
    assert.strictEqual(this.ran, 1, 'the item ran');
    assert.dom('.md-compact-head__more-menu').doesNotExist('and the menu closed');
  });

  QUnit.test('Escape closes it and returns focus to the button', async function(assert) {
    q('.md-compact-head__more-trigger').click(); await tick();
    q('.item').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
    assert.dom('.md-compact-head__more-menu').doesNotExist('closed');
    assert.strictEqual(document.activeElement, q('.md-compact-head__more-trigger'), 'focus back on More');
  });

  QUnit.test('an outside click closes it', async function(assert) {
    q('.md-compact-head__more-trigger').click(); await tick();
    q('.outside').click(); await tick();
    assert.dom('.md-compact-head__more-menu').doesNotExist('closed');
  });
});
