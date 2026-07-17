import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import stashes from '../utils/_stashes';

export default Controller.extend({
  router: service('router'),
  appState: service('app-state'),
  title: "Login"
});
