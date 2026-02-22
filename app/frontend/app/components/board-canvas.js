import Component from '@ember/component';

export default Component.extend({
  tagName: 'canvas',
  attributeBindings: ['tabindex'],
  didInsertElement: function() {
    this.sendAction('redraw');
  }
});
