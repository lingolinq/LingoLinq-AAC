import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import * as QUnit from 'qunit';

/*
 * A Supervisors row in the Basic account panel (requested 2026-09-30). Basic reached supervision
 * only from the home page's rail row and Actions tile, both hidden for supporters, so a supporter
 * in Basic had no way there at all. The row links to the Supervision page (user.supervision), as
 * Modern's account rail does, and takes Modern's label rule: "Supervision" for a supporter (the
 * people they supervise), "Supervisors" for a communicator (the people who supervise them).
 */
QUnit.module('Integration | Component | dashboard/classic-account-rail supervisors row', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.owner.setupRouter();
    this.owner.unregister('service:stashes');
    this.owner.register('service:stashes', Service.extend({ classic_rail_collapsed: false, persist: function() {} }));
  });

  function user(supporter) {
    return EmberObject.create({ user_name: 'example', supporter_role: supporter, permissions: { edit: true }, avatar_url_with_fallback: '' });
  }

  QUnit.test('a communicator sees "Supervisors", linking to the Supervision page', async function(assert) {
    this.set('user', user(false));
    await render(hbs`<Dashboard::ClassicAccountRail @user={{this.user}} />`);
    assert.dom('a[href="/example/supervision"]').exists({ count: 1 }, 'one row links to /example/supervision');
    assert.dom('a[href="/example/supervision"] .ch-row__title').hasText('Supervisors');
  });

  QUnit.test('a supporter sees "Supervision"', async function(assert) {
    this.set('user', user(true));
    await render(hbs`<Dashboard::ClassicAccountRail @user={{this.user}} />`);
    assert.dom('a[href="/example/supervision"] .ch-row__title').hasText('Supervision');
  });
});
