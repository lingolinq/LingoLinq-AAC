import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/* The Compressed View dashboard toolbar's labelled "More" menu (components/dashboard/
   authenticated-view.hbs). A DISCLOSURE: a button with aria-expanded that shows a group of plain
   buttons, driven by component state, so it needs no hover and no Bootstrap JS. It closes when an
   item runs (items receive `close` from the yield), on Escape (items wire the yielded `onKeydown`;
   focus returns to the button), and on a click anywhere outside it.

   Not a native <details> (a <button> inside it fails template-lint's no-nested-interactive) and
   not an ARIA role="menu" (its items are yielded, so the menuitem-in-menu context the role
   requires cannot be guaranteed; a disclosure of buttons is the simpler correct pattern). */
export default class DashboardCompactMoreMenuComponent extends Component {
  @tracked open = false;
  _outsideClick = null;

  @action
  toggle() {
    if (this.open) { this.close(); } else { this.show(); }
  }

  show() {
    this.open = true;
    /* Capture phase on the document, added while the opening click is already past it, so this
       click does not immediately close the menu it opened. */
    this._outsideClick = (event) => {
      var target = event && event.target;
      if (!target || !target.closest || !target.closest('.md-compact-head__more')) { this.close(); }
    };
    document.addEventListener('click', this._outsideClick, true);
  }

  @action
  close() {
    this.open = false;
    if (this._outsideClick) {
      document.removeEventListener('click', this._outsideClick, true);
      this._outsideClick = null;
    }
  }

  @action
  onKeydown(event) {
    if (event && event.key === 'Escape' && this.open) {
      this.close();
      var wrap = event.target && event.target.closest && event.target.closest('.md-compact-head__more');
      var trigger = wrap && wrap.querySelector('.md-compact-head__more-trigger');
      if (trigger) { trigger.focus(); }
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.close();
  }
}
