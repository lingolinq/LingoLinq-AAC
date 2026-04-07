import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

export default Component.extend({
  tagName: '',
  appState: service('app-state'),
  activeFont: null,
  actions: {
    support() {
      // placeholder for support/help action
    },
    showFeatures() {
      modal.open('landing-features-modal');
    },
    toggleFont(fontName) {
      var _this = this;
      if (_this.get('activeFont') === fontName) {
        _this.set('activeFont', null);
      } else {
        _this.set('activeFont', fontName);
      }
    }
  }
});
