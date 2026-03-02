import Component from '@ember/component';
import modal from '../utils/modal';

export default Component.extend({
  tagName: '',
  activeFont: null,

  actions: {
    support() {
      // placeholder for support/help action
    },
    showFeatures() {
      modal.open('la-features-modal');
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
