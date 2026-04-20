import Component from '@ember/component';
import { observer } from '@ember/object';

/**
 * Reusable mobile nav drawer: backdrop + panel with close button and yielded content.
 * Used for landing-alt (unauthenticated) and modern dashboard (authenticated) collapse.
 * Parent owns state and passes @isOpen and @onClose; trigger (hamburger) stays in parent.
 */
export default Component.extend({
  tagName: '',

  _escHandler: null,

  _watchOpen: observer('isOpen', function() {
    if (this.get('isOpen')) {
      this._bindEscKey();
    } else {
      this._unbindEscKey();
    }
  }),

  didInsertElement() {
    this._super(...arguments);
    if (this.get('isOpen')) {
      this._bindEscKey();
    }
  },

  willDestroyElement() {
    this._super(...arguments);
    this._unbindEscKey();
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
