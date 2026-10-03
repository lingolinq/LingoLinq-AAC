import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { opens_in_view_route } from 'frontend/utils/board_view';

/* A VIEW SWITCH ON AN obf/ OR integrations/ BOARD STAYS ON IT (2026-10-02, requested: "work on the
 * imported-board view-switch strand"). Those boards are not `<owner>/<name>`: routes/board.js keeps
 * them on the legacy board page in either view. The switcher split the key anyway, so "obf" became a
 * user name, the transition to user.board-alt/board-detail failed half-way and left a page with no
 * header (scripts/view-switch-obf-board-qa.mjs). One rule now: utils/board_view.js opens_in_view_route.
 */
module('Unit | Component | view-switcher obf boards', function(hooks) {
  setupTest(hooks);

  function run(context, key, next) {
    var calls = [];
    var me = EmberObject.create({ id: '1_3', user_name: 'example', preferences: { board_view_style: next === 'classic' ? 'modern' : 'classic', device: {} },
      save: function() { return Promise.resolve(); } });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      current_route: 'board.index', effective_view_user: me, currentUser: me, sessionUser: me,
      currentBoardState: { key: key }
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      currentURL: '/' + key,
      transitionTo: function() { calls.push(['transitionTo'].concat(Array.prototype.slice.call(arguments))); },
      replaceWith: function() { calls.push(['replaceWith'].concat(Array.prototype.slice.call(arguments))); }
    }));
    context.owner.factoryFor('component:view-switcher').create().send('_apply_view', me, next);
    return calls;
  }

  test('the rule: user boards move between the view routes; obf/ and integrations/ do not', function(assert) {
    assert.expect(5);
    assert.true(opens_in_view_route('example/core-40'));
    assert.false(opens_in_view_route('obf/stars-self'), 'Liked Boards');
    assert.false(opens_in_view_route('obf/eval-start'), 'eval');
    assert.false(opens_in_view_route('integrations/1_2:launch'), 'integration');
    assert.false(opens_in_view_route('1_23'), 'a bare id');
  });

  test('switching view on Liked Boards stays on it, both directions', async function(assert) {
    assert.expect(2);
    assert.deepEqual(run(this, 'obf/stars-self', 'classic'), [], 'Modern -> Basic: no transition');
    assert.deepEqual(run(this, 'obf/stars-self', 'modern'), [], 'Basic -> Modern: no transition');
  });
});
