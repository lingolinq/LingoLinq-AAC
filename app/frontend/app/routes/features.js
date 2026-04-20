import Route from '@ember/routing/route';

export default Route.extend({
  activate: function() {
    this._super();
    window.scrollTo(0, 0);
  }
});
