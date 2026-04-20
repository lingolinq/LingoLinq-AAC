import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

export default Component.extend({
  app_state: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    console.log('[LOADING-OVERLAY] component initialized; app_state =', !!this.get('app_state'));
  },

  show: computed('app_state.loading_overlay_message', function() {
    var msg = this.get('app_state.loading_overlay_message');
    console.log('[LOADING-OVERLAY] show recomputed; message =', msg, 'show =', !!msg);
    return !!msg;
  }),

  message: computed('app_state.loading_overlay_message', function() {
    return this.get('app_state.loading_overlay_message') || '';
  })
});
