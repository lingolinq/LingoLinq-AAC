import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* NO TOP MARGIN ON SEVEN ACCOUNT PAGES IN MODERN GENTLE (requested 2026-10-02: "on goals, logs,
 * profile, recordings, settings, subscription, and supervision, remove the top margin from
 * md-workspace"). The user controller marks those routes (and the Goal and Log detail pages under
 * them) so templates/user.hbs can flag the workspace; the account page and Reports keep theirs.
 */
module('Unit | Controller | user flush-top workspace', function(hooks) {
  setupTest(hooks);

  test('true on the seven pages and their details, false elsewhere', function(assert) {
    assert.expect(14);
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({ currentRouteName: 'user.goals' }));
    var router = this.owner.lookup('service:router');
    var c = this.owner.lookup('controller:user');
    ['user.goals', 'user.goal', 'user.logs', 'user.log', 'user.edit', 'user.recordings', 'user.preferences', 'user.subscription', 'user.supervision'].forEach(function(r) {
      router.set('currentRouteName', r);
      assert.true(c.get('flushTopWorkspace'), r);
    });
    ['user.index', 'user.stats', 'user.lessons', 'user.boards', 'user.home'].forEach(function(r) {
      router.set('currentRouteName', r);
      assert.false(c.get('flushTopWorkspace'), r);
    });
  });
});
