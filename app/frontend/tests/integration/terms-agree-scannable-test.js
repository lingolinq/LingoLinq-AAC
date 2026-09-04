import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * LL-104bfa61dc: the terms-agree modal is uncloseable and is the only way a
 * new user accepts Terms. The scanner selector is
 * `.modal-dialog .modal_targets .btn, .modal-dialog .modal_targets a, ...`
 * (services/modal.js / utils/modal.js). Without .modal_targets and .btn the
 * scanner finds zero targets.
 */
QUnit.module('Integration | terms-agree scannable markup', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('actions sit in .modal_targets and buttons also have .btn', async function(assert) {
    await render(hbs`<TermsAgree />`);

    assert.dom('.modal_targets').exists('scanner container is present');
    assert.dom('.modal-dialog .modal_targets .btn').exists(
      'scanner selector .modal-dialog .modal_targets .btn finds Agree'
    );
    assert.dom('.modal-dialog .modal_targets .btn.la-btn--primary').exists(
      'existing la-btn styling hook is preserved'
    );
  });
});
