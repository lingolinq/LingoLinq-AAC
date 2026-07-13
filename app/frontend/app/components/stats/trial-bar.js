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
    // `title` is app-controlled stats data; do not enable html:true or pass untrusted strings (bootstrap 3 EOL, LL-d1ea8659c3).
    $elem.find(".bar_holder").tooltip({container: 'body'});
  }
});

