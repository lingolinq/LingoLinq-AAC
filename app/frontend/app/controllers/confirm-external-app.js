import capabilities from '../utils/capabilities';
import modal from '../utils/modal';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  app: computed('model.apps', function() {
    var apps = this.get('model.apps') || {};
    if(capabilities.system == 'iOS' && apps.ios && apps.ios.launch_url) {
      return apps.ios.name || apps.ios.launch_url;
    } else if(capabilities.system == 'Android' && apps.android && apps.android.launch_url) {
      return apps.android.name || apps.android.launch_url;
    } else if(apps.web && apps.web.launch_url) {
      return apps.web.launch_url;
    } else {
      return "Unknown resource";
    }
  }),
  actions: {
    open_link: function() {
      this.modal.close();
      var apps = this.get('model.apps') || {};
      if(capabilities.system == 'iOS' && apps.ios && apps.ios.launch_url) {
        capabilities.window_open(apps.ios.launch_url, '_blank');
      } else if(capabilities.system == 'Android' && apps.android && apps.android.launch_url) {
        capabilities.window_open(apps.android.launch_url, '_blank');
      } else if(apps.web && apps.web.launch_url) {
        capabilities.window_open(apps.web.launch_url, '_blank');
      } else {
        // TODO: handle this edge case smartly I guess
      }
    }
  }
});
