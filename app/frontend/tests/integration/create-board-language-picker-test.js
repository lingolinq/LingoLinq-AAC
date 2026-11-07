import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, findAll, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';
import CreateBoardNew from 'frontend/components/create-board-new';

/*
 * With english_first_board_generation on, the Language field used to show only a hint, so
 * anyone whose UI language was English had no way to make a board in another language and
 * the board spoke with an English voice.
 */
QUnit.module('Integration | Component | create-board-new language picker', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('offers the Language select with english_first_board_generation on', async function(assert) {
    const appState = this.owner.lookup('service:app-state');
    const prior = appState.get('currentUser');
    appState.set('currentUser', EmberObject.create({ feature_flags: { english_first_board_generation: true } }));
    try {
      await render(hbs`<CreateBoardNew />`);
      assert.dom('.nb-wizard .new-board-field--locale button#locale').exists();
      assert.dom('.nb-wizard .new-board-field--locale .nb-field__hint').exists();
    } finally {
      appState.set('currentUser', prior);
    }
  });

  QUnit.test('the language notices show only when asked for', async function(assert) {
    this.set('noVoice', true);
    this.set('translation', false);
    await render(hbs`<BoardLanguageNotices @noVoice={{this.noVoice}} @translation={{this.translation}} />`);
    assert.dom('[data-test-no-voice-notice]').exists();
    assert.dom('[data-test-translation-notice]').doesNotExist();
    this.set('noVoice', false);
    this.set('translation', true);
    await settled();
    assert.dom('[data-test-no-voice-notice]').doesNotExist();
    assert.dom('[data-test-translation-notice]').exists();
  });

  // Real clicks, because ModernSelect writes its selection back before it calls its action:
  // a send() in a unit test skips that write, and both defects below lived in it.
  async function choose(trigger, name) {
    await click(trigger);
    const option = findAll('.modern-select [role="option"], .modern-select li').find((el) => el.textContent.trim() === name);
    await click(option);
  }

  function capture(owner) {
    const seen = {};
    owner.register('component:create-board-new', CreateBoardNew.extend({
      init() {
        this._super(...arguments);
        seen.component = this;
      }
    }));
    return seen;
  }

  QUnit.test('choosing a language in the picker drops lookups from the old language', async function(assert) {
    assert.expect(2);
    const appState = this.owner.lookup('service:app-state');
    const prior = appState.get('currentUser');
    appState.set('currentUser', EmberObject.create({ feature_flags: { english_first_board_generation: true } }));
    const seen = capture(this.owner);
    try {
      await render(hbs`<CreateBoardNew />`);
      seen.component.set('model.locale', 'es');
      seen.component.set('_label_english', { sombrero: 'hat' });
      await choose('button#locale', 'French');
      assert.strictEqual(seen.component.get('model.locale'), 'fr');
      assert.deepEqual(seen.component.get('_label_english'), {});
    } finally {
      appState.set('currentUser', prior);
    }
  });

  QUnit.test('choosing the owner sets the owner and says the board will be in their language', async function(assert) {
    assert.expect(3);
    const appState = this.owner.lookup('service:app-state');
    const prior = appState.get('currentUser');
    const priorSession = appState.get('sessionUser');
    appState.set('sessionUser', EmberObject.create({
      supporter_role: true,
      known_supervisees: [{ id: 'u-es', user_name: 'communicator', locale: 'es' }]
    }));
    // Set last: with sessionUser set after it, the flag was gone when the owner was chosen.
    appState.set('currentUser', EmberObject.create({ feature_flags: { english_first_board_generation: true } }));
    const seen = capture(this.owner);
    try {
      await render(hbs`<CreateBoardNew />`);
      seen.component.setProperties({ wizard_step: 4, creating_for_someone_else: true });
      seen.component.set('model.locale', 'en');
      await settled();
      await choose('button#new_board_for_user', 'communicator');
      assert.strictEqual(seen.component.get('model.for_user_id'), 'u-es');
      assert.strictEqual(seen.component.get('model.locale'), 'es');
      assert.dom('[data-test-owner-language]').exists();
    } finally {
      appState.set('currentUser', prior);
      appState.set('sessionUser', priorSession);
    }
  });
});
