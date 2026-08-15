import Component from '@ember/component';

/**
 * Supervisor entry overlay for the standalone board picker.
 *
 * A supporter opening `/board-picker?user_id=<communicator>` is asked HOW they
 * want to give that communicator a home board before the picker itself is in
 * play: browse the catalog, take the one-click Vocal Flair 84 assignment, or
 * build a board from scratch. The self flow never sees it (the caller gates on
 * `for_self`) — picking your own home board has its own CTA block on the page.
 *
 * PRESENTATIONAL ONLY: every option is a closure passed in by
 * controllers/board-picker.js. This component owns no routing, no saving and no
 * knowledge of what "quick assign" assigns.
 *
 * DELIBERATELY NOT the create-board chooser (`.nb-create-chooser`,
 * components/create-board-new.hbs). It borrows that overlay's SHAPE — scrim,
 * single panel, title, hairline separator, stacked options with OR between them
 * — because the two are the same kind of decision, but the skin is distinct on
 * purpose: verdigris scrim rather than navy, an eyebrow chip naming the task,
 * and left-aligned options with fixed icon wells. A supporter who lands here
 * must never think they are already creating a board.
 */
export default Component.extend({
  classNames: ['bp-options'],
  attributeBindings: ['role', 'ariaModal:aria-modal', 'ariaLabelledby:aria-labelledby'],
  role: 'dialog',
  ariaModal: 'true',
  ariaLabelledby: 'bp-options-title',

  didInsertElement: function() {
    this._super(...arguments);
    var _this = this;
    /* Escape closes, matching every other dismissible surface in the app. Bound
       on the document rather than the panel because focus may legitimately sit
       on the scrim (a click outside a button) and a keydown there would not
       reach an element-scoped listener. */
    this._escape_handler = function(event) {
      if(event && event.key === 'Escape') {
        event.preventDefault();
        if(_this.onClose) { _this.onClose(); }
      }
    };
    document.addEventListener('keydown', this._escape_handler);
    /* Move focus into the panel so the overlay is operable by keyboard from the
       moment it appears — without this, focus stays wherever the page left it
       and Tab walks the picker BEHIND the scrim. */
    var first = this.element && this.element.querySelector('.bp-options__btn');
    if(first) {
      try { first.focus(); } catch(e) { }
    }
  },

  willDestroyElement: function() {
    this._super(...arguments);
    if(this._escape_handler) {
      document.removeEventListener('keydown', this._escape_handler);
      this._escape_handler = null;
    }
  }
});
