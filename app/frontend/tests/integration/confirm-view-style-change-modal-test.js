import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import modalUtil from 'frontend/utils/modal';

/*
 * The "Change this person's view?" confirmation (utils/view_style.js#confirm_view_style_change)
 * opens whenever the view being changed belongs to someone else, for example while a supporter
 * models for a communicator. It was registered as a converted modal
 * (components/modal-container.js) but had no branch in modal-container.hbs, so it opened
 * invisibly: the switch never resolved and the modal stayed "open", which stops the scanner and
 * keyboard-listen selection on the communicator's board. Found by the 2026-09-30 adversarial
 * review (H1).
 */
QUnit.module('Integration | modal-container confirm-view-style-change', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    modalUtil.last_template = null;
    modalUtil._component_based_template = null;
    modalUtil.last_promise = null;
    modalUtil.last_any_template = null;
    const svc = this.owner.lookup('service:modal');
    if (svc && svc.set) { svc.set('currentTemplate', null); }
  });

  QUnit.test('the container renders the confirmation when it is opened', async function(assert) {
    const service = this.owner.lookup('service:modal');
    await render(hbs`<ModalContainer />`);
    service.open('confirm-view-style-change', { user_name: 'aiden_parker', style: 'classic' });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'confirm-view-style-change', 'precondition: it is the open template');
    assert.dom(document.querySelector('.md-modal-title')).hasText("Change this person's view?", 'the dialog is on screen');
  });
});
