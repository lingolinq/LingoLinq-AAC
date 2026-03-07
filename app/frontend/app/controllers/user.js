import Controller from '@ember/controller';
import { inject as service } from '@ember/service';

export default Controller.extend({
  app_state: service('app-state'),
  queryParams: ['from_dashboard'],
  from_dashboard: null
});
