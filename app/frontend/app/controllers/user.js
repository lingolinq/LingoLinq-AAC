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
    function() {
      var name = this.get('router.currentRouteName') || '';
      if (name === 'user.board-alt.index' || name === 'user.home' || name === 'user.extras' || name === 'user.boards') {
        return true;
      }
      var un = this.get('model.user_name');
      if (!un) {
        return false;
      }
      var url = this.get('router.currentURL') || '';
      if (url.indexOf('/' + un + '/home') !== -1 || url.indexOf('/' + un + '/extras') !== -1) {
        return true;
      }
      return false;
    }
  )
});
