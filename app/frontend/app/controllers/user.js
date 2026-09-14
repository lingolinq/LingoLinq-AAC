import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

export default Controller.extend({
  app_state: service('app-state'),
  router: service('router'),
  /**
   * Full dashboard or board-alt: render only {{outlet}} (no md-user-layout / User menu).
   * Uses router + URL so user.extras always matches even if current_route leaf name differs.
   */
  bareUserOutletLayout: computed(
    'router.currentRouteName',
    'router.currentURL',
    'model.user_name',
    'app_state.current_route',
    function() {
      /* Bare if EITHER the route we are on OR the route we are heading to is bare.
         `router.currentRouteName` only advances on routeDidChange, i.e. at the END of a
         transition, while `app_state.current_route` is set from `transition.to_route` on
         routeWillChange, i.e. at the START (routes/application.js:110 ->
         services/app-state.js:749). Consulting only the former made this layout lag the
         whole transition.

         The OR is what makes it correct in both directions, and neither half alone is:
           account -> board  currentRouteName is still the account route, so without
                             `current_route` the board's loading state rendered underneath
                             the account pill nav -- the reported flash.
           board -> account  `current_route` is already the account route, so without
                             `currentRouteName` the pill nav would appear OVER the board
                             that is still rendered, which is the same flash mirrored.
         Being bare during a transition between the two is the safe answer: the pill nav
         belongs to the settled account-style page, not to either loading state. */
      var _this = this;
      /* Matched on the route's BASE plus any child, rather than on a list of exact leaf
         names, so a new child route under any of these is covered without editing a list
         (`user.board-detail.edit` already is).

         `indexOf(base + '.')` rather than a bare prefix test: 'user.boards' starts with
         'user.board', so a prefix test would make Boards match board-alt/board-detail.

         The `_loading` strip is DEFENSIVE, not load-bearing. Ember names a loading substate
         with an underscore (`user.board-detail_loading`), and that name did reach here until
         services/app-state.js#global_transition started ignoring substate transitions
         outright -- see the comment there. It is kept because this computed reads two
         different route sources and only one of them is covered by that guard. */
      var BARE_ROUTE_BASES = ['user.board-alt', 'user.board-detail', 'user.home',
                              'user.extras', 'user.boards', 'user.stats'];
      var is_bare_route = function(name) {
        var n = (name || '').replace(/_loading$/, '');
        return BARE_ROUTE_BASES.some(function(base) {
          return n === base || n.indexOf(base + '.') === 0;
        });
      };
      if (is_bare_route(_this.get('router.currentRouteName')) ||
          is_bare_route(_this.get('app_state.current_route'))) {
        return true;
      }
      var un = _this.get('model.user_name');
      if (!un) {
        return false;
      }
      var url = _this.get('router.currentURL') || '';
      if (url.indexOf('/' + un + '/home') !== -1 || url.indexOf('/' + un + '/extras') !== -1) {
        return true;
      }
      return false;
    }
  )
});
