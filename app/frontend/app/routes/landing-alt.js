import Route from '@ember/routing/route';
import i18n from '../utils/i18n';

export default Route.extend({
  activate: function() {
    this._super();
    window.scrollTo(0, 0);
    var controller = this.controllerFor('application');
    if(controller && controller.updateTitle) {
      controller.updateTitle(i18n.t('landing_alt', "LingoLinq"));
    }
    this._installDrawerArrowNav();
  },

  deactivate: function() {
    this._super();
    this._removeDrawerArrowNav();
  },

  _installDrawerArrowNav: function() {
    var handler = function(e) {
      var key = e.key;
      var keyCode = e.keyCode || e.which;
      var isDown = key === 'ArrowDown' || keyCode === 40;
      var isUp = key === 'ArrowUp' || keyCode === 38;
      var isHome = key === 'Home' || keyCode === 36;
      var isEnd = key === 'End' || keyCode === 35;
      if (!isDown && !isUp && !isHome && !isEnd) { return; }

      // Trigger as long as a drawer is open in the DOM — focus may be on the
      // hamburger toggle, the backdrop button, the close button, or a link.
      var drawer = document.querySelector('.la-mobile-drawer');
      if (!drawer) { return; }
      var items = Array.prototype.slice.call(
        drawer.querySelectorAll('.la-mobile-drawer__link, .la-mobile-drawer__cta')
      ).filter(function(el) { return el.offsetParent !== null; });
      if (!items.length) { return; }

      var active = document.activeElement;
      var idx = items.indexOf(active);
      var next;
      if (idx === -1) {
        next = (isUp || isEnd) ? items.length - 1 : 0;
      } else if (isDown) { next = (idx + 1) % items.length; }
      else if (isUp) { next = (idx - 1 + items.length) % items.length; }
      else if (isHome) { next = 0; }
      else { next = items.length - 1; }
      e.preventDefault();
      e.stopPropagation();
      items[next].focus();
    };
    document.addEventListener('keydown', handler, true); // capture phase
    this._drawerArrowHandler = handler;
  },

  _removeDrawerArrowNav: function() {
    if (this._drawerArrowHandler) {
      document.removeEventListener('keydown', this._drawerArrowHandler, true);
      this._drawerArrowHandler = null;
    }
  }
});
