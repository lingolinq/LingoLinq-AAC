import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { settled } from '@ember/test-helpers';
import { setupTest } from 'frontend/tests/helpers';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* A TOKEN CHECK REFRESHES THE SESSION USER ONLY WHEN THE PERSON CHANGED (section 21 of
 * docs/task-management/2026-11-10_offline-followup-proposals.md). services/session.js compared `sessionUser.id` with the
 * server's real `user_id`; the record keyed 'self' never matched, so every check reloaded the user and reinstalled the
 * 'self' record. A missing session user, or a different person, still refreshes. */
module('Unit | Service | session token check user refresh', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { restoreStubs(); });

  async function check(owner, session_user, server_user_id) {
    var session = owner.lookup('service:session');
    var app = owner.lookup('service:app-state');
    var prior = app.get('sessionUser');
    var refreshes = 0;
    stub(app, 'refresh_session_user', function() { refreshes++; return RSVP.resolve(); });
    stub(owner.lookup('service:persistence'), 'ajax', function() {
      return RSVP.resolve({ authenticated: true, user_name: 'example', user_id: server_user_id });
    });
    app.set('sessionUser', session_user);
    try {
      await session.check_token();
      await settled();
    } finally {
      app.set('sessionUser', prior);
    }
    return refreshes;
  }

  test('the session user keyed self is the same person as the server\'s id: no refresh', async function(assert) {
    var refreshes = await check(this.owner, EmberObject.create({ id: 'self', global_id: '1_3' }), '1_3');
    assert.strictEqual(refreshes, 0);
  });

  test('no session user yet: refresh', async function(assert) {
    assert.strictEqual(await check(this.owner, null, '1_3'), 1);
  });

  test('a different person: refresh', async function(assert) {
    assert.strictEqual(await check(this.owner, EmberObject.create({ id: 'self', global_id: '1_3' }), '1_9'), 1);
  });
});
