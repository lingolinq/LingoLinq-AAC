import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click, fillIn, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import i18n from 'frontend/utils/i18n';

/*
 * The profile page's two-factor section (components/two-factor-settings.hbs).
 * - It shows when the account has 2FA, or on the person's own account when they are a supporter.
 * - Enable shows only on a supporter's own account; Reset only on the person's own account.
 *   `@ownAccount` is false while acting as another user (controllers/user/edit.js own_account_2fa).
 * - Disable stays available to anyone who can edit the account, unless 2FA is required for it.
 * - A success message stays visible after the account stops qualifying for the section.
 */
module('Integration | Component | two-factor-settings', function(hooks) {
  setupRenderingTest(hooks);

  const SECTION = '[data-test-2fa-section]';
  const action = (name) => `[data-test-2fa-action="${name}"]`;

  function user(opts) {
    return EmberObject.create({
      permissions: { edit: true },
      supporter_role: opts.supporter,
      state_2fa: opts.state_2fa
    });
  }

  async function draw(context, opts) {
    context.sent = [];
    context.typed = [];
    context.set('user', user(opts));
    context.set('ownAccount', opts.own);
    context.set('status', opts.status || null);
    context.set('code', '');
    context.set('ctrlAction', function(name, verb) { return function() { context.sent.push([name, verb]); }; });
    context.set('onCodeInput', function(event) { context.typed.push(event.target.value); });
    await render(hbs`<TwoFactorSettings @user={{this.user}} @ownAccount={{this.ownAccount}} @status={{this.status}} @code={{this.code}} @ctrlAction={{this.ctrlAction}} @onCodeInput={{this.onCodeInput}} />`);
  }

  test('a supporter without 2FA can turn it on for their own account', async function(assert) {
    await draw(this, { own: true, supporter: true, state_2fa: { required: false } });
    assert.dom(SECTION).exists();
    assert.dom(action('enable')).exists();
    assert.dom(action('reset')).doesNotExist();
    assert.dom(action('disable')).doesNotExist();
  });

  test('a communicator without 2FA does not see the section on their own account', async function(assert) {
    await draw(this, { own: true, supporter: false, state_2fa: { required: false } });
    assert.dom(SECTION).doesNotExist();
    assert.dom(action('enable')).doesNotExist();
  });

  test('someone viewing another account without 2FA does not see the section', async function(assert) {
    await draw(this, { own: false, supporter: true, state_2fa: { required: false } });
    assert.dom(SECTION).doesNotExist();
    assert.dom(action('enable')).doesNotExist();
  });

  test('the account holder with 2FA can disable or reset it', async function(assert) {
    await draw(this, { own: true, supporter: true, state_2fa: { required: true, verified: true } });
    assert.dom(SECTION).includesText(i18n.t('currently_enabled', "Currently Enabled"));
    assert.dom(action('disable')).exists();
    assert.dom(action('reset')).exists();
    assert.dom(action('enable')).doesNotExist();
  });

  test('someone viewing another account with 2FA can disable it but not reset it', async function(assert) {
    await draw(this, { own: false, supporter: false, state_2fa: { required: true, verified: true } });
    assert.dom(SECTION).exists();
    assert.dom(action('disable')).exists();
    assert.dom(action('reset')).doesNotExist();
    assert.dom(action('enable')).doesNotExist();
  });

  test('an account that must use 2FA can reset it but not disable it', async function(assert) {
    await draw(this, { own: true, supporter: true, state_2fa: { required: true, mandatory: true, verified: true } });
    assert.dom(SECTION).includesText(i18n.t('required_for_this_account', "Required for This Account"));
    assert.dom(action('reset')).exists();
    assert.dom(action('disable')).doesNotExist();
  });

  test('each button sends its own action', async function(assert) {
    await draw(this, { own: true, supporter: true, state_2fa: { required: false } });
    await click(action('enable'));
    this.set('user.state_2fa', { required: true, verified: true });
    await settled();
    await click(action('disable'));
    await click(action('reset'));
    assert.deepEqual(this.sent, [['update_2fa', 'enable'], ['update_2fa', 'disable'], ['update_2fa', 'reset']]);
  });

  test('while setting up, the code entered is passed on and Confirm sends it', async function(assert) {
    await draw(this, { own: true, supporter: true, state_2fa: { required: false }, status: { uri: 'otpauth://totp/test' } });
    assert.dom(action('enable')).doesNotExist();
    await fillIn('[data-test-2fa-section] input[autocomplete="one-time-code"]', '123456');
    await click(action('confirm'));
    assert.deepEqual(this.typed, ['123456']);
    assert.deepEqual(this.sent, [['update_2fa', 'confirm']]);
  });

  test('the success message stays after the account no longer shows the section', async function(assert) {
    await draw(this, { own: false, supporter: false, state_2fa: { required: false }, status: { success: true } });
    assert.dom(SECTION).doesNotExist();
    assert.dom('[data-test-2fa-success]').exists();
  });
});
