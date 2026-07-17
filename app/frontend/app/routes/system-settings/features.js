import Route from '@ember/routing/route';

export default Route.extend({
  activate() {
    this._super(...arguments);
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  },

  setupController(controller) {
    this._super(...arguments);
    if (typeof controller.loadFeatures === 'function') {
      controller.loadFeatures();
    }
  }
});
