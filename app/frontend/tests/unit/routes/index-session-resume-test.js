import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';

/* SESSION RESUME SURVIVES A REDIRECT (2026-10-01, requested: "fix session resume for basic view").
 * On app open, routes/index.js replays the remembered page. Several pages redirect a Basic viewer
 * (utils/basic_landing.js: My Boards, Extras, Caseload, Modern's Updates), and a redirect ABORTS the
 * first transition, so its promise rejects -- which the resume read as "the page is gone": it
 * deleted the remembered page and landed on home. It now waits on `followRedirects()`, which
 * settles with wherever the redirects end, and rejects only on a real failure (a deleted board,
 * an ended supervision), which still clears the record and lands on home.
 */
module('Unit | Route | index session resume', function(hooks) {
  setupTest(hooks);

  var realSession;
  hooks.beforeEach(function() {
    realSession = LingoLinq.session;
    LingoLinq.session = { get: function(k) { return k === 'access_token' ? 'token' : null; } };
    localStorage['ll_last_location_slp_ana'] = JSON.stringify({ url: '/slp_ana/boards', route: 'user.boards', at: (new Date()).getTime() });
  });
  hooks.afterEach(function() {
    LingoLinq.session = realSession;
    delete localStorage['ll_last_location_slp_ana'];
  });

  function setup(context, redirectsSucceed) {
    var calls = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ _index_login_entry: true, feature_flags: { session_resume: true } }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      replaceWith: function(target) {
        calls.push(target);
        // The resume's own transition was aborted by the page's redirect, so it rejects; what the
        // redirect chain did is what followRedirects reports.
        var aborted = Promise.reject(new Error('TransitionAborted'));
        aborted.catch(function() {});
        aborted.followRedirects = function() { return redirectsSucceed ? Promise.resolve() : Promise.reject(new Error('gone')); };
        return aborted;
      },
      transitionTo: function() {}
    }));
    var model = EmberObject.create({ user_name: 'slp_ana', supporter_view: true, preferences: {} });
    return { calls: calls, route: context.owner.lookup('route:index'), model: model };
  }

  test('a resumed page that redirects (Basic) keeps the remembered page and does not land on home', async function(assert) {
    var t = setup(this, true);
    t.route.afterModel(t.model);
    await settled();
    assert.deepEqual(t.calls, ['/slp_ana/boards'], 'resumed, and no fallback to home');
    assert.ok(localStorage['ll_last_location_slp_ana'], 'the remembered page is kept');
  });

  test('a resumed page that is really gone still clears the record and lands on home', async function(assert) {
    var t = setup(this, false);
    t.route.afterModel(t.model);
    await settled();
    assert.deepEqual(t.calls, ['/slp_ana/boards', 'user.home']);
    assert.notOk(localStorage['ll_last_location_slp_ana'], 'cleared');
  });
});
