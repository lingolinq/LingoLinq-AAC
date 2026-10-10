import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest, setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import systemSettingsTemplate from 'frontend/templates/system-settings';

/* SYSTEM SETTINGS GETS THE BASIC RAIL (2026-10-10).
 *
 * Every other page an admin reaches from the Basic rail (Organizations, the board picker, the
 * account section) keeps the rail beside it; System Settings had none on ANY of its four pages
 * (emails, email-edit, app-defaults, features), so following the rail's own "System Settings" row
 * dropped the navigation. The rail is mounted ONCE in the parent template, so every subpage
 * inherits it, and only in Basic: Modern renders the page exactly as before.
 */
module('Unit | Controller | system-settings isBasicView', function(hooks) {
  setupTest(hooks);

  function ctrl(context, view_user) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ effective_view_user: view_user }));
    return context.owner.lookup('controller:system-settings');
  }

  test('Basic view', function(assert) {
    assert.true(ctrl(this, { preferences: { board_view_style: 'classic' } }).get('isBasicView'));
  });

  test('Modern view, and no user yet', function(assert) {
    assert.false(ctrl(this, { preferences: { board_view_style: 'modern' } }).get('isBasicView'));
    assert.false(ctrl(this, null).get('isBasicView'));
  });
});

module('Integration | Template | system-settings Basic rail', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.owner.setupRouter();
    this.set('ctrlActionEventValue', function() { return function() {}; });
  });

  test('Basic: the rail sits beside the settings workspace', async function(assert) {
    this.set('isBasicView', true);
    await render(systemSettingsTemplate);
    var rail = document.querySelector('.la-system-settings .la-main > .ch-rail');
    assert.ok(rail, 'the Basic rail is a direct child of the page main');
    assert.ok(document.querySelector('.la-system-settings .la-main > .md-workspace'), 'the workspace stays beside it');
  });

  test('Modern: no rail, the page is unchanged', async function(assert) {
    this.set('isBasicView', false);
    await render(systemSettingsTemplate);
    assert.notOk(document.querySelector('.la-system-settings .ch-rail'));
  });
});
