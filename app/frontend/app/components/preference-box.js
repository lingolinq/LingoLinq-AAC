import Component from '@ember/component';

export default Component.extend({
  init() {
    this._super(...arguments);
    var self = this;
    this.onToggle = function() {
      self.send('toggle');
    };
  },

  actions: {
    toggle: function() {
      this.set('open', !this.get('open'));
    }
  }
});