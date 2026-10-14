import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* ARRIVING FROM THE EXTRAS PAGE (a switch to Basic, utils/basic_landing.js).
 *
 * REWRITTEN 2026-10-09. This used to assert that the arrival OPENED the Extras drawer and scrolled
 * to it. The drawer no longer collapses — its tiles are always on the page and the slot that
 * toggled it is now a plain Account link — so there is nothing to open and nothing to scroll to;
 * landing on the Actions tab is the whole handoff. The companion
 * classic-view-extras-scroll-test.js was retired with the override it pinned.
 *
 * What is still worth pinning, and is what these tests now cover: the pending flag is CONSUMED on
 * arrival. If it survived it would re-fire on the next navigation, and app-state clears it on
 * account switch for the same reason (services/app-state.js:2194) — a handoff leaking into another
 * user's session is the failure this guards.
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

  /* Two animation frames, never `settled()`: the handoff runs in didInsertElement (observers in the
     next run-loop flush) and the scroll in one requestAnimationFrame. `settled()` waits for every
     run-loop timer in the app, and one earlier test can leave a 15-minute stashes flush timer
     (learnings-archive/2026-09.md, #1073), so every test here hit the 15s timeout in CI. */
  function frame() { return new Promise(function(r) { window.requestAnimationFrame(function() { window.requestAnimationFrame(r); }); }); }

  test('a handed-off arrival consumes the flag and moves the page nowhere', async function(assert) {
    var t = setup(this, true);
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component._pending_open_extras, 'the handoff was consumed, so it cannot re-fire');
    assert.strictEqual(t.scrolls.length, 0, 'and nothing scrolled — there is no drawer to reveal');
  });

  test('an ordinary arrival leaves the page where it is', async function(assert) {
    var t = setup(this, false);
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component._pending_open_extras, 'no handoff pending');
    assert.strictEqual(t.scrolls.length, 0, 'no scroll');
  });
});
