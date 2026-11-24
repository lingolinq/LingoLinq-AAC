import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { modifier } from 'ember-modifier';

/* THE BASIC DASHBOARD'S SECTION MENU AT <=550px (2026-11-09/10, requested: Basic's section dropdown
 * "is not styled with our modern styles"). Replaces a native <select>, whose open list cannot be
 * styled, with a disclosure in the shared `.md-pillnav-dropdown*` style: a toggle button and, while
 * open, a list of buttons. Rendered by components/dashboard/classic-view.hbs, which passes:
 *   @items       [{ id, label }], already filtered by the same rules as the tab strip
 *   @currentTab  the open section's id
 *   @onSelect    called with an id when one is chosen
 *   @menuLabel   what the menu is ("Dashboard sections"), part of the toggle's accessible name
 *
 * HOW IT CLOSES, AND WHY NOT ON FOCUS (red-team review 2026-11-10). On a choice, on a click or tap
 * anywhere outside it (a document listener in the CAPTURE phase, as modifiers/details-autoclose.js
 * does), and on Escape anywhere while open. Not on `focusout`: Safari and iOS WebKit do not focus a
 * tapped button, so focus never entered the menu there and a tap away left it open over the page.
 * After a choice, and after Escape, focus goes to the toggle, which stays mounted, rather than being
 * dropped on the page when the list unmounts. */
export default class SectionMenuComponent extends Component {
  @tracked open = false;
  listId = 'section-menu-' + guidFor(this);
  container = null;

  get current() {
    var items = this.args.items || [];
    return items.find((item) => item.id === this.args.currentTab) || items[0] || null;
  }

  get accessibleName() {
    var current = this.current;
    return current ? this.args.menuLabel + ', ' + current.label : this.args.menuLabel;
  }

  focusToggle() {
    var toggle = this.container && this.container.querySelector('.md-pillnav-dropdown__trigger');
    if (toggle && typeof toggle.focus === 'function') { toggle.focus(); }
  }

  @action
  toggle() {
    this.open = !this.open;
  }

  @action
  choose(id) {
    this.open = false;
    this.args.onSelect?.(id);
    this.focusToggle();
  }

  dismiss = modifier((element) => {
    this.container = element;
    var onClick = (event) => {
      if (!this.open) { return; }
      if (event.target && element.contains(event.target)) { return; }
      this.open = false;
    };
    var onKeydown = (event) => {
      if (event.key === 'Escape' && this.open) {
        this.open = false;
        this.focusToggle();
      }
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown);
      this.container = null;
    };
  });
}
