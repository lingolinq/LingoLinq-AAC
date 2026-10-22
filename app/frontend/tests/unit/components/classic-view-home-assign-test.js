import { module, test } from 'qunit';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* The Basic home page's Boards view mode (requested 2026-10-12). Kept apart from Modern's Boards
 * page mode (components/available-boards-section.js): different names, its own state, its own
 * template wiring. Covered here: the label, the toggle, Cancel, leaving the Boards view, and that
 * a tile click is only redirected while the mode is on. */
module('Unit | Component | classic-view home assign', function(hooks) {
  setupTest(hooks);

  function setup(context, homeKey) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ id: 'self', user_name: 'example', preferences: { home_board: homeKey ? { key: homeKey } : null } })
    }));
    context.owner.unregister('service:persistence');
    context.owner.register('service:persistence', Service.extend({ online: false }));
    var model = EmberObject.create({ id: '1_1', supporter_role: false, load_word_activities: function() {} });
    return context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
  }

  test('label follows whether they have a home board', function(assert) {
    var a = setup(this, null);
    var b = setup(this, 'example/communikate-home');
    assert.strictEqual(a.get('basicSetHomeLabel'), 'Assign Home Board');
    assert.strictEqual(b.get('basicSetHomeLabel'), 'Change Home Board');
    a.destroy(); b.destroy();
  });

  test('the button toggles the mode; the tooltip Cancel ends it', function(assert) {
    var c = setup(this, 'example/communikate-home');
    assert.false(c.get('basicAssigningHome'));
    assert.strictEqual(c.get('basicTileAction'), null, 'tiles keep their normal click');
    c.send('toggleBasicHomeAssign');
    assert.true(c.get('basicAssigningHome'));
    assert.strictEqual(typeof c.get('basicTileAction'), 'function', 'tiles assign while on');
    c.send('cancelBasicHomeAssign');
    assert.false(c.get('basicAssigningHome'));
    assert.strictEqual(c.get('basicTileAction'), null);
    c.destroy();
  });

  test('leaving the Boards view ends the mode', function(assert) {
    // Switching Suggested / Mine / Community / Recent keeps it: checked in the browser, since those
    // subtabs drive the board-list queries this unit test does not stand up.
    var c = setup(this, 'example/communikate-home');
    c.set('index_nav_state', 'boards'); // what set_index_nav writes (authenticated-view.js)
    c.send('toggleBasicHomeAssign');
    assert.true(c.get('basicAssigningHome'));
    c.set('index_nav_state', 'main');
    assert.false(c.get('basicAssigningHome'), 'another view ends it');
    c.destroy();
  });

  test("Modern's Boards page names are not used here", function(assert) {
    var c = setup(this, null);
    assert.strictEqual(c.get('assigningHome'), undefined);
    assert.strictEqual((c.actions || {}).toggleSetHomeMode, undefined);
    c.destroy();
  });

  /* DOUBLE TAP (Scot's review of #1141, 2026-10-14). BoardIcon is a classic component: it calls the
     `onAction` it was last rendered with (components/board-icon.js), so a second tap before the re-render
     still reached the assign, and the mode only ended once the first save came back. Two saves raced and
     the one that resolved last became home. `tap` below is that rendered function, held across both taps. */
  module('one assign at a time', function(inner) {
    var original_open;
    inner.beforeEach(function() { original_open = modal.open; });
    inner.afterEach(function() { modal.open = original_open; });
    function board(key) { return EmberObject.create({ key: key }); }

    test('a double tap sets one home board, even when the saves come back in reverse order', async function(assert) {
      var c = setup(this, 'example/old-home');
      var copies = [];
      var finishers = [];
      c.set('basicCopyAsHome', function(b) {
        copies.push(b.get('key'));
        return new RSVP.Promise(function(resolve) { finishers.push(function() { resolve(b); }); });
      });
      var opened = [];
      modal.open = function(template, opts) { opened.push([template, opts.home && opts.home.get('key')]); return RSVP.resolve(); };
      c.send('toggleBasicHomeAssign');
      var tap = c.get('basicTileAction');
      tap(board('example/three'));
      tap(board('example/four'));
      assert.deepEqual(copies, ['example/three'], 'only the first tap sets a home board');
      assert.false(c.get('basicAssigningHome'), 'the first tap ends the mode at once');
      finishers.slice().reverse().forEach(function(f) { f(); });
      await RSVP.resolve(); await RSVP.resolve(); await RSVP.resolve();
      assert.deepEqual(opened, [['confirm-home-board-copy', 'example/three']], 'one dialog, for the first board');
      c.destroy();
    });

    test("while a save is in flight, a tap after turning the mode back on is ignored", async function(assert) {
      var c = setup(this, 'example/old-home');
      var finish;
      var copies = [];
      c.set('basicCopyAsHome', function(b) {
        copies.push(b.get('key'));
        return new RSVP.Promise(function(resolve) { finish = function() { resolve(b); }; });
      });
      var opened = [];
      modal.open = function(template, opts) { opened.push([template, opts.board.get('key')]); return RSVP.resolve(); };
      c.send('toggleBasicHomeAssign');
      c.get('basicTileAction')(board('example/three'));
      c.send('toggleBasicHomeAssign');
      c.get('basicTileAction')(board('lingolinq/quick-core-24'));
      assert.deepEqual(opened, [], "someone else's board does not open a second assign");
      finish();
      await RSVP.resolve(); await RSVP.resolve(); await RSVP.resolve();
      assert.deepEqual(copies, ['example/three']);
      assert.deepEqual(opened, [['confirm-home-board-copy', 'example/three']], 'only the first assign finishes');
      c.destroy();
    });

    test('a tap that arrives after the assign has finished, with the mode off, assigns nothing', async function(assert) {
      var c = setup(this, 'example/old-home');
      var copies = [];
      c.set('basicCopyAsHome', function(b) { copies.push(b.get('key')); return RSVP.resolve(b); });
      modal.open = function() { return RSVP.resolve(); };
      c.send('toggleBasicHomeAssign');
      var tap = c.get('basicTileAction');
      await tap(board('example/three'));
      assert.strictEqual(c.get('basicTileAction'), null, 'tiles have their normal click back');
      await tap(board('example/four'));
      assert.deepEqual(copies, ['example/three'], 'the late tap on the old handler sets nothing');
      c.destroy();
    });

    test('while a save is in flight the tiles stay on the ignoring handler, so a second tap opens nothing', async function(assert) {
      var c = setup(this, 'example/old-home');
      var finish;
      c.set('basicCopyAsHome', function(b) { return new RSVP.Promise(function(resolve) { finish = function() { resolve(b); }; }); });
      modal.open = function() { return RSVP.resolve(); };
      c.send('toggleBasicHomeAssign');
      c.get('basicTileAction')(board('example/three'));
      assert.false(c.get('basicAssigningHome'));
      assert.strictEqual(typeof c.get('basicTileAction'), 'function', 'not the normal click yet');
      finish();
      await RSVP.resolve(); await RSVP.resolve(); await RSVP.resolve();
      assert.strictEqual(c.get('basicTileAction'), null);
      c.destroy();
    });

    test('a save that hangs does not leave the tiles dead: after a moment they open boards again', async function(assert) {
      var c = setup(this, 'example/old-home');
      c.set('basicCopyAsHome', function() { return new RSVP.Promise(function() { /* never settles */ }); });
      modal.open = function() { return RSVP.resolve(); };
      // The hold timer, captured rather than waited for: a real wait lets unrelated timers of this
      // component fire against the stubbed services.
      var timers = [];
      var original_timeout = window.setTimeout;
      window.setTimeout = function(fn, ms) { timers.push([fn, ms]); return 0; };
      try {
        c.send('toggleBasicHomeAssign');
        c.get('basicTileAction')(board('example/three'));
      } finally {
        window.setTimeout = original_timeout;
      }
      assert.strictEqual(typeof c.get('basicTileAction'), 'function', 'a quick second tap is still ignored');
      assert.deepEqual(timers.map(function(t) { return t[1]; }), [1500], 'released after a moment');
      timers[0][0]();
      assert.strictEqual(c.get('basicTileAction'), null, 'then tiles have their normal click back');
      assert.true(c.get('basicSettingHome'), 'while the save is still held as in flight');
      c.destroy();
    });

    test('an assign that throws does not leave the next one blocked', async function(assert) {
      var c = setup(this, 'example/old-home');
      var calls = 0;
      c.set('basicCopyAsHome', function(b) { calls++; if (calls === 1) { throw new Error('boom'); } return RSVP.resolve(b); });
      modal.open = function() { return RSVP.resolve(); };
      c.send('toggleBasicHomeAssign');
      try { await c.get('basicTileAction')(board('example/three')); } catch (e) { /* the first one fails */ }
      c.send('toggleBasicHomeAssign');
      await c.get('basicTileAction')(board('example/four'));
      assert.strictEqual(calls, 2, 'the second assign ran');
      c.destroy();
    });

    test('once a save has finished, the next assign goes ahead', async function(assert) {
      var c = setup(this, 'example/old-home');
      var copies = [];
      c.set('basicCopyAsHome', function(b) { copies.push(b.get('key')); return RSVP.resolve(b); });
      modal.open = function() { return RSVP.resolve(); };
      c.send('toggleBasicHomeAssign');
      await c.get('basicTileAction')(board('example/three'));
      c.send('toggleBasicHomeAssign');
      await c.get('basicTileAction')(board('example/four'));
      assert.deepEqual(copies, ['example/three', 'example/four']);
      c.destroy();
    });
  });
});
