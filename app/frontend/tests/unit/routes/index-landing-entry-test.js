import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

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
});
