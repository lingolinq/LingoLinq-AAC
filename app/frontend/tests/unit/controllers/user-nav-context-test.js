import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* WHICH NAV THE LOGS PAGE WEARS, decided by where the user came from.
 *
 * `user.logs` is the one page reachable from two different menus: as "Updates" in a
 * pill-nav (which appends `?nav=home`) and as "Logs" in the account rail (which does not).
 * templates/user.hbs picks between them with `accountRailContext` first and
 * `homeNavContext` second, so the rail check has to YIELD on the `nav=home` case or the
 * pill-nav branch is unreachable — which is exactly the state this pins. Both computeds
 * read the URL rather than a click-time flag, so the choice survives reload, the back
 * button and a bookmark.
 *
 * The services are stubbed: the computeds read `router.currentRouteName`,
 * `router.currentURL` and `app_state.current_route` and nothing else, so standing up a
 * real router would test Ember rather than this precedence rule.
 */
module('Unit | Controller | user nav context', function(hooks) {
  setupTest(hooks);

  function ctrl(context, routeName, url) {
    // UNREGISTER FIRST — a bare `register` over an already-registered service is silently
    // ignored, which would make every property read `undefined` and pass for the wrong reason.
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentRouteName: routeName,
      currentURL: url
    }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ current_route: routeName }));
    return context.owner.lookup('controller:user');
  }

  test('Updates from a pill-nav shows the pill-nav and suppresses the rail', function(assert) {
    assert.expect(2);
    var c = ctrl(this, 'user.logs', '/someone/logs?type=note&nav=home');
    assert.true(c.get('homeNavContext'), 'the home pill-nav is the nav for this visit');
    assert.false(c.get('accountRailContext'), 'and the account rail stays out of its way');
  });

  test('Logs from the account rail shows the rail and no pill-nav', function(assert) {
    assert.expect(2);
    var c = ctrl(this, 'user.logs', '/someone/logs?type=all');
    assert.false(c.get('homeNavContext'), 'no nav=home, so this is not a pill-nav visit');
    assert.true(c.get('accountRailContext'), 'the account rail is the nav for this visit');
  });

  // `nav=home` is scoped to the logs page on purpose: a stray param on another account-section
  // page must not strip that page's rail.
  test('a stray nav=home on another section page does not remove the rail', function(assert) {
    assert.expect(2);
    var c = ctrl(this, 'user.goals', '/someone/goals?nav=home');
    assert.false(c.get('homeNavContext'), 'the origin rule only applies to the logs page');
    assert.true(c.get('accountRailContext'), 'Goals keeps its rail');
  });

  // The board routes are the reason the rail list is a list and not a `startsWith('user.')`
  // test: a 208px panel across a communication board is not acceptable.
  test('board routes never get the rail', function(assert) {
    assert.expect(2);
    assert.false(ctrl(this, 'user.board-detail', '/someone/board-detail/x').get('accountRailContext'),
      'no rail over a board');
    assert.false(ctrl(this, 'user.board-alt', '/someone/board/x').get('accountRailContext'),
      'no rail over the classic board either');
  });
});
