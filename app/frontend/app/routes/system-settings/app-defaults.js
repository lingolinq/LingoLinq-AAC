import Route from '@ember/routing/route';
import { getOwner } from '@ember/application';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';

export default Route.extend({
  router: service('router'),
  activate() {
    this._super(...arguments);
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  },

  beforeModel() {
    var parent = getOwner(this).lookup('controller:system-settings');
    if (parent && !parent.get('canEditSiteWide')) {
      this.router.transitionTo('system-settings.emails');
      return RSVP.reject();
    }
    return RSVP.resolve();
  },

  setupController(controller) {
    this._super(...arguments);
    if (typeof controller.loadDefaults === 'function') {
      controller.loadDefaults();
    }
  }
});
