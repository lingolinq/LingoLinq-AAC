import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/* The Display Style disc (the Dashboard Design entry point in the navbar). Kept from
 * display-style-triggerless-test.js when the component's `@triggerless` mode, used only by
 * Compressed View, was removed with that feature (2026-10-10). */
QUnit.module('Integration | display-style disc', function(hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function() {
    this.owner.lookup('service:app-state').set('dashboard_design_opener', null);
  });

  QUnit.test('renders the disc', async function(assert) {
    await render(hbs`<DisplayStyle />`);
    assert.dom('.md-display-style__trigger').exists('the Display Style disc is shown');
  });

  // Mounting registers the opener the phone-width drawer and Edit Dashboard open the page through
  // (app-navbar-authenticated-inner.js#openDisplayStyle, dashboard/authenticated-view.js).
  QUnit.test('registers the Dashboard Design opener when mounted', async function(assert) {
    await render(hbs`<DisplayStyle />`);
    assert.strictEqual(typeof this.owner.lookup('service:app-state').get('dashboard_design_opener'), 'function',
      'the opener other entry points use is registered');
  });

  // In the View menu now (2026-10-13): the navbar mounts it without its button, and the menu's Display
  // item opens the page through the same opener (components/view-switcher.js#open_display_style).
  QUnit.test('@triggerless: no button, but the opener is still registered', async function(assert) {
    await render(hbs`<DisplayStyle @triggerless={{true}} />`);
    assert.dom('.md-display-style__trigger').doesNotExist('no button in the navbar');
    assert.strictEqual(typeof this.owner.lookup('service:app-state').get('dashboard_design_opener'), 'function',
      'the View menu and the drawer can still open it');
  });
});
