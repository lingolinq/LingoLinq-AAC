import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled, click, waitUntil } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import modalUtil from 'frontend/utils/modal';

/*
 * The dialog board Save shows while a picture or sound is still uploading
 * (utils/save_after_media.js). It must render through the real modal container (a converted
 * modal with no branch in modal-container.hbs opens invisibly), offer "Back to editing" at once,
 * offer "Save without it" only once 15 seconds have passed since the first Save click, and not
 * close on Escape or a backdrop click.
 */
QUnit.module('Integration | modal-container save-waiting', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    modalUtil.last_template = null;
    modalUtil._component_based_template = null;
    modalUtil.last_promise = null;
    modalUtil.last_any_template = null;
    const svc = this.owner.lookup('service:modal');
    if (svc && svc.set) { svc.set('currentTemplate', null); }
  });

  QUnit.test('it renders, offers Back to editing, and is uncloseable', async function(assert) {
    await render(hbs`<ModalContainer />`);
    var result = null;
    modalUtil.open('save-waiting', {started_at: Date.now()}).then(function(res) { result = res; });
    await settled();
    var dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the dialog is on screen');
    assert.strictEqual(dialog.getAttribute('data-uncloseable'), 'true', 'Escape and the backdrop do not close it');
    assert.dom(document.querySelector('[data-test-save-waiting-message]')).exists();
    assert.dom(document.querySelector('[data-test-save-waiting-back]')).exists();
    assert.dom(document.querySelector('[data-test-save-waiting-without]')).doesNotExist('not before 15 seconds');

    await click('[data-test-save-waiting-back]');
    assert.strictEqual(result, 'back');
  });

  QUnit.test('Save without it appears by itself when the 15 seconds run out while open', async function(assert) {
    await render(hbs`<ModalContainer />`);
    modalUtil.open('save-waiting', {started_at: Date.now() - 14900});
    await settled();
    assert.dom(document.querySelector('[data-test-save-waiting-without]')).doesNotExist();
    await waitUntil(function() { return document.querySelector('[data-test-save-waiting-without]'); }, {timeout: 2000});
    assert.dom(document.querySelector('[data-test-save-waiting-without]')).exists();
  });

  QUnit.test('after 15 seconds it offers Save without it', async function(assert) {
    await render(hbs`<ModalContainer />`);
    var result = null;
    modalUtil.open('save-waiting', {started_at: Date.now() - 16000}).then(function(res) { result = res; });
    await settled();
    assert.dom(document.querySelector('[data-test-save-waiting-without]')).exists();
    await click('[data-test-save-waiting-without]');
    assert.strictEqual(result, 'save_without');
  });
});
