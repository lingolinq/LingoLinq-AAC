import { module, test } from 'qunit';
import Service from '@ember/service';
import i18n from 'frontend/utils/i18n';
import { setupTest } from '../../helpers';

/* At 900px and narrower the account rail is a dropdown whose trigger SHOWS the current row
 * (account-rail.hbs `md-acct-rail__menu-label`). Read out alone that is "Home Page, button", which
 * sounds like a link home, not the account menu it opens. The accessible name keeps the visible
 * words first (WCAG 2.5.3, label in name) and says what the button opens. */
module('Unit | Component | account-rail menu trigger name', function(hooks) {
  setupTest(hooks);

  function rail(context, routeName) {
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({ get() { return undefined; }, persist() {} }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({}));
    return context.owner.factoryFor('component:account-rail').create();
  }

  test('the trigger names the current row, then the account menu', function(assert) {
    var component = rail(this, 'user.logs');
    var visible = component.get('activeLabel');
    assert.ok(visible, 'the visible label is set');
    assert.strictEqual(component.get('menuTriggerLabel'), visible + ', ' + i18n.t('account_menu', "Account menu"));
  });

  test('on a page with no rail row the name is not doubled', function(assert) {
    var component = rail(this, 'some.route.without.a.row');
    var menu = i18n.t('account_menu', "Account menu");
    assert.strictEqual(component.get('activeLabel'), menu, 'the visible label is the menu name itself');
    assert.strictEqual(component.get('menuTriggerLabel'), menu, 'said once');
  });
});
