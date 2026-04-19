import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';

export default Component.extend({
  didInsertElement() {
    this._super(...arguments);
    var el = this.element;
    if (!el) { return; }
    var imgs = el.querySelectorAll('.setup-core-bubbles__img');
    if (!imgs.length) { return; }

    var loaded = 0;
    var total = imgs.length;
    var triggered = false;

    var triggerAnimation = function() {
      if (triggered) { return; }
      triggered = true;
      for (var i = 0; i < imgs.length; i++) {
        imgs[i].classList.add('setup-core-bubbles__img--loaded');
      }
    };

    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete && imgs[i].naturalHeight > 0) {
        loaded++;
      } else {
        imgs[i].addEventListener('load', function() {
          loaded++;
          if (loaded >= total) { triggerAnimation(); }
        });
        imgs[i].addEventListener('error', function() {
          loaded++;
          if (loaded >= total) { triggerAnimation(); }
        });
      }
    }

    // If all already cached/loaded
    if (loaded >= total) {
      triggerAnimation();
    }

    // Safety fallback: trigger after 3s even if some images fail
    runLater(function() {
      triggerAnimation();
    }, 3000);
  }
});
