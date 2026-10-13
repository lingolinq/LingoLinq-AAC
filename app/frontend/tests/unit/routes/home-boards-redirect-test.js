import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* "Finding the Right Home Board" (`home-boards`, /search/home) is retired as a destination
 * (2026-09-30): every link that pointed at it now opens the board picker, and the address itself
 * forwards there so an old bookmark lands in the same place.
 */
module('Unit | Route | home-boards redirect', function(hooks) {
  setupTest(hooks);

  test('the address forwards to the board picker', function(assert) {
    var calls = [];
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({
      replaceWith: function(route) { calls.push(route); },
      transitionTo: function(route) { calls.push(route); }
    }));
    var route = this.owner.lookup('route:home-boards');
    route.beforeModel();
    assert.deepEqual(calls, ['board-picker']);
  });
});
