import Component from '@glimmer/component';
import { inject as service } from '@ember/service';

// A PAGE TITLE FOR FOCUSED, where some pages' heroes are hidden (2026-10-01; first for the Basic
// Access page, templates/offline_boards.hbs). It renders the Rooms page's label (`md-compact-head`:
// the caller's two-toned icon, then the title) in Focused only, read from the layout preference so
// it is right on first paint; Gentle keeps the page's hero as its title.
//   <FocusedPageLabel @title={{t "Basic Access" key="critical_access"}}><svg ...></svg></FocusedPageLabel>
export default class FocusedPageLabelComponent extends Component {
  @service('app-state') appState;

  get show() {
    return this.appState.get('effectiveLayout') === 'focused';
  }
}
