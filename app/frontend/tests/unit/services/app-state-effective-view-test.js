import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';

/* WHOSE Basic/Modern view the app wears.
 *
 * Every reader of `board_view_style` used to ask `currentUser`, and that is the wrong record
 * the moment a supervisor models for a communicator: `set_speak_mode_user(..., keep_as_self
 * = true)` nulls `speakModeUser`, so `currentUser` STAYS THE SUPERVISOR while
 * `referenced_user` is the communicator. An SLP modelling for a Basic-view communicator was
 * driving that communicator's session through the SLP's Modern shell.
 *
 * `effective_view_user` is the single rule those readers now go through, and these tests pin
 * its three branches and the order between them. The order is the interesting part: the
 * modelling branch has to beat the page branch, or a supervisor modelling ON their own
 * account page would snap back to their own view mid-session.
 */
module('Unit | Service | app-state effective view', function(hooks) {
  setupTest(hooks);

  function user(id, style) {
    var prefs = {};
    if(style) { prefs.board_view_style = style; }
    /* `reload` is a fixture necessity, not decoration: setting `referenced_speak_mode_user`
       wakes app-state's own `check_inbox` observer, which calls `ref_user.reload()` on the
       referenced record. A plain EmberObject has no such method and the whole test dies
       before reaching an assertion. Resolving to itself keeps that observer harmless. */
    return EmberObject.create({
      id: id,
      preferences: prefs,
      reload: function() { return RSVP.resolve(this); }
    });
  }

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    /* Forcing `speak_mode` on the REAL service wakes observers that try to raise a flash
       message, and outside a rendered app that throws "must call setup before trying to show
       a flash message" -- killing the test before any assertion. Silenced here rather than by
       swapping in a stubbed app-state, because the whole point of these tests is to exercise
       the service's OWN computeds. Restored in afterEach so no other module inherits them. */
    this._modal = { flash: modal.flash, warning: modal.warning, notice: modal.notice,
                    error: modal.error, success: modal.success };
    modal.flash = function() { };
    modal.warning = function() { };
    modal.notice = function() { return RSVP.resolve(); };
    modal.error = function() { };
    modal.success = function() { };
    this.stashes = this.owner.lookup('service:stashes');
    this._mode = this.stashes.get('current_mode');
    /* Cleared so the per-device mirror cannot leak into these assertions. `effective_view_style`
       consults it ONLY when the resolved user has no preference, which is exactly the last
       test below -- without this, a mirror left by another test would decide that one. */
    try { window.localStorage.removeItem('ll_board_view_style'); } catch(e) { /* unavailable */ }
  });

  hooks.afterEach(function() {
    this.svc.set('current_route', null);
    modal.flash = this._modal.flash;
    modal.warning = this._modal.warning;
    modal.notice = this._modal.notice;
    modal.error = this._modal.error;
    modal.success = this._modal.success;
    this.svc.set('page_user', null);
    this.svc.set('referenced_speak_mode_user', null);
    this.svc.set('currentBoardState', null);
    this.stashes.set('current_mode', this._mode);
  });

  /* Turn speak mode on the way PRODUCTION does, rather than forcing the computed. `speak_mode`
     has a setter only so tests can force it, but the cached forced value is discarded the
     moment either dependent key (`stashes.current_mode`, `currentBoardState`) changes -- and
     setting `currentUser` / `referenced_speak_mode_user` wakes observers that do exactly that,
     so the forced `true` was being re-derived back to false before the assertions ran. Setting
     the two real inputs makes the getter return true on its own merits, and it stays true. */
  function enter_speak_mode(ctx) {
    ctx.stashes.set('current_mode', 'speak');
    ctx.svc.set('currentBoardState', { id: '1_1', key: 'kiddo/home' });
  }

  test('uses the session account on its own pages', function(assert) {
    var me = user('slp-1', 'modern');
    this.svc.set('currentUser', me);
    this.svc.set('page_user', null);

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'slp-1', 'resolves to the session account');
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'and wears its style');
  });

  /* THE BUG THIS EXISTS FOR. */
  test('while modelling, the COMMUNICATOR decides the view, not the supervisor', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('referenced_speak_mode_user', kiddo);
    enter_speak_mode(this);
    /* currentUser LAST. Booting the real service kicks a session-user lookup that fails in a
       test and nulls `currentUser` on the way through (app-state.js:423), and entering speak
       mode is what wakes it -- so a currentUser set BEFORE that gets wiped and
       `modeling_for_user` reads false. Setting it afterwards is the state under test. */
    this.svc.set('currentUser', slp);

    assert.true(this.svc.get('modeling_for_user'), 'precondition: modelling is on');
    assert.strictEqual(this.svc.get('effective_view_user.id'), 'kiddo-1', 'resolves to the communicator');
    assert.strictEqual(this.svc.get('effective_view_style'), 'classic',
      'so the session runs in the communicator\'s Basic view, not the supervisor\'s Modern');
  });

  test('a page belonging to someone else follows that person', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('currentUser', slp);
    this.svc.set('page_user', kiddo);
    this.svc.set('current_route', 'user.board-detail.edit');

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'kiddo-1', 'resolves to the page owner');
    assert.strictEqual(this.svc.get('effective_view_style'), 'classic', 'and wears their style');
  });

  /* The "returning to the SLP's own pages" half of the requirement. Without this case a
     resolver that simply always preferred `page_user` would pass every test above. */
  test('back on the supervisor\'s own pages it returns to their view', function(assert) {
    var slp = user('slp-1', 'modern');
    this.svc.set('currentUser', slp);
    this.svc.set('page_user', user('slp-1', 'modern'));

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'slp-1', 'the page owner IS the session account');
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'so their own view applies again');
  });

  test('modelling outranks the page owner', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('referenced_speak_mode_user', kiddo);
    enter_speak_mode(this);                  // modelling for the communicator ...
    this.svc.set('currentUser', slp);        // (set last -- see the note above)
    this.svc.set('page_user', slp);          // ... while ON the supervisor's own page

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'kiddo-1',
      'the modelling branch wins, so the view does not snap back mid-session');
  });

  test('an absent or unrecognised preference resolves to modern', function(assert) {
    this.svc.set('currentUser', user('slp-1', null));
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'absent -> modern');

    this.svc.set('currentUser', user('slp-2', 'sideways'));
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'unrecognised -> modern, never echoed back');
  });
  /* THE BOUNDARY (option C, 2026-09-17). Reading a communicator's report is administration,
     not communication: the supervisor is acting as themselves, and flipping their whole shell
     for it would be disorienting. Without this case, a resolver that adopted the page owner on
     EVERY `/:user_id/` page would pass every other test in this file. */
  test('an administrative page keeps the supervisor\'s own view', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('currentUser', slp);
    this.svc.set('page_user', kiddo);
    this.svc.set('current_route', 'user.stats');       // Reports

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'slp-1',
      'the page owner is ignored here');
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern',
      'so the supervisor keeps their own shell');
  });

  test('modelling still wins even on an administrative page', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('referenced_speak_mode_user', kiddo);
    enter_speak_mode(this);
    this.svc.set('currentUser', slp);
    this.svc.set('current_route', 'user.stats');

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'kiddo-1',
      'branch 1 is not gated on the route list');
  });

  /* The route list is strings, and strings rot silently. A renamed route would not error --
     it would just stop matching, and the communicator's view would quietly stop applying on
     their own boards. */
  test('every communication route names a real route', function(assert) {
    var entries = (window.requirejs && window.requirejs.entries) || {};
    var routes = this.svc.get('communication_routes') || [];
    assert.true(routes.length > 0, 'the list is not empty');
    var missing = routes.filter(function(name) {
      return !entries['frontend/routes/' + name.replace(/\./g, '/')];
    });
    assert.deepEqual(missing, [],
      'each entry resolves to a route module (missing: ' + missing.join(', ') + ')');
  });
});
