import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { run } from '@ember/runloop';
import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import editManager from 'frontend/utils/edit_manager';
import modal from 'frontend/utils/modal';

/* THE USER IS TOLD WHEN A COPY FINISHES, HOWEVER THEY WAITED (requested 2026-10-01: "informs the
 * user when it is complete"). A minimised copy ends in the drawer's "Copy created!" and a
 * dismissed one in modal.notice, but a copy the user WATCHED to the end (the window still open,
 * the most common case) only navigated to the new board: nothing said it had finished.
 */
module('Unit | Component | copying-board completion notice', function(hooks) {
  setupTest(hooks);

  function poll(fn, ms) {
    var start = Date.now();
    return new RSVP.Promise(function(resolve) {
      (function tick() {
        if (fn() || Date.now() - start > ms) { resolve(); return; }
        setTimeout(tick, 20);
      })();
    });
  }

  test('a copy watched to the end shows "Copy created!" and still opens the new board', async function(assert) {
    var orig = { copy: editManager.copy_board, success: modal.success, notice: modal.notice, isOpen: modal.is_open, close: modal.close };
    var successes = [];
    var notices = [];
    var jumps = [];
    var copiedBoard = EmberObject.create({ id: '1_99', key: 'example/copied', reload: function() { return RSVP.resolve(); } });
    editManager.copy_board = function() { return RSVP.resolve(copiedBoard); };
    modal.success = function(text) { successes.push(text); };
    modal.notice = function(text) { notices.push(text); };
    modal.is_open = function(name) { return name === 'copying-board'; };
    modal.close = function() {};
    try {
      this.owner.unregister('service:modal');
      this.owner.register('service:modal', Service.extend({
        getSettingsFor: function() { return null; },
        isOpen: function() { return false; },
        close: function() {}
      }));
      this.owner.unregister('service:app-state');
      this.owner.register('service:app-state', Service.extend({
        jump_to_board: function(b) { jumps.push(b.key); }
      }));
      var board = EmberObject.create({ id: '1_5', key: 'example/source', locale: 'en' });
      var owner = this.owner;
      run(function() {
        owner.factoryFor('component:copying-board').create({
          model: { action: 'keep_links', board: board, user: EmberObject.create({ id: 'self' }), symbol_library: 'original' }
        });
      });
      await poll(function() { return jumps.length > 0; }, 2000);
      assert.deepEqual(jumps, ['example/copied'], 'the new board still opens');
      assert.deepEqual(successes, ['Copy created!'], 'and the user is told the copy finished');
      assert.deepEqual(notices, [], 'no second, dismissed-path notice');
    } finally {
      editManager.copy_board = orig.copy; modal.success = orig.success; modal.notice = orig.notice;
      modal.is_open = orig.isOpen; modal.close = orig.close;
    }
  });
});
