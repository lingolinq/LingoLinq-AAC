import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  appState: service('app-state'),
  beforeModel: function() {
    this.appState.set('show_intro', true);
    this.transitionTo('index');
  }
});
