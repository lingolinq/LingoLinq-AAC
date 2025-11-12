import Component from '@ember/component';
import $ from 'jquery';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  draw: function() {
    var $elem = $(this.get('element'));
    $elem.find(".bar_holder").tooltip({container: 'body'});
  }
});

