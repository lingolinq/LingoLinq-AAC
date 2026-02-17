import Route from '@ember/routing/route';

export default Route.extend({
  title: "Inflections",
  model: function(params) {
    this.set('ref', params.ref);
    this.set('locale', params.locale);
    return {};
  },
  setupController: function(controller) {
    controller.set('ref', this.get('ref'));
    controller.set('locale', this.get('locale'));
    controller.load_word();
  }
});
