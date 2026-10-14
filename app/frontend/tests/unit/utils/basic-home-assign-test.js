import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { assign_home_board_basic, basic_home_button_label } from 'frontend/utils/basic_home_assign';

/* BASIC HOME PAGE, Boards view: "Assign Home Board" / "Change Home Board" (requested 2026-10-12).
 * The same flow as Modern's Boards page mode, wired separately for Basic: a board the user owns is
 * set and then the dialog asks whether to open it; anyone else's board goes through the copy
 * dialog (progress, 30s messages, Cancel). Opening uses Basic's own board route. */
module('Unit | Utility | basic home assign', function() {
  function user() { return EmberObject.create({ id: 'self', user_name: 'example' }); }
  function board(key) { return EmberObject.create({ key: key, id: '1_9', name: 'B' }); }

  test('the button says Assign with no home board, Change with one', function(assert) {
    assert.strictEqual(basic_home_button_label(false), 'Assign Home Board');
    assert.strictEqual(basic_home_button_label(true), 'Change Home Board');
  });

  test('their own board: set, then asked whether to open it (no copy question)', async function(assert) {
    var calls = [];
    var assigned = [];
    var b = board('example/two');
    await assign_home_board_basic(b, user(), {
      copyAsHome: function(brd) { calls.push(['copy', brd.get('key')]); return RSVP.resolve(brd); },
      openDialog: function(template, opts) { calls.push(['dialog', template, opts.stage, opts.copied, opts.home.get('key')]); return RSVP.resolve(); },
      onAssigned: function(home) { assigned.push(home.get('key')); },
      openBoard: function() {}
    });
    assert.deepEqual(calls, [['copy', 'example/two'], ['dialog', 'confirm-home-board-copy', 'done', false, 'example/two']]);
    assert.deepEqual(assigned, ['example/two'], 'the mode is told it is done');
  });

  test("someone else's board: the copy dialog, which reports back and opens in Basic", async function(assert) {
    var opened;
    var b = board('lingolinq/quick-core-24');
    var u = user();
    var assigned = [];
    var openedBoards = [];
    var copiedEarly = 0;
    await assign_home_board_basic(b, u, {
      copyAsHome: function() { copiedEarly++; },
      openDialog: function(template, opts) { opened = [template, opts]; return RSVP.resolve(); },
      onAssigned: function(home) { assigned.push(home.get('key')); },
      openBoard: function(home) { openedBoards.push(home.get('key')); }
    });
    assert.strictEqual(copiedEarly, 0, 'nothing copied before they agree');
    assert.strictEqual(opened[0], 'confirm-home-board-copy');
    assert.strictEqual(opened[1].board, b);
    assert.strictEqual(opened[1].user, u);
    assert.strictEqual(opened[1].stage, undefined, 'starts by asking');
    opened[1].onDone(board('example/quick-core-24'));
    opened[1].onOpenBoard(board('example/quick-core-24'));
    assert.deepEqual(assigned, ['example/quick-core-24']);
    assert.deepEqual(openedBoards, ['example/quick-core-24']);
  });

  test('a failed save on their own board says so and does not open the dialog', async function(assert) {
    var dialogs = 0;
    var errors = [];
    await assign_home_board_basic(board('example/two'), user(), {
      copyAsHome: function() { return RSVP.reject('Nope'); },
      openDialog: function() { dialogs++; return RSVP.resolve(); },
      onAssigned: function() {},
      openBoard: function() {},
      showError: function(msg) { errors.push(msg); }
    });
    assert.strictEqual(dialogs, 0);
    assert.deepEqual(errors, ['Nope']);
  });
});
