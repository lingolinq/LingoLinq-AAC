import { module, test } from 'qunit';
import { modern_landing_for } from 'frontend/utils/basic_landing';

/* BASIC -> MODERN KEEPS YOUR PLACE (2026-10-02, requested: "switching from basic to modern ->
 * implement it"). The Basic home page is one address with four tabs; Modern has a page for each.
 * The reverse of basic_landing_for: which Modern page matches where you are on the Basic home.
 */
module('Unit | Utility | basic_landing modern landing', function() {
  var flags = { updates_pill: true };

  test('each Basic tab lands on its Modern page', function(assert) {
    assert.expect(4);
    assert.deepEqual(modern_landing_for({ tab: 'supervisees' }, 'ana', flags), { route: 'caseload', models: [], query_params: {} }, 'Communicators -> Caseload');
    assert.deepEqual(modern_landing_for({ tab: 'boards' }, 'ana', flags), { route: 'user.boards', models: ['ana'], query_params: {} }, 'Boards -> Boards');
    assert.deepEqual(modern_landing_for({ tab: 'updates' }, 'ana', flags), { route: 'user.logs', models: ['ana'], query_params: { type: 'note', nav: 'home' } }, 'Updates -> Updates');
    assert.deepEqual(modern_landing_for({ tab: 'main', extras: true }, 'ana', flags), { route: 'user.extras', models: ['ana'], query_params: {} }, 'Extras drawer -> Extras');
  });

  test('an expanded communicator card opens that row on the Caseload', function(assert) {
    assert.expect(1);
    assert.deepEqual(modern_landing_for({ tab: 'supervisees', supervisee: 'aiden_parker' }, 'ana', flags), { route: 'caseload', models: [], query_params: { supervisee: 'aiden_parker' } });
  });

  test('stays on the Dashboard: Actions, no place, or Updates without the Updates pill', function(assert) {
    assert.expect(4);
    assert.strictEqual(modern_landing_for({ tab: 'main' }, 'ana', flags), null, 'Actions');
    assert.strictEqual(modern_landing_for(null, 'ana', flags), null, 'nothing published');
    assert.strictEqual(modern_landing_for({ tab: 'updates' }, 'ana', {}), null, 'Modern has no Updates page without the flag');
    assert.strictEqual(modern_landing_for({ tab: 'boards' }, null, flags), null, 'no user name to build the address');
  });
});
