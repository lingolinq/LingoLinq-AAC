import Component from '@ember/component';


export default Component.extend({
  tagName: 'span',
  tripleClick: function() {
    this.sendAction('triple_click');
  }
});
