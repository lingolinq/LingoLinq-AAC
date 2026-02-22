import Component from '@ember/component';

export default Component.extend({
  tagName: 'canvas',
  attributeBindings: ['tabindex'],
  didInsertElement: function() {
    var redrawFn = this.get('onInsert');
    if (redrawFn && typeof redrawFn === 'function') {
      redrawFn();
    } else if (this.sendAction) {
      this.sendAction('redraw');
    }
  }
});
