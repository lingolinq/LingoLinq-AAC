import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';

/**
 * Add App modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  device: computed(function() {
    return {
      standalone: navigator.standalone,
      android: (navigator.userAgent.match(/android/i) && navigator.userAgent.match(/chrome/i)),
      ios: (navigator.userAgent.match(/mobile/i) && navigator.userAgent.match(/safari/i))
    };
  }),

  actions: {
    close() {
      modal.close();
    },
    opening() {},
    closing() {}
  }
});
