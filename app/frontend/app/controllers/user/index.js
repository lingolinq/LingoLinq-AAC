import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater, schedule, debounce } from '@ember/runloop';
import LingoLinq from '../../app';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import progress_tracker from '../../utils/progress_tracker';
import Subscription from '../../utils/subscription';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import session from '../../utils/session';
import { getOwner } from '@ember/application';
import { readFoldersExpanded } from '../../utils/folders_panel_state';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import {
  filterRootBoards,
  dedupeByName,
  filterBrandSetRootBoards,
  dedupeBoardRows,
  boardsPagePreferUserNames,
  filterBoardsPageTopLevelRoots,
  BOARDS_PAGE_SEARCH_LIMIT
} from '../../utils/board-roots';
import { filterBrandRoots } from '../../utils/board-brands';
import boardDetailCache from '../../utils/board_detail_cache';
import boardsPageListCache from '../../utils/boards_page_list_cache';

function invertBoardTagMap(map) {
  var inv = {};
  if (!map || typeof map !== 'object') { return inv; }
  Object.keys(map).forEach(function(tag) {
    (map[tag] || []).forEach(function(gid) {
      if (!gid) { return; }
      inv[gid] = inv[gid] || [];
      if (inv[gid].indexOf(tag) === -1) {
        inv[gid].push(tag);
      }
    });
  });
  return inv;
}

function allTaggedGlobalIds(map) {
  var s = {};
  if (!map || typeof map !== 'object') { return s; }
  Object.keys(map).forEach(function(tag) {
    (map[tag] || []).forEach(function(gid) {
      if (gid) { s[gid] = true; }
    });
  });
  return s;
}

export default Controller.extend({
  /* Folder drill-in lives in the URL as `?folder=<tag>`.
     WHY A QUERY PARAM rather than a popstate listener: drilling into a folder is a
     view change the user reads as navigation, so the browser Back button has to undo
     it. Back is handled client-side by the Ember router (verified in a browser: an
     in-app transition followed by Back never reloads the document), so a routed
     param gets Back, Forward, refresh-persistence and a shareable URL for free, and
     it does not fight the router's own history handling the way a hand-rolled
     pushState/popstate pair would — this app installs no popstate listener anywhere.

     MAPPED onto the EXISTING `mineTagFolderDrillIn` property rather than adding a new
     one, so all ~8 existing `set('mineTagFolderDrillIn', …)` call sites in
     components/available-boards-section.js keep working untouched and there is no
     second source of truth to keep in sync.

     Default is `null` (declared at `mineTagFolderDrillIn:` below), so the param is
     omitted from the URL entirely until the user actually opens a folder — including
     on `/:user`, which shares this controller and also renders <BoardsBrowser>. Ember
     pushes a history entry for a query-param change by default, which is exactly the
     entry Back needs to pop. */
  queryParams: [{ mineTagFolderDrillIn: 'folder' }],

  store: service('store'),
  router: service('router'),
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  persistence: service('persistence'),

  /* "Help me Choose" on the Boards page hands the board-picker the account it is
     picking for. The picker keys its whole supervisor flow off this `user_id`
     query param (controllers/board-picker#_resolve_setup_user → setup_user →
     for_self → the "Choose <name>'s home board" title and the back link), so a
     supporter on a communicator's Boards page has to arrive with it or the
     picker will run the SELF flow and offer to set THEIR own home board.

     Null on your own page — Ember drops a query param that equals the
     controller's default, so the URL stays a clean /board-picker and the picker
     resolves setup_user to currentUser on its own.

     Global id, not user_name: _resolve_setup_user both does
     `store.findRecord('user', user_id)` and compares the param against
     `setup_user.id`, so a handle would re-resolve on every recompute. */
  homeBoardPickerUserId: computed('model.id', 'appState.currentUser.id', function() {
    var page_user_id = this.get('model.id');
    if(!page_user_id || page_user_id === this.get('appState.currentUser.id')) { return null; }
    return page_user_id;
  }),

  init() {
    this._super(...arguments);
    /* Read the stored folders-panel preference HERE rather than in the class body, so it
       reflects the value at instantiation. `available-boards-section` reads the same
       function in its own `init`, which is what keeps the two in agreement on first paint
       without either writing across the boundary. */
    this.set('mineFoldersPanelExpanded', readFoldersExpanded());
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    this.onNothing = function(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      self.send('nothing');
    };
  },

  // Explicit injection for app_state to avoid implicit injection deprecation warning

  // Explicit injection for persistence to avoid implicit injection deprecation warning

  // Welcome notice ("Watch for an email from us...") shown on boards
  // pages while model.pending. Once the user clicks the close button
  // we flip this flag and the notice hides for the remainder of this
  // controller's lifetime (i.e. until next page load — the notice is
  // a reminder to confirm a pending email, so re-appearing on reload
  // is intentional). See user/index.hbs, user/boards.hbs, and
  // components/dashboard-user-boards.hbs for the consumers.
  welcome_notice_dismissed: false,
  // Pre-computed gate so templates don't need a `(not …)` helper —
  // the codebase only ships `and.js` and `or.js` in app/helpers, so
  // `(not x)` silently fails at render time. Use this in templates
  // via `{{#if this.show_welcome_notice}}` (or
  // `this.boardsCtrl.show_welcome_notice` inside dashboard-user-boards).
  show_welcome_notice: computed('model.pending', 'welcome_notice_dismissed', function() {
    return !!this.get('model.pending') && !this.get('welcome_notice_dismissed');
  }),
  // True when board_list has finished loading and has zero results.
  // Drives the empty-state composition in available-boards-section
  // AND flips the header `+ New Board` pill to `+ Create Your First
  // Board` (boards-browser.hbs + dashboard-user-boards.hbs) so the
  // header CTA aligns with the empty-state message in the body.
  is_boards_empty: computed('board_list', 'board_list.loading', 'board_list.error', 'board_list.results.length', function() {
    var list = this.get('board_list');
    if (!list) { return false; }
    if (list.loading) { return false; }
    if (list.error) { return false; }
    var results = list.results;
    return !results || (results.length || 0) === 0;
  }),

  // Board Stats accordion (user.boards page) — collapsed by default
  // so the stats-row only shows when the user explicitly expands it.
  // Toggled by `toggle_board_stats` in the actions block below.
  board_stats_expanded: false,

  // Count of the user's owned boards that are flagged public — feeds
  // the "N PUBLIC" chip on the Board Stats accordion header. Uses
  // model.my_boards (loaded by the Mine-tab query in update_selected)
  // and `.public` on each board record (always shipped, see
  // lib/json_api/board.rb line 65 — not gated by permissions like
  // `starred` is). Returns 0 until my_boards finishes loading.
  // Dep uses `.[]` to match the existing my_boards computeds on this
  // controller (line 172, 196, 237) — `@each.public` on a non-array
  // value (e.g. Promise during initial render) can throw and break
  // the whole boards page below.
  /* Overlay / hero gate: first Mine page or a completed list (including
     empty). Distinct from my_boards.done, which still waits for the last
     pagination page so copy-cluster and the library-complete hint can
     use the full list. Search itself runs on pages loaded so far. */
  mineListPaintReady: computed(
    'model.my_boards.done',
    'model.my_boards.paint_ready',
    'model.my_boards.loading',
    'model.my_boards.length',
    function() {
      return boardsPageListCache.isPaintReady(this.get('model.my_boards'));
    }
  ),
  public_boards_count: computed('model.my_boards.[]', function() {
    var boards = this.get('model.my_boards');
    if(!boards) { return 0; }
    var arr = (typeof boards.slice === 'function') ? boards.slice()
            : Array.isArray(boards) ? boards
            : null;
    if(!arr) { return 0; }
    var count = 0;
    arr.forEach(function(b) { if(b && b.get && b.get('public')) { count++; } });
    return count;
  }),

  title: computed('model.user_name', function() {
    return "Profile for " + this.get('model.user_name');
  }),
  sync_able: computed('extras.ready', function() {
    return this.get('extras.ready');
  }),
  needs_sync: computed('persistence.last_sync_at', function() {
    var now = (new Date()).getTime();
    var persistenceService = this.get('persistence') || this.persistence;
    if(!persistenceService || typeof persistenceService.get !== 'function') {
      return false;
    }
    var lastSync = persistenceService.get('last_sync_at') || 0;
    return (now - lastSync) > (7 * 24 * 60 * 60 * 1000);
  }),
  check_daily_use: observer('model.user_name', 'model.id', 'model.permissions', 'appState.sessionUser.id', function() {
    if(boardsPageListCache.isBoardsPageActive()) { return; }
    var current_user_name = this.get('daily_use.user_name');
    var user_name = this.get('model.user_name');
    // Don't make request if user_name is undefined or empty
    if(!user_name) {
      return;
    }
    var session_id = this.get('appState.sessionUser.id');
    var is_self = session_id && this.get('model.id') === session_id;
    var is_admin_support = !!this.get('model.permissions.admin_support_actions');
    // Match Api::UsersController#daily_use: own profile or admin-support access only.
    if(!is_self && !is_admin_support) {
      this.set('daily_use', null);
      return;
    }
    if(!this.get('daily_use') || current_user_name !== user_name) {
      var _this = this;
      _this.set('daily_use', {loading: true});
      _this.persistence.ajax('/api/v1/users/' + user_name + '/daily_use', {type: 'GET'}).then(function(data) {
        if(data && data.log) {
          if(data.log.empty_daily_use_log) {
            _this.set('daily_use', {user_name: user_name, daily_use_history: null});
          } else {
            var log = LingoLinq.store.push({ data: {
              id: data.log.id,
              type: 'log',
              attributes: data.log
            }});
            _this.set('daily_use', log);
          }
        } else {
          _this.set('daily_use', null);
        }
      }, function(err) {
        if(err && err.result && err.result.error == 'no data available') {
          _this.set('daily_use', null);
        } else {
          _this.set('daily_use', {error: true});
        }
      });
    }
  }),
  blank_slate: computed(
    'model.preferences.home_board.key',
    'public_boards_shortened',
    'private_boards_shortened',
    'root_boards_shortened',
    'starred_boards_shortened',
    'shared_boards_shortened',
    function() {
      return !this.get('model.preferences.home_board.key') &&
        (this.get('public_boards_shortened') || []).length === 0 &&
        (this.get('private_boards_shortened') || []).length === 0 &&
        (this.get('root_boards_shortened') || []).length === 0 &&
        (this.get('starred_boards_shortened') || []).length === 0 &&
        (this.get('shared_boards_shortened') || []).length === 0;
    }
  ),
  filterStringDebounced: '',
  /** When set, Mine tab shows boards tagged with this folder name (flat folders). */
  mineTagFolderDrillIn: null,

  /* Mirrors the folders panel's expanded/collapsed state from
     components/available-boards-section.js (which owns it, persists it to
     localStorage, and syncs it here). The controller needs it because `board_list`
     hides foldered boards ONLY while the panel is actually presenting them — see the
     tagged-board filter in board_list.

     Initialised from the SAME stored preference the component restores from, so both
     agree on first paint without anyone writing across the boundary mid-render. The
     component's observer carries changes after that.

     Seeded in `init()`, NOT here as a class-body default: a call in the class body runs
     once at MODULE EVAL, in import order, so it froze whatever localStorage held at app
     boot rather than what it holds when this controller is instantiated. `null` here means
     "not yet seeded" and init fills it in. */
  mineFoldersPanelExpanded: null,
  _scheduleFilterDebounce: observer('filterString', function() {
    var _this = this;
    debounce(this, function() {
      if (_this.get('filterString') !== _this.get('filterStringDebounced')) {
        var val = _this.get('filterString');
        runLater(function() {
          _this.set('filterStringDebounced', val);
        }, 0);
      }
    }, 300);
  }),
  /* A `?folder=` value can outlive the folder it names — rename or delete pushes a
     history entry carrying the OLD name, so Back restores a tag that no longer exists.
     Without this the page rendered a folder card titled with the dead name, containing
     zero boards, with live Rename and Delete buttons; and when board_tag_map was empty
     the drill filter was skipped entirely so the FULL board list rendered inside a card
     labelled with the bogus folder.

     Only clears once the map has actually loaded and is non-empty — an absent map means
     "not fetched yet", and clearing then would break a legitimate deep link. */
  _clearStaleFolderDrillIn: observer('mineTagFolderDrillIn', 'model.board_tag_map', function() {
    var tag = this.get('mineTagFolderDrillIn');
    if(!tag) { return; }
    var map = this.get('model.board_tag_map');
    if(!map || Object.keys(map).length === 0) { return; }
    if(!map[tag]) { this.set('mineTagFolderDrillIn', null); }
  }),

  mineFoldersEnabled: computed(
    'selected',
    'parent_object',
    'model.board_tag_map',
    'model.permissions.edit',
    function() {
      if (this.get('parent_object')) { return false; }
      var sel = this.get('selected');
      if (sel && sel !== 'mine') { return false; }
      if (this.get('model.permissions.edit')) { return true; }
      var m = this.get('model.board_tag_map');
      return !!(m && typeof m === 'object' && Object.keys(m).length > 0);
    }
  ),
  allBoardsCategorized: computed(
    'model.board_tag_map',
    'model.my_boards.[]',
    'mineFoldersEnabled',
    function() {
      if (!this.get('mineFoldersEnabled')) { return false; }
      var map = this.get('model.board_tag_map');
      if (!map || typeof map !== 'object') { return false; }
      var allIds = {};
      Object.keys(map).forEach(function(tag) {
        (map[tag] || []).forEach(function(gid) { allIds[gid] = true; });
      });
      var boards = this.get('model.my_boards');
      if (!boards || !boards.length) { return false; }
      var allCategorized = true;
      boards.forEach(function(b) {
        var gid = b && b.get ? b.get('id') : null;
        if (gid && !allIds[gid]) { allCategorized = false; }
      });
      return allCategorized;
    }
  ),
  /** Sorted folder rows: { tag, count } for strip. When the main boards
     filter is active, hide folders with zero matching root boards. */
  mineTagFolderSummaries: computed(
    'model.board_tag_map',
    'filterStringDebounced',
    'boardsPageSearchRows.[]',
    function() {
      var map = this.get('model.board_tag_map');
      if (!map || typeof map !== 'object') { return []; }
      var filter = (this.get('filterStringDebounced') || '').trim();
      var q = filter ? filter.toLowerCase() : null;
      var haystackById = null;
      if (q) {
        haystackById = Object.create(null);
        (this.get('boardsPageSearchRows') || []).forEach(function(row) {
          var b = row.board;
          if (!b || !b.get) { return; }
          var gid = b.get('global_id');
          if (gid) { haystackById[gid] = row.haystack; }
          var bid = b.get('id');
          if (bid && bid !== gid) { haystackById[bid] = row.haystack; }
        });
      }
      var keys = Object.keys(map).sort();
      var res = [];
      var _this = this;
      keys.forEach(function(tag) {
        var ids = map[tag] || [];
        if (q) {
          var show = tag.toLowerCase().indexOf(q) >= 0;
          var cnt = 0;
          ids.forEach(function(gid) {
            if (!_this._isMineBoardRoot(gid)) { return; }
            var hay = haystackById && haystackById[gid];
            if (hay && hay.indexOf(q) >= 0) {
              show = true;
              cnt++;
            }
          });
          if (!show || cnt === 0) { return; }
          res.push({ tag: tag, count: cnt });
        } else {
          var unfilteredCnt = 0;
          ids.forEach(function(gid) {
            if (_this._isMineBoardRoot(gid)) { unfilteredCnt++; }
          });
          res.push({ tag: tag, count: unfilteredCnt });
        }
      });
      return res;
    }
  ),
  myBoardsByGlobalIdMap: computed('model.my_boards.[]', function() {
    var boards = this.get('model.my_boards') || [];
    var map = Object.create(null);
    if (!boards.forEach) { return map; }
    boards.forEach(function(b) {
      if (b && b.get) {
        var gid = b.get('global_id');
        if (gid !== undefined && gid !== null) {
          map[gid] = b;
        }
      }
    });
    return map;
  }),
  boardTagMapInverted: computed('model.board_tag_map', function() {
    return invertBoardTagMap(this.get('model.board_tag_map'));
  }),
  /** Pre-lowercased haystacks for live boards-page filter (built once per tab list). */
  boardsPageSearchRows: computed(
    'boards_page_raw_list.[]',
    'boardTagMapInverted',
    function() {
      var rawList = this.get('boards_page_raw_list') || [];
      var gidToTags = this.get('boardTagMapInverted') || {};
      var rows = [];
      for (var i = 0; i < rawList.length; i++) {
        var b = rawList[i];
        if (!b || !b.get) { continue; }
        var haystack = (b.get('search_string') || '').toLowerCase();
        var gid = b.get('global_id');
        var tags = gidToTags[gid];
        if (tags && tags.length) {
          haystack = haystack + ' ' + tags.join(' ').toLowerCase();
        }
        rows.push({ board: b, haystack: haystack });
      }
      return rows;
    }
  ),
  _findMineBoardByGlobalId: function(gid) {
    var map = this.get('myBoardsByGlobalIdMap');
    if (!map) { return null; }
    return Object.prototype.hasOwnProperty.call(map, gid) ? map[gid] : null;
  },
  /* Visible-tile root boards for the BOARDS chip on the boards page and
     the dashboard summary. Mirrors the folder-count methodology fixed
     in mineTagFolderSummaries: enumerate what the user actually sees
     as a TILE, not the raw my_boards (which includes every sub-board
     copy in the user's library, inflating 14 visible roots to 419
     records). Filter logic lives in utils/board-roots so the home
     dashboard can apply the same clustering against its own fetched
     pool. Returns an empty array while my_boards is still loading. */
  myBoardsRoots: computed('model.my_boards.[]', 'model.id', function() {
    // filterBoardsPageTopLevelRoots = filterBrandSetRootBoards(filterRootBoards(...)) —
    // the #375 consolidation of copy_id root filtering + brand key-pattern filtering, so
    // the count/folder summaries match the grid (drops copy_id-less brand sub-boards too).
    return filterBoardsPageTopLevelRoots(this.get('model.my_boards'), this.get('model.id'));
  }),
  myBoardsTileCount: computed('myBoardsRoots.[]', function() {
    return (this.get('myBoardsRoots') || []).length;
  }),
  /* Set keyed by global_id (and id when distinct) of every my_boards
     root. Lets folder UIs answer "is this tagged id a root, or a
     sub-board copy that came along via downstream tagging?" in O(1).
     A board tagged with the "include sub-boards" checkbox stores its
     root gid + every downstream_board_id in board_tag_map, so without
     this filter every folder display over-counts the same vocab set
     once per page in its tree. */
  myBoardsRootGidSet: computed('myBoardsRoots.[]', function() {
    var roots = this.get('myBoardsRoots') || [];
    var set = Object.create(null);
    roots.forEach(function(b) {
      if (!b || !b.get) { return; }
      var gid = b.get('global_id');
      if (gid) { set[gid] = true; }
      var bid = b.get('id');
      if (bid && bid !== gid) { set[bid] = true; }
    });
    return set;
  }),
  _isMineBoardRoot: function(gid) {
    if (!gid) { return false; }
    var set = this.get('myBoardsRootGidSet');
    return !!(set && set[gid]);
  },
  /* Split of myBoardsTileCount across folders vs the unfiled grid. A
     root is "in folders" when its global_id (or id) appears in ANY
     folder's id list in board_tag_map; otherwise it's "unfiled" and
     renders directly in the BOARDS grid. The two always sum to the
     total. Drives the dual-stat chip rendered in the BOARDS section
     header (see available-boards-section.hbs). */
  myBoardsInFoldersCount: computed('myBoardsRoots.[]', 'model.board_tag_map', function() {
    var roots = this.get('myBoardsRoots') || [];
    var tagMap = this.get('model.board_tag_map');
    if (!roots.length || !tagMap || typeof tagMap !== 'object' || !Object.keys(tagMap).length) {
      return 0;
    }
    var taggedSet = allTaggedGlobalIds(tagMap);
    var cnt = 0;
    roots.forEach(function(b) {
      if (!b || !b.get) { return; }
      var gid = b.get('global_id');
      if (gid && taggedSet[gid]) { cnt++; return; }
      var bid = b.get('id');
      if (bid && bid !== gid && taggedSet[bid]) { cnt++; }
    });
    return cnt;
  }),
  /* True when the user's home board is tagged into at least one
     folder. board_list always keeps the home visible in the main
     boards grid (so the page never reads as a dead end), so a tagged
     home renders TWICE — once inside its folder, once in the unfiled
     grid. Both myBoardsUnfiledCount's +1 and the info-icon affordance
     in the BOARDS header read from this. */
  homeBoardIsTagged: computed(
    'myBoardsRoots.[]',
    'model.board_tag_map',
    'model.preferences.home_board.key',
    function() {
      var homeKey = this.get('model.preferences.home_board.key');
      if (!homeKey) { return false; }
      var tagMap = this.get('model.board_tag_map');
      if (!tagMap || typeof tagMap !== 'object' || !Object.keys(tagMap).length) {
        return false;
      }
      var taggedSet = allTaggedGlobalIds(tagMap);
      var roots = this.get('myBoardsRoots') || [];
      return roots.some(function(b) {
        if (!b || !b.get) { return false; }
        if (b.get('key') !== homeKey) { return false; }
        var gid = b.get('global_id');
        if (gid && taggedSet[gid]) { return true; }
        var bid = b.get('id');
        if (bid && bid !== gid && taggedSet[bid]) { return true; }
        return false;
      });
    }
  ),
  myBoardsUnfiledCount: computed(
    'myBoardsTileCount',
    'myBoardsInFoldersCount',
    'homeBoardIsTagged',
    function() {
      var total = this.get('myBoardsTileCount') || 0;
      var inFolders = this.get('myBoardsInFoldersCount') || 0;
      var unfiled = Math.max(0, total - inFolders);
      /* Tagged home renders as a duplicate tile in this section per the
         board_list home-board exemption — add 1 so the pill matches the
         number of tiles the user actually sees. */
      return this.get('homeBoardIsTagged') ? unfiled + 1 : unfiled;
    }
  ),
  boards_page_raw_list: computed(
    'selected',
    'parent_object',
    'model.my_boards',
    'model.my_boards.length',
    'model.public_boards',
    'model.public_boards.length',
    'model.private_boards',
    'model.private_boards.length',
    'model.root_boards',
    'model.root_boards.length',
    'model.starred_boards',
    'model.starred_boards.length',
    'model.shared_boards',
    'model.shared_boards.length',
    'model.tagged_boards',
    'model.prior_home_boards',
    function() {
      if (this.get('parent_object')) { return null; }
      var list = [];
      var sel = this.get('selected');
      if (sel === 'mine' || !sel) { list = this.get('model.my_boards'); }
      else if (sel === 'public') { list = this.get('model.public_boards'); }
      else if (sel === 'private') { list = this.get('model.private_boards'); }
      else if (sel === 'root') { list = this.get('model.root_boards'); }
      else if (sel === 'starred') { list = this.get('model.starred_boards'); }
      else if (sel === 'shared') { list = this.get('model.shared_boards'); }
      else if (sel === 'tagged') { list = this.get('model.tagged_boards'); }
      else if (sel === 'prior_home') { list = this.get('model.prior_home_boards'); }
      list = list || [];
      if (list.loading || list.error) { return []; }
      return list;
    }
  ),
  boardsPageSearchState: computed(
    'filtered_results',
    'filterStringDebounced',
    'boardsPageSearchRows.[]',
    'parent_object',
    'mineTagFolderDrillIn',
    'boards_page_raw_list',
    'boards_page_raw_list.done',
    'model.my_boards.done',
    'model.public_boards.done',
    function() {
      /* Folder drill-in hides the Boards Filter UI but keeps any
         prior filterStringDebounced — show the folder grid only. */
      if (this.get('mineTagFolderDrillIn')) {
        return { results: this.get('filtered_results') || [], truncated: false, incomplete: false };
      }
      var filter = (this.get('filterStringDebounced') || '').trim();
      if (!filter) {
        return { results: this.get('filtered_results') || [], truncated: false, incomplete: false };
      }
      var q = filter.toLowerCase();
      var rows = this.get('boardsPageSearchRows') || [];
      var matches = [];
      var truncated = false;
      var sourceList = this.get('boards_page_raw_list') || [];
      var incomplete = !sourceList.done;
      if (rows.length) {
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].haystack.indexOf(q) === -1) { continue; }
          if (matches.length >= BOARDS_PAGE_SEARCH_LIMIT) {
            truncated = true;
            break;
          }
          matches.push({ board: rows[i].board, children: [] });
        }
        return { results: matches, truncated: truncated, incomplete: incomplete };
      }
      var fallbackRows = this.get('filtered_results') || [];
      for (var j = 0; j < fallbackRows.length; j++) {
        var row = fallbackRows[j];
        if (!row || !row.board || !row.board.get) { continue; }
        var haystack = (row.board.get('search_string') || '').toLowerCase();
        if (haystack.indexOf(q) === -1) { continue; }
        if (matches.length >= BOARDS_PAGE_SEARCH_LIMIT) {
          truncated = true;
          break;
        }
        matches.push({ board: row.board, children: row.children || [] });
      }
      return { results: matches, truncated: truncated, incomplete: incomplete };
    }
  ),
  boards_page_visible_results: computed('boardsPageSearchState', function() {
    var state = this.get('boardsPageSearchState');
    return (state && state.results) || [];
  }),
  boards_page_search_truncated: computed('boardsPageSearchState', function() {
    var state = this.get('boardsPageSearchState');
    return !!(state && state.truncated);
  }),
  boards_page_search_incomplete: computed('boardsPageSearchState', function() {
    var state = this.get('boardsPageSearchState');
    return !!(state && state.incomplete);
  }),
  boards_page_search_limit: computed(function() {
    return BOARDS_PAGE_SEARCH_LIMIT;
  }),
  board_list: computed(
    'selected',
    'parent_object',
    'show_all_boards',
    'boards_display_limit',
    // 'filterString',
    'model.id',
    'model.board_tag_map',
    'mineTagFolderDrillIn',
    'mineFoldersPanelExpanded',
    'model.my_boards',
    'model.prior_home_boards',
    'model.public_boards',
    'model.private_boards',
    'model.root_boards',
    'model.starred_boards',
    'model.shared_boards',
    'model.tagged_boards',
    'model.my_boards.length',
    'model.prior_home_boards.length',
    'model.public_boards.length',
    'model.private_boards.length',
    'model.root_boards.length',
    'model.starred_boards.length',
    'model.shared_boards.length',
    function() {
      var list = [];
      var res = {remove_type: 'delete', remove_label: i18n.t('delete_lower', "delete"), remove_icon: 'glyphicon glyphicon-trash'};
      var cluster_orphans = false;
      // Brand-family SUB-boards (e.g. CommuniKate "alcohol"/"bodyparts" pages)
      // ride along in both the owned library (Mine) and the public search
      // (Public). filterRootBoards can't drop them when the records have no
      // copy_id, so `brand_clean` flags these tabs to run filterBrandRoots
      // (key-pattern roots-only, the same classifier the Find Boards grouping +
      // speak-menu brand sections use). Public additionally clusters/dedupes.
      var root_dedupe = false;
      var brand_clean = false;
      if(this.get('selected') == 'mine' || !this.get('selected')) {
        list = this.get('model.my_boards');
        cluster_orphans = true;
        brand_clean = true;
      } else if(this.get('selected') == 'public') {
        list = this.get('model.public_boards');
        root_dedupe = true;
        brand_clean = true;
      } else if(this.get('selected') == 'private') {
        list = this.get('model.private_boards');
      } else if(this.get('selected') == 'root') {
        list = this.get('model.root_boards');
      } else if(this.get('selected') == 'starred') {
        list = this.get('model.starred_boards');
        res.remove_type = 'unstar';
        res.remove_label = i18n.t('unstar', "un-like");
        res.remove_icon = 'md-icon-heart';
      } else if(this.get('selected') == 'shared') {
        list = this.get('model.shared_boards');
        res.remove_type = 'unlink';
        res.remove_label = i18n.t('unlink', "unlink");
        res.remove_icon = 'glyphicon glyphicon-remove';
      } else if(this.get('selected') == 'tagged') {
        list = this.get('model.tagged_boards');
        res.remove_type = 'untag';
        res.remove_label = i18n.t('unlink', "unlink");
        res.remove_icon = 'glyphicon glyphicon-remove';
      } else if(this.get('selected') == 'prior_home') {
        list = this.get('model.prior_home_boards');
      }
      list = list || [];
      if(list.loading || list.error) { return list; }

      // Drop brand sub-boards (Mine + Public), then for Public also cluster to
      // root tiles + collapse same-name duplicates. filterBrandRoots is the
      // roots-only key-pattern filter that catches copy_id-less brand pages;
      // it leaves non-brand boards (and the Mine tab's copy_id nesting below)
      // untouched, so Mine keeps grouping real copies under their root. `.done`
      // is preserved so the show-all / pagination branch keeps working.
      // NOTE (security review false-positive — "data-isolation bypass"): this is a pure
      // client-side DISPLAY filter over model.my_boards / model.public_boards — boards
      // the server already authorized + scoped to this user. It only HIDES rows (brand
      // sub-boards), never fetches or widens the set, so it can't cross account/org
      // boundaries; isolation stays enforced server-side where the model was built.
      if(brand_clean && !this.get('parent_object')) {
        var was_done = list.done;
        list = filterBrandRoots(list);
        if(root_dedupe) {
          list = dedupeByName(filterRootBoards(list, this.get('model.id')), {
            preferUserNames: boardsPagePreferUserNames(this.get('appState'))
          });
        }
        list.done = was_done;
      }

      if(this.get('parent_object')) {
        list = [];
        var parentBoard = this.get('parent_object.board');
        if (parentBoard) {
          list.push({ board: parentBoard });
        }
        (this.get('parent_object.children') || []).forEach(function(b) {
          if (b && b.board) {
            list.push({ board: b.board });
          }
        });
        list.done = true;
        res.sub_result = true;
      }

      res.results = list;
      var board_ids = {};
      var new_list = [];
      var _this = this;
      if(this.get('parent_object')) {
        list.forEach(function(ref) {
          if (!ref || !ref.board) { return; }
          var parentObjBoard = _this.get('parent_object.board');
          var parentId = parentObjBoard && emberGet(parentObjBoard, 'id');
          if (emberGet(ref.board, 'id') == parentId) {
            ref.str = "a " + ref.board.name;
          } else {
            ref.str = "b" + (parseInt(ref.board.name, 10) || 0).toString().padStart(6, '0') + ' ' + ref.board.name.toLowerCase();
          }
        });
        new_list = list.sort(function(a, b) { return a.str.localeCompare(b.str); });
      } else {
        var copies = {};
        var roots = [];
        var shallow_roots = {};
        list.forEach(function(b) {
          if (!b) { return; }
          var bidRaw = emberGet(b, 'id');
          if (bidRaw == null || bidRaw === '') { return; }
          var bid = String(bidRaw);
          if(bid.match(/-/) && (!emberGet(b, 'copy_id') || emberGet(b, 'copy_id') == bid || emberGet(b, 'copy_id') == bid.split(/-/)[0])) {
            var user_id = bid.split(/-/)[1];
            if(user_id == _this.get('model.id')) {
              shallow_roots[emberGet(b, 'copy_id') || bid.split(/-/)[0]] = b;
            }
          }
        });
        list.forEach(function(b) {
          if (!b) { return; }
          var bidRaw2 = emberGet(b, 'id');
          if (bidRaw2 == null || bidRaw2 === '') { return; }
          var bid = String(bidRaw2);
          if(bid.match(/-/) && bid.split(/-/)[1] == _this.get('model.id') && emberGet(b, 'copy_id') && shallow_roots[emberGet(b, 'copy_id')]) {
            // Shallow clones are a little trickier to get added as sub-boards to their root
            var shallow = shallow_roots[emberGet(b, 'copy_id')];
            copies[emberGet(shallow, 'id')] = copies[emberGet(shallow, 'id')] || [];
            copies[emberGet(shallow, 'id')].push(b);
          } else if(emberGet(b, 'copy_id') && emberGet(b, 'copy_id') != bid) {
            var copy_id = emberGet(b, 'copy_id');
            copies[copy_id] = copies[copy_id] || [];
            copies[copy_id].push(b);
          } else {
            roots.push(b);
          }
        });
        roots.forEach(function(b) {
          if (!b) { return; }
          var obj = {board: b, children: []};
          var id = emberGet(b, 'id');
          if(copies[id]) {
            copies[id].forEach(function(c) { obj.children.push({board: c})});
            delete copies[id];
          }
          new_list.push(obj);
          // board_ids[emberGet(b, 'id')] = obj;
          // if(emberGet(b, 'copy_id') && board_ids[b.get('copy_id')]) {
          //   board_ids[b.get('copy_id')].children.push({board: b});
          // } else {
          //   new_list.push(obj);
          // }
        });
        new_list.forEach(function(ref) {
          if(ref.board && ref.board.sort_score != null) {
            ref.str = (99999999 - ref.board.sort_score).toString().padStart(8, '0') + ' ';
            ref.str = ref.str + (parseInt(ref.board.name, 10) || 0).toString().padStart(6, '0') + ' ';
            ref.str = ref.str + ref.board.name;
          } else {
            ref.str = "99999999 " + (ref.board || {}).name;
          }
        });
        /* Public tab keeps the server's popularity / query order — only
           Mine and other grouped tabs use the legacy str sort here
           (Mine re-sorts again below for home/star/alpha). */
        if (this.get('selected') !== 'public') {
          new_list = new_list.sort(function(a, b) { return a.str.localeCompare(b.str); });
        }
        // TODO: sort this list on something better than just id
        for(var id in copies) {
          if(cluster_orphans) {
            var obj = {
              board: LingoLinq.store.createRecord('board', {name: "Orphan Boards id:" + id}),
              children: [],
              orphan: true
            };
            copies[id].forEach(function(c) { obj.children.push({board: c})});
            new_list.push(obj);  
          } else {
            copies[id].forEach(function(c) {
              new_list.push({board: c, children: []});
            });
          }
        }
        // list.forEach(function(b) {
        //   var obj = {board: b, children: []};
        //   board_ids[emberGet(b, 'id')] = obj;
        //   if(emberGet(b, 'copy_id') && board_ids[b.get('copy_id')]) {
        //     board_ids[b.get('copy_id')].children.push({board: b});
        //   } else {
        //     new_list.push(obj);
        //   }
        // });
      }
      if (cluster_orphans && !this.get('parent_object')) {
        var tagMap = this.get('model.board_tag_map');
        if (tagMap && typeof tagMap === 'object' && Object.keys(tagMap).length > 0) {
          var drill = this.get('mineTagFolderDrillIn');
          var taggedSet = allTaggedGlobalIds(tagMap);
          var idsInDrill = {};
          if (drill) {
            (tagMap[drill] || []).forEach(function(gid) {
              if (gid) { idsInDrill[gid] = true; }
            });
          }
          var isTagged = function(board) {
            if (!board || !board.get) { return false; }
            var gid = board.get('global_id');
            if (gid && taggedSet[gid]) { return true; }
            var bid = board.get('id');
            if (bid && bid !== gid && taggedSet[bid]) { return true; }
            return false;
          };
          var isInDrill = function(board) {
            if (!board || !board.get) { return false; }
            var gid = board.get('global_id');
            if (gid && idsInDrill[gid]) { return true; }
            var bid = board.get('id');
            if (bid && bid !== gid && idsInDrill[bid]) { return true; }
            return false;
          };
          if (drill) {
            /* Drilled-in folder view: render only ROOT tiles that are
               tagged into this folder. Sub-board copies that came
               along via the "include sub-boards" checkbox at tag time
               are NOT shown as separate tiles — they belong to their
               root's tree and the user navigates into them by clicking
               the root, not by listing them flat. Orphan rows (clusters
               whose root isn't in my_boards) are dropped here too;
               they're synthetic display rows, never user-tagged units. */
            new_list = new_list.filter(function(row) {
              if (row.orphan) { return false; }
              if (!row.board || !row.board.get) { return false; }
              return isInDrill(row.board);
            });
            // Children stay nested under their root, exactly as in the
            // main boards grid — no flattening, no second render.
          } else if (this.get('mineFoldersEnabled') && this.get('mineFoldersPanelExpanded')) {
            /* Foldered boards are held out of the main grid ONLY while the folders
               panel is open — filing a board into a folder MOVES it there, so showing a
               second loose copy in the grid would defeat the point.

               When the panel is COLLAPSED (or folders are not enabled on this tab) the
               grid is the only view of the library on the page, so holding boards out of
               it makes them unreachable with nothing on screen to hint they exist. That
               is exactly what "the folder content disappears" was: collapsing the panel
               from inside a folder both exited the folder and hid everything filed in
               one. A board with no untagged twin — and that is not the home board, which
               is exempted below — vanished from the page entirely.

               So the exclusion is scoped to the state where folders are visibly the
               alternative home for those boards. Same condition the template uses to
               decide whether the drilled-in grid is rendering at all, which keeps the
               two in agreement. */
            /* Home board must ALWAYS render in the main boards grid,
               even when categorized into a folder — it's the user's
               anchor board and hiding it behind a folder turns the
               boards page into a dead end on first paint. The folder
               still shows the home board (drilled-in view keeps it),
               so this just keeps a parallel copy out here. */
            var homeKey = this.get('model.preferences.home_board.key');
            var isHomeBoard = function(board) {
              if (!homeKey || !board || !board.get) { return false; }
              return board.get('key') === homeKey;
            };
            new_list = new_list.filter(function(row) {
              if (row.orphan) { return true; }
              if (!row.board || !row.board.get) { return true; }
              if (isHomeBoard(row.board)) { return true; }
              return !isTagged(row.board);
            });
            // Also filter tagged children out of grouped rows
            new_list.forEach(function(row) {
              if (row.children && row.children.length) {
                row.children = row.children.filter(function(child) {
                  if (isHomeBoard(child.board)) { return true; }
                  return !isTagged(child.board);
                });
              }
            });
          }
        }
      }
      /* Mine-tab sort: Home Board first, then liked/favorite boards
         alphabetically by name, then everything else alphabetically.
         Mirrors the My Boards modal Mine-tab order. Scoped to the
         Mine tab only — other tabs (Public, Liked, Root, Shared,
         etc.) keep the server's `home_popularity`/`popularity` order. */
      if(this.get('selected') == 'mine' || !this.get('selected')) {
        var homeKey = this.get('model.preferences.home_board.key');
        new_list = new_list.sort(function(a, b) {
          var aBoard = a && a.board;
          var bBoard = b && b.board;
          if(!aBoard || !aBoard.get) { return 1; }
          if(!bBoard || !bBoard.get) { return -1; }
          var aIsHome = aBoard.get('key') === homeKey;
          var bIsHome = bBoard.get('key') === homeKey;
          if(aIsHome && !bIsHome) { return -1; }
          if(bIsHome && !aIsHome) { return 1; }
          /* `starred_for_current_user` falls back to the user's
             stats.starred_board_refs since list-loaded boards don't
             ship `starred` (see lib/json_api/board.rb). */
          var aStar = aBoard.get('starred_for_current_user');
          var bStar = bBoard.get('starred_for_current_user');
          if(aStar && !bStar) { return -1; }
          if(bStar && !aStar) { return 1; }
          var aName = (aBoard.get('name') || '').toLowerCase();
          var bName = (bBoard.get('name') || '').toLowerCase();
          return aName.localeCompare(bName);
        });
      }
      /* Default grid only — search uses boards_page_raw_list and bypasses
         this dedup. Both tabs: brand-set roots + same-name collapse. Mine
         also drops owned copy-set sub-boards via filterRootBoards first. */
      if (!this.get('parent_object')) {
        var selectedTab = this.get('selected');
        var preferOwners = boardsPagePreferUserNames(this.get('appState'));
        if (selectedTab === 'public') {
          var publicRootIds = Object.create(null);
          filterBrandSetRootBoards(new_list.map(function(row) {
            return row && row.board;
          })).forEach(function(b) {
            if (b) { publicRootIds[String(emberGet(b, 'id'))] = true; }
          });
          new_list = new_list.filter(function(row) {
            if (!row || !row.board) { return false; }
            return publicRootIds[String(emberGet(row.board, 'id'))];
          });
          new_list = dedupeBoardRows(new_list, { preferUserNames: preferOwners });
        } else if (selectedTab === 'mine' || !selectedTab) {
          /* Folder drill-in already scoped new_list to tagged roots in
             this folder — re-applying the top-level root filter would
             drop tagged tiles whose ids are global_ids not present in
             filterBoardsPageTopLevelRoots(list). */
          if (!this.get('mineTagFolderDrillIn')) {
            var mineRootIds = Object.create(null);
            filterBoardsPageTopLevelRoots(list, this.get('model.id')).forEach(function(b) {
              if (b) { mineRootIds[String(emberGet(b, 'id'))] = true; }
              var rootGid = b && emberGet(b, 'global_id');
              if (rootGid) { mineRootIds[String(rootGid)] = true; }
            });
            new_list = new_list.filter(function(row) {
              if (row && row.orphan) { return true; }
              if (!row || !row.board) { return false; }
              var rowId = String(emberGet(row.board, 'id'));
              var rowGid = emberGet(row.board, 'global_id');
              if (mineRootIds[rowId]) { return true; }
              if (rowGid && mineRootIds[String(rowGid)]) { return true; }
              return false;
            });
          }
          new_list = dedupeBoardRows(new_list, { preferUserNames: preferOwners });
        }
      }
      /* Orphan CLUSTER rows are synthetic placeholders that the Boards page does NOT
         render (components/available-boards-section.js#showOrphanClusters is false, and
         the template skips them). They were still counted here, so a page could show
         well under 18 tiles while "More" remained visible and each click revealed fewer
         boards than expected. Drop them BEFORE the slice so the counts match what the
         user actually sees. If showOrphanClusters is ever flipped back on, this filter
         has to come off with it — they are one decision. */
      new_list = (new_list || []).filter(function(row) { return !(row && row.orphan); });
      /* if(this.get('filterString')) {
        var re = new RegExp(this.get('filterString'), 'i');
        new_list = new_list.filter(function(i) {
          return i.board.get('search_string').match(re) || i.children.find(function(c)  { return c.board.get('search_string').match(re); });
        });
        res.filtered_results = new_list.slice(0, 18);
      } else */ if(this.get('show_all_boards')) {
        var limit = this.get('boards_display_limit') || new_list.length;
        res.filtered_results = new_list.slice(0, limit);
        res.has_more = new_list.length > limit;
      } else {
        if(list.done && new_list && new_list.length <= 18) {
          this.set_show_all_boards();
        }
        res.filtered_results = new_list.slice(0, 18);
        res.has_more = new_list.length > 18;
      }
      res.filtered_results_key = (res.filtered_results || []).map(function(row) {
        var boardId = row && row.board && emberGet(row.board, 'id');
        var rowId = row && row.id;
        var keyId = rowId || boardId || '';
        var kids = (row && row.children) || [];
        return keyId + kids.length;
      }).join(',');
      return res;
    }
  ),
  update_filtered_results: observer('board_list.filtered_results_key', function() {
    var last_key = this.get('last_filtered_results_key');
    if(last_key != this.get('board_list.filtered_results_key')) {
      this.set('last_filtered_results_key', this.get('board_list.filtered_results_key'));
      this.set('filtered_results', this.get('board_list.filtered_results'));       
    }
  }),
  set_show_all_boards: function() {
    this.set('show_all_boards', true);
  },
  reload_logs: observer('persistence.online', 'model.permissions', function() {
    if(!this || typeof this.get !== 'function') { return; }
    if(boardsPageListCache.isBoardsPageActive()) { return; }
    var _this = this;
    var persistenceService = this.get('persistence') || this.persistence;
    if(!persistenceService || typeof persistenceService.get !== 'function' || !persistenceService.get('online')) { return; }
    var model_id = this.get('model.id');
    // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
    if(model_id && (model_id == 'cache' || model_id.toString().match(/^cache:/))) {
      return;
    }
    var perms = this.get('model.permissions');
    if(!perms || !perms.supervise) {
      if(this.get('model')) {
        this.set('model.logs', []);
      }
      return;
    }
    if(!(_this.get('model.logs') || {}).length) {
      if(this.get('model')) {
        this.set('model.logs', {loading: true});
      }
    }
    this.store.query('log', {user_id: model_id, per_page: 4}).then(function(logs) {
      if(_this.get('model')) {
        _this.set('model.logs', logs.slice(0,4));
      }
    }, function() {
      if(!(_this.get('model.logs') || {}).length) {
        if(_this.get('model')) {
          _this.set('model.logs', {error: true});
        }
      }
    });
  }),
  load_badges: observer('model.permissions', function() {
    if(boardsPageListCache.isBoardsPageActive()) { return; }
    if(this.get('model.permissions')) {
      var _this = this;
      if(!(_this.get('model.badges') || {}).length) {
        _this.set('model.badges', {loading: true});
      }
      this.store.query('badge', {user_id: this.get('model.id'), earned: true, per_page: 4}).then(function(badges) {
        _this.set('model.badges', badges);
      }, function(err) {
        if(!(_this.get('model.badges') || {}).length) {
          _this.set('model.badges', {error: true});
        }
      });
    }
  }),
  load_goals: observer('model.permissions', function() {
    if(boardsPageListCache.isBoardsPageActive()) { return; }
    if(this.get('model.permissions')) {
      var _this = this;
      if(!(_this.get('model.goals') || {}).length) {
        _this.set('model.goals', {loading: true});
      }
      this.store.query('goal', {user_id: this.get('model.id'), per_page: 3}).then(function(goals) {
        _this.set('model.goals', goals.slice().filter(function(g) { return g.get('active'); }));
      }, function(err) {
        if(!(_this.get('model.goals') || {}).length) {
          _this.set('model.goals', {error: true});
        }
      });
    }
  }),
  subscription: computed(
    'model.permissions.admin_support_actions',
    'model.subscription',
    function() {
      if(this.get('model.permissions.admin_support_actions') && this.get('model.subscription')) {
        var sub = Subscription.create({user: this.get('model')});
        sub.reset();
        return sub;
      }
    }
  ),
  generate_or_append_to_list: function(args, list_name, list_id, append) {
    var _this = this;
    if(list_id != _this.get('list_id')) { return; }
    /* Default to the server's MAX_PAGE (50, per lib/json_api/board.rb).
       The server caps higher values to 50 anyway, so asking for 50 up
       front halves request count vs the prior implicit default of 25
       — a power user with ~250 boards goes from 10 paginated round-
       trips to 5. Honor an explicit per_page if a caller sets one. */
    if(!args.per_page) { args.per_page = 50; }
    var prior = _this.get(list_name) || [];
    if(prior.error || prior.loading) { prior = []; }
    /* When a usable completed list is already on screen (SPA re-entry or
       localStorage hydrate), keep it painted and accumulate pages in a
       side buffer. Assigning partial pages onto list_name would clear
       `.done` and re-trigger the boards-page overlay. */
    var backgroundRefresh = boardsPageListCache.isUsableList(prior);
    var bufferKey = list_name + ':' + list_id;
    var isMineList = list_name === 'model.my_boards';
    /* Within TTL, a usable on-screen Mine list + fresh localStorage
       snapshot means skip the full-library re-download — the point of the snapshot is to
       avoid re-fetching a whole library on every visit (a ~250-board account is 5
       paginated round-trips).

       KNOWN BOUND, stated rather than implied: this skips the query ENTIRELY, so the list
       is only as fresh as the last thing that invalidated the snapshot. Local mutations do
       invalidate it — create, delete, copy, remove and now RENAME (which changes a tile's
       `key`, so a stale tile would 404). A change made on ANOTHER DEVICE does not, and
       cannot: there is no signal here to notice it. Such a change surfaces after the TTL
       expires, or after any local mutation. That is the deliberate trade; do not read this
       branch as "the list is current". */
    if(isMineList && !append && backgroundRefresh && boardsPageListCache.hasFreshSnapshot(_this.get('model.id'))) {
      boardsPageListCache.setMineListBusy(false);
      return;
    }
    /* Do not clobber a usable empty list (`[].done`) with {loading:true}. */
    if(!append && !backgroundRefresh && !prior.length) {
      _this.set(list_name, {loading: true});
    }
    if(!append && backgroundRefresh) {
      _this._boards_list_refresh_buffers = _this._boards_list_refresh_buffers || {};
      _this._boards_list_refresh_buffers[bufferKey] = [];
    }
    if(isMineList && !append) {
      boardsPageListCache.setMineListBusy(true);
    }
    _this.store.query('board', args).then(function(boards) {
      /* Stale page for a superseded list_id: do not clear Mine busy —
         a newer Mine fetch may own the flag. */
      if(_this.get('list_id') != list_id) { return; }

      var chunk = boards.slice();
      var meta = _this.persistence.meta('board', boards); //_this.store.metadataFor('board');

      if(backgroundRefresh) {
        var buf = (_this._boards_list_refresh_buffers && _this._boards_list_refresh_buffers[bufferKey]) || [];
        if(append && buf.length) {
          buf = buf.concat(chunk);
        } else {
          buf = chunk;
        }
        buf.user_id = _this.get('model.id');
        _this._boards_list_refresh_buffers = _this._boards_list_refresh_buffers || {};
        _this._boards_list_refresh_buffers[bufferKey] = buf;
        if(meta && meta.more) {
          args.per_page = meta.per_page;
          args.offset = meta.next_offset;
          runLater(function() {
            if(_this.isDestroyed || _this.isDestroying) { return; }
            _this.generate_or_append_to_list(args, list_name, list_id, true);
          }, 200);
        } else {
          buf.done = true;
          buf.user_id = _this.get('model.id');
          _this.set(list_name, buf);
          if(_this._boards_list_refresh_buffers) {
            delete _this._boards_list_refresh_buffers[bufferKey];
          }
          if(isMineList) {
            boardsPageListCache.write(_this.get('model.id'), buf);
            boardsPageListCache.setMineListBusy(false);
          }
        }
        return;
      }

      if(!append && prior.length) {
        prior = [];
      }

      if (append && prior.length) {
        prior = prior.concat(chunk);
      } else {
        prior = chunk;
      }
      prior.user_id = _this.get('model.id');
      if(isMineList) {
        prior.paint_ready = true;
      }
      _this.set(list_name, prior);
      if(meta && meta.more) {
        args.per_page = meta.per_page;
        args.offset = meta.next_offset;
        /* Throttle subsequent pages so a 5-page sweep doesn't fire as
           a single back-to-back burst (which read as a network
           "flood" in the dev tools, and competed with foreground
           traffic like board-preview image loads). 200ms is small
           enough that the full list still finishes streaming in ~1s
           for typical cases, and large enough that the requests
           interleave cleanly with user-initiated work. The list_id
           check at the top of the function still guards against tab
           changes during the gap. */
        runLater(function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          _this.generate_or_append_to_list(args, list_name, list_id, true);
        }, 200);
      } else {
        _this.set(list_name + '.done', true);
        if(isMineList) {
          _this.set(list_name + '.paint_ready', true);
          boardsPageListCache.write(_this.get('model.id'), _this.get(list_name));
          boardsPageListCache.setMineListBusy(false);
        }
      }
    }, function() {
      if(isMineList && _this.get('list_id') == list_id) {
        boardsPageListCache.setMineListBusy(false);
      }
      if(backgroundRefresh) {
        if(_this._boards_list_refresh_buffers) {
          delete _this._boards_list_refresh_buffers[bufferKey];
        }
        return;
      }
      if(_this.get('list_id') == list_id && !prior.length) {
        _this.set(list_name, {error: true});
      }
    });
  },
  raw_daily_use: computed('daily_use.daily_use_history', function() {
    var div = document.createElement('div');
    (this.get('daily_use.daily_use_history') || []).forEach(function(day) {
      var sub = document.createElement('div');
      sub.setAttribute('class', day.activity);
      sub.setAttribute('style', day.display_style);
      var span = document.createElement('span');
      span.innerText = day.date;
      sub.appendChild(span);
      div.appendChild(sub);
    })
    return htmlSafe(div.innerHTML);
  }),
  filtered_devices: computed('model.devices', function() {
    return (this.get('model.devices') || []).slice(0, 10);
  }),
  more_label: computed(
    'selected',
    'current_tag',
    'other_selected',
    function() {
      if(this.get('other_selected')) {
        var sel = this.get('selected');
        if(sel == 'shared') {
          return i18n.t('shared', "Shared with Me");
        } else if(sel == 'prior_home') {
          return i18n.t('prior_home', "Prior Home Boards");
        } else if(sel == 'private') {
          return i18n.t('private', "Private");
        } else if(sel == 'root') {
          return i18n.t('root', "Root");
        } else if(sel == 'starred') {
          return i18n.t('starred', "Liked");
        } else if(sel == 'tagged') {
          return this.get('current_tag');
        } else {
          return i18n.t('other', "Other");
        }
      } else {
        return i18n.t('more_ellipsis', "More...");

      }
    }
  ),
  update_home_board: observer('model.preferences.home_board.key', function() {
    if(this.get('model.preferences.home_board.key')) {
      if(this.get('home_board_pref.key') != this.get('model.preferences.home_board.key')) {
        this.set('home_board_pref', this.get('model.preferences.home_board'));
      }
      var _this = this;
      LingoLinq.store.findRecord('board', this.get('model.preferences.home_board.key')).then(function(brd) {
        _this.set('home_board_pref', brd);
      }, function(err) { });
    }
  }),
  update_selected: observer('selected', 'persistence.online', 'current_tag', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var _this = this;
    var list_id = Math.random().toString();
    this.set('list_id', list_id);
    var model = this.get('model');
    var persistenceService = this.get('persistence') || this.persistence;
    if(!persistenceService || typeof persistenceService.get !== 'function' || !persistenceService.get('online')) { return; }
    var default_key = null;
    if(!_this.get('selected') && model) {
      default_key = model.get('permissions.supervise') ? 'mine' : 'public';
    }
    /* Visible top tabs are now only `mine` and `public` (Root + Liked
       moved into the More... dropdown per design). Anything else
       counts as `other_selected` so the More trigger highlights and
       its `more_label` flips to the chosen sub-tab name. */
    this.set('other_selected', this.get('selected') && ['mine', 'public'].indexOf(this.get('selected')) == -1);
    ['mine', 'public', 'private', 'starred', 'shared', 'prior_home', 'root', 'tagged'].forEach(function(key, idx) {
      if(_this.get('selected') == key || key == default_key) {
        _this.set(key + '_selected', true);
        if(key == 'mine') {
          _this.generate_or_append_to_list({user_id: model.get('id')}, 'model.my_boards', list_id);
        } else if(key == 'public') {
          _this.generate_or_append_to_list({q: '', locale: 'en', sort: 'popularity'}, 'model.public_boards', list_id);
        } else if(key == 'private') {
          _this.generate_or_append_to_list({user_id: model.get('id'), private: true}, 'model.private_boards', list_id);
        } else if(key == 'root') {
          _this.generate_or_append_to_list({user_id: model.get('id'), root: true, sort: 'home_popularity'}, 'model.root_boards', list_id);
        } else if(key == 'starred') {
          if(model.get('permissions.supervise')) {
            _this.generate_or_append_to_list({user_id: model.get('id'), starred: true}, 'model.starred_boards', list_id);
          } else {
            _this.generate_or_append_to_list({user_id: model.get('id'), public: true, starred: true}, 'model.starred_boards', list_id);
          }
        } else if(key == 'tagged') {
          _this.generate_or_append_to_list({user_id: model.get('id'), tag: _this.get('current_tag'), sort: 'home_popularity'}, 'model.tagged_boards', list_id);
        } else if(key == 'shared') {
          _this.generate_or_append_to_list({user_id: model.get('id'), shared: true}, 'model.shared_boards', list_id);
        }
      } else {
        _this.set(key + '_selected', false);
      }
    });

    if(model && model.get('permissions.edit')) {
      if(!model.get('preferences.home_board.key')) {
        _this.generate_or_append_to_list({user_id: this.appState.get('currentUser.id') || 'self', starred: true, public: true}, 'model.starting_boards', list_id);
      }
    }
  }),
  external_device_or_no_home: computed('model.external_device', 'model.preference.home_board', function() {
    return this.get('model.external_device') || this.get('model.preferences.home_board');
  }),
  /* The label on the "Set / Change Home Board" link (available-boards-section.hbs:621),
     which routes to the board picker. It reads the VIEWED profile, so a supervisor on a
     communicator's boards page sees the wording that matches that communicator.

     There is deliberately no tile-click selection mode behind it any more: setting a home
     board happens in exactly three places — board-detail speak mode ("Set as Home Board"),
     the board picker, and this link into the picker. The old `selectingHome` mode that set
     the home board by clicking a board tile was removed on 2026-08-26; nothing had set its
     flag since the My Boards modal it mirrored was replaced by a route transition on
     2026-05-23, so the branch had been unreachable, and it wrote `preferences.home_board`
     straight onto `app_state.currentUser` — the SIGNED-IN user, never the profile being
     viewed — while this label described the communicator. */
  hasHomeBoard: computed('model.preferences.home_board.key', function() {
    return !!this.get('model.preferences.home_board.key');
  }),
  setHomeButtonLabel: computed('hasHomeBoard', function() {
    return this.get('hasHomeBoard')
      ? i18n.t('change_home_board', "Change Home Board")
      : i18n.t('set_home_board', "Set Home Board");
  }),
  actions: {
    toggle_board_stats: function() {
      this.toggleProperty('board_stats_expanded');
    },
    dismiss_welcome_notice: function() {
      this.set('welcome_notice_dismissed', true);
    },
    sync: function() {
      console.debug('syncing because manually triggered');
      this.persistence.sync(this.get('model.id'), 'all_reload').then(null, function() { });
    },
    // Runs against the PROFILE being viewed (`model.id`), which may be a
    // supervisee — so this goes to the standalone board picker for THAT user, not
    // to the current user's home tour. The picker is the decoupled replacement for
    // the wizard's board step and "mirrors setup's user_id / setup_user
    // resolution" (controllers/board-picker.js:10), so it lands on exactly the
    // screen the wizard used to open for this person.
    // `homeBoardPickerUserId` (above) is the established param source: a GLOBAL id,
    // and null when the profile IS the current user, so a self-visit opens the
    // plain picker rather than a redundant ?user_id round-trip.
    setup: function() {
      var other_user_id = this.get('homeBoardPickerUserId');
      if(window.ga) {
        window.ga('send', 'event', 'Onboarding', 'start', other_user_id ? 'Board picker opened' : 'Home tour started');
      }
      if(other_user_id) {
        this.router.transitionTo('board-picker', { queryParams: { user_id: other_user_id } });
      } else {
        // Own profile — the home tour is the self-onboarding path.
        this.appState.set('auto_open_home_tour', true);
        this.appState.return_to_index();
      }
    },
    quick_assessment: function() {
      var _this = this;
      _this.appState.check_for_currently_premium(_this.get('model', 'quick_assessment')).then(function() {
        modal.open('quick-assessment', {user: _this.get('model')}).then(function() {
          _this.reload_logs();
        });
      }, function() { });
    },
    stats: function() {
      this.router.transitionTo('user.stats', this.get('model.user_name'));
    },
    approve_or_reject_org: function(approve) {
      var user = this.get('model');
      var type = this.get('edit_permission') ? 'add_edit' : 'add';
      if(approve == 'user_approve') {
        user.set('supervisor_key', "approve-org");
      } else if(approve == 'user_reject') {
        user.set('supervisor_key', "remove_supervisor-org");
      } else if(approve == 'supervisor_approve') {
        var org_id = this.get('model.pending_supervision_org.id');
        user.set('supervisor_key', "approve_supervision-" + org_id);
      } else if(approve == 'supervisor_reject') {
        var org_id = this.get('model.pending_supervision_org.id');
        user.set('supervisor_key', "remove_supervision-" + org_id);
      }
      user.save().then(function() {

      }, function() { });
    },
    add_supervisor: function() {
      var _this = this;
      _this.appState.check_for_currently_premium(this.get('model'), 'add_supervisor', true).then(function() {
        modal.open('add-supervisor', {user: _this.get('model')});
      }, function() { });
    },
    view_devices: function() {
      modal.open('device-settings', this.get('model'));
    },
    masquerade: function() {
      var user_id = this.get('model.id');
      if(this.get('model.permissions.support_actions')) {
        modal.open('modals/masquerade', {user: this.get('model')});
      }
    },
    run_eval: function() {
      var _this = this;
      _this.appState.check_for_currently_premium(_this.get('model'), 'eval', false, true).then(function() {
        _this.appState.set_speak_mode_user(_this.get('model.id'), false, false, 'obf/eval');
      });
    },
    remote_model: function(user) {
      var _this = this;
      _this.appState.check_for_currently_premium(_this.get('model'), 'eval', false, true).then(function() {
        modal.open('modals/remote-model', {user_id: _this.get('model.id')});
      });
    },
    eval_settings: function() {
      modal.open('modals/eval-status', {user: this.get('model')});
    },
    supervision_settings: function() {
      modal.open('supervision-settings', {user: this.get('model')});
    },
    show_more_boards: function() {
      var scrollY = window.scrollY || window.pageYOffset;
      var current = this.get('boards_display_limit') || 18;
      this.set('boards_display_limit', current + 48);
      this.set('show_all_boards', true);
      this.set('show_back_to_top', true);
      schedule('afterRender', function() {
        requestAnimationFrame(function() {
          window.scrollTo(0, scrollY);
        });
      });
    },
    scroll_to_top: function() {
      this.set('show_back_to_top', false);
      var boardsSection = document.querySelector('.ub-boards-page__content');
      if(boardsSection) {
        boardsSection.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    set_selected: function(selected) {
      this.set('selected', selected);
      this.set('show_all_boards', false);
      this.set('boards_display_limit', null);
      this.set('parent_object', null);
      this.set('mineTagFolderDrillIn', null);
//       this.set('filterString', '');
    },
    set_tag: function(tag) {
      this.set('mineTagFolderDrillIn', null);
      this.set('selected', 'tagged');
      this.set('show_all_boards', false);
      this.set('parent_object', null);
      this.set('current_tag', tag);
    },
    enterMineFolderTag: function(tag) {
      /* Use the derived `mine_selected` flag, NOT the raw `selected`
         field. On initial page load `selected` starts as undefined
         even though the UI shows the Mine tab as active via the
         `default_key` fallback in update_selected. Comparing
         `selected !== 'mine'` against an undefined value was true,
         so set_selected('mine') fired on the first folder click,
         which re-triggered update_selected → re-queried my_boards →
         the array was rebuilt and its `.done` property lost → the
         "Loading boards..." overlay flashed for the duration of the
         refetch. mine_selected reflects the actual visible tab
         state, so this guard skips the no-op switch correctly. */
      if(!this.get('mine_selected')) {
        this.send('set_selected', 'mine');
      }
      this.set('mineTagFolderDrillIn', tag);
      this.set('show_all_boards', false);
      this.set('boards_display_limit', null);
    },
    exitMineFolderTag: function() {
      this.set('mineTagFolderDrillIn', null);
      this.set('show_all_boards', false);
      this.set('boards_display_limit', null);
      var bl = this.get('board_list');
      if (bl) {
        this.set('last_filtered_results_key', bl.filtered_results_key);
        this.set('filtered_results', bl.filtered_results);
      }
    },
    openNewBoardFolderModal: function() {
      modal.open('new-board-folder', { user: this.get('model') });
    },
    load_children: function(obj) {
      this.set('mineTagFolderDrillIn', null);
      this.set('show_all_boards', false);
      if(obj) {
        this.set('prior_filter_string', this.get('filterString') || '');
        this.set('filterString', '');
      } else {
        this.set('filterString', this.get('prior_filter_string') || '');
        this.set('prior_filter_string', '');
      }
      this.set('parent_object', obj);
    },
    /* Boards-page tile click — open the board the user actually clicked,
       respecting `currentUser.preferences.board_view_style`:
         - 'classic'  → user.board-alt.index  (the modern speak grid)
         - 'modern'   → user.board-detail.index  (the panelled view)
       Default is 'modern' (per board/index.js#board_view_style).
       Previously the template bound `onAction=(action "load_children" …)`
       for boards with copies, so clicking a parent tile drilled into
       its copy cluster instead of opening the parent. The copy-cluster
       drill-in is still reachable via the Preview chip (which now
       shows the children count). `obj` is either a {board, children}
       wrapper or a raw board record — unwrap defensively. */
    open_board_in_user_view: function(obj) {
      var board = (obj && obj.board) || obj;
      if(!board) { return; }
      var key = board.get ? board.get('key') : board.key;
      if(!key) { return; }
      var parts = key.split('/');
      if(parts.length !== 2) { return; }
      var pref = this.get('appState.currentUser.preferences.board_view_style');
      var route = (pref === 'classic') ? 'user.board-alt.index' : 'user.board-detail.index';
      /* Show full-viewport loading overlay so the click registers
         visually while the route resolves the board record + tree.
         board-detail / board-alt setupController calls
         hide_loading_overlay when ready. .catch handler clears the
         overlay if the transition aborts (setupController would
         never run in that case). When raw JSON and an Ember board
         record are already cached, use a shorter minimum so repeat
         opens feel instant without skipping click feedback. */
      var _appState = this.appState;
      var board_key = parts[0] + '/' + parts[1];
      var overlay_opts = null;
      var cached_raw = boardDetailCache.get(board_key);
      if (cached_raw) {
        var cached_record = this.store.peekAll('board').find(function(b) {
          if (!b) { return false; }
          return b.get('key') === board_key;
        });
        if (cached_record && !cached_record.get('should_reload')) {
          overlay_opts = { min_ms: _appState.get('LOADING_OVERLAY_CACHE_HIT_MIN_MS') };
        }
      }
      _appState.show_loading_overlay(i18n.t('loading_board', "Loading board..."), overlay_opts);
      var transition = this.get('router').transitionTo(route, parts[0], parts[1]);
      if(transition && typeof transition.catch === 'function') {
        transition.catch(function() { _appState.hide_loading_overlay(); });
      }
    },
    /* Legacy entry point — boards page now links to /board-picker instead
       of inline selection mode. Kept so any stale callers still land on
       the dedicated picker. */
    toggleSetHomeMode: function() {
      var modelId = this.get('model.id');
      var currentId = this.appState.get('currentUser.id');
      if (modelId && currentId && modelId != currentId) {
        this.get('router').transitionTo('board-picker', { queryParams: { user_id: modelId } });
      } else {
        this.get('router').transitionTo('board-picker');
      }
    },
    nothing: function() {
    },
    updateFilterString: function(event) {
      this.set('filterString', event.target.value);
    },
    clearFilter: function() {
      this.set('filterString', '');
      this.set('filterStringDebounced', '');
    },
    badge_popup: function(badge) {
      modal.open('badge-awarded', {badge: badge, user_id: this.get('model.id')});
    },
    remove_board: function(action, board) {
      var _this = this;
      var refreshMine = function() {
        /* Drop the TTL snapshot so update_selected re-queries instead of
           treating the pre-mutation list as still fresh. */
        boardsPageListCache.clear(_this.get('model.id'));
        _this.update_selected();
      };
      if(action == 'delete') {
        modal.open('confirm-delete-board', {board: board, redirect: false}).then(function(res) {
          if(res && res.update) {
            refreshMine();
          }
        });
      } else if(action == 'delete_orphans') {
        board.name = board.board.name;
        modal.open('confirm-delete-board', {board: board, redirect: false, orphans: true}).then(function(res) {
          if(res && res.update) {
            refreshMine();
          }
        });
      } else {
        modal.open('confirm-remove-board', {action: action, tag: _this.get('current_tag'), board: board, user: this.get('model')}).then(function(res) {
          if(res && res.update) {
            refreshMine();
          }
        });
      }
    },
    resendConfirmation: function() {
      this.persistence.ajax('/api/v1/users/' + this.get('model.user_name') + '/confirm_registration', {
        type: 'POST',
        data: {
          resend: true
        }
      }).then(function(res) {
        modal.success(i18n.t('confirmation_resent', "Confirmation email sent, please check your spam box if you can't find it!"));
      }, function() {
        modal.error(i18n.t('confirmation_resend_failed', "There was an unexpected error requesting a confirmation email."));
      });
    },
    set_subscription: function(action) {
      if(action == 'cancel') {
        this.set('subscription_settings', null);
      } else if(action == 'confirm' && this.get('subscription_settings')) {
        this.set('subscription_settings.loading', true);
        var _this = this;
        _this.persistence.ajax('/api/v1/users/' + this.get('model.user_name') + '/subscription', {
          type: 'POST',
          data: {
            type: this.get('subscription_settings.action')
          }
        }).then(function(data) {
          progress_tracker.track(data.progress, function(event) {
            if(event.status == 'errored') {
              _this.set('subscription_settings.loading', false);
              _this.set('subscription_settings.error', i18n.t('subscription_error', "There was an error checking status on the users's subscription"));
            } else if(event.status == 'finished') {
              _this.get('model').reload().then(function() {
                _this.get('subscription').reset();
              });
              _this.set('subscription_settings', null);
              modal.success(i18n.t('subscription_updated', "User purchase information updated!"));
            }
          });
        }, function() {
          _this.set('subscription_settings.loading', false);
          _this.set('subscription_settings.error', i18n.t('subscription_update_error', "There was an error updating the users's account information"));
        });
      } else if(action == 'eval') {
        this.set('subscription_settings', {action: action, type: i18n.t('eval_device', "Evaluation Device")});
      } else if(action == 'never_expires') {
        this.set('subscription_settings', {action: action, type: i18n.t('never_expires', "Never Expiring Subscription")});
      } else if(action == 'manual_supporter') {
        this.set('subscription_settings', {action: action, type: i18n.t('manual_supporter', "Manually Set as Supporter")});
      } else if(action == 'manual_modeler') {
        this.set('subscription_settings', {action: action, type: i18n.t('manual_modeler', "Manually Set as Modeler")});
      } else if(action == 'add_1') {
        this.set('subscription_settings', {action: action, type: i18n.t('add_one_month_to_expiration', "Add 1 Month to Expiration")});
      } else if(action == 'add_5_years') {
        this.set('subscription_settings', {action: action, type: i18n.t('add_five_years_to_expiration', "Add 5 Years to Expiration")});
      } else if(action == 'communicator_trial') {
        this.set('subscription_settings', {action: action, type: i18n.t('communicator_trial', "Manually Set as Communicator Free Trial")});
      } else if(action == 'add_voice') {
        this.set('subscription_settings', {action: action, type: i18n.t('add_1_premium_voice', "Add 1 Premium Voice")});
      } else if(action == 'enable_extras') {
        this.set('subscription_settings', {action: action, type: i18n.t('enable_extras', "Enable Premium Symbols Access")});
      } else if(action == 'supporter_credit') {
        this.set('subscription_settings', {action: action, type: i18n.t('add_premium_supporter_credit', "Add 1 Premium Supporter Credit")});
      } else if(action == 'check_remote') {
        this.set('subscription_settings', {action: action, type: i18n.t('recheck_purchasing_status', "Re-Check Purchasing Status")});
      } else if(action == 'restore_purchase') {
        this.set('subscription_settings', {action: action, type: i18n.t('restore_purchase', "Restore an Accidentally-Disabled Purchase")});
      } else if(action == 'force_logout') {
        this.set('subscription_settings', {action: action, type: i18n.t('force_device_logout', "Force Logout on all Devices (this may cause the user to lose some logs)")});
      }
    },
    rename_user: function(confirm) {
      if(confirm === undefined) {
        this.set('new_user_name', {});
      } else if(confirm === false) {
        this.set('new_user_name', null);
      } else {
        if(!this.get('new_user_name')) {
          this.set('new_user_name', {});
        }
        if(!this.get('new_user_name.value')) { return; }

        var _this = this;
        var new_key = _this.get('new_user_name.value');
        new_key = LingoLinq.clean_path(new_key);
        var old_key = _this.get('new_user_name.old_value');
        if(old_key != _this.get('model.user_name')) { return; }

        _this.set('new_user_name', {renaming: true});
        this.persistence.ajax('/api/v1/users/' + this.get('model.user_name') + '/rename', {
          type: 'POST',
          data: {
            old_key: _this.get('model.user_name'),
            new_key: new_key
          }
        }).then(function(res) {
          _this.set('new_user_name', null);
          _this.router.transitionTo('user.index', res.key);
          runLater(function() {
            modal.success(i18n.t('user_renamed_to', "User successfully renamed to %{k}. The full renaming process can take a little while to complete.", {k: res.key}));
          }, 200);
        }, function(err) {
          _this.set('new_user_name', {error: true});
        });
      }
    },
    reset_password: function(confirm) {
      if(confirm === undefined) {
        this.set('password', {});
      } else if(confirm === false) {
        this.set('password', null);
      } else {
        if(!this.get('password')) {
          this.set('password', {});
        }
        var keys = "23456789abcdef";
        var pw = "";
        for(var idx = 0; idx < 8; idx++) {
          var hit = Math.floor(Math.random() * keys.length);
          var key = keys.substring(hit, hit + 1);
          pw = pw + key;
        }
        this.set('password.pw', pw);
        this.set('password.loading', true);
        var _this = this;

        this.persistence.ajax('/api/v1/users/' + this.get('model.user_name'), {
          type: 'POST',
          data: {
            '_method': 'PUT',
            'reset_token': 'admin',
            'user': {
              'password': pw
            }
          }
        }).then(function(data) {
          _this.set('password.loading', false);
        }, function() {
          _this.set('password.error', true);
        });
      }
    },
    load_starred: function() {
      var opts = {force_board_state: {key: 'obf/stars-' + this.get('model.id')}};
      this.appState.home_in_speak_mode(opts);
    },
    external_device: function() {
      if(this.get('model.permissions.edit')) {
        modal.open('modals/external-device', {user: this.get('model')});
      } else {

      }
    },
    manual_log: function() {
      LingoLinq.Log.manual_log(this.get('model.id'), !!this.get('model.external_device'));
    },
    profile_preview: function() {
      modal.open('modals/profiles', {user: this.get('model')});
    },
    retry_board_list: function() {
      this.update_selected();
    }
  }
});
