import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/* push_log takes a batch out of usage_log before saving it, and puts it back if the save fails.
 * A newer push can start before an older save fails (a slow request, then a press 10 seconds later). */
module('Unit | Service | stashes push_log re-queue', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:stashes');
    this.saved = { online: this.svc.get('online'), errored_at: this.svc.errored_at };
    this.saves = [];
    stub(LingoLinq, 'session', { get: (key) => key === 'isAuthenticated' });
    stub(LingoLinq, 'store', {
      createRecord: (type, attrs) => {
        const defer = RSVP.defer();
        this.saves.push({ labels: attrs.events.map((e) => e.button.label), defer: defer });
        return { save: () => defer.promise, cleanup: () => {} };
      }
    });
    this.svc.set('online', true);
    this.svc.errored_at = null;
    // push_log schedules its 15 minute retry only when `timer` is empty; hold it so nothing outlives the test.
    // last_log_push is cleared before each push, so the 10 second wait_timer is never scheduled either.
    this.svc.timer = 'held by test';
    this.svc.persist('usage_log', []);
    this.event = (label) => ({ timestamp: this.svc.current_timestamp(), type: 'button', button: { label: label } });
    this.record = (label) => this.svc.persist('usage_log', this.svc.get('usage_log').concat([this.event(label)]));
    this.push = (label) => {
      this.record(label);
      this.svc.last_log_push = null;
      this.svc.push_log();
    };
    this.queued = () => this.svc.get('usage_log').map((e) => e.button.label);
  });

  hooks.afterEach(function() {
    this.svc.timer = null;
    this.svc.set('online', this.saved.online);
    this.svc.errored_at = this.saved.errored_at;
    this.svc.persist('usage_log', []);
    restoreStubs();
  });

  test('a failed batch goes back in the queue when a newer push has started', async function(assert) {
    this.push('first');
    this.push('second');
    this.record('third');
    assert.deepEqual(this.saves.map((s) => s.labels), [['first'], ['second']]);

    this.saves[0].defer.reject(new Error('timeout'));
    await tick();
    assert.deepEqual(this.queued(), ['first', 'third'], 'the failed batch is queued again, ahead of newer events');

    this.saves[1].defer.resolve({});
    await tick();
    assert.deepEqual(this.queued(), ['first', 'third'], 'the newer success does not clear it');
  });

  test('a failed batch goes back in the queue when it is the latest push', async function(assert) {
    this.push('only');
    this.record('later');
    this.saves[0].defer.reject(new Error('timeout'));
    await tick();
    assert.deepEqual(this.queued(), ['only', 'later']);
    assert.strictEqual(this.svc.errored_at, 1, 'the failure counts toward the back-off');
  });

  test('a failure older than the latest push does not change the back-off', async function(assert) {
    this.push('first');
    this.push('second');
    this.saves[0].defer.reject(new Error('timeout'));
    await tick();
    assert.strictEqual(this.svc.errored_at, null);
  });
});
