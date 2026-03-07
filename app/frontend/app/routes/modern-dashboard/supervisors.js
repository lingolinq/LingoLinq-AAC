import Route from '@ember/routing/route';
import { set } from '@ember/object';

export default Route.extend({
  activate: function() {
    this._super();
    var controller = this.controllerFor('modern-dashboard');
    if (controller) {
      set(controller, 'activeTab', 'supervisors');
      set(controller, 'showNewBoardForm', false);
    }
  }
});
