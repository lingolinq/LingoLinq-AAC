import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { set } from '@ember/object';

export default Route.extend({
  router: service(),

  activate: function() {
    this._super();
    window.scrollTo(0, 0);
    var controller = this.controllerFor('application');
    if (controller && controller.updateTitle) {
      controller.updateTitle(i18n.t('modern_dashboard', "Modern Dashboard"));
    }
    var dashboardController = this.controllerFor('modern-dashboard');
    if (!dashboardController) { return; }
    var name = this.router.currentRouteName;
    if (name === 'modern-dashboard' || name === 'modern-dashboard.index') {
      set(dashboardController, 'activeTab', 'home');
      set(dashboardController, 'showNewBoardForm', false);
    }
  }
});
