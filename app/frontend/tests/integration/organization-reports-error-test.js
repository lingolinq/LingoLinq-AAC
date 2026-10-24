import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { setComponentTemplate } from '@ember/component';
import Component from '@ember/component';
import template from 'frontend/templates/organization/reports';
import * as QUnit from 'qunit';

/* The reports controller stores the server sentence on results.error.error.
   The page used to render the object, so the screen read "[object Object]". */
QUnit.module('Integration | organization reports error', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('a failed report fetch shows the server sentence', async function(assert) {
    var Reports = setComponentTemplate(template, Component.extend({
      model: { permissions: { edit: true } },
      available_reports: [{ id: 'logged_2', name: 'Logs' }],
      current_report: 'logged_2',
      results: { error: { error: 'Not authorized' } }
    }));
    this.owner.register('component:org-reports-error-subject', Reports);
    await render(hbs`<OrgReportsErrorSubject />`);
    assert.dom('.md-org-error').hasText('Not authorized');
  });
});
