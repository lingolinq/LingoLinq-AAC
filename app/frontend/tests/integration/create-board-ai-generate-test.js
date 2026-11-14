import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, settled, waitUntil } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import * as QUnit from 'qunit';
import CreateBoardNew from 'frontend/components/create-board-new';
import article50Gate from 'frontend/utils/article50_gate';

/*
 * Generate Labels with AI used to hide the whole wizard the moment it was pressed. While the
 * request ran the card was blank, and when it failed the error was drawn inside the hidden
 * wizard, so it only appeared after pressing Back. The step now stays on screen with a busy
 * button until the labels arrive, and a failure shows beside the button.
 */
QUnit.module('Integration | Component | create-board-new AI generate', function(hooks) {
  setupRenderingTest(hooks);

  let seen;
  let pending;
  let service;
  let realAjax;
  let realGate;
  let realOnline;

  hooks.beforeEach(function() {
    seen = {};
    this.owner.register('component:create-board-new', CreateBoardNew.extend({
      init() {
        this._super(...arguments);
        seen.component = this;
        this._ensureAiBoardGenerationAccess = function() { return RSVP.resolve({ proceed: true }); };
      }
    }));
    // utils/persistence is a proxy onto this service, so the request is faked here.
    service = this.owner.lookup('service:persistence');
    realAjax = service.ajax;
    realGate = article50Gate.presentBlockingGate;
    realOnline = service.get('online');
    service.set('online', true);
    article50Gate.presentBlockingGate = function() { return RSVP.resolve(); };
    service.ajax = function(url) {
      if (String(url).indexOf('/api/v1/boards/generate_labels') === -1) { return RSVP.resolve({}); }
      pending = RSVP.defer();
      return pending.promise;
    };
  });

  hooks.afterEach(function() {
    service.ajax = realAjax;
    article50Gate.presentBlockingGate = realGate;
    service.set('online', realOnline);
  });

  async function openLastAiStep() {
    await render(hbs`<CreateBoardNew />`);
    seen.component.setProperties({ ai_mode: true, wizard_step: 3 });
    seen.component.set('model.description', 'Playground words');
    await settled();
  }

  QUnit.test('the step stays on screen with a busy button while the labels are generated', async function(assert) {
    await openLastAiStep();
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    assert.dom('.nb-ai-generate__btn').hasAttribute('aria-busy', 'true');
    assert.dom('.nb-ai-generate__btn').includesText('Generating Labels');
    assert.dom('.nb-ai-generate__btn .nb-ai-sparkle.nb-ai-sparkle--pulse').exists();
    assert.dom('[data-test-ai-generating-status]').exists();
    assert.dom('.nb-wizard__step').exists('the wizard step is still showing');
    assert.false(seen.component.get('wizard_done'));
    pending.resolve({ labels: 'slide swing' });
    await settled();
  });

  QUnit.test('a failure shows beside the button, with no blank card and no Back needed', async function(assert) {
    await openLastAiStep();
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    pending.reject({ responseJSON: { error: 'The AI returned an incomplete word list (63 of 64).' } });
    await settled();
    assert.false(seen.component.get('wizard_done'));
    assert.dom('.nb-wizard__step').exists();
    assert.dom('.nb-ai-generate [role="alert"]').includesText('63 of 64');
    assert.dom('.nb-ai-generate__btn').hasAttribute('aria-busy', 'false');
    assert.dom('.nb-ai-generate__btn').includesText('Generate Labels with AI');
  });

  // The server sends `shortfall` when the AI still came back short after its top-up (PR #1313):
  // the board is made with the remaining cells empty, and the labels page says so.
  QUnit.test('the labels page says how many cells are left empty after a short list', async function(assert) {
    await openLastAiStep();
    seen.component.set('model.grid.rows', 2);
    seen.component.set('model.grid.columns', 2);
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    pending.resolve({ labels: 'slide, swing, ball', shortfall: 1 });
    await settled();
    assert.dom('[data-test-ai-shortfall-notice]').exists();
    assert.dom('[data-test-ai-shortfall-notice]').includesText('3 of 4');
    assert.dom('[data-test-ai-shortfall-notice]').includesText('1 cell');
  });

  QUnit.test('no note when the AI filled every cell', async function(assert) {
    await openLastAiStep();
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    pending.resolve({ labels: 'slide swing' });
    await settled();
    assert.dom('[data-test-ai-shortfall-notice]').doesNotExist();
  });

  // While the step stays on screen, its way out to the other creation methods must be held too,
  // or a late answer would land on top of a flow the person chose instead (Codex review, #1309).
  QUnit.test('Other Create Board Methods is held while the labels are generated', async function(assert) {
    // The header holding that button is only drawn on the full page (`@standalone`, as the route renders it).
    await render(hbs`<CreateBoardNew @standalone={{true}} />`);
    seen.component.setProperties({ ai_mode: true, wizard_step: 3 });
    seen.component.set('model.description', 'Playground words');
    await settled();
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    assert.dom('.nb-other-methods-btn').isDisabled();
    pending.resolve({ labels: 'slide swing' });
    await settled();
  });

  QUnit.test('a late answer is ignored once the person has left AI mode', async function(assert) {
    await openLastAiStep();
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    seen.component.send('set_create_mode', 'regular');
    seen.component.set('model.grid.labels', 'typed by hand');
    pending.resolve({ labels: 'slide swing' });
    await settled();
    assert.strictEqual(seen.component.get('model.grid.labels'), 'typed by hand');
    assert.false(seen.component.get('wizard_done'));
    assert.false(seen.component.get('ai_generating'));
  });

  QUnit.test('the labels page opens once the labels arrive', async function(assert) {
    await openLastAiStep();
    await click('.nb-ai-generate__btn');
    await waitUntil(() => seen.component.get('ai_generating'));
    pending.resolve({ labels: 'slide swing' });
    await settled();
    assert.true(seen.component.get('wizard_done'));
    assert.strictEqual(seen.component.get('model.grid.labels'), 'slide swing');
  });
});
