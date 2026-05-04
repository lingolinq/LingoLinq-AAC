import Component from '@ember/component';

export default Component.extend({
  tagName: 'canvas',
  attributeBindings: ['tabindex'],
  didInsertElement: function() {
    var redrawFn = this.get('onInsert');
    if (redrawFn && typeof redrawFn === 'function') {
      redrawFn();
    } else {
      var target = this.get('targetObject');
      if (target && typeof target.send === 'function') {
        target.send('redraw');
      }
    }
  }
});
