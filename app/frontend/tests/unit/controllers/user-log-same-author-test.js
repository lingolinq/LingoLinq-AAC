import { setupTest } from 'frontend/tests/helpers';
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
 * Compare `sessionUser.global_id`, not `.id`. The network load path pins
 * sessionUser.id to the literal 'self' (serializers/application.js); the author's
 * id is a real global id. Matching those hides Resume from the eval's own author.
 * eval-workbook.js#isAuthor already uses this gate.
 *
 * The third test is the one that matters for the old dependency key. The 'self'
 * tests are the ones that matter for the id-vs-global_id comparison.
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

  function setup(owner, authorId, sessionId, globalId) {
    const controller = owner.lookup('controller:user/log');
    const app = owner.lookup('service:app-state');
    var sessionAttrs = sessionId ? { id: sessionId } : null;
    if (sessionAttrs && globalId !== undefined) {
      sessionAttrs.global_id = globalId;
    }
    app.set('sessionUser', sessionAttrs ? EmberObject.create(sessionAttrs) : null);
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

    app.set('sessionUser', EmberObject.create({ id: '1_33' }));

    assert.false(!!controller.get('same_author'),
      'switching to a non-author must invalidate the computed — a stale true here is the bug this key fixes');

    app.set('sessionUser', EmberObject.create({ id: '1_24' }));

    assert.true(!!controller.get('same_author'), 'and back again');
  });

  /*
   * Production path: serializers/application.js pins sessionUser.id to 'self'.
   * The existing tests above stub a real id, which is the local-storage load
   * path — they would pass on the broken `.id` comparison. These would not.
   */
  QUnit.test("true when sessionUser.id is 'self' and global_id matches the author", function(assert) {
    const { controller } = setup(this.owner, '1_24', 'self', '1_24');
    assert.true(!!controller.get('same_author'),
      'the author must be offered Resume Evaluation while the session record is keyed self');
  });

  QUnit.test("false when sessionUser.id is 'self' and global_id belongs to someone else", function(assert) {
    const { controller } = setup(this.owner, '1_24', 'self', '1_33');
    assert.false(!!controller.get('same_author'),
      'a non-author keyed as self must not be offered Resume Evaluation');
  });

  QUnit.test("false when sessionUser.id is 'self' and global_id is missing", function(assert) {
    const { controller } = setup(this.owner, '1_24', 'self', undefined);
    assert.false(!!controller.get('same_author'),
      'the self sentinel is not an identity — fail closed until global_id is known');
  });

  QUnit.test("recomputes when switching between two 'self'-keyed session users", function(assert) {
    const { controller, app } = setup(this.owner, '1_24', 'self', '1_24');

    assert.true(!!controller.get('same_author'), 'starts true for the author');

    app.set('sessionUser', EmberObject.create({ id: 'self', global_id: '1_33' }));

    assert.false(!!controller.get('same_author'),
      'switching to a different self-keyed user must invalidate — watching only .id would keep the stale true because both ids are the string self');

    app.set('sessionUser', EmberObject.create({ id: 'self', global_id: '1_24' }));

    assert.true(!!controller.get('same_author'), 'and back again');
  });
});
