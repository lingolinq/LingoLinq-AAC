import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { request_token, request_identity } from 'frontend/utils/request_identity';

/* The identity a request runs as (Codex review of #1322, P1 and P2): the token utils/extras.js ajax sends, found
 * the same way (capabilities, then the session, then the stashed sign-in; 'none' and '' are no token), plus the user
 * the request acts as. A board download is shared and its late answer stored only under the same identity. */
module('Unit | Utility | request identity', function() {
  function stashes(auth) { return { get_object: function(key) { return key === 'auth_settings' ? auth : null; } }; }

  test('the token is found as the request finds it', function(assert) {
    var session = EmberObject.create({ access_token: 'tok-session' });
    assert.strictEqual(request_token({ access_token: 'tok-cap' }, session, stashes({ access_token: 'tok-stash' })), 'tok-cap', 'capabilities first');
    assert.strictEqual(request_token({ access_token: '' }, session, stashes({ access_token: 'tok-stash' })), 'tok-session', 'then the session');
    assert.strictEqual(request_token({ access_token: 'none' }, null, stashes({ access_token: 'tok-stash' })), 'tok-stash', 'then the stashed sign-in');
    assert.strictEqual(request_token({}, null, stashes({ access_token: 'none' })), null, 'no token');
  });

  test('two requests have the same identity only with the same token and the same acting user', function(assert) {
    var a = request_identity({ access_token: 'tok-a' }, EmberObject.create({}), stashes(null));
    assert.strictEqual(a, request_identity({ access_token: 'tok-a' }, EmberObject.create({}), stashes(null)));
    assert.notStrictEqual(a, request_identity({ access_token: 'tok-b' }, EmberObject.create({}), stashes(null)), 'another account');
    assert.notStrictEqual(a, request_identity({ access_token: 'tok-a' }, EmberObject.create({ as_user_id: '1_9' }), stashes(null)), 'the same account acting as someone else');
    assert.notStrictEqual(request_identity({}, null, stashes(null)), a, 'signed out');
  });
});
