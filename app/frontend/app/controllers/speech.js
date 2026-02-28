import Ember from 'ember';
import { inject as service } from '@ember/service';

export default Ember.Controller.extend({
  app_state: service('app-state'),
});
