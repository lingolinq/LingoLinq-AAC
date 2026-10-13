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
 * `effective_view_user` is the single rule those readers now go through.
 *
 * THE RULE IS NOW ABSOLUTE (changed 2026-09-23, on request). The view follows the SESSION
 * ACCOUNT everywhere, with exactly ONE exception: while actively modelling in speak mode, the
 * communicator decides, because it is their session on their device. Browsing or administering
 * somebody else's pages no longer adopts their view.
 *
 * What that replaced: a `page_user` branch that made a supervisor's whole UI flip to the page
 * owner's view on `user.home`, `user.boards` and the board routes. Clicking between org members
 * changed the shell repeatedly with nobody having asked for it, which is the report this change
 * came from. The per-device mirror is likewise no longer consulted for anyone but the session
 * account -- it holds the SESSION user's style, so using it while another user's record was
 * still hydrating answered a question about one person with another person's data.
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

  /* THE REPORTED BUG. This previously resolved to the page owner and wore their style, so an
     SLP in Modern who opened a communicator's board, boards list or home was silently moved
     into Basic -- and back again on the next page. Now the page owner has no say. */
  test('a page belonging to someone else keeps the session account\'s view', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('currentUser', slp);
    this.svc.set('page_user', kiddo);
    this.svc.set('current_route', 'user.board-detail.edit');

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'slp-1', 'still the session account');
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'so the view does not flip');
  });

  test('every communication page keeps the session account\'s view', function(assert) {
    // The five routes that used to adopt the page owner. Named explicitly rather than read
    // from a property, so deleting that property cannot quietly empty this test out.
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('currentUser', slp);
    this.svc.set('page_user', kiddo);
    var routes = ['user.board-alt.index', 'user.board-detail.index', 'user.board-detail.edit',
                  'user.home', 'user.boards'];
    var _this = this;
    /* Collected and compared once rather than asserted inside the loop: a single deepEqual
       names every route that flipped, instead of stopping at the first. */
    var resolved = routes.map(function(route) {
      _this.svc.set('current_route', route);
      return route + '=' + _this.svc.get('effective_view_style');
    });
    assert.deepEqual(resolved, routes.map(function(r) { return r + '=modern'; }),
      'no communication route adopts the page owner\'s view');
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

  /* THE EXPLICIT HALF OF THE REQUEST: "when it goes back to one of the SLP's pages, it needs
     to load the SLP's view preference". Leaving speak mode has to actually take the view back,
     not leave it stuck on whoever was last modelled for. */
  test('leaving modelling returns the SLP to their own view', function(assert) {
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', 'classic');
    this.svc.set('referenced_speak_mode_user', kiddo);
    enter_speak_mode(this);
    this.svc.set('currentUser', slp);
    assert.strictEqual(this.svc.get('effective_view_style'), 'classic', 'precondition: in the communicator\'s view');

    // Leave speak mode the way production does, then land on a page that still BELONGS to the
    // communicator -- the hardest case for "returns to the SLP's view", since the page owner
    // is the person we were just modelling for.
    this.stashes.set('current_mode', 'default');
    this.svc.set('currentBoardState', null);
    this.svc.set('referenced_speak_mode_user', null);
    /* currentUser is re-set for the same reason the fixtures above set it last: changing the
       mode wakes app-state's session lookup, which fails in a test and nulls `currentUser` on
       the way through (app-state.js:423). Verified here rather than assumed -- an assertion on
       it came back null before this line was added. Production has a real session user, so
       this restores the state the assertions are actually about. */
    this.svc.set('currentUser', slp);
    this.svc.set('page_user', kiddo);
    this.svc.set('current_route', 'user.home');

    assert.false(!!this.svc.get('modeling_for_user'), 'modelling is over');
    assert.strictEqual(this.svc.get('effective_view_user.id'), 'slp-1',
      'resolves back to the SLP even though the page belongs to the communicator');
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'and reloads the SLP\'s own preference');
  });

  /* THE SECOND FLIP MECHANISM. The per-device mirror holds the SESSION account's style, so
     consulting it while a DIFFERENT user's record is still hydrating answers a question about
     one person with another person's data -- and the stale value it returns is exactly the
     "keeps switching me back" symptom, because nothing corrects it until that record lands. */
  test('the per-device mirror is never consulted for anyone but the session account', function(assert) {
    try { window.localStorage.setItem('ll_board_view_style', 'classic'); } catch(e) { /* unavailable */ }
    var slp = user('slp-1', 'modern');
    var kiddo = user('kiddo-1', null);          // preference not hydrated yet
    this.svc.set('referenced_speak_mode_user', kiddo);
    enter_speak_mode(this);
    this.svc.set('currentUser', slp);

    assert.strictEqual(this.svc.get('effective_view_user.id'), 'kiddo-1', 'precondition: resolved to the communicator');
    assert.strictEqual(this.svc.get('effective_view_style'), 'modern',
      'falls back to the modern DEFAULT, not to the session account\'s stored Basic');
    try { window.localStorage.removeItem('ll_board_view_style'); } catch(e) { /* unavailable */ }
  });

  test('the mirror still covers the session account\'s own cold load', function(assert) {
    // Its real job, kept: a Basic user must not flash Modern before their record hydrates.
    try { window.localStorage.setItem('ll_board_view_style', 'classic'); } catch(e) { /* unavailable */ }
    this.svc.set('currentUser', user('slp-1', null));
    assert.strictEqual(this.svc.get('effective_view_style'), 'classic',
      'the session account\'s own unhydrated load still uses its mirror');
    try { window.localStorage.removeItem('ll_board_view_style'); } catch(e) { /* unavailable */ }
  });
});
