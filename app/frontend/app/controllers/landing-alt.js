import Controller from '@ember/controller';

export default Controller.extend({
  activeFont: null,

  actions: {
    support() {
      // placeholder for support/help action
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
