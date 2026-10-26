import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';

/*
 * The goal page's request carries the device's time zone (#1196), so the server
 * groups the goal's days, weeks and months at the viewer's own midnight.
 */
module('Unit | Adapter | goal', function(hooks) {
  setupTest(hooks);

  test("a goal's own request sends the device's time zone", function(assert) {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var adapter = this.owner.lookup('adapter:goal');
    var url = adapter.urlForFindRecord('1_2', 'goal');
    assert.notStrictEqual(url.indexOf('/api/v1/goals/1_2'), -1, url);
    assert.notStrictEqual(url.indexOf('tz=' + encodeURIComponent(zone)), -1, url);
  });

  test('other goal requests do not change', function(assert) {
    var adapter = this.owner.lookup('adapter:goal');
    var url = adapter.urlForQuery({user_id: '1_2'}, 'goal');
    assert.strictEqual(url.indexOf('tz='), -1, url);
  });
});
