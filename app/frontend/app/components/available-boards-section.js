import Component from '@ember/component';
import { computed, observer } from '@ember/object';
import { inject as service } from '@ember/service';
import { run, next } from '@ember/runloop';
import i18n from '../utils/i18n';
import actionLock from '../utils/action-lock';
import buildEventAction from '../utils/event_action';
import { readFoldersExpanded, writeFoldersExpanded } from '../utils/folders_panel_state';

/**
 * Available Boards grid (Mine folders, filter, DnD) — used on user/boards and dashboard.
 * Pass boardsCtrl (controller:user/index) and optional filterInputId for duplicate IDs.
 */
export default Component.extend({
  tagName: '',

  /* Board-card density for the Boards page, mirroring the picker's own control
     (components/board-picker.js#compact_boards). true = compact rows showing only icon,
     name and Preview; false = the detailed cards.
     DEFAULTS TO COMPACT, matching the picker (2026-08-16, requested). This does change
     what existing users see on load — the denser list is now the starting point on both
     surfaces, and the toggle is right there to go back to the detailed cards.
     The compact styling itself is NOT duplicated — both pages emit the shared
     `ll-boards-grid--compact` modifier and the rules live once in _board_picker.scss. */
  compactBoards: true,

  /* Orphan CLUSTER rows ("Orphan Boards id:<id>") are not rendered on the Boards page at
     all (2026-08-16, requested). They are synthetic placeholders, not boards — the
     controller creates an unsaved record per cluster (controllers/user/index.js ~770) to
     group boards whose parent is missing from the list. The row shows a raw internal
     label with a global id and offers no useful action, so it reads as broken.
     A named flag rather than a deleted branch: the markup, its drill-in and its
     delete-orphans action are all still in the template, so restoring the row is flipping
     this to `true` rather than reconstructing it.
     TRADE-OFF: the boards clustered under these rows have no other entry point on this
     page, so they are no longer listed here. */
  /* PAIRED with the orphan filter in controllers/user/index.js#board_list — flipping
     this back on also means removing that filter, or the rows will be counted for
     pagination but still absent from the grid. */
  showOrphanClusters: false,

  appState: service('app-state'),
  modal: service('modal'),
  persistence: service('persistence'),
  store: service('store'),

  /** @type {string} id attribute for filter input (avoid duplicate ids on dashboard embed). */
  filterInputId: 'ub-boards-filter-input',

  boardPickerQuery: computed('boardsCtrl.model.id', 'appState.currentUser.id', function() {
    var modelId = this.get('boardsCtrl.model.id');
    var currentId = this.appState.get('currentUser.id');
    if (modelId && currentId && modelId != currentId) {
      return { user_id: modelId };
    }
    return {};
  }),

  editingFolderName: false,
  editFolderNameValue: '',
  confirmingFolderDelete: false,
  deletingFolder: false,
  folderFilterString: '',
  /* Whether the centered "Boards in this folder" dropdown is open.
     Reset to false on every drill-in/drill-out via the observer below
     so each entry into a folder starts with a clean (closed) menu. */
  folderBoardsMenuOpen: false,
  /* Live search string for the in-dropdown board filter. Cleared on
     close so the next open lands the user back on the full list. */
  folderBoardsSearch: '',
  _resetBoardsMenuOnDrillChange: observer('boardsCtrl.mineTagFolderDrillIn', function() {
    if (this.get('folderBoardsMenuOpen')) {
      this.set('folderBoardsMenuOpen', false);
    }
    if (this.get('folderBoardsSearch')) {
      this.set('folderBoardsSearch', '');
    }
  }),
  /* Collapsed by default — the folders strip used to be expanded on
     first paint, but at narrow viewports it eats a lot of vertical
     space above the board grid. The user's last choice is read from
     localStorage in init() below; if they previously expanded it,
     the next visit restores that. Toggle clicks write back to
     localStorage so the preference survives reloads. The literal
     `false` here is the floor — actual initial value is set in
     init() based on the persisted preference. */
  foldersExpanded: false,

  /* Mirror the panel's expanded state onto the controller, which needs it to decide
     whether to hold foldered boards out of the main grid (controller:user/index
     #board_list). ONE method rather than a set() at each of the four places that write
     `foldersExpanded` (init restore, the toggle action, the narrow auto-collapse, and
     the drill-in re-expand) — those would drift apart the moment a fifth appears. */
  /* Carries LATER changes only — the toggle action, the narrow auto-collapse, the
     side-by-side auto-expand. The INITIAL value is not pushed from here: the controller
     reads the same stored preference itself (utils/folders_panel_state), so the two
     already agree on first paint.

     Do NOT add a didReceiveAttrs/init write to close a perceived gap. That fires during
     render, and setting this property invalidates `board_list` — which the template has
     already consumed in the same pass — so Ember discards the component's whole output
     and the boards page renders blank. Reproduced whenever the stored preference was
     `true` while the controller still held its default. */
  _syncFoldersExpandedToCtrl: observer('foldersExpanded', function() {
    var ctrl = this.get('boardsCtrl');
    if (!ctrl || ctrl.isDestroyed || ctrl.isDestroying) { return; }
    var value = !!this.get('foldersExpanded');
    if (ctrl.get('mineFoldersPanelExpanded') !== value) {
      ctrl.set('mineFoldersPanelExpanded', value);
    }
  }),
  init() {
    this._super(...arguments);
    /* Restore the user's last folders-section preference. Read at
       init so the component never paints the expanded state when
       the user previously chose collapsed, and vice versa. Try/
       catch because localStorage can throw (Safari Private mode,
       SSR rendering, sandboxed iframes); the `false` default still
       holds in those cases. */
    this.set('foldersExpanded', readFoldersExpanded());

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
        var ctrl = self.get('boardsCtrl');
        if (ctrl) { ctrl.send.apply(ctrl, [actionName].concat(args)); }
      };
    };
    // For `input` bindings: the handler reads event.target.value, which the
    // generic ctrlAction above discards (5.12 upgrade #490), so the search
    // box never filtered. ctrlAction is unchanged for clicks.
    this.eventAction = buildEventAction(function() { return self.get('boardsCtrl'); });
    // Same contract for this component's own actions (folders filter, folder
    // drill-in search, drag-and-drop onto folder tiles). sendAction still
    // strips DOM events — same bug class as ctrlAction — so anything that
    // reads event.target / event.dataTransfer must use this wrapper instead.
    this.selfEventAction = buildEventAction(function() { return self; });
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        var ctrl = self.get('boardsCtrl');
        if (ctrl) { ctrl.send.apply(ctrl, [actionName].concat(bound)); }
      };
    };
    // A FACTORY, like every other wrapper in this component — it RETURNS the
    // handler. Templates bind it bare: `{{on "click" (this.sendAction "name")}}`,
    // same as `ctrlAction`. Both halves have to match, and this is the pairing
    // the component settled on; the two ways to break it are:
    //
    //   • `(fn this.sendAction …)` — calls the FACTORY on click and throws the
    //     returned handler away, so the action never runs.
    //   • making this invoke `send()` immediately — the bare subexpression is
    //     evaluated at RENDER time, so the action fires during render (Ember
    //     then asserts "already been used previously in the same computation",
    //     e.g. toggling `foldersExpanded` after `aria-expanded` has read it) and
    //     `{{on}}` receives an `undefined` handler, leaving the folders
    //     accordion dead to clicks.
    //
    // Mixing the two halves is the regression covered by
    // tests/integration/available-boards-folders-test.js. Dispatches to `self`
    // (this component). Handlers that need the raw DOM event
    // (updateFolderFilter, drag/drop) use `selfEventAction` instead; the event
    // is popped here because every `sendAction` binding is click-only.
    this.sendAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.selfActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    /* ≤640px section picker (<ModernSelect>). Sections go through `set_selected`,
       the user's board TAGS through `set_tag`, and one picker carries one action —
       so tag options are namespaced `tag:<name>` and unwrapped here. `tag:` is safe
       as a sentinel: every other id is a fixed section key built in
       `boardsSectionOptions` below, never user-supplied, so a tag literally named
       "tag:x" still round-trips to set_tag correctly. */
    this.onBoardsSectionChoose = function(value) {
      var ctrl = self.get('boardsCtrl');
      if (!ctrl || !value) { return; }
      if (value.indexOf('tag:') === 0) {
        ctrl.send('set_tag', value.slice(4));
      } else {
        ctrl.send('set_selected', value);
      }
    };
    this.onSaveFolderRename = function(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      self.send('saveFolderRename');
    };
    this.onOpenBoardInUserView = function(board) {
      var ctrl = self.get('boardsCtrl');
      if (ctrl) { ctrl.send('open_board_in_user_view', board); }
    };
    this.onLoadChildren = function() {
      var ctrl = self.get('boardsCtrl');
      if (ctrl) { ctrl.send('load_children'); }
    };
  },

  /* ≤640px section picker contents. MIRRORS THE DESKTOP TAB ROW and must keep doing
     so: the two top-level pills are plain options, and everything the desktop row
     hides behind [More ▾] follows a `heading` row, in the same order and under the
     same permission gates. Built here rather than in the template because
     <ModernSelect> takes a flat `content` array; `heading: true` is the custom
     list's equivalent of <optgroup label>. */
  boardsSectionOptions: computed(
    'boardsCtrl.model.permissions.edit',
    'boardsCtrl.model.permissions.model',
    'boardsCtrl.model.prior_home_boards',
    'boardsCtrl.model.board_tags.[]',
    'appState.currentUser.modeling_only',
    function() {
      var perms = this.get('boardsCtrl.model.permissions') || {};
      var opts = [];
      if (perms.edit || perms.model) {
        opts.push({ id: 'mine', name: i18n.t('my_boards', "My Boards") });
      }
      if (!this.get('appState.currentUser.modeling_only')) {
        opts.push({ id: 'public', name: i18n.t('public_boards', "Public Boards") });
        if (perms.model) {
          /* Static heading, NOT the controller's `more_label` — that computed swaps
             to whichever item is currently selected, which is right for a dropdown
             TRIGGER and wrong for a group heading. */
          opts.push({ heading: true, name: i18n.t('more_ellipsis', "More...") });
          opts.push({ id: 'root', name: i18n.t('root', "Root") });
          opts.push({ id: 'starred', name: i18n.t('starred', "Liked") });
          if (perms.edit) {
            opts.push({ id: 'shared', name: i18n.t('shared_with_me', "Shared with Me") });
          }
          if (this.get('boardsCtrl.model.prior_home_boards')) {
            opts.push({ id: 'prior_home', name: i18n.t('prior_home', "Prior Home Boards") });
          }
          if (perms.edit) {
            opts.push({ id: 'private', name: i18n.t('private', "Private") });
          }
          (this.get('boardsCtrl.model.board_tags') || []).forEach(function(tag) {
            opts.push({ id: 'tag:' + tag, name: tag });
          });
        }
      }
      return opts;
    }
  ),

  /* Which option the picker shows as current.
     GET derives from the controller — `mine_selected` / `public_selected` rather than
     raw `selected`, because on first load `selected` is undefined while the UI already
     shows Mine via `update_selected`'s default_key fallback.
     SET exists because <ModernSelect> writes the chosen id back to its `selection`
     binding; without a setter that write asserts on a read-only computed. The cached
     write is immediately superseded — choosing fires `onBoardsSectionChoose`, which
     changes the controller, which invalidates a dependent key and recomputes. */
  boardsSectionSelection: computed(
    'boardsCtrl.selected',
    'boardsCtrl.current_tag',
    'boardsCtrl.mine_selected',
    'boardsCtrl.public_selected',
    {
      get() {
        var ctrl = this.get('boardsCtrl');
        if (!ctrl) { return null; }
        if (ctrl.get('selected') === 'tagged') {
          return 'tag:' + (ctrl.get('current_tag') || '');
        }
        if (ctrl.get('mine_selected')) { return 'mine'; }
        if (ctrl.get('public_selected')) { return 'public'; }
        return ctrl.get('selected') || null;
      },
      set(key, value) { return value; }
    }
  ),

  /* Info popover next to the BOARDS-section "in this section" pill.
     Only rendered when the home board is tagged into a folder (the
     case where the +1 duplicate-tile rule applies); explains why the
     home appears in both counts. Toggled on the icon click, dismissed
     by click-outside via the capture-phase handler in didInsertElement. */
  homeBoardInfoOpen: false,

  filteredFolderSummaries: computed(
    'boardsCtrl.mineTagFolderSummaries.[]',
    'folderFilterString',
    function() {
      var summaries = this.get('boardsCtrl.mineTagFolderSummaries') || [];
      var filter = (this.get('folderFilterString') || '').trim();
      if (!filter) { return summaries; }
      var re = null;
      try { re = new RegExp(filter, 'i'); } catch (e) { return summaries; }
      var ctrl = this.get('boardsCtrl');
      return summaries.filter(function(folder) {
        if (folder.tag.match(re)) { return true; }
        var map = ctrl && ctrl.get('model.board_tag_map');
        if (!map) { return false; }
        var ids = map[folder.tag] || [];
        return ids.some(function(gid) {
          var b = ctrl._findMineBoardByGlobalId && ctrl._findMineBoardByGlobalId(gid);
          if (!b) { return false; }
          var name = b.get ? b.get('name') : (b.name || '');
          var key = b.get ? b.get('key') : (b.key || '');
          return (name && name.match(re)) || (key && key.match(re));
        });
      });
    }
  ),

  /**
   * Rows for the centered "Boards in this folder" dropdown. Each entry
   * carries the resolved board record + display name; the template
   * iterates this to render name + remove-from-folder (×) per row.
   * Sorted by board name (case-insensitive) so the list reads
   * alphabetically rather than in the underlying tag-map insertion
   * order.
   */
  folderBoardsList: computed(
    'boardsCtrl.mineTagFolderDrillIn',
    'boardsCtrl.model.board_tag_map',
    'boardsCtrl.model.my_boards.[]',
    function() {
      var ctrl = this.get('boardsCtrl');
      if (!ctrl) { return []; }
      var tag = ctrl.get('mineTagFolderDrillIn');
      if (!tag) { return []; }
      var map = ctrl.get('model.board_tag_map') || {};
      var ids = (map[tag] || []).slice();
      var rows = [];
      /* Roots-only — mirrors the drilled-in folder grid and the chip
         count. Sub-board copies stored in the tag map via downstream=
         true tagging are pages inside their root's tree, not separate
         entries the user organized into this folder. */
      ids.forEach(function(gid) {
        if (!(ctrl._isMineBoardRoot && ctrl._isMineBoardRoot(gid))) { return; }
        var b = ctrl._findMineBoardByGlobalId && ctrl._findMineBoardByGlobalId(gid);
        if (!b || !b.get) { return; }
        var name = b.get('name') || b.get('key') || '';
        var key = b.get('key') || '';
        rows.push({ board: b, name: name, key: key });
      });
      rows.sort(function(a, b) {
        return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
      });
      return rows;
    }
  ),
  /**
   * Same row shape as folderBoardsList, narrowed by the live search
   * string (case-insensitive substring match against name OR board
   * key). When the search is empty this returns the full list — no
   * extra allocation cost.
   */
  filteredFolderBoardsList: computed(
    'folderBoardsList.[]',
    'folderBoardsSearch',
    function() {
      var list = this.get('folderBoardsList') || [];
      var q = (this.get('folderBoardsSearch') || '').trim().toLowerCase();
      if (!q) { return list; }
      return list.filter(function(row) {
        var n = (row.name || '').toLowerCase();
        var k = (row.key || '').toLowerCase();
        return n.indexOf(q) >= 0 || k.indexOf(q) >= 0;
      });
    }
  ),

  /** id for drag hint when the grid should reference it (omit when drilled into a folder). */
  boardGridAriaDescribedby: computed(
    'boardsCtrl.mine_selected',
    'boardsCtrl.model.permissions.edit',
    'boardsCtrl.mineFoldersEnabled',
    'boardsCtrl.mineTagFolderDrillIn',
    'filterInputId',
    function() {
      var c = this.get('boardsCtrl');
      if (!c || !c.get('mine_selected') || !c.get('model.permissions.edit') || !c.get('mineFoldersEnabled')) {
        return null;
      }
      if (c.get('mineTagFolderDrillIn')) {
        return null;
      }
      var fid = this.get('filterInputId') || 'ub-boards-filter-input';
      return fid + '-mine-drag-hint';
    }
  ),

  dragBoardId: null,
  dragSourceTag: null,

  actions: {
    /* Same contract as the picker's `set_compact_boards`. Bound through this component's
       `sendAction` FACTORY (see the note at ~111), so the template binds it BARE. */
    setCompactBoards(compact) {
      this.set('compactBoards', !!compact);
    },
    toggleFoldersExpanded() {
      /* Collapsing while drilled into a folder would hide the drilled-in grid (it lives
         inside the foldersExpanded block) while the main grid is still suppressed by
         `{{#unless mineTagFolderDrillIn}}` — an empty page. Leaving the folder on collapse
         is the coherent reading of the gesture: "stop showing me folders" restores the
         full board list rather than showing nothing. */
      var collapsing = !!this.get('foldersExpanded');
      if (collapsing && this.get('boardsCtrl.mineTagFolderDrillIn')) {
        this.set('boardsCtrl.mineTagFolderDrillIn', null);
      }
      this.toggleProperty('foldersExpanded');
      /* Persist the new state so the user's choice survives a
         reload. localStorage may be unavailable (private mode /
         sandboxed iframe) — fail silently rather than disrupting
         the click. */
      writeFoldersExpanded(this.get('foldersExpanded'));
    },
    toggleHomeBoardInfo() {
      this.toggleProperty('homeBoardInfoOpen');
    },
    folderDragOver(tag, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    },
    folderDragEnter(tag, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      var el = event && event.currentTarget;
      if (el && el.classList) { el.classList.add('ub-boards-page__folder-row--dropping'); }
    },
    folderDragLeave(tag, event) {
      var el = event && event.currentTarget;
      if (el && el.classList) { el.classList.remove('ub-boards-page__folder-row--dropping'); }
    },
    folderDrop(tag, event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.stopPropagation) { event.stopPropagation(); }
      var el = event && event.currentTarget;
      if (el && el.classList) {
        el.classList.remove('ub-boards-page__folder-row--dropping');
      }
      var raw = event && event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
      var parts = (raw || '').split('|');
      var boardId = parts[0];
      var sourceTag = parts[1] || '';
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      if (!user || !boardId) { return; }
      var store = this.get('store');
      var modalSvc = this.get('modal');
      if (!store) { return; }
      store.findRecord('board', boardId).then(function(board) {
        if (sourceTag && sourceTag !== tag) {
          return user.tag_board(board, sourceTag, true, false).then(function() {
            return user.tag_board(board, tag, false, false);
          });
        }
        return user.tag_board(board, tag, false, false);
      }).then(function() {
        // Force board list to recompute and update filtered results
        if (ctrl) {
          ctrl.notifyPropertyChange('model.board_tag_map');
          ctrl.notifyPropertyChange('board_list');
          var bl = ctrl.get('board_list');
          if (bl) {
            ctrl.set('last_filtered_results_key', bl.filtered_results_key);
            ctrl.set('filtered_results', bl.filtered_results);
          }
        }
        // Ember re-renders the folder list after the API call updates the model.
        // Wait for the next render cycle, then find the fresh DOM element and animate it.
        setTimeout(function() {
          var folders = document.querySelectorAll('.ub-boards-page__folder-row');
          var freshEl = null;
          folders.forEach(function(f) {
            var nameEl = f.querySelector('.ub-boards-page__folder-row-name');
            if (nameEl && nameEl.textContent.trim() === tag) {
              freshEl = f;
            }
          });
          if (freshEl) {
            freshEl.classList.add('ub-boards-page__folder-row--animating');
            setTimeout(function() {
              freshEl.classList.remove('ub-boards-page__folder-row--animating');
            }, 1500);
          }
          // Keep hover disabled for 5 seconds after drop animation
          var strip = document.querySelector('.ub-boards-page__folder-list');
          if (strip) { strip.classList.add('ub-boards-page__folder-list--no-hover'); }
          setTimeout(function() {
            if (strip) { strip.classList.remove('ub-boards-page__folder-list--no-hover'); }
          }, 5000);
        }, 100);
      }).catch(function() {
        modalSvc.error(i18n.t('folder_tag_failed', "Could not update folder for this board."));
      });
    },
    boardDragStart(board, event) {
      var strip = document.querySelector('.ub-boards-page__folder-list');
      if (strip) { strip.classList.add('ub-boards-page__folder-list--no-hover'); }
      var ctrl = this.get('boardsCtrl');
      var tag = ctrl && ctrl.get('mineTagFolderDrillIn');
      var gid = board && board.get ? board.get('id') : '';
      if (event && event.dataTransfer && gid) {
        event.dataTransfer.setData('text/plain', gid + '|' + (tag || ''));
        event.dataTransfer.effectAllowed = 'copyMove';
      }
    },
    updateFolderFilter(event) {
      this.set('folderFilterString', event.target.value || '');
    },
    clearFolderFilter() {
      this.set('folderFilterString', '');
    },
    emptyFolderDragOver(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      /* Stop bubbling — this handler is now wired on BOTH the
         outer folders-section and the inner folder-list. Without
         stopPropagation, a dragover on the strip would re-fire on
         the section, causing redundant work each frame of the
         drag. The folder-tag-specific handlers already stop
         propagation; this matches the same pattern. */
      if (event && event.stopPropagation) { event.stopPropagation(); }
      if (event && event.dataTransfer) { event.dataTransfer.dropEffect = 'copy'; }
    },
    emptyFolderDrop(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      /* Same reasoning as emptyFolderDragOver — without this, a
         drop on the inner strip would bubble up to the section's
         own handler and open the tag-board modal twice. */
      if (event && event.stopPropagation) { event.stopPropagation(); }
      var raw = event && event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
      var parts = (raw || '').split('|');
      var boardId = parts[0];
      var ctrl = this.get('boardsCtrl');
      if (!ctrl || !boardId) { return; }
      var store = this.get('store');
      var modalSvc = this.get('modal');
      if (!store) { return; }
      store.findRecord('board', boardId).then(function(board) {
        modalSvc.open('modals/tag-board', {
          user: ctrl.get('model'),
          board: board,
          boardChoices: ctrl.get('model.my_boards'),
          skipReturnToDetails: true
        });
      });
    },
    openTagBoardModal() {
      var ctrl = this.get('boardsCtrl');
      if (!ctrl) { return; }
      this.get('modal').open('modals/tag-board', {
        user: ctrl.get('model'),
        board: null,
        boardChoices: ctrl.get('model.my_boards')
      });
    },
    startFolderRename() {
      var ctrl = this.get('boardsCtrl');
      var currentName = ctrl && ctrl.get('mineTagFolderDrillIn');
      this.set('editFolderNameValue', currentName || '');
      this.set('editingFolderName', true);
      setTimeout(function() {
        var input = document.querySelector('.ub-boards-page__folder-rename-input');
        if (input) { input.focus(); input.select(); }
      }, 50);
    },
    cancelFolderRename() {
      this.set('editingFolderName', false);
      this.set('editFolderNameValue', '');
    },
    saveFolderRename() {
      var _this = this;
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      var oldName = ctrl && ctrl.get('mineTagFolderDrillIn');
      var newName = (this.get('editFolderNameValue') || '').trim();
      if (!newName || !user || !oldName || newName === oldName) {
        this.set('editingFolderName', false);
        return;
      }

      // Single API call to rename the folder key on the server
      this.get('persistence').ajax('/api/v1/users/' + user.get('id') + '/board_tags/rename', {
        type: 'POST',
        data: { old_tag: oldName, new_tag: newName }
      }).then(function(res) {
        if (res && res.board_tag_map) {
          user.set('board_tag_map', res.board_tag_map);
        }
        if (res && res.board_tags) {
          user.set('board_tags', res.board_tags);
        }
        _this.set('editingFolderName', false);
        _this.set('editFolderNameValue', '');
        ctrl.set('mineTagFolderDrillIn', newName);

        ctrl.notifyPropertyChange('model.board_tag_map');
        ctrl.notifyPropertyChange('model.board_tags');
        ctrl.notifyPropertyChange('board_list');
        var bl = ctrl.get('board_list');
        if (bl) {
          ctrl.set('last_filtered_results_key', bl.filtered_results_key);
          ctrl.set('filtered_results', bl.filtered_results);
        }
      }, function(err) {
        console.error('Folder rename failed:', err);
        _this.set('editingFolderName', false);
      });
    },
    startDeleteFolder() {
      /* No per-button positioning — the modal centers on the viewport
         via CSS (top: 50%; left: 50%; transform: translate(-50%, -50%)).
         The previous logic anchored the modal under the clicked Delete
         button (rect.bottom + 8px), but now that the button lives
         far-right inside the destination card, that anchor produced
         a visibly off-center modal. Viewport-centered reads cleaner
         and matches standard confirmation-modal conventions. */
      this.set('confirmingFolderDelete', true);
    },
    cancelDeleteFolder() {
      this.set('confirmingFolderDelete', false);
    },
    confirmDeleteFolder() {
      var _this = this;
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      var tag = ctrl && ctrl.get('mineTagFolderDrillIn');
      if (!user || !tag) { return; }

      return actionLock.run('delete-folder:' + user.get('id') + ':' + tag, function() {
        _this.set('deletingFolder', true);
        return _this.get('persistence').ajax('/api/v1/users/' + user.get('id') + '/board_tags/delete', {
          type: 'POST',
          data: { tag: tag }
        }).then(function(res) {
          _this.set('deletingFolder', false);
          if (res && res.board_tag_map) {
            user.set('board_tag_map', res.board_tag_map);
          }
          if (res && res.board_tags) {
            user.set('board_tags', res.board_tags);
          }
          _this.set('confirmingFolderDelete', false);
          ctrl.set('mineTagFolderDrillIn', null);
          ctrl.set('show_all_boards', false);
          ctrl.set('boards_display_limit', null);
          ctrl.notifyPropertyChange('model.board_tag_map');
          ctrl.notifyPropertyChange('model.board_tags');
          ctrl.notifyPropertyChange('board_list');
          var bl = ctrl.get('board_list');
          if (bl) {
            ctrl.set('last_filtered_results_key', bl.filtered_results_key);
            ctrl.set('filtered_results', bl.filtered_results);
          }
        }, function(err) {
          console.error('Folder delete failed:', err);
          _this.set('deletingFolder', false);
          _this.set('confirmingFolderDelete', false);
        });
      }, {timeout: 10000});
    },
    exitMineFolderTag() {
      var ctrl = this.get('boardsCtrl');
      if (!ctrl) { return; }
      ctrl.set('mineTagFolderDrillIn', null);
      ctrl.set('show_all_boards', false);
      ctrl.set('boards_display_limit', null);
      // Reset the centered dropdown so re-entering any folder starts
      // with the menu closed.
      this.set('folderBoardsMenuOpen', false);
      var bl = ctrl.get('board_list');
      if (bl) {
        ctrl.set('last_filtered_results_key', bl.filtered_results_key);
        ctrl.set('filtered_results', bl.filtered_results);
      }
    },
    toggleFolderBoardsMenu() {
      var open = !this.get('folderBoardsMenuOpen');
      this.set('folderBoardsMenuOpen', open);
      if (!open) {
        // Clear the search when the menu closes so re-opening starts
        // back on the full list.
        this.set('folderBoardsSearch', '');
        return;
      }
      // Auto-focus the search input one tick after open so the user
      // can immediately type to filter. setTimeout matches the same
      // pattern used by startFolderRename above.
      setTimeout(function() {
        var input = document.querySelector('.ub-boards-page__folder-context-boards-menu-search-input');
        if (input) { input.focus(); }
      }, 50);
    },
    updateFolderBoardsSearch(event) {
      this.set('folderBoardsSearch', (event && event.target && event.target.value) || '');
    },
    clearFolderBoardsSearch() {
      this.set('folderBoardsSearch', '');
      setTimeout(function() {
        var input = document.querySelector('.ub-boards-page__folder-context-boards-menu-search-input');
        if (input) { input.focus(); }
      }, 0);
    },
    /* Open the clicked board in speak mode, respecting the user's
       classic/modern view preference. home_in_speak_mode does both
       (transitionToBoardForCurrentUiStyle picks the right route via
       preferences.board_view_style, then toggle_mode flips speak on).
       Menu auto-closes on the drill-in observer once the transition
       lands on a new route. */
    openBoardFromMenu(board) {
      if (!board || !board.get) { return; }
      var key = board.get('key');
      var id = board.get('id');
      if (!key) { return; }
      this.set('folderBoardsMenuOpen', false);
      this.set('folderBoardsSearch', '');
      this.get('appState').home_in_speak_mode({
        force_board_state: { key: key, id: id }
      });
    },
    removeBoardFromFolder(board) {
      var _this = this;
      var ctrl = this.get('boardsCtrl');
      var user = ctrl && ctrl.get('model');
      var tag = ctrl && ctrl.get('mineTagFolderDrillIn');
      if (!user || !board || !tag) { return; }
      var modalSvc = this.get('modal');
      // Untag the board from the current folder. tag_board(b, t, remove,
      // downstream) — the third arg true triggers the remove path, which
      // refreshes user.board_tag_map server-side. The board itself is
      // not deleted.
      user.tag_board(board, tag, true, false).then(function() {
        if (ctrl) {
          ctrl.notifyPropertyChange('model.board_tag_map');
          ctrl.notifyPropertyChange('board_list');
          var bl = ctrl.get('board_list');
          if (bl) {
            ctrl.set('last_filtered_results_key', bl.filtered_results_key);
            ctrl.set('filtered_results', bl.filtered_results);
          }
        }
        _this.notifyPropertyChange('folderBoardsList');
        // If the folder is now empty, drop drill-in so the user lands
        // back on the folder strip — an empty drilled-in card with a
        // stale name reads as a dead state.
        var remaining = (user.get('board_tag_map') || {})[tag] || [];
        if (!remaining.length) {
          _this.send('exitMineFolderTag');
        }
      }).catch(function() {
        modalSvc.error(i18n.t('folder_untag_failed', "Could not remove this board from the folder."));
      });
    }
  },

  /* Click-outside-to-exit: while drilled into a folder, a click anywhere
     outside the folder-context card behaves like the breadcrumb "back"
     button. Capture-phase listener runs before any bubble-phase action,
     so a click on a folder tile (which sets drill-in via bubble) still
     enters that folder cleanly — at capture time drill-in is still null,
     so the handler returns early. */
  _folderClickOutside: null,

  /* NO AUTOMATIC EXPAND/COLLAPSE OF THE FOLDERS PANEL — deliberately.
     There used to be two viewport/layout-driven syncs here: `_syncSideBySideFoldersExpand`
     (force-expand on entering side-by-side above 768px) and `_syncNarrowFoldersCollapse`
     (force-collapse below it). Both are gone, for two reasons.

     PRODUCT (Traci, 2026-08-26): the panel stays where the user left it, so the page never
     feels like it changed on them.

     CORRECTNESS: both mutated `foldersExpanded` WITHOUT writing the stored preference, which
     is what let this component and the SINGLETON `controllers/user/index` drift apart. The
     controller survives this component; a value the component adopted without persisting was
     invisible to the next instance, which re-read localStorage and got something else. Once
     they disagreed, `board_list` withheld foldered boards from the main grid while the panel
     was NOT presenting them — so a board filed in a folder with no untagged twin vanished
     from the page entirely (the mirror case rendered every foldered board twice).

     The invariant now: `foldersExpanded` changes ONLY when the user toggles it, and that path
     always calls `writeFoldersExpanded`. Both sides initialise from `readFoldersExpanded()`,
     so they agree on first paint with nobody writing across the boundary mid-render, and the
     observer below carries later changes. Do not reintroduce a state change here that skips
     the write — persist it, or do not make it.

     TRADE-OFF, recorded so it is a choice and not an oversight: on a phone in the
     side-by-side arrangement an expanded folders accordion pushes the boards list down. The
     user collapses it once and, unlike before, that now persists. */

  didInsertElement() {
    this._super(...arguments);
    var _this = this;

    var handler = function(ev) {
      if (!ev || !ev.target || !ev.target.closest) { return; }
      // Dismiss the BOARDS-section home-board-info popover on any
      // click outside its trigger + panel wrapper. This check runs
      // regardless of drill-in state (the popover lives on the
      // boards-summary header, visible only when NOT drilled in) so
      // it must happen before the drill-in early-return below.
      if (_this.get('homeBoardInfoOpen') &&
          !ev.target.closest('.ub-boards-page__boards-summary-info-wrap')) {
        run(function() { _this.set('homeBoardInfoOpen', false); });
      }
      var ctrl = _this.get('boardsCtrl');
      if (!ctrl || !ctrl.get('mineTagFolderDrillIn')) { return; }
      // Auto-close the centered "Boards in this folder" dropdown when
      // the user clicks anywhere outside its wrapper (trigger + panel
      // both live inside .ub-boards-page__folder-context-boards-menu).
      // This runs in capture phase so it fires before the exit-folder
      // check below — order matters because exiting also re-renders
      // the menu away, but closing it explicitly avoids a flash of an
      // open menu if the user clicks back in.
      if (_this.get('folderBoardsMenuOpen') &&
          !ev.target.closest('.ub-boards-page__folder-context-boards-menu')) {
        run(function() { _this.set('folderBoardsMenuOpen', false); });
      }
      // Clicks inside the folder card itself (board tiles, breadcrumb,
      // identity, action buttons, inline delete-confirm) stay scoped.
      if (ev.target.closest('.ub-boards-page__folder-context')) { return; }
      // Restrict the click-outside scope to the boards page chrome —
      // clicks on overlay modals/dialogs portalled outside the page
      // wrapper shouldn't trigger an unrelated folder exit.
      if (!ev.target.closest('.ub-boards-page')) { return; }
      run(function() { _this.send('exitMineFolderTag'); });
    };
    this.set('_folderClickOutside', handler);
    next(function() {
      document.addEventListener('click', handler, true);
    });
  },

  willDestroyElement() {
    var handler = this.get('_folderClickOutside');
    if (handler) {
      document.removeEventListener('click', handler, true);
      this.set('_folderClickOutside', null);
    }
    this._super(...arguments);
  }
});
