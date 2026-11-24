import { module, test } from 'qunit';
import { entry_verdicts, merge_verdicts, fold_entry, board_seen, VERDICT_CAP } from 'frontend/utils/board_verdicts';

/* Whether another owner's liked board may be listed offline, kept per person beyond the 5-entry sync log
 * (docs/task-management/2026-11-23-offline-liked-board-verdicts.md). Rows are in the shape the sync logs a liked seed:
 * its key in both slots (services/persistence.js `id = next.id || next.key`). */
module('Unit | Utility | board verdicts', function() {
  var K = 'therapist/feelings';
  var row = function(extra) { return Object.assign({ id: K, key: K }, extra); };
  var whole = function(at, statuses, answered) { return { user_id: 'larry', issues: false, finished: new Date(at), statuses: statuses, answered: answered }; };
  var raw = { id: '4_1', key: K };

  test('a whole sync\'s answered row lists; a refusal in any entry hides; a row with no answer is weak', function(assert) {
    var v = entry_verdicts(whole(1000, [row({ status: 're-downloaded' })], [K]));
    assert.true(v[K].v);
    assert.strictEqual(v[K].n, 1000);
    assert.strictEqual(entry_verdicts(whole(1000, [row({ status: 'kept' })]))[K].v, 'weak');
    assert.false(entry_verdicts({ user_id: 'larry', errored: true, confirmed: true, finished: new Date(5), statuses: [row({ error: 'x', refused: true })] })[K].v, 'a refusal in a stop counts');
    assert.strictEqual(entry_verdicts({ user_id: 'larry', errored: true, confirmed: true, finished: new Date(5), statuses: [row({ status: 're-downloaded' })] })[K], undefined,
      'a stop\'s clean row decides nothing');
    assert.strictEqual(entry_verdicts(whole(1000, [row({ error: 'timeout' })]))[K], undefined, 'an untagged error decides nothing');
  });

  test('in one entry a refusal wins over a clean row, in either row order', function(assert) {
    var a = entry_verdicts(whole(1000, [row({ status: 're-downloaded' }), row({ error: 'x', refused: true })], [K]));
    var b = entry_verdicts(whole(1000, [row({ error: 'x', refused: true }), row({ status: 're-downloaded' })], [K]));
    assert.false(a[K].v);
    assert.false(b[K].v);
  });

  test('only other owners\' boards are kept (the list checks only those)', function(assert) {
    var v = entry_verdicts(whole(1000, [{ id: '1_1', key: 'larry/home', status: 'cached' }, row({ status: 'cached' }), { id: '7_7', status: 'cached' }], ['larry/home', K, '7_7']));
    assert.strictEqual(v['larry/home'], undefined);
    assert.strictEqual(v['1_1'], undefined);
    assert.true(v[K].v);
    assert.true(v['7_7'].v, 'an id-only row is kept (a link refusal is logged by id)');
  });

  test('merging does not depend on order: the later decisive verdict wins, a decisive one beats weak, a tie hides', function(assert) {
    assert.expect(5);
    var seen = entry_verdicts(whole(1000, [row({ status: 're-downloaded' })], [K]));
    var refused = entry_verdicts(whole(2000, [row({ error: 'x', refused: true })]));
    var weak = entry_verdicts(whole(3000, [row({ status: 'kept' })]));
    var orders = [[seen, refused, weak], [weak, refused, seen], [refused, weak, seen]];
    for(var i = 0; i < orders.length; i++) {
      var m = orders[i].reduce(function(acc, x) { return merge_verdicts(acc, x); }, null);
      assert.false(board_seen(m, raw), 'refused at 2000 holds over seen at 1000 and weak at 3000 (order ' + i + ')');
    }
    var tie = merge_verdicts(entry_verdicts(whole(1000, [row({ status: 're-downloaded' })], [K])), entry_verdicts(whole(1000, [row({ error: 'x', refused: true })])));
    assert.false(board_seen(tie, raw), 'a tie hides');
    var again = merge_verdicts(refused, entry_verdicts(whole(4000, [row({ status: 're-downloaded' })], [K])));
    assert.true(board_seen(again, raw), 'a later real answer ends the refusal');
  });

  test('per board, not per token: a refusal under the id, then answers under the key, lists it', function(assert) {
    var by_id = entry_verdicts(whole(1000, [{ id: '4_1', key: '4_1', error: 'x', refused: true }]));
    var by_key = entry_verdicts(whole(2000, [row({ status: 're-downloaded' })], [K]));
    assert.true(board_seen(merge_verdicts(by_id, by_key), raw));
    var later_refusal = entry_verdicts(whole(3000, [{ id: '4_1', key: '4_1', error: 'x', refused: true }]));
    assert.false(board_seen(merge_verdicts(merge_verdicts(by_id, by_key), later_refusal), raw), 'a newer refusal under the id hides again');
    assert.false(board_seen(null, raw), 'nothing known: not seen');
    assert.true(board_seen(entry_verdicts(whole(1000, [row({ status: 'kept' })])), raw), 'only weak: listed');
  });

  test('fold_entry keeps a map per person, with no prototype, so any user name is safe', function(assert) {
    var by_user = null;
    by_user = fold_entry(by_user, whole(1000, [row({ status: 're-downloaded' })], [K]));
    by_user = fold_entry(by_user, Object.assign(whole(1000, [row({ error: 'x', refused: true })]), { user_id: '__proto__' }));
    assert.true(board_seen(by_user.larry, raw));
    assert.false(board_seen(by_user['__proto__'], raw));
    assert.strictEqual(({})[K], undefined, 'Object.prototype is untouched');
    assert.strictEqual(Object.getPrototypeOf(by_user), null);
  });

  test('a person\'s map is capped, dropping the oldest verdicts', function(assert) {
    var by_user = null;
    for(var i = 0; i < VERDICT_CAP + 10; i++) {
      by_user = fold_entry(by_user, whole(1000 + i, [{ id: 'o/b' + i, key: 'o/b' + i, status: 'cached' }], ['o/b' + i]));
    }
    var tokens = Object.keys(by_user.larry.t);
    assert.ok(tokens.length <= VERDICT_CAP, 'at most the cap');
    assert.strictEqual(by_user.larry.t['o/b0'], undefined, 'the oldest went first');
    assert.true(by_user.larry.t['o/b' + (VERDICT_CAP + 9)].v, 'the newest stays');
  });

  test('a refusal row is kept even when its key names the person\'s own board (a link\'s stated key)', function(assert) {
    var v = entry_verdicts(whole(1000, [{ id: '4_1', key: 'larry/renamed', error: 'x', refused: true }]));
    assert.false(v['4_1'].v);
    assert.false(board_seen(v, raw));
  });

  test('the cap drops weak verdicts first, and on a tie keeps keys (a liked board is logged under its key)', function(assert) {
    var statuses = [row({ status: 'cached' })];
    for(var i = 0; i < VERDICT_CAP + 5; i++) { statuses.push({ id: '9_' + i, key: '9_' + i, status: 'cached' }); }
    var answered = statuses.map(function(s) { return s.id; });
    var by_user = fold_entry(null, whole(1000, statuses, answered));
    assert.true(board_seen(by_user.larry, raw), 'the liked board\'s key stays');
    var weak_then_real = fold_entry(fold_entry(null, whole(1000, [{ id: 'o/w', key: 'o/w', status: 'kept' }])), whole(2000, statuses, answered));
    assert.strictEqual(weak_then_real.larry.t['o/w'], undefined, 'a weak verdict goes before decisive ones');
  });
});
