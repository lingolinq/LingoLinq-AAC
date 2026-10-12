import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

/* The Boards page's "Set Home Board" mode, on a board the user does not own (requested 2026-10-11):
 * say so and offer to copy it; on Yes copy it and set the copy as home with a progress message (no
 * copy-board modal); then offer to open the new home board. */
module('Unit | Component | confirm-home-board-copy', function(hooks) {
  setupTest(hooks);

  function dialog(owner, copyResult) {
    var opened = [];
    var done = [];
    var model = {
      board: EmberObject.create({ key: 'lingolinq/quick-core-24', name: 'Quick Core 24' }),
      user: EmberObject.create({ id: '1_1', user_name: 'example' }),
      copyAsHome: function() { return copyResult; },
      onOpenBoard: function(b) { opened.push(b.get('key')); },
      onDone: function(b) { done.push(b && b.get('key')); }
    };
    var comp = owner.factoryFor('component:confirm-home-board-copy').create({ model: model });
    comp.set('model', model);
    return { comp: comp, opened: opened, done: done };
  }

  test('starts by asking, then copies with a progress message, then offers to open it', async function(assert) {
    var copy = EmberObject.create({ key: 'example/quick-core-24' });
    var t = dialog(this.owner, RSVP.resolve(copy));
    assert.strictEqual(t.comp.get('stage'), 'ask');
    t.comp.send('confirm');
    assert.strictEqual(t.comp.get('stage'), 'copying', 'progress while copying');
    await RSVP.resolve(); await RSVP.resolve();
    assert.strictEqual(t.comp.get('stage'), 'done');
    assert.deepEqual(t.done, ['example/quick-core-24'], 'the page is told the new home board');
    t.comp.send('openBoard');
    assert.deepEqual(t.opened, ['example/quick-core-24'], 'opens the NEW home board');
    t.comp.destroy();
  });

  test("the board isn't 'theirs' when the page's user is the signed-in user keyed 'self'", function(assert) {
    var t = dialog(this.owner, RSVP.resolve(null));
    t.comp.set('appState', EmberObject.create({ currentUser: EmberObject.create({ id: 'self', global_id: '1_1', user_name: 'example' }) }));
    assert.false(t.comp.get('forSomeoneElse'), 'your own page');
    t.comp.set('appState', EmberObject.create({ currentUser: EmberObject.create({ id: 'self', global_id: '1_2', user_name: 'sup' }) }));
    assert.true(t.comp.get('forSomeoneElse'), "a communicator's page");
    t.comp.destroy();
  });

  test('an owned board opens straight at the done step, and Not now plays the move', function(assert) {
    var notNow = [];
    var owner = this.owner;
    var home = EmberObject.create({ key: 'example/three', name: 'Three' });
    var model = { board: home, home: home, stage: 'done', copied: false, user: EmberObject.create({ user_name: 'example' }),
                  onNotNow: function(h) { notNow.push(h.get('key')); } };
    var comp = owner.factoryFor('component:confirm-home-board-copy').create({ model: model });
    comp.set('modal', { close: function() {} });
    assert.strictEqual(comp.get('stage'), 'done');
    assert.strictEqual(comp.get('home'), home);
    assert.false(comp.get('copied'), 'says "is now the home board", not "the copy of"');
    comp.send('close');
    assert.deepEqual(notNow, ['example/three'], 'Not now (or closing) after the home board is set follows it to the top');
    comp.destroy();
  });

  test('while copying, the message changes every 30 seconds so they know it is still working', function(assert) {
    var t = dialog(this.owner, new RSVP.Promise(function() {}));
    t.comp.send('confirm');
    var first = t.comp.get('progressMessage');
    t.comp.tick();
    var second = t.comp.get('progressMessage');
    t.comp.tick();
    var third = t.comp.get('progressMessage');
    assert.notStrictEqual(second, first, '30s');
    assert.notStrictEqual(third, second, '60s');
    for (var i = 0; i < 6; i++) { t.comp.tick(); }
    assert.ok(t.comp.get('progressMessage'), 'keeps a message however long it takes');
    assert.strictEqual(t.comp.get('progressInterval'), 30000);
    t.comp.destroy();
  });

  test('Cancel while copying: home not set, the copy is removed, then it says so', async function(assert) {
    var made = EmberObject.create({ key: 'example/quick-core-24' });
    var check;
    var copyResult = new RSVP.Promise(function(resolve, reject) {
      check = function(isCancelled) { if (isCancelled()) { reject({ cancelled: true, board: made, new_board_ids: ['1_90'] }); } else { resolve(made); } };
    });
    var discarded = [];
    var done = [];
    var model = {
      board: EmberObject.create({ key: 'lingolinq/quick-core-24', name: 'Quick Core 24' }),
      user: EmberObject.create({ id: '1_1', user_name: 'example' }),
      copyAsHome: function(b, u, locale, opts) { var p = copyResult; p.then(null, function() {}); setTimeout(function() { check(opts.isCancelled); }, 0); return p; },
      discardCopy: function(ids) { discarded.push(ids); return RSVP.resolve(); },
      onDone: function(h) { done.push(h); }
    };
    var comp = this.owner.factoryFor('component:confirm-home-board-copy').create({ model: model });
    comp.set('model', model);
    comp.set('modal', { close: function() {} });
    comp.send('confirm');
    assert.true(comp.get('canCancel'));
    comp.send('cancelCopy');
    assert.strictEqual(comp.get('stage'), 'cancelling');
    await new RSVP.Promise(function(r) { setTimeout(r, 20); });
    assert.deepEqual(discarded, [['1_90']], 'the boards this copy made are removed');
    assert.strictEqual(comp.get('stage'), 'cancelled');
    assert.deepEqual(done, [], 'the page is not told a home board was set');
    comp.destroy();
  });

  test('a failed copy says so', async function(assert) {
    var t = dialog(this.owner, RSVP.reject('Could not copy'));
    t.comp.send('confirm');
    await RSVP.resolve(); await RSVP.resolve();
    assert.strictEqual(t.comp.get('stage'), 'error');
    assert.strictEqual(t.comp.get('error'), 'Could not copy');
    t.comp.destroy();
  });
});
