import Component from '@ember/component';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    var size = parseInt(this.get('size') || 400, 10);
    if(this.get('text')) {
      if(window.QRCode) {
        var qr = new window.QRCode(this.element.querySelector('#qr_code'), {text: this.get('text'), width: size, height: size});
        document.querySelector('#qr_code').setAttribute('title', '');
      }
    }
  },
  div_style: computed('size', function() {
    var size = parseInt(this.get('size') || 400, 10);
    return htmlSafe('width: ' + size + 'px; margin: 10px auto 20px;');
  })
});
