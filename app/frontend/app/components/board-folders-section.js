import Component from '@ember/component';
import { computed } from '@ember/object';

/**
 * Board Folders Section — reusable folders accordion + drilled-in
 * affordance shared by the boards page (user/index.js +
 * available-boards-section) AND the My Boards picker modal (in
 * application.js / application.hbs). Owns its own expanded UI state;
 * everything else is supplied by the caller via attrs so the same
 * data binding works regardless of which controller is driving.
 *
 * Required attrs:
 *   - enabled (bool)               : whole panel hides when false
 *   - drillIn (string|null)        : current folder tag, or null
 *   - summaries (array)            : [{tag, count}, …] visible chips
 *   - canModel (bool)              : whether to show New folder /
 *                                    Tag a board action buttons
 *
 * Optional attrs:
 *   - filterValue (string)         : current folder-filter input
 *                                    value (omit to hide the filter
 *                                    input row)
 *   - filterEnabled (bool)         : render the folder-filter input
 *                                    row (matches the boards-page
 *                                    behavior; off for the picker
 *                                    modal where there's no per-
 *                                    folder filter)
 *   - showStripEmptyState (bool)   : when true, expanded body renders
 *                                    a "no folders yet" hint when
 *                                    summaries is empty (boards page
 *                                    behavior)
 *
 * Action attrs (the caller wires these to whichever controller owns
 * the state):
 *   - onToggleExpanded()             : flip accordion open/closed
 *   - onUpdateFilter(event)          : input event on folder filter
 *   - onClearFilter()                : clear the folder filter
 *   - onEnterFolder(tag)             : drill into a folder
 *   - onExitFolder()                 : back to all
 *   - onOpenTagBoard()               : open modals/tag-board
 *   - onOpenNewFolder()              : open modals/new-board-folder
 *   - onFolderDragOver(tag, ev)      : optional DnD passthrough
 *   - onFolderDragEnter(tag, ev)     : "
 *   - onFolderDragLeave(tag, ev)     : "
 *   - onFolderDrop(tag, ev)          : "
 *   - onEmptyFolderDragOver(ev)      : "
 *   - onEmptyFolderDrop(ev)          : "
 */
export default Component.extend({
  tagName: '',

  /* Local UI state — `expanded` controls the accordion. Default
     closed so the panel reads compact on first render. Caller can
     bind to it if they need to react. */
  expanded: false,

  /* Provide an opt-in for the folder-filter input so the picker modal
     (which has its own board filter) can suppress this one. */
  filterEnabled: true,

  /* Boards page wants a "drag a board here to create a folder"
     hint when there are no folders yet; the picker modal doesn't
     need that since folder creation happens via the action button. */
  showStripEmptyState: true,

  hasFilter: computed('filterValue', function() {
    var v = this.get('filterValue');
    return !!(v && String(v).length > 0);
  }),
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },


  actions: {
    toggle() {
      this.toggleProperty('expanded');
      if (this.onToggleExpanded && typeof this.onToggleExpanded === 'function') {
        this.onToggleExpanded();
      }
    },
    updateFilter(event) {
      if (this.onUpdateFilter && typeof this.onUpdateFilter === 'function') {
        this.onUpdateFilter(event);
      }
    },
    clearFilter() {
      if (this.onClearFilter && typeof this.onClearFilter === 'function') {
        this.onClearFilter();
      }
    },
    enterFolder(tag) {
      if (this.onEnterFolder && typeof this.onEnterFolder === 'function') {
        this.onEnterFolder(tag);
      }
    },
    exitFolder() {
      if (this.onExitFolder && typeof this.onExitFolder === 'function') {
        this.onExitFolder();
      }
    },
    openTagBoard() {
      if (this.onOpenTagBoard && typeof this.onOpenTagBoard === 'function') {
        this.onOpenTagBoard();
      }
    },
    openNewFolder() {
      if (this.onOpenNewFolder && typeof this.onOpenNewFolder === 'function') {
        this.onOpenNewFolder();
      }
    },
    folderDragOver(tag, event) {
      if (this.onFolderDragOver) { this.onFolderDragOver(tag, event); }
    },
    folderDragEnter(tag, event) {
      if (this.onFolderDragEnter) { this.onFolderDragEnter(tag, event); }
    },
    folderDragLeave(tag, event) {
      if (this.onFolderDragLeave) { this.onFolderDragLeave(tag, event); }
    },
    folderDrop(tag, event) {
      if (this.onFolderDrop) { this.onFolderDrop(tag, event); }
    },
    emptyFolderDragOver(event) {
      if (this.onEmptyFolderDragOver) { this.onEmptyFolderDragOver(event); }
    },
    emptyFolderDrop(event) {
      if (this.onEmptyFolderDrop) { this.onEmptyFolderDrop(event); }
    }
  }
});
