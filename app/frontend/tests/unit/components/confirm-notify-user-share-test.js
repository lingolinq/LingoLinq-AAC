import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest, stubPersistence, persistenceTarget } from '../../helpers';
import { stashesTarget } from '../../helpers/service-stub';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';

// Share Text SMS: confirm-notify-user took the log-fallback toast
// ("Message will be sent with logs or next sync.") for three CONFIRMED
// client bugs, none of which mean the SMS was handed to deliver_to:
//   1. missing utterance_record while online (share-utterance snapshots
//      it at modal.open; save may still be in flight)
//   2. persistence.ajax rejects a jqXHR with .status, but confirm()
//      only treats err.result.status >= 400 as an error
//   3. sharer_id / user_id sent as Ember Data id 'self'
// Mutation: restore the old `if (!utterance && raw) fallback()` and
// `err.result.status` check; these tests go red.

module('Unit | Component | confirm-notify-user share send', function(hooks) {
  setupTest(hooks);

  var originalClose;
  var originalSuccess;
  var originalLogEvent;
  var originalPushLog;
  var logCalls;
  var ajaxCalls;

  hooks.beforeEach(function() {
    logCalls = 0;
    ajaxCalls = [];
    originalClose = modal.close;
    originalSuccess = modal.success;
    var stash = stashesTarget();
    originalLogEvent = stash.log_event;
    originalPushLog = stash.push_log;
    modal.close = function() {};
    modal.success = function() {};
    stash.log_event = function() {
      logCalls++;
      return {};
    };
    stash.push_log = function() {};

    this.owner.register('service:modal', Service.extend({
      getSettingsFor: function() { return {}; }
    }));
  });

  hooks.afterEach(function() {
    if (this.restorePersistence) {
      this.restorePersistence();
    }
    modal.close = originalClose;
    modal.success = originalSuccess;
    var stash = stashesTarget();
    if (stash) {
      stash.log_event = originalLogEvent;
      stash.push_log = originalPushLog;
    }
  });

  function sharerSelf() {
    return EmberObject.create({
      id: 'self',
      _actual_id: '1_42',
      global_id: '1_42',
      last_share: null
    });
  }

  function stubSharePersistence(opts) {
    var target = persistenceTarget();
    var originalGet = (target && typeof target.get === 'function') ? target.get.bind(target) : null;
    return stubPersistence({
      ajax: opts.ajax,
      get: function(key) {
        if (key === 'online') { return opts.online; }
        return originalGet ? originalGet(key) : undefined;
      }
    });
  }

  test('online with no utterance record POSTs /share instead of log-fallback', function(assert) {
    var done = assert.async();
    var created = null;
    this.owner.unregister('service:store');
    this.owner.register('service:store', Service.extend({
      createRecord: function(type, hash) {
        created = { type: type, hash: hash };
        return EmberObject.create({
          id: 'utt-new',
          assert_remote_urls: function() {},
          save: function() { return RSVP.resolve(this); }
        });
      }
    }));
    this.restorePersistence = stubSharePersistence({
      online: true,
      ajax: function(url, opts) {
        ajaxCalls.push({ url: url, opts: opts });
        return RSVP.resolve({ shared: true });
      }
    });

    var component = this.owner.factoryFor('component:confirm-notify-user').create();
    component.set('model', {
      raw: [{ label: 'hello' }],
      sentence: 'hello',
      user: { id: '1_42xabc', user_name: 'Dad' },
      sharer: sharerSelf()
    });
    component.send('confirm');

    RSVP.resolve().then(function() {
      assert.strictEqual(logCalls, 0, 'does not queue a share log event while online');
      assert.ok(created && created.type === 'utterance', 'creates an utterance when the snapshot was empty');
      assert.strictEqual(ajaxCalls.length, 1, 'POSTs /share');
      assert.ok(ajaxCalls[0].url.indexOf('/api/v1/utterances/utt-new/share') !== -1, 'share URL uses the new utterance id');
      assert.strictEqual(ajaxCalls[0].opts.data.sharer_id, '1_42', 'sharer_id is global_id, not self');
      done();
    });
  });

  test('jqXHR status 400 shows an error instead of the logs toast', function(assert) {
    var done = assert.async();
    this.restorePersistence = stubSharePersistence({
      online: true,
      ajax: function() {
        return RSVP.reject({ status: 400 });
      }
    });

    var component = this.owner.factoryFor('component:confirm-notify-user').create();
    component.set('model', {
      utterance: EmberObject.create({ id: 'utt-1' }),
      raw: [{ label: 'hello' }],
      sentence: 'hello',
      user: { id: '1_42xabc', user_name: 'Dad' },
      sharer: sharerSelf()
    });
    component.send('confirm');

    RSVP.resolve().then(function() {
      assert.strictEqual(logCalls, 0, '4xx is not treated as a queue-with-logs success');
      assert.strictEqual(component.get('error'), true, 'shows the send-error state');
      done();
    });
  });

  test('share POST uses global_id when the session record id is self', function(assert) {
    var done = assert.async();
    this.restorePersistence = stubSharePersistence({
      online: true,
      ajax: function(url, opts) {
        ajaxCalls.push({ url: url, opts: opts });
        return RSVP.resolve({ shared: true });
      }
    });

    var component = this.owner.factoryFor('component:confirm-notify-user').create();
    component.set('model', {
      utterance: EmberObject.create({ id: 'utt-1' }),
      sentence: 'hello',
      user: { id: '1_42xabc', user_name: 'Dad' },
      sharer: sharerSelf()
    });
    component.send('confirm');

    RSVP.resolve().then(function() {
      assert.strictEqual(ajaxCalls[0].opts.data.sharer_id, '1_42');
      assert.strictEqual(ajaxCalls[0].opts.data.user_id, '1_42xabc');
      done();
    });
  });

  // Mutation: restore `again` so it always `_this.set('seconds', diff)` after
  // confirm/cancel/destroy; this test goes red (setSecondsWhileDead > 0).
  test('countdown does not set seconds after the modal is destroyed', function(assert) {
    var done = assert.async();
    var component = this.owner.factoryFor('component:confirm-notify-user').create();
    var originalSet = component.set.bind(component);
    var setSecondsWhileDead = 0;
    component.set = function(key, value) {
      if (key === 'seconds' && (this.isDestroyed || this.isDestroying)) {
        setSecondsWhileDead++;
      }
      if (this.isDestroyed || this.isDestroying) {
        return this;
      }
      return originalSet(key, value);
    };
    component.didInsertElement();
    component.destroy();
    window.setTimeout(function() {
      assert.strictEqual(setSecondsWhileDead, 0, 'timer must not set seconds on a destroyed component');
      done();
    }, 400);
  });

  test('offline with no utterance still queues a log event', function(assert) {
    this.restorePersistence = stubSharePersistence({
      online: false,
      ajax: function() {
        ajaxCalls.push(1);
        return RSVP.reject({ offline: true });
      }
    });

    var component = this.owner.factoryFor('component:confirm-notify-user').create();
    component.set('model', {
      raw: [{ label: 'hello' }],
      sentence: 'hello',
      user: { id: '1_42xabc', user_name: 'Dad' },
      sharer: sharerSelf()
    });
    component.send('confirm');

    assert.strictEqual(ajaxCalls.length, 0, 'does not POST /share while offline');
    assert.strictEqual(logCalls, 1, 'queues the share on the log');
  });
});
