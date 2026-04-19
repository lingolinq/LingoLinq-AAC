import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * Reusable board browser component.
 *
 * Renders the full boards UI: header with title and optional "New Board" button,
 * tab strip (Mine, Public, Root, Liked, More...), and the board grid with
 * folder support, filtering, and drag-and-drop.
 *
 * Usage:
 *   {{boards-browser boardsCtrl=this}}
 *   {{boards-browser boardsCtrl=this showNewBoard=false filterInputId="my-filter"}}
 *
 * @param {Controller} boardsCtrl — the user/index controller (required)
 * @param {Boolean}    showNewBoard — show the "+ New Board" button (default true)
 * @param {String}     filterInputId — unique id for the filter input (default "ub-boards-filter-input")
 * @param {String}     headingId — unique id for the section heading (default "ub-boards-heading")
 */
export default Component.extend({
  tagName: '',

  appState: service('app-state'),

  showNewBoard: true,
  filterInputId: 'ub-boards-filter-input',
  headingId: 'ub-boards-heading',

  actions: {
    newBoard() {
      var ctrl = this.get('boardsCtrl');
      if (ctrl) { ctrl.send('newBoard'); }
    },
    setSelected(selected) {
      var ctrl = this.get('boardsCtrl');
      if (ctrl) { ctrl.send('set_selected', selected); }
    },
    setTag(tag) {
      var ctrl = this.get('boardsCtrl');
      if (ctrl) { ctrl.send('set_tag', tag); }
    }
  }
});
