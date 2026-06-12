import Route from '@ember/routing/route';

export default Route.extend({
  activate() {
    this._super(...arguments);
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  },

  model(params) {
    return params.template_slug;
  },

  setupController(controller, slug) {
    this._super(controller, slug);
    controller.set('template_slug', slug);
    if (typeof controller.clearPreviewState === 'function') {
      controller.clearPreviewState();
    }
    if (typeof controller.loadTemplate === 'function') {
      controller.loadTemplate();
    }
  },

  resetController(controller, isExiting) {
    this._super(...arguments);
    if (isExiting && typeof controller.clearPreviewState === 'function') {
      controller.clearPreviewState();
    }
  }
});
