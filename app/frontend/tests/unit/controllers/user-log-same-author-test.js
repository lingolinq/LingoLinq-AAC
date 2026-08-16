import { setupTest } from 'frontend/tests/helpers';
import { run } from '@ember/runloop';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/*
 * controllers/user/log#same_author gates the "Resume Evaluation" button
 * (templates/user/log.hbs:620) — only the clinician who recorded an eval may
 * resume it.
 *
 * Its dependency key used to be 'app_state.sessionUser.id'. The controller has no
 * `app_state` PROPERTY: it reads the singleton imported at module scope, which
 * Ember cannot observe. So Ember resolved that key against the controller, found
 * nothing, and the computed never invalidated — once cached, it kept answering for
 * whoever happened to be signed in when it was first read. After switching
 * communicators without a full reload, Resume could stay visible to someone who did
 * not author the eval, or stay hidden from the person who did.
 *
 * The service is now injected so the watched path and the read path are the same
 * object (services/app-state.js:70 assigns `LingoLinq.appState = this`, and
 * utils/app_state.js is a Proxy onto it, so this is the same instance the rest of
 * the controller already used — not a second one).
 *
 * The third test is the one that matters: it fails on the old dependency key.
 */
QUnit.module('Unit | user/log same_author', function(hooks) {
  setupTest(hooks);

  /*
   * app-state is a SHARED service and these tests set sessionUser on it to a stub.
   * Without this, the stub outlives the module and leaks into every later test that
   * reads the signed-in user — the persistence suite is user-scoped, so a bogus
   * sessionUser there can hang the browser rather than fail an assertion, which
   * kills the whole run (testem: "Browser timeout exceeded: 120s") instead of
   * reporting a failure. Restore whatever was there before, not just null.
   */
  hooks.beforeEach(function() {
    const app = this.owner.lookup('service:app-state');
    this._priorSessionUser = app ? app.get('sessionUser') : null;
  });

  hooks.afterEach(function() {
    const app = this.owner.lookup('service:app-state');
    if (app) { app.set('sessionUser', this._priorSessionUser || null); }
  });

  function setup(owner, authorId, sessionId) {
    const controller = owner.lookup('controller:user/log');
    const app = owner.lookup('service:app-state');
    app.set('sessionUser', sessionId ? EmberObject.create({ id: sessionId }) : null);
    controller.set('model', EmberObject.create({ author: EmberObject.create({ id: authorId }) }));
    return { controller, app };
  }

  QUnit.test('true when the signed-in user authored the eval', function(assert) {
    const { controller } = setup(this.owner, '1_24', '1_24');
    assert.true(!!controller.get('same_author'),
      'the author must be offered Resume Evaluation');
  });

  QUnit.test('false when someone else authored the eval', function(assert) {
    const { controller } = setup(this.owner, '1_24', '1_33');
    assert.false(!!controller.get('same_author'),
      'a non-author must not be offered Resume Evaluation');
  });

  /*
   * THE REGRESSION TEST. Read once (caching the value), then change the session
   * user and read again. With the old 'app_state.sessionUser.id' key Ember had
   * nothing to invalidate on and the stale `true` survived.
   */
  QUnit.test('recomputes when the session user changes', function(assert) {
    const { controller, app } = setup(this.owner, '1_24', '1_24');

    assert.true(!!controller.get('same_author'), 'starts true for the author');

    run(() => app.set('sessionUser', EmberObject.create({ id: '1_33' })));

    assert.false(!!controller.get('same_author'),
      'switching to a non-author must invalidate the computed — a stale true here is the bug this key fixes');

    run(() => app.set('sessionUser', EmberObject.create({ id: '1_24' })));

    assert.true(!!controller.get('same_author'), 'and back again');
  });
});
