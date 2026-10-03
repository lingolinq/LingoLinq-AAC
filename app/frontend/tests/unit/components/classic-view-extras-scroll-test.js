import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';

/* Opening the classic home page's Extras card reveals a drawer of ten tiles BELOW the
 * Actions row (classic-view.hbs:705). When the Actions row sits mid-page, that drawer
 * opens off the bottom of the screen and nothing appears to happen.
 *
 * `toggle_extras` is overridden on the classic component to scroll the Extras card to
 * the top of the viewport after the drawer renders, so the drawer fills the space below
 * it. The parent's action (authenticated-view.js:1669) only flips the flag, and the
 * parent must stay untouched — the modern dashboard shares that class.
 *
 * The two assertions that matter are that it scrolls on OPEN and that it does NOT
 * scroll on CLOSE: a version that scrolls on every toggle would yank the page upward
 * when the user is putting the drawer away, which for this app's audience (scanning and
 * eye-gaze users) is worse than not scrolling at all.
 *
 * The toggle is found with a real element in the test container rather than a stub:
 * `component.element` is getter-only on an Ember 5.12 classic component and cannot be
 * assigned, and the lookup under test is a `document.querySelector` anyway — the same
 * approach controllers/caseload.js:308 uses for the equivalent accordion scroll.
 */
module('Unit | Component | classic-view extras scroll', function(hooks) {
  setupTest(hooks);

  var planted = null;

  hooks.afterEach(function() {
    if (planted && planted.parentNode) { planted.parentNode.removeChild(planted); }
    planted = null;
  });

  function setup(context) {
    var calls = [];
    var button = document.createElement('button');
    button.className = 'ch-tile ch-tile--big ch-tile--extras-toggle';
    // Overwrite the real implementation: headless Chrome would run an actual scroll,
    // which reports nothing useful and depends on the container having a scrollable
    // overflow. What is under test is WHETHER and HOW it is called.
    button.scrollIntoView = function(opts) { calls.push(opts); };
    (document.querySelector('#ember-testing') || document.body).appendChild(button);
    planted = button;

    // Unregister first — a bare register over an existing service is ignored, which
    // would leave every read `undefined` and let these assertions pass hollowly.
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ preferences: {} })
    }));
    var component = context.owner.factoryFor('component:dashboard/classic-view').create();
    return { component: component, calls: calls, button: button };
  }

  // The override defers its scroll to `requestAnimationFrame`, which `settled()` knows
  // nothing about — asserting straight after it would read `calls` before the frame had
  // run and pass or fail on timing. Awaiting a frame of our own is enough: callbacks fire
  // in the order they were registered, so the component's runs first.
  function toggle(t) {
    t.component.ctrlAction('toggle_extras')();
    return settled().then(function() {
      return new Promise(function(resolve) { window.requestAnimationFrame(resolve); });
    });
  }

  test('opening Extras scrolls the toggle to the top of the viewport', async function(assert) {
    var t = setup(this);
    await toggle(t);
    assert.strictEqual(t.calls.length, 1, 'scrollIntoView ran once');
    assert.strictEqual(t.calls[0].block, 'start', 'top-aligned, so the revealed drawer is what fills the screen below it');
  });

  test('closing Extras leaves the page where it is', async function(assert) {
    var t = setup(this);
    await toggle(t);
    await toggle(t);
    assert.strictEqual(t.calls.length, 1, 'still just the one scroll from opening — closing did not move the page');
  });

  test('the flag still toggles, so the override did not replace the parent behaviour', async function(assert) {
    var t = setup(this);
    await toggle(t);
    assert.true(!!t.component.get('show_main_extras'), 'the drawer is open');
    await toggle(t);
    assert.false(!!t.component.get('show_main_extras'), 'and closes again');
  });
});
