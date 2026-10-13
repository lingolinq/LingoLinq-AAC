import { module, test } from 'qunit';
import { basic_landing_for, hand_off_index_nav, take_pending_index_nav, take_pending_open_extras } from 'frontend/utils/basic_landing';

/* Requested 2026-09-30: "extras page -> switching to basic there needs to route to the home page
 * with the extras drawer expanded and scrolled down on the page to the Extras items". Basic's
 * equivalent of the Extras page is the Actions tab's Extras drawer
 * (components/dashboard/classic-view.hbs), so this landing names a tab AND the drawer. The handoff
 * carries both, and like the tab the drawer is taken once.
 */
module('Unit | Utility | basic_landing Extras', function() {
  function appState() {
    return { pending_index_nav: null, pending_open_extras: null, set(k, v) { this[k] = v; }, get(k) { return this[k]; } };
  }

  test('the Extras page lands on the Basic home page, Actions tab, Extras drawer open', function(assert) {
    var landing = basic_landing_for('user.extras');
    assert.strictEqual(landing.route, 'index', 'the Basic home page');
    assert.strictEqual(landing.index_nav, 'main', 'the Actions tab, where the Extras drawer lives');
    assert.true(landing.open_extras, 'with the drawer open');
  });

  test('an Extras handoff is taken once, with its tab', function(assert) {
    var state = appState();
    hand_off_index_nav(state, 'main', { open_extras: true });
    assert.strictEqual(take_pending_index_nav(state), 'main', 'the tab');
    assert.true(take_pending_open_extras(state), 'the drawer');
    assert.false(take_pending_open_extras(state), 'the second read finds nothing');
  });

  test('a handoff without the drawer leaves it closed', function(assert) {
    var state = appState();
    hand_off_index_nav(state, 'boards');
    assert.false(take_pending_open_extras(state), 'no drawer asked for');
  });
});
