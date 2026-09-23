import { module, test } from 'qunit';
import { setupTest, setupRenderingTest } from 'frontend/tests/helpers';
import { render, triggerEvent, fillIn } from '@ember/test-helpers';
import emailEditTemplate from 'frontend/templates/system-settings/email-edit';
import appDefaultsTemplate from 'frontend/templates/system-settings/app-defaults';

// Issue #1051. The parental-consent message fields in the email editor, and the
// app-defaults fields, must render and keep what the admin types.

module('Unit | Controller | system-settings/email-edit handlers', function(hooks) {
  setupTest(hooks);

  test('a single init defines the handler factories the page uses', function(assert) {
    var controller = this.owner.lookup('controller:system-settings/email-edit');
    assert.strictEqual(typeof controller.ctrlAction, 'function', 'ctrlAction is defined');
    assert.strictEqual(typeof controller.ctrlActionNoBubble, 'function', 'ctrlActionNoBubble is defined');
  });
});

module('Integration | Template | system-settings input fields', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.owner.setupRouter();
  });

  function copyHandlers(context, controller) {
    ['ctrlAction', 'ctrlActionNoBubble'].forEach(function(name) {
      context.set(name, controller[name]);
    });
  }

  test('email-edit consent fields keep focus and every typed character', async function(assert) {
    var controller = this.owner.lookup('controller:system-settings/email-edit');
    copyHandlers(this, controller);
    var greeting = { key: 'parental_consent_mailer.greeting', label: 'Greeting', value: 'Hi', placeholders: [] };
    var intro = { key: 'parental_consent_mailer.intro', label: 'Introduction', value: 'Intro', placeholders: ['app_name', 'consent_age'] };
    this.set('template', { name: 'Parental consent request', description: '' });
    this.set('hasI18nBlocks', true);
    this.set('activeFormat', 'message');
    this.set('i18nBlocks', [greeting, intro]);

    await render(emailEditTemplate);

    var field = document.getElementById('system-email-i18n-parental_consent_mailer.greeting');
    assert.ok(field, 'the greeting field renders');
    field.focus();
    field.value = 'Hi!';
    await triggerEvent(field, 'input');
    field.value = 'Hi!!';
    await triggerEvent(field, 'input');

    assert.ok(field.isConnected, 'the same field element is still in the page');
    assert.strictEqual(document.activeElement, field, 'focus stays in the field between keystrokes');
    assert.strictEqual(greeting.value, 'Hi!!', 'both typed characters are kept on the block');
    assert.strictEqual(intro.value, 'Intro', 'other blocks are untouched');

    var introField = document.getElementById('system-email-i18n-parental_consent_mailer.intro');
    await fillIn(introField, 'Welcome to %{app_name}');
    assert.strictEqual(intro.value, 'Welcome to %{app_name}', 'the textarea fields write back too');
  });

  test('app-defaults fields render and write back', async function(assert) {
    var controller = this.owner.lookup('controller:system-settings/app-defaults');
    copyHandlers(this, controller);
    this.set('settings', { app_name: 'LingoLinq', support_url: 'https://example.com/help' });

    await render(appDefaultsTemplate);

    await fillIn('#app-defaults-app-name', 'LingoLinq Beta');
    assert.strictEqual(this.settings.app_name, 'LingoLinq Beta', 'the edited field takes the typed value');
    assert.strictEqual(this.settings.support_url, 'https://example.com/help', 'other fields are untouched');
  });
});
