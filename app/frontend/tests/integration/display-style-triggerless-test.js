import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/* Compressed View removes the navbar's Display Style disc (the Dashboard Design entry point), but
 * the component must stay MOUNTED: mounting is what registers `appState.dashboard_design_opener`,
 * which the phone-width menu drawer and the dashboard's own Edit Dashboard action open it through
 * (components/app-navbar-authenticated-inner.js#openDisplayStyle). `@triggerless` is how the navbar
 * asks for that, the same contract as <GuidedTour @triggerless>. */
QUnit.module('Integration | display-style triggerless', function(hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function() {
    this.owner.lookup('service:app-state').set('dashboard_design_opener', null);
  });

  QUnit.test('renders the disc by default', async function(assert) {
    await render(hbs`<DisplayStyle />`);
    assert.dom('.md-display-style__trigger').exists('the Display Style disc is shown');
  });

  QUnit.test('with @triggerless renders no disc but still registers the opener', async function(assert) {
    await render(hbs`<DisplayStyle @triggerless={{true}} />`);
    assert.dom('.md-display-style__trigger').doesNotExist('no disc');
    assert.strictEqual(typeof this.owner.lookup('service:app-state').get('dashboard_design_opener'), 'function',
      'the opener other entry points use is still registered');
  });
});
