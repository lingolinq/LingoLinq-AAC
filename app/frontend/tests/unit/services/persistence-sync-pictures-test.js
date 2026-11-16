import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import { OPTIONAL_PICTURE_MS } from 'frontend/utils/optional_picture';

/* A picture never fails the sync (docs/task-management/2026-11-16_sync-status-first-sync.md, A). A new account's
 * first sync on Traci's phone failed with "promise timed out: sync user data": the default avatar, on a host the app
 * reaches only through the image proxy, outlasted the step's 30 s, and the boards it had saved were reported as a
 * failed sync. Supervisors', contacts' and tags' pictures could fail it too, and their code read `this` inside
 * callbacks, where it is undefined. */
module('Unit | Service | persistence sync pictures', function(hooks) {
  setupTest(hooks);

  function service(owner, download) {
    var p = owner.lookup('service:persistence');
    p.set('optional_picture_ms', 50); // the limit for a picture that never answers, shortened for the test
    p.store_url_quick_check = function() { return false; };
    p.store_url_now = download;
    p.store_url = download; // the queue (sync_contacts, sync_tags)
    return p;
  }
  function user(extra) {
    return EmberObject.create(Object.assign({ id: '9921_1', user_name: 'sam', fresh: true, sync_stamp: 's' }, extra || {}));
  }
  var never = function() { return new RSVP.Promise(function() { }); };
  async function rejects(promise) {
    try { await promise; return null; } catch(e) { return e || {}; }
  }

  test('the limit stays inside "sync user data" (30 s, less the user reload\'s 5 s)', function(assert) {
    assert.true(OPTIONAL_PICTURE_MS <= 25000);
  });

  test('the profile picture failing does not fail "sync user data"', async function(assert) {
    var p = service(this.owner, function() { return RSVP.reject({ error: 'URL lookup failed during proxy' }); });
    var ids = [];
    await p.sync_user(user({ avatar_url: 'https://example.com/avatar.png' }), ids);
    assert.deepEqual(ids, ['user_9921_1'], 'the user is kept; no picture to keep');
  });

  test('a profile picture that never answers does not hold "sync user data"', async function(assert) {
    var p = service(this.owner, never);
    await p.sync_user(user({ avatar_url: 'https://example.com/avatar.png' }), []);
    assert.ok(true, 'resolved after the picture limit');
  });

  test('a full device still fails it, as before', async function(assert) {
    var p = service(this.owner, function() { return RSVP.reject({ quota_maxed: true }); });
    var err = await rejects(p.sync_user(user({ avatar_url: 'https://example.com/avatar.png' }), []));
    assert.ok(err, 'it failed');
    assert.strictEqual(err.error, 'failed to save user avatar, storage is full');
  });

  test('the user details failing to load still fails it', async function(assert) {
    var p = service(this.owner, function() { return RSVP.resolve({}); });
    var u = user({ fresh: false, avatar_url: 'https://example.com/avatar.png' });
    u.reload = function() { return RSVP.reject({ error: 'offline' }); };
    var err = await rejects(p.sync_user(u, []));
    assert.ok(err, 'it failed');
    assert.strictEqual(err.error, 'failed to retrieve latest user details');
  });

  test('supervisors\' and contacts\' pictures are saved, and their failure does not fail the sync', async function(assert) {
    var asked = [];
    var p = service(this.owner, function(url) { asked.push(url); return RSVP.reject({ error: 'proxy' }); });
    await p.sync_contacts(user({ supervisors: [{ avatar_url: 'https://example.com/sup.png' }], contacts: [{ image_url: 'https://example.com/c.png' }] }));
    assert.deepEqual(asked, ['https://example.com/sup.png', 'https://example.com/c.png']);
  });

  test('a supervisor\'s picture that never answers does not hold the sync', async function(assert) {
    var p = service(this.owner, never);
    await p.sync_contacts(user({ supervisors: [{ avatar_url: 'https://example.com/sup.png' }] }));
    assert.ok(true);
  });

  test('a full device still fails the contacts step', async function(assert) {
    var p = service(this.owner, function() { return RSVP.reject({ quota_maxed: true }); });
    var err = await rejects(p.sync_contacts(user({ supervisors: [{ avatar_url: 'https://example.com/sup.png' }] })));
    assert.ok(err, 'it failed');
    assert.true(!!err.quota_maxed);
  });

  test('a tag\'s button picture is saved (the tags step no longer throws)', async function(assert) {
    var asked = [];
    var p = service(this.owner, function(url) { asked.push(url); return RSVP.resolve({ url: url }); });
    var store = LingoLinq.store;
    var own = Object.prototype.hasOwnProperty.call(store, 'findRecord');
    var original = store.findRecord;
    store.findRecord = function(type, id) {
      if(type === 'tag') { return RSVP.resolve(EmberObject.create({ id: id, button: { image_url: 'https://example.com/tag.png' } })); }
      return original.apply(store, arguments);
    };
    try {
      await p.sync_tags(user({ preferences: { tag_ids: ['t1'] } }));
    } finally {
      if(own) { store.findRecord = original; } else { delete store.findRecord; }
    }
    assert.deepEqual(asked, ['https://example.com/tag.png']);
  });
});
