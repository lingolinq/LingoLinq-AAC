import Component from '@ember/component';
import { observer } from '@ember/object';
import { scheduleOnce } from '@ember/runloop';

/**
 * Reusable mobile nav drawer: backdrop + panel with close button and yielded content.
 * Used for landing-alt (unauthenticated) and modern dashboard (authenticated) collapse.
 * Parent owns state and passes @isOpen and @onClose; trigger (hamburger) stays in parent.
 */
export default Component.extend({
  tagName: '',

  _escHandler: null,
  _previouslyFocused: null,

  _watchOpen: observer('isOpen', function() {
    if (this.get('isOpen')) {
      this._bindEscKey();
      this._previouslyFocused = document.activeElement;
      scheduleOnce('afterRender', this, this._focusFirstItem);
    } else {
      this._unbindEscKey();
      this._restoreFocus();
    }
  }),

  didInsertElement() {
    this._super(...arguments);
    if (this.get('isOpen')) {
      this._bindEscKey();
      this._previouslyFocused = document.activeElement;
      scheduleOnce('afterRender', this, this._focusFirstItem);
    }
  },

  willDestroyElement() {
    this._super(...arguments);
    this._unbindEscKey();
  },

  _focusFirstItem() {
    var panel = document.querySelector('.la-mobile-drawer__panel');
    if (!panel) { return; }
    var first = panel.querySelector('.la-mobile-drawer__link, .la-mobile-drawer__cta');
    if (first && typeof first.focus === 'function') {
      first.focus();
    }
  },

  _restoreFocus() {
    var prev = this._previouslyFocused;
    this._previouslyFocused = null;
    if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
      prev.focus();
    }
  },

  _bindEscKey() {
    if (this._escHandler) { return; }
    var _this = this;
    this._escHandler = function(e) {
      if (e.key === 'Escape' && _this.get('onClose')) {
        _this.get('onClose')();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  },

  _unbindEscKey() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }
});
