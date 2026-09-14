import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import modalUtil from 'frontend/utils/modal';
import { setOwner } from '@ember/application';

/*
 * Reported: in the Share Text modal, the "Button" tile does nothing -- no modal,
 * no console error. Copy and Link (same row, same ctrlAction) work.
 *
 * "Button" is the only tile that opens a modal FROM INSIDE an already-open modal
 * (share-utterance -> modals/big-button). Email does too but was not reported.
 * These pin the two layers separately so a failure says WHICH one is broken:
 *   1. does the service reach currentTemplate === 'modals/big-button'?
 *   2. does modal-container actually render <BigButton /> for that value?
 */
QUnit.module('Integration | big-button nested open', function(hooks) {
  setupRenderingTest(hooks);

  // utils/modal is a MODULE SINGLETON. Without this reset these tests pass alone
  // and fail after one another, because `last_template` / `_component_based_template`
  // / `last_promise` survive between them. Order-dependent tests are worse than no
  // tests, so the state is cleared explicitly rather than left to run order.
  hooks.beforeEach(function() {
    modalUtil.last_template = null;
    modalUtil._component_based_template = null;
    modalUtil.last_promise = null;
    modalUtil.last_any_template = null;
    const svc = this.owner.lookup('service:modal');
    if (svc && svc.set) { svc.set('currentTemplate', null); }
  });

  QUnit.test('service reaches modals/big-button when opened directly', async function(assert) {
    const service = this.owner.lookup('service:modal');
    service.open('modals/big-button', { text: 'hello there', text_only: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'modals/big-button',
      'currentTemplate is modals/big-button');
  });

  QUnit.test('service reaches modals/big-button when REPLACING an open modal', async function(assert) {
    const service = this.owner.lookup('service:modal');
    service.open('share-utterance', { utterance: { sentence: 'hi' } });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'share-utterance', 'precondition: share modal open');
    service.open('modals/big-button', { text: 'hello there', text_only: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'modals/big-button',
      'nested open replaced the share modal');
  });

  QUnit.test('modal-container renders BigButton for that template', async function(assert) {
    const service = this.owner.lookup('service:modal');
    await render(hbs`<ModalContainer />`);
    service.open('modals/big-button', { text: 'hello there', text_only: true });
    await settled();
    const el = document.querySelector('.la-big-button-modal-wrap') ||
               document.querySelector('#full_button');
    assert.ok(el, 'BigButton markup is in the DOM');
  });

  // share_via() calls the IMPORTED utils/modal, not the service. utils/modal only
  // takes the component path when _getService() resolves; otherwise it falls
  // through to the legacy outlet path, which renders into an outlet that no
  // longer exists for converted modals -- silently, with no error. That is the
  // shape the report describes, so pin it.
  QUnit.test('utils/modal (the path share_via uses) reaches the service', async function(assert) {
    const service = this.owner.lookup('service:modal');
    // app-state.js:443 calls modal.setup(route) at boot; a rendering test never
    // does, so without this _getService() is null for harness reasons rather
    // than product reasons. Set it so the assertion tests the PRODUCT path.
    const fakeRoute = {};
    setOwner(fakeRoute, this.owner);
    modalUtil.setup(fakeRoute);
    assert.ok(modalUtil._getService(), '_getService() resolves a service');
    modalUtil.open('modals/big-button', { text: 'hello there', text_only: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'modals/big-button',
      'utils/modal.open routed through the service');
  });

  QUnit.test('utils/modal reaches it while share-utterance is already open', async function(assert) {
    const service = this.owner.lookup('service:modal');
    const fakeRoute2 = {};
    setOwner(fakeRoute2, this.owner);
    modalUtil.setup(fakeRoute2);
    modalUtil.open('share-utterance', { utterance: { sentence: 'hi' } });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'share-utterance', 'precondition');
    modalUtil.open('modals/big-button', { text: 'hello there', text_only: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'modals/big-button',
      'nested open via utils/modal replaced the share modal');
  });

  // The REAL sequence from the report: the speak menu is a modal, it opens the
  // share modal, and the share modal's Button tile opens big-button. Three opens
  // through the utils/modal SINGLETON with no close in between. Tests above pass
  // in isolation and fail after other opens have run, which points at accumulated
  // singleton state rather than at the nested open itself.
  QUnit.test('speak-menu -> share-utterance -> big-button (the reported flow)', async function(assert) {
    const service = this.owner.lookup('service:modal');
    const r = {};
    setOwner(r, this.owner);
    modalUtil.setup(r);

    modalUtil.open('speak-menu', { inactivity_timeout: true, scannable: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'speak-menu', 'step 1: speak menu open');

    modalUtil.open('share-utterance', { utterance: { sentence: 'hi' }, inactivity_timeout: true, scannable: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'share-utterance', 'step 2: share modal replaced it');

    modalUtil.open('modals/big-button', { text: 'hi', text_only: true });
    await settled();
    assert.strictEqual(service.get('currentTemplate'), 'modals/big-button',
      'step 3: Button tile opens big-button');
  });
});
