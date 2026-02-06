import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';

/**
 * Confirm External App modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'confirm-external-app';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  app: computed('model.apps', function() {
    const apps = this.get('model.apps') || {};
    if (capabilities.system === 'iOS' && apps.ios && apps.ios.launch_url) {
      return apps.ios.name || apps.ios.launch_url;
    }
    if (capabilities.system === 'Android' && apps.android && apps.android.launch_url) {
      return apps.android.name || apps.android.launch_url;
    }
    if (apps.web && apps.web.launch_url) {
      return apps.web.launch_url;
    }
    return 'Unknown resource';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    open_link() {
      this.get('modal').close();
      const apps = this.get('model.apps') || {};
      if (capabilities.system === 'iOS' && apps.ios && apps.ios.launch_url) {
        capabilities.window_open(apps.ios.launch_url, '_blank');
      } else if (capabilities.system === 'Android' && apps.android && apps.android.launch_url) {
        capabilities.window_open(apps.android.launch_url, '_blank');
      } else if (apps.web && apps.web.launch_url) {
        capabilities.window_open(apps.web.launch_url, '_blank');
      }
    }
  }
});
