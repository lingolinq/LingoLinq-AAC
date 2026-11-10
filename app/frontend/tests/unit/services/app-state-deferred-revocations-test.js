import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import boardRevocation from 'frontend/utils/board_revocation';

/* A sync that finds boards no synced user can view any more holds the marks back while Speak
 * Mode is on (utils/board_revocation.js), so the board in use is never pulled away.
 * app-state#apply_deferred_board_revocations applies them once Speak Mode is turned off. */
module('Unit | Service | app-state applies deferred board revocations', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    this.stashes = this.owner.lookup('service:stashes');
    /* Leaving speak mode raises flash messages, which throw outside a rendered app. */
    this._modal = { flash: modal.flash, warning: modal.warning, notice: modal.notice,
                    error: modal.error, success: modal.success, open: modal.open };
    modal.flash = function() { };
    modal.warning = function() { };
    modal.notice = function() { return RSVP.resolve(); };
    modal.error = function() { };
    modal.success = function() { };
    modal.open = function() { return RSVP.resolve(); };
    this._mode = this.stashes.get('current_mode');
    this._revocation = { has_deferred: boardRevocation.has_deferred, flush_deferred: boardRevocation.flush_deferred };
    var calls = this.flushes = [];
    var ctx = this;
    boardRevocation.has_deferred = function() { return ctx.deferred; };
    boardRevocation.flush_deferred = function() {
      calls.push(ctx.svc.get('speak_mode'));
      return RSVP.resolve(true);
    };
  });

  hooks.afterEach(function() {
    boardRevocation.has_deferred = this._revocation.has_deferred;
    boardRevocation.flush_deferred = this._revocation.flush_deferred;
    modal.flash = this._modal.flash;
    modal.warning = this._modal.warning;
    modal.notice = this._modal.notice;
    modal.error = this._modal.error;
    modal.success = this._modal.success;
    modal.open = this._modal.open;
    this.svc.set('currentBoardState', null);
    this.stashes.set('current_mode', this._mode);
  });

  test('held-back marks are applied once Speak Mode is turned off, not while it is on', async function(assert) {
    this.deferred = false;
    this.svc.set('currentBoardState', { id: '1_1', key: 'fred/home' });
    this.stashes.set('current_mode', 'speak');
    await settled();
    assert.true(this.svc.get('speak_mode'), 'precondition: Speak Mode is on');

    // A sync finishes during Speak Mode and holds its marks back; the user moves on to
    // another board, which re-evaluates speak_mode while it stays on.
    this.deferred = true;
    this.svc.set('currentBoardState', { id: '1_2', key: 'fred/next' });
    await settled();
    assert.true(this.svc.get('speak_mode'), 'precondition: Speak Mode is still on');
    assert.deepEqual(this.flushes, [], 'nothing is applied while Speak Mode is on');

    this.stashes.set('current_mode', 'default');
    await settled();
    assert.false(this.svc.get('speak_mode'), 'precondition: Speak Mode is off');
    assert.deepEqual(this.flushes, [false], 'the held-back marks are applied once, with Speak Mode off');
  });

  test('nothing is applied when no marks are held back', async function(assert) {
    this.deferred = false;
    this.svc.set('currentBoardState', { id: '1_1', key: 'fred/home' });
    this.stashes.set('current_mode', 'speak');
    await settled();
    this.stashes.set('current_mode', 'default');
    await settled();
    assert.deepEqual(this.flushes, [], 'flush is not called without held-back marks');
  });
});
