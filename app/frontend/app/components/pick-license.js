import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Component.extend({
  appState: service('app-state'),
  tagName: 'span',
  licenseOptions: computed(function() {
    return this.appState.get('licenseOptions');
  }),
  private_license: computed('license.type', function() {
    return this.get('license.type') == 'private';
  })
});
