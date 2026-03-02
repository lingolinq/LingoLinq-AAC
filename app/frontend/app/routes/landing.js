import Route from '@ember/routing/route';
import i18n from '../utils/i18n';

export default Route.extend({
  activate: function() {
    this._super();
    window.scrollTo(0, 0);
    var controller = this.controllerFor('application');
    if(controller && controller.updateTitle) {
      controller.updateTitle(i18n.t('landing', "Scot's Design"));
    }
  }
});
