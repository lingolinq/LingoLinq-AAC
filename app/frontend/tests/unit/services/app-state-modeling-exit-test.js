import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';

/* Leaving speak mode ENDS the modelling session. These tests pin that, because it is the
 * behaviour a supervisor's next session depends on and nothing else asserts it.
 *
 * `app-state#speak_mode_handlers` (the observer at ~:3123) tears the session down on the way
 * out of speak mode: `referenced_speak_mode_user`, `speak_mode_user_id`,
 * `referenced_speak_mode_user_id`, `manual_modeling` and `modeling_for_self` are all released.
 * So entering speak mode again without choosing anybody is an ordinary session on the
 * supervisor's own boards -- it cannot silently resume modelling for whoever was last
 * modelled for.
 *
 * ONE DELIBERATE EXCEPTION, and it is why this file exists as regression cover rather than as
 * a fix: entering EDIT mode flips `speak_mode` false in passing, and the teardown is skipped
 * when the transition target is 'edit' so a supervisor editing a board mid-session comes back
 * to an intact session. That carve-out is easy to widen by accident, and widening it would
 * reintroduce exactly the silent-resume this module rules out.
 */module('Unit | Service | app-state modelling ends with speak mode', function(hooks) {
  setupTest(hooks);

  function user(id, name) {
    return EmberObject.create({
      id: id,
      user_name: name,
      preferences: {},
      /* Setting `referenced_speak_mode_user` wakes app-state's `check_inbox`, which calls
         reload() on that record; a plain object would die before any assertion. */
      reload: function() { return RSVP.resolve(this); }
    });
  }

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    this.stashes = this.owner.lookup('service:stashes');
    /* Entering and leaving speak mode raises flash messages, which throw outside a rendered
       app ("must call setup before trying to show a flash message"). */
    this._modal = { flash: modal.flash, warning: modal.warning, notice: modal.notice,
                    error: modal.error, success: modal.success, open: modal.open };
    modal.flash = function() { };
    modal.warning = function() { };
    modal.notice = function() { return RSVP.resolve(); };
    modal.error = function() { };
    modal.success = function() { };
    modal.open = function() { return RSVP.resolve(); };
    this._mode = this.stashes.get('current_mode');
  });

  hooks.afterEach(function() {
    modal.flash = this._modal.flash;
    modal.warning = this._modal.warning;
    modal.notice = this._modal.notice;
    modal.error = this._modal.error;
    modal.success = this._modal.success;
    modal.open = this._modal.open;
    this.svc.set('referenced_speak_mode_user', null);
    this.svc.set('speakModeUser', null);
    this.svc.set('currentBoardState', null);
    this.stashes.persist('referenced_speak_mode_user_id', null);
    this.stashes.persist('speak_mode_user_id', null);
    this.stashes.set('current_mode', this._mode);
  });

  /* Puts the service in the state "supervisor is modelling for a communicator", the way
     set_speak_mode_user(..., keep_as_self = true) leaves it. currentUser is set LAST because
     booting the real service kicks a session lookup that nulls it on the way through. */
  function start_modelling(ctx, slp, kiddo) {
    ctx.svc.set('speakModeUser', null);
    ctx.svc.set('referenced_speak_mode_user', kiddo);
    ctx.stashes.persist('referenced_speak_mode_user_id', kiddo.get('id'));
    ctx.stashes.persist('speak_mode_user_id', null);
    ctx.stashes.set('current_mode', 'speak');
    ctx.svc.set('currentBoardState', { id: '1_1', key: 'kiddo/home' });
    ctx.svc.set('currentUser', slp);
  }

  test('leaving speak mode while modelling clears the target', function(assert) {
    var slp = user('slp-1', 'sarah');
    var kiddo = user('kiddo-1', 'aiden');
    start_modelling(this, slp, kiddo);
    assert.true(this.svc.get('modeling_for_user'), 'precondition: modelling is on');

    this.svc.toggle_mode('speak');

    assert.strictEqual(this.svc.get('referenced_speak_mode_user'), null,
      'the modelling target is released');
    assert.notOk(this.stashes.get('referenced_speak_mode_user_id'),
      'and so is the stashed id, so a later boot cannot restore it');
  });

  /* The point of the change: entering speak mode again without choosing anybody must be a
     plain speak-mode session, on the supervisor's own boards. */
  test('re-entering speak mode afterwards does not resume modelling', function(assert) {
    var slp = user('slp-1', 'sarah');
    var kiddo = user('kiddo-1', 'aiden');
    start_modelling(this, slp, kiddo);
    this.svc.toggle_mode('speak');                 // leave

    this.stashes.set('current_mode', 'speak');      // enter again, choosing nobody
    this.svc.set('currentBoardState', { id: '1_2', key: 'sarah/home' });

    assert.strictEqual(this.svc.get('referenced_speak_mode_user'), null,
      'no modelling target was resurrected');
    assert.notOk(this.svc.get('modeling_for_user'),
      'so this is an ordinary speak-mode session as themselves');
  });

  /* "Speak as" is released on the way out too -- the same teardown clears `speak_mode_user_id`.
     Asserted rather than assumed: an earlier draft of this file claimed the opposite and was
     wrong, and the distinction decides whether leaving speak mode returns the supervisor to
     their own account or leaves them inside someone else's. */
  test('"speak as" is released on the way out as well', function(assert) {
    var slp = user('slp-1', 'sarah');
    var kiddo = user('kiddo-1', 'aiden');
    this.svc.set('speakModeUser', kiddo);
    this.svc.set('referenced_speak_mode_user', kiddo);
    this.stashes.persist('speak_mode_user_id', kiddo.get('id'));
    this.stashes.persist('referenced_speak_mode_user_id', kiddo.get('id'));
    this.stashes.set('current_mode', 'speak');
    this.svc.set('currentBoardState', { id: '1_1', key: 'kiddo/home' });
    this.svc.set('currentUser', slp);

    this.svc.toggle_mode('speak');

    assert.strictEqual(this.svc.get('referenced_speak_mode_user'), null,
      'the referenced user is released');
    assert.notOk(this.stashes.get('speak_mode_user_id'),
      'and the stashed speak-as id with it, so a later boot restores nobody');
  });

  /* THE CARVE-OUT. Editing a board mid-session must NOT count as leaving. If this ever starts
     failing, a supervisor loses their modelling session every time they open the editor; if it
     is ever widened to other targets, the silent-resume comes back. */
  test('entering edit mode keeps the session, because that is not leaving', function(assert) {
    var slp = user('slp-1', 'sarah');
    var kiddo = user('kiddo-1', 'aiden');
    start_modelling(this, slp, kiddo);

    this.stashes.set('current_mode', 'edit');   // speak_mode flips false in passing

    assert.strictEqual(this.svc.get('referenced_speak_mode_user.id'), 'kiddo-1',
      'the modelling target survives the round trip into the editor');
  });
});
