import Component from '@ember/component';
import { inject as service } from '@ember/service';
import buttonTracker from '../utils/raw_events';

export default Component.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  didInsertElement: function() {
    buttonTracker.setup(this.appState, this.persistence);
  }
});
