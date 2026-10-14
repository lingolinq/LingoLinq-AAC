import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* DISPLAY STYLE MOVES INTO THE VIEW MENU (requested 2026-10-13: "move the display design link inside the
 * view dropdown under a DISPLAY header"). The item is offered where the Display Style button was: wherever
 * the mounted display-style component has registered `appState.dashboard_design_opener` (Modern, on the
 * home and caseload pages; app-navbar-authenticated-inner.hbs). Choosing it closes the menu and opens the
 * same page the button did (opener('display_style_layout'), as the phone drawer does). */
module('Unit | Component | view-switcher display style', function(hooks) {
  setupTest(hooks);

  function withAppState(context, props) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(props));
    return context.owner.factoryFor('component:view-switcher').create();
  }

  test('offered where Display Style is available, and opens it', function(assert) {
    var opened = [];
    var c = withAppState(this, { currentUser: { id: 'u1' }, dashboard_design_opener: function(page) { opened.push(page); } });
    assert.true(c.get('canDisplayStyle'), 'offered');
    c.set('menu_open', true);
    c.send('open_display_style');
    assert.false(c.get('menu_open'), 'the menu closes');
    assert.deepEqual(opened, ['display_style_layout'], 'the Display Style page opens');
  });

  test('not offered where Display Style is not (Basic, or another page)', function(assert) {
    var c = withAppState(this, { currentUser: { id: 'u1' }, dashboard_design_opener: null });
    assert.false(c.get('canDisplayStyle'));
  });
});
