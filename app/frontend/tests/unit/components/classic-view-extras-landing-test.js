import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';

/* ARRIVING FROM THE EXTRAS PAGE (a switch to Basic, utils/basic_landing.js): the Basic home page
 * opens its Extras drawer and scrolls to it. It does that through `toggle_extras`, the action the
 * Extras card sends, so the arrival gets the click's own open-and-scroll behaviour (pinned by
 * classic-view-extras-scroll-test.js) rather than a second copy of it.
 */
module('Unit | Component | classic-view Extras landing', function(hooks) {
  setupTest(hooks);
  var planted = null;
  hooks.afterEach(function() {
    if (planted && planted.parentNode) { planted.parentNode.removeChild(planted); }
    planted = null;
  });

  function setup(context, pending) {
    var scrolls = [];
    var button = document.createElement('button');
    button.className = 'ch-tile ch-tile--big ch-tile--extras-toggle';
    button.scrollIntoView = function(opts) { scrolls.push(opts); };
    (document.querySelector('#ember-testing') || document.body).appendChild(button);
    planted = button;
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      /* `save`: the handed-off Actions tab runs `set_index_nav('main')`, which remembers the tab
         on the user record (authenticated-view.js#set_index_nav). Fixture fix approved by Traci,
         2026-09-30: without it the test threw `u.save is not a function` before asserting. */
      currentUser: EmberObject.create({ preferences: {}, supporter_role: true, save: function() { return Promise.resolve(); } }),
      pending_index_nav: pending ? 'main' : null,
      pending_open_extras: pending ? true : null
    }));
    var model = EmberObject.create({ id: '1_3', supporter_role: true, load_word_activities: function() {} });
    var component = context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
    return { component: component, scrolls: scrolls };
  }

  function frame() { return settled().then(function() { return new Promise(function(r) { window.requestAnimationFrame(r); }); }); }

  test('arriving with the Extras drawer handed off opens it and scrolls to it', async function(assert) {
    var t = setup(this, true);
    t.component.didInsertElement();
    await frame();
    assert.true(t.component.get('show_main_extras'), 'the drawer is open');
    assert.strictEqual(t.scrolls.length, 1, 'and the Extras card was scrolled into view');
  });

  test('an ordinary arrival leaves the drawer closed and the page where it is', async function(assert) {
    var t = setup(this, false);
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component.get('show_main_extras'), 'the drawer stays closed');
    assert.strictEqual(t.scrolls.length, 0, 'no scroll');
  });
});
