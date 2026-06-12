import Route from '@ember/routing/route';

export default Route.extend({
  beforeModel: function() {
    this.replaceWith('demo.speak', { queryParams: { board: null, source: null } });
  }
});
