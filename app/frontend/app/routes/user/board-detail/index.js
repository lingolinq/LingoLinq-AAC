import Route from '@ember/routing/route';

export default Route.extend({
  model: function() {
    return this.modelFor('user.board-detail');
  },
  setupController: function(controller, model) {
    controller.set('model', model);
  }
});
