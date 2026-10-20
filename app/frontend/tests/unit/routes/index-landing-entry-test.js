import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { mark_user_reload, clear_user_reload, RELOAD_INTENT_KEY } from 'frontend/utils/reload_intent';

/* `index` treats an arrival with no `transition.from` as a login / app-boot entry, which resumes
 * the last remembered page and, for a communicator, starts speak mode (routes/index.js). A Basic
 * landing (utils/basic_landing.js) that happens during the first page load also has no `from`, so
 * without this it was resumed away: a cold /caseload in Basic handed off Communicators, then the
 * resume sent the user to their last page and that page's landing overwrote the tab. An arrival
 * carrying a pending tab handoff is an explicit destination, not a boot entry.
 */
module('Unit | Route | index login entry and Basic landings', function(hooks) {
  setupTest(hooks);

  function route(context, pending) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ pending_index_nav: pending || null }));
    return { route: context.owner.lookup('route:index'), appState: context.owner.lookup('service:app-state') };
  }

  test('a cold boot with no landing is a login entry', function(assert) {
    var t = route(this, null);
    t.route.beforeModel({ from: null });
    assert.true(t.appState.get('_index_login_entry'));
  });

  test('a cold boot carrying a Basic landing is not a login entry', function(assert) {
    var t = route(this, 'supervisees');
    t.route.beforeModel({ from: null });
    assert.false(t.appState.get('_index_login_entry'));
  });

  test('arriving from the login route is still a login entry', function(assert) {
    var t = route(this, null);
    t.route.beforeModel({ from: { name: 'login' } });
    assert.true(t.appState.get('_index_login_entry'));
  });

  test('an in-app arrival is not a login entry', function(assert) {
    var t = route(this, null);
    t.route.beforeModel({ from: { name: 'caseload' } });
    assert.false(t.appState.get('_index_login_entry'));
  });

  /* A USER-INITIATED RELOAD IS NOT A LAUNCH (2026-10-09). The rail's "Reload" link calls
   * `location.reload()` (components/dashboard/authenticated-view.js:1563), which reloads the
   * current URL and transitions nowhere -- but the boot that follows has no `transition.from`, so
   * it was classified as a login entry and the inherited `setupController`'s `jump_to_speak`
   * (routes/index.js:189 -> :247 -> :249) opened speak mode instead, re-landing the user on a
   * different page than the one they asked to reload. `auto_open_speak_mode` defaults to true for
   * every authenticated user (app/models/user.rb:2009), so this was the common case, not an edge.
   */
  module('a user-initiated reload', function(inner) {
    inner.afterEach(function() {
      /* sessionStorage is NOT reset between tests -- `tests/test-helper.js` and `setupTest` touch
         none of it, which is why tests/components/guided-tour-test.js:55,84 hand-clears its own
         key. A marker left behind here would make the two "is a login entry" tests above go red,
         and QUnit's `reorder` runs previously-failed tests first, so declaration order is no
         protection. */
      clear_user_reload();
    });

    test('is not a login entry', function(assert) {
      mark_user_reload();
      var t = route(this, null);
      t.route.beforeModel({ from: null });
      assert.false(t.appState.get('_index_login_entry'));
    });

    /* THE DOUBLE beforeModel. A reload at `/` runs the inherited `beforeModel` twice in one boot:
       index.beforeModel -> index.afterModel -> _land_on_default (routes/index.js:83) ->
       replaceWith('user.home') -> the same beforeModel again. A marker consumed and removed on
       the first pass would leave the second recomputing a login entry and undoing the fix. */
    test('stays suppressed across the index -> user.home boot chain', function(assert) {
      mark_user_reload();
      var t = route(this, null);
      t.route.beforeModel({ from: null });
      t.route.beforeModel({ from: null });
      assert.false(t.appState.get('_index_login_entry'));
    });

    /* SELF-INVALIDATING. A marker whose URL does not match this page is stale -- a cancelled
       reload, or a reload of a page that never enters `index` -- and must not suppress a landing
       that belongs to some other page. */
    test('a marker recorded for a different page does not suppress', function(assert) {
      /* sessionStorage used directly, as tests/components/guided-tour-test.js:55,84 does: the
         headless test browser has it, and a conditional assertion is a lint error here. */
      window.sessionStorage.setItem(RELOAD_INTENT_KEY, 'https://example.invalid/somewhere-else');
      var t = route(this, null);
      t.route.beforeModel({ from: null });
      assert.true(t.appState.get('_index_login_entry'));
    });

  });
});
