import Component from '@ember/component';


export default Component.extend({
  tagName: 'span',
  tripleClick: function () {
    if (this.triple_click) {
      this.triple_click();
    }
  }
});
