import { module, test } from 'qunit';
import { setupTest, setupRenderingTest } from 'frontend/tests/helpers';
import { render, triggerEvent, fillIn, settled } from '@ember/test-helpers';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
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

  test('typed consent text reaches the save payload', function(assert) {
    var controller = this.owner.lookup('controller:system-settings/email-edit');
    var greeting = { key: 'parental_consent_mailer.greeting', value: 'Hi' };
    controller.set('i18nBlocks', [greeting, { key: 'parental_consent_mailer.footer', value: 'Bye' }]);
    // The template's (set-field block "value") handler writes to the block in place.
    greeting.value = 'Hello there';
    assert.deepEqual(controller.buildI18nOverrides(), {
      'parental_consent_mailer.greeting': 'Hello there',
      'parental_consent_mailer.footer': 'Bye'
    });
  });

  test('a rejected save shows the server error, not the generic message', async function(assert) {
    var controller = this.owner.lookup('controller:system-settings/email-edit');
    var originalAjax = controller.persistence.ajax;
    var originalError = modal.error;
    var shown = [];
    var message = 'Introduction: %{app_nam} is not a placeholder this field supports. Allowed: %{app_name}, %{consent_age}';
    // The rejection the app's $.ajax wrapper builds for a 400 with a JSON error body
    // (utils/extras.js, the error branch: result = xhr.responseJSON.error, fakeXHR keeps
    // responseJSON). Written by hand: that wrapper does not settle in a unit test.
    controller.persistence.ajax = function() {
      return RSVP.reject({
        fakeXHR: { status: 400, readyState: 4, statusText: 'Bad Request', responseJSON: { error: message } },
        message: 'error',
        result: message
      });
    };
    modal.error = function(text) { shown.push(text); };
    try {
      controller.set('template_slug', 'user_mailer.parental_consent_request');
      controller.set('template', { has_i18n_blocks: true });
      controller.set('i18nBlocks', [{ key: 'parental_consent_mailer.intro', value: 'Welcome to %{app_nam}' }]);
      controller.send('saveTemplate');
      await settled();
    } finally {
      controller.persistence.ajax = originalAjax;
      modal.error = originalError;
    }
    assert.deepEqual(shown, [message], 'the admin sees which field and placeholder is wrong');
    assert.false(controller.get('saving'), 'the Save button is re-enabled');
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
    var footer = { key: 'parental_consent_mailer.footer', label: 'Footer', value: 'Bye', placeholders: [] };
    this.set('i18nBlocks', [greeting, intro, footer]);

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
    await fillIn(document.getElementById('system-email-i18n-parental_consent_mailer.footer'), 'Thanks');
    assert.strictEqual(footer.value, 'Thanks', 'the footer textarea writes back');
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
