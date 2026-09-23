import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

// The email-edit and app-defaults templates bind their text fields with
// `{{on "input" (this.ctrlActionEventValueBound ...)}}`, so each controller
// must define that handler factory on the instance (issue #1051).
module('Unit | Controller | system-settings input handlers', function(hooks) {
  setupTest(hooks);

  test('email-edit defines ctrlActionEventValueBound and it updates the i18n block', function(assert) {
    var controller = this.owner.lookup('controller:system-settings/email-edit');
    assert.strictEqual(typeof controller.ctrlActionEventValueBound, 'function', 'ctrlActionEventValueBound is defined');
    assert.strictEqual(typeof controller.ctrlAction, 'function', 'ctrlAction is still defined');
    assert.strictEqual(typeof controller.ctrlActionNoBubble, 'function', 'ctrlActionNoBubble is still defined');

    var block = { key: 'parental_consent_mailer.greeting', value: 'Hello' };
    controller.set('i18nBlocks', [block, { key: 'parental_consent_mailer.footer', value: 'Bye' }]);
    var handler = controller.ctrlActionEventValueBound('updateI18nBlock', block, 'value');
    handler({ target: { value: 'Hi there' } });

    assert.deepEqual(controller.get('i18nBlocks').map(function(b) { return b.value; }), ['Hi there', 'Bye'],
      'only the bound block takes the input value');
  });

  test('app-defaults defines ctrlActionEventValueBound and it updates the setting', function(assert) {
    var controller = this.owner.lookup('controller:system-settings/app-defaults');
    assert.strictEqual(typeof controller.ctrlActionEventValueBound, 'function', 'ctrlActionEventValueBound is defined');

    controller.set('settings', { app_name: 'LingoLinq', support_url: 'https://example.com/help' });
    var handler = controller.ctrlActionEventValueBound('updateField', 'app_name', 'value');
    handler({ target: { value: 'LingoLinq Beta' } });

    assert.strictEqual(controller.get('settings.app_name'), 'LingoLinq Beta', 'the bound field takes the input value');
    assert.strictEqual(controller.get('settings.support_url'), 'https://example.com/help', 'other fields are untouched');
  });
});
