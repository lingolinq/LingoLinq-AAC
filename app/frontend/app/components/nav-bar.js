import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  app_state: alias('appState')
});
