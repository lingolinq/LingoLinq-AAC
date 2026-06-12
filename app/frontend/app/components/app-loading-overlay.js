import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

export default Component.extend({
  app_state: service('app-state'),
  tagName: '',

  show: computed('app_state.loading_overlay_message', function() {
    return !!this.get('app_state.loading_overlay_message');
  }),

  message: computed('app_state.loading_overlay_message', function() {
    return this.get('app_state.loading_overlay_message') || '';
  })
});
