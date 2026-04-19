import Route from '@ember/routing/route';

export default Route.extend({
  activate() {
    this._super(...arguments);
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  }
});
