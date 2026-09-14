import { module, test } from 'qunit';
/* The repo's own setupTest, NOT ember-qunit's: the wrapper passes `waitForSettled: false`
   because a booted app with stubbed persistence leaves orphan RSVP/runLater work that never
   settles, and upstream's afterEach settled() then hangs (tests/helpers/index.js:36-40).
   Importing upstream directly made all seven of these synchronous tests time out at 15s in a
   FULL run while passing under a filter — which is exactly how it went unnoticed. */
import { setupTest } from '../../helpers';

/* The percent half of the copy-progress service. The distinction under test throughout is
   MEASURED vs NOT MEASURED: a board copy runs in two phases and only the second reports a
   figure (edit_manager#copy_board), so `percent` must stay null rather than collapsing to 0
   whenever the server has not measured anything. The surfaces key their indeterminate bar off
   exactly that null, so a 0 here would render a determinate 0% bar that never moves. */
module('Unit | Service | copy-progress percent', function(hooks) {
  setupTest(hooks);

  function svc(ctx) { return ctx.owner.lookup('service:copy-progress'); }

  test('percent starts null and a minimized copy is unmeasured until told otherwise', function(assert) {
    const s = svc(this);
    assert.strictEqual(s.get('percent'), null, 'nothing running, nothing measured');
    s.minimize({ board_key: 'a/b' });
    assert.strictEqual(s.get('percent'), null, 'a fresh copy has no measurement yet');
  });

  test('progress() records a measurement for the owning token', function(assert) {
    const s = svc(this);
    const token = s.minimize({ board_key: 'a/b' });
    s.progress(token, 42);
    assert.strictEqual(s.get('percent'), 42);
  });

  test('progress() distinguishes an explicit 0 from no measurement', function(assert) {
    const s = svc(this);
    const token = s.minimize({ board_key: 'a/b' });
    s.progress(token, 0);
    assert.strictEqual(s.get('percent'), 0, '0 is a real measurement and must be kept as 0');
    s.progress(token, null);
    assert.strictEqual(s.get('percent'), null, 'and null must not be coerced to 0');
  });

  test('progress() ignores a token that does not own the drawer', function(assert) {
    const s = svc(this);
    const first = s.minimize({ board_key: 'first' });
    s.progress(first, 30);
    const second = s.minimize({ board_key: 'second' });
    s.progress(first, 90);
    assert.strictEqual(s.get('percent'), null,
      'a poll from the superseded copy cannot write over the current one');
    s.progress(second, 10);
    assert.strictEqual(s.get('percent'), 10, 'the owning copy still reports normally');
  });

  test('a late poll after complete() cannot drag the result card back to a bar', function(assert) {
    const s = svc(this);
    const token = s.minimize({ board_key: 'a/b' });
    s.progress(token, 80);
    s.complete(token, 'Copy created!', { id: '1', key: 'x/y' });
    assert.strictEqual(s.get('status'), 'done');
    assert.strictEqual(s.get('percent'), null, 'completing clears the measurement');
    s.progress(token, 95);
    assert.strictEqual(s.get('percent'), null, 'a poll in flight when it finished is ignored');
    assert.strictEqual(s.get('status'), 'done', 'and the result card is left alone');
  });

  test('a late poll after fail() is ignored too', function(assert) {
    const s = svc(this);
    const token = s.minimize({ board_key: 'a/b' });
    s.progress(token, 55);
    s.fail(token, 'nope');
    s.progress(token, 70);
    assert.strictEqual(s.get('percent'), null);
    assert.strictEqual(s.get('status'), 'error');
  });

  test('dismiss() clears the measurement along with the rest', function(assert) {
    const s = svc(this);
    const token = s.minimize({ board_key: 'a/b' });
    s.progress(token, 60);
    s.dismiss();
    assert.strictEqual(s.get('percent'), null);
    assert.strictEqual(s.get('status'), null);
  });
});
