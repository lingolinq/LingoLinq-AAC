import Component from '@ember/component';
import $ from 'jquery';

export default Component.extend({
  click: function (event) {
    if (event.target.tagName == 'A' && event.target.className == 'ember_link') {
      event.preventDefault();
      if (this.action) {
        this.action($(event.target).data());
      }
    }
  }
});
