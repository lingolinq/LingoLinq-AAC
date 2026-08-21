import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import EmberObject, { set as emberSet, get as emberGet, observer, computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { A } from '@ember/array';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import LingoLinq from '../../app';
import capabilities from '../../utils/capabilities';
import { board_view_route } from '../../utils/board_view';
import Badge from '../../models/badge';
import Log from '../../models/log';
import session from '../../utils/session';
import modal from '../../utils/modal';
import sync from '../../utils/sync';
import i18n from '../../utils/i18n';
import { filterRootBoards } from '../../utils/board-roots';
import sessionHistory from '../../utils/session_history';
import { availableHomeSections, sectionHidden, layoutPresentation, focusedHeroKey, communicatorsNeedingAttention } from '../../utils/dashboard_sections';
import { homePillLabel } from '../../helpers/home-pill-label';

export default Component.extend({
  tagName: '',
  
  router: service(),
  store: service(),
  persistence: service('persistence'),
  appState: service('app-state'),
  stashes: service('stashes'),
  modal: service('modal'),
  app_state: alias('appState'),

  // The layout actually RENDERED — the saved `dashboard_layout` pref, validated to a
  // known variant. Everything that drives the grid (class, grid state, section
  // visibility, the shell modifier) reads THIS. The default is 'gentle'; an unset
  // pref or any legacy/invalid value (e.g. the removed 'balanced') resolves to it.
  effectiveLayout: computed('appState.currentUser.preferences.dashboard_layout', function() {
    var layout = this.get('appState.currentUser.preferences.dashboard_layout') || 'gentle';
    if (['gentle', 'focused'].indexOf(layout) === -1) { layout = 'gentle'; }
    return layout;
  }),


  // Home dashboard arrangement modifier, driven by the EFFECTIVE layout (above).
  // Always resolves to a known variant so the grid has a stable hook class;
  // 'focused' is the default grid — the Gentle View/Focused View CSS variants hang off
  // md-grid--layout-gentle / md-grid--layout-focused.
  dashboardLayoutClass: computed('effectiveLayout', function() {
    return 'md-grid--layout-' + this.get('effectiveLayout');
  }),

  // Counts for the supervisor home header subheader. Rooms are the supervisor's org
  // units (supervised_units); communicators are the people they supervise (supervisees).
  // Both default to 0 when the raw arrays are absent.
  slpRoomCount: computed('appState.currentUser.supervised_units', function() {
    return (this.get('appState.currentUser.supervised_units') || []).length;
  }),
  slpCommunicatorCount: computed('appState.currentUser.supervisees', function() {
    return (this.get('appState.currentUser.supervisees') || []).length;
  }),
  // The supporter's actual role label for the home subheader, instead of a
  // hardcoded "Supervisor": site admins read "Admin", anyone who manages an org
  // reads "Manager", and everyone else (supervises only) keeps "Supervisor".
  roleName: computed(
    'appState.currentUser.admin',
    'appState.currentUser.is_admin',
    'appState.currentUser.org_manager',
    'appState.currentUser.managed_orgs.[]',
    function() {
      var user = this.get('appState.currentUser');
      if (!user) { return i18n.t('slp_role', "Supervisor"); }
      if (user.get('admin') || user.get('is_admin')) { return i18n.t('org_admin', "Admin"); }
      if (user.get('org_manager') || (user.get('managed_orgs') || []).length > 0) { return i18n.t('org_manager', "Manager"); }
      return i18n.t('slp_role', "Supervisor");
    }
  ),

  // First name for the supervisor home greeting. The model has no first_name field, so
  // take the leading word of the full `name`; fall back to user_name when name is blank.
  slpFirstName: computed('appState.currentUser.name', 'appState.currentUser.user_name', function() {
    var name = (this.get('appState.currentUser.name') || '').trim();
    if (name) { return name.split(/\s+/)[0]; }
    return this.get('appState.currentUser.user_name');
  }),

  // Rooms (supervised org units) for the home Rooms card. Natural-sorted by name so
  // embedded room numbers order numerically (112 before 1012) via Intl.Collator numeric
  // collation, then sliced to the first 5 with an overflow count for the "view all"
  // affordance. roomsAllOrgId points the "view all" link at the org rooms page (rooms
  // are org-scoped; the first room's org covers the common single-org case).
  sortedRooms: computed('appState.currentUser.supervised_units.[]', function() {
    var units = (this.get('appState.currentUser.supervised_units') || []).slice();
    var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    units.sort(function(a, b) { return collator.compare((a && a.name) || '', (b && b.name) || ''); });
    return units;
  }),
  roomsShown: computed('sortedRooms.[]', function() {
    return (this.get('sortedRooms') || []).slice(0, 4);
  }),
  roomsOverflowCount: computed('sortedRooms.[]', function() {
    return Math.max(0, (this.get('sortedRooms') || []).length - 4);
  }),
  roomsAllOrgId: computed('sortedRooms.[]', function() {
    var first = (this.get('sortedRooms') || [])[0];
    return first && first.organization_id;
  }),

  // Communicators whose org_status needs attention (see communicatorsNeedingAttention /
  // ATTENTION_STATUS_IDS in dashboard_sections). Each maps to the bits the card renders:
  // name, avatar, and the human status label (from LingoLinq.user_statuses).
  attentionCommunicators: computed('appState.currentUser.supervisees.[]', function() {
    var statusMap = {};
    (LingoLinq.user_statuses || []).forEach(function(s) { statusMap[s.id] = s.label; });
    return communicatorsNeedingAttention(this.get('appState.currentUser')).map(function(s) {
      var state = s.org_status && s.org_status.state;
      return {
        user_name: s.user_name,
        avatar_url: s.avatar_url,
        status_state: state,
        status_label: statusMap[state] || state
      };
    });
  }),

  // "Reports" appears in the primary pill-nav (and its responsive dropdown) for
  // EVERYONE — supporters and communicators alike, on every layout including Focused
  // View. Communicators ALSO keep a Reports card in Extras (see extrasItems), so for
  // them it's reachable from both places. Constant for now; left as a named hook so
  // the template guards stay in place if visibility ever needs gating again.
  showReportsPill: true,

  // Communicators get a far-right "Account" pill in the nav — but NOT on Focused View
  // (its nav is the minimal centered bar). Supporters never get it (they use the
  // identity dropdown).
  showAccountPill: computed('effectiveLayout', 'appState.currentUser.supporter_role', function() {
    return !this.get('appState.currentUser.supporter_role') && this.get('effectiveLayout') !== 'focused';
  }),

  // Visibility map for the home dashboard cards, keyed by section key
  // (boards/speak/extras/caseload/org). A key is present+true only when the
  // section is BOTH available to this user type AND not hidden by their saved
  // `dashboard_sections` preference (set in the Getting Started flow). The
  // template gates each card — and the caseload/org grid modifiers — on this,
  // so hiding a section also reflows the grid as if that section didn't exist.
  sectionVisibility: computed(
    'appState.currentUser.preferences.dashboard_sections',
    'effectiveLayout',
    'appState.currentUser.supporter_role',
    'appState.currentUser.organizations',
    'appState.currentUser.managing_supervision_orgs',
    'appState.currentUser.supervisees',
    function() {
      // Derived by the shared layout description, which the two preview surfaces
      // also call — so a section the previews hide is a section this page hides.
      // (That includes Focused View's forced-off Extras: Speak takes the focal
      // full-width hero slot, and a visible-but-unplaced card would land in an
      // implicit grid row of its own.)
      return layoutPresentation(this.get('appState.currentUser'), this.get('effectiveLayout')).vis;
    }
  ),

  // The Focused View hero for THIS user, resolved by role (admin > supervisor >
  // communicator): 'org' for admins, 'caseload' for supervisors, 'speak' for
  // communicators. Drives which section gets the full-width hero showcase (the
  // grid `md-grid--hero-<key>` class + the template's per-hero card variant).
  heroKey: computed(
    'appState.currentUser.supporter_role',
    'appState.currentUser.organizations',
    function() {
      return focusedHeroKey(this.get('appState.currentUser'));
    }
  ),

  // Dashboard grid state derived from visibility — the card-styling classes plus
  // the computed grid-template-areas/rows. The layout is applied as an inline
  // style (gridStyle) from the shared layout matrix, so the home grid and the
  // Getting Started preview reflow identically with no CSS-specificity juggling.
  dashboardGrid: computed('sectionVisibility', 'sectionOrder', 'effectiveLayout', 'heroKey',
    'appState.currentUser', 'appState.feature_flags.dashboard_drag_layout', function() {
    // Same call the Dashboard Design clone and the Display Style preview iframes
    // make. `vis`/`order` are passed explicitly because this component resolved
    // them already (sectionOrder applies the drag-flag gate); `dragEnabled` is
    // passed too so the gate is applied identically no matter which surface asks.
    return layoutPresentation(this.get('appState.currentUser'), this.get('effectiveLayout'), {
      vis: this.get('sectionVisibility'),
      order: this.get('sectionOrder'),
      dragEnabled: !!this.get('appState.feature_flags.dashboard_drag_layout')
    }).grid;
  }),

  // The user's saved drag-to-reorder arrangement: an ordered array of section
  // keys (the layout packs visible cards in this order — Boards full-width, small
  // cards two-per-row; see dashboard_sections.gridLayoutState). Read like the
  // other dashboard prefs and gated behind the `dashboard_drag_layout` flag (the
  // only way to SET an order is the flagged drag UI). Returns null when unset or
  // the flag is off → the canonical default order.
  sectionOrder: computed(
    'appState.currentUser.preferences.dashboard_order',
    'appState.feature_flags.dashboard_drag_layout',
    function() {
      if (!this.get('appState.feature_flags.dashboard_drag_layout')) { return null; }
      var o = this.get('appState.currentUser.preferences.dashboard_order');
      return (o && o.length) ? o : null;
    }
  ),
  gridClassString: computed('dashboardGrid', function() {
    return (this.get('dashboardGrid.classes') || []).join(' ');
  }),
  gridStyle: computed('dashboardGrid', function() {
    var s = this.get('dashboardGrid');
    // Inline !important so it wins over the base .md-grid !important rules.
    var css = 'grid-template-areas: ' + s.areasValue + ' !important; grid-template-rows: ' + s.rows + ' !important;';
    // Focused View pins the column count to the visible utility-card count so the
    // utility row fills evenly (see gridLayoutState.columns); Gentle View leaves
    // the stylesheet's columns in place.
    if (s.columns) { css += ' grid-template-columns: ' + s.columns + ' !important;'; }
    // Per-section reading-order as `--ord-<key>` custom properties — inert on large
    // screens, consumed by the ≤950px Gentle View single-column flex fallback so its
    // card order matches this (drag-aware) arrangement instead of a static order.
    var oi = s.orderIndices || {};
    Object.keys(oi).forEach(function(k) { css += ' --ord-' + k + ': ' + oi[k] + ';'; });
    return htmlSafe(css);
  }),

  // Availability-only map (does this section EXIST for this user type, ignoring
  // the hidden preference). The template gates caseload/org on this so they
  // never render for users who don't have them — while every available card is
  // ALWAYS rendered (hidden ones via cardHideStyle), so the Getting Started
  // preview clone is full-fidelity and a re-checked section actually reappears.
  sectionAvailable: computed(
    'appState.currentUser',
    'appState.currentUser.supporter_role',
    'appState.currentUser.organizations',
    'appState.currentUser.managing_supervision_orgs',
    'appState.currentUser.supervised_units',
    'appState.currentUser.supervisees',
    function() {
      var user = this.get('appState.currentUser');
      var map = {};
      availableHomeSections(user).forEach(function(s) { map[s.key] = true; });
      return map;
    }
  ),

  // Per-card inline style that HIDES a section when it's turned off — `display:
  // none !important` so it beats every stylesheet rule (incl. the wide/narrow
  // variant `display:...!important` @media rules) regardless of specificity,
  // with no cascade juggling. Visible sections get an empty style so their
  // normal (wide/narrow) display rules govern. Because hidden cards stay in the
  // DOM (just display:none), the dashboard clone the Getting Started modal makes
  // contains every available card — toggling one back on shows it instead of
  // leaving phantom grid space.
  cardHideStyle: computed('sectionVisibility', function() {
    var vis = this.get('sectionVisibility') || {};
    var HIDDEN = htmlSafe('display: none !important;');
    var SHOWN = htmlSafe('');
    var map = {};
    ['boards', 'speak', 'extras', 'caseload', 'rooms', 'attention', 'org', 'account', 'createboard', 'reports', 'editdashboard'].forEach(function(k) {
      map[k] = vis[k] ? SHOWN : HIDDEN;
    });
    return map;
  }),

  // The welcome hero banner is a non-grid toggle (see EXTRA_HOME_TOGGLES): hidden
  // via the same dashboard_sections preference the cards use. Focused View hides the
  // hero in CSS regardless; this governs the Gentle View layout. Only applies to the
  // GREETING hero — on the Extras tab the same <header> is the page header, which
  // the toggle must never hide.
  heroHideStyle: computed('appState.currentUser.preferences.dashboard_sections', 'activeTab', function() {
    if (this.get('activeTab') === 'extras') { return htmlSafe(''); }
    return sectionHidden(this.get('appState.currentUser'), 'hero') ? htmlSafe('display: none !important;') : htmlSafe('');
  }),

  activeTab: 'home',
  /** When set (e.g. on user.extras), open this tab on load */
  initialActiveTab: null,
  isSearchOpen: false,
  showNewBoardForm: false,
  pillnavDropdownOpen: false,

  init() {
    this._super(...arguments);
    // Initialize supervisees_with_badges to empty array
    this.set('supervisees_with_badges', []);
    // Same explicit lookup as application controller (implicit injection removed)
    var owner = getOwner(this);
    var extras = owner && owner.lookup('lingolinq:extras');
    if (extras) {
      Object.defineProperty(this, 'extras', {
        value: extras,
        writable: false,
        configurable: true
      });
    }
    var initial = this.get('initialActiveTab');
    if (initial) {
      this.set('activeTab', initial);
    }
    this._loadPreviewBoards();
    var self = this;
    var send = function(action) {
      var args = Array.prototype.slice.call(arguments, 1);
      self.send.apply(self, [action].concat(args));
    };
    this.onGoTab = function(tab) { send('goTab', tab); };
    this.onSelectTab = function(tab) { send('selectTab', tab); };
    this.onApproveOrRejectOrg = function(decision) { send('approve_or_reject_org', decision); };
    this.onGo = function(dest) { send('go', dest); };
    this.onGoToBoard = function(boardKey) { send('goToBoard', boardKey); };
    this.onGoAndCloseSearch = function(dest) { send('goAndCloseSearch', dest); };
    this.onExtraAction = function(name) { send('extraAction', name); };
    this.onHomeInSpeakMode = function(boardForUserId, keepAsSelf) {
      send('homeInSpeakMode', boardForUserId, keepAsSelf);
    };
    this.onRecordNoteFor = function(supervisee) { send('recordNoteFor', supervisee); };
    this.onQuickAssessmentFor = function(supervisee) { send('quickAssessmentFor', supervisee); };
    this.onTogglePillnavDropdown = function() { send('togglePillnavDropdown'); };
    this.onGettingStarted = function() { send('getting_started'); };
    this.onGoOrganizations = function() { send('goOrganizations'); };
    this.onOpenNewBoardOnBoards = function() { send('openNewBoardOnBoards'); };
    this.onEditDashboard = function() { send('editDashboard'); };
    this.onCloseSearch = function() { send('closeSearch'); };
    this.onOpenExtrasTab = function() { send('openExtrasTab'); };
    this.onSearchKeydown = function(event) { send('onSearchKeydown', event); };
  },
  didInsertElement() {
    this._super(...arguments);
    this._loadPreviewBoards();
  },

  // NOTE: the `body.ll-layout-focused` class is now set globally (on every page,
  // not just the dashboard) by sync_layout_scope in services/app-state.js, which
  // mirrors the dashboard_layout pref onto <body>. The component no longer toggles
  // it here so the Focused View overlay survives navigation away from the dashboard.

  sync_able: computed('extras.ready', 'appState.currentUser.external_device', function() {
    return this.get('extras.ready') && !this.appState.get('currentUser.external_device');
  }),
  home_board_or_supporter: computed(
    'appState.currentUser.preferences.home_board.key',
    'appState.currentUser.supporter_view',
    function() {
        return this.appState.get('currentUser.preferences.home_board.key') || this.appState.get('currentUser.supporter_view');
    }
  ),
  last_board_name: computed('stashes.root_board_state', 'appState.currentUser.user_name', function() {
    // Helper: ignore synthetic OBF boards (keys like `obf/eval`,
    // `obf/emergency`, etc.) — their names are throwaway timestamp ids.
    var isObfKey = function(k) { return k && /^obf\//.test(k); };

    var fromStashKey = this.stashes.get('root_board_state.key');
    var fromStash = this.stashes.get('root_board_state.name');
    if(fromStash && !isObfKey(fromStashKey)) { return fromStash; }

    var userName = this.appState.get('currentUser.user_name');
    if(!userName) { return null; }
    var stored = sessionHistory.last_board(userName);
    if(!stored) { return null; }
    if(isObfKey(stored.key)) {
      // Stale synthetic-board entry from a prior session — clean it
      // out so it doesn't keep showing up on the dashboard.
      sessionHistory.clear_board(userName);
      return null;
    }
    return stored.name || null;
  }),
  needs_sync: computed('persistence.last_sync_at', function() {
    if (!this || typeof this.get !== 'function') { return false; }
    var p = null;
    try { p = this.get('persistence'); } catch (e) { }
    if (!p && typeof window !== 'undefined') { p = window.persistence; }
    if(!p || typeof p.get !== 'function') { return false; }
    var now = (new Date()).getTime() / 1000;
    var lastSync = p.get('last_sync_at') || 0;
    return (now - lastSync) > (7 * 24 * 60 * 60);
  }),
  blank_slate: computed(
    'appState.currentUser.preferences.progress',
    function() {
      var progress = this.appState.get('currentUser.preferences.progress');
      // Only hide Getting Started when user has actually completed setup
      if(progress && progress.setup_done) {
        return null;
      }
      return progress;
    }
  ),
  no_intro: computed(
    'blank_slate',
    'appState.currentUser.preferences.progress.intro_watched',
    function() {
      return this.get('blank_slate') && !this.appState.get('currentUser.preferences.progress.intro_watched');
    }
  ),
  blank_slate_percent: computed('appState.currentUser.preferences.progress', function() {
    var options = ['intro_watched', 'profile_edited', 'preferences_edited', 'home_board_set', 'app_added'];

    var total = options.length;
    if(total === 0) { return 0; }
    var done = 0;
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if(progress.setup_done) { return 100; }
    options.forEach(function(opt) {
      if(progress[opt]) {
        done++;
      }
    });
    return Math.round(done / total * 100);
  }),
  blank_slate_percent_style: computed('blank_slate_percent', function() {
    return htmlSafe("width: " + this.get('blank_slate_percent') + "%;");
  }),
  /** Current step (1–5) for Getting Started; same order as modal: intro, home board, app, preferences, profile */
  getting_started_step: computed('appState.currentUser.preferences.progress', function() {
    var order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 5; }
    for (var i = 0; i < order.length; i++) {
      if (!progress[order[i]]) { return i + 1; }
    }
    return 5;
  }),
  checkForBlankSlate: observer('persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var persistenceService = null;
    try { persistenceService = this.get('persistence') || this.persistence; } catch (e) { }
    if (!persistenceService && typeof window !== 'undefined') { persistenceService = window.persistence; }
    if(!persistenceService || typeof persistenceService.find_recent !== 'function') { return; }
    var _this = this;
    if(this.get('isGenerated')) { return; } // Ember testing check equivalent?
    persistenceService.find_recent('board').then(function(boards) {
      if(boards && boards.slice) {
        boards = boards.slice(0, 12);
      }
      _this.set('recentOfflineBoards', boards);
      if(_this.get('homeBoards') == [] && _this.get('popularBoards') == []) {
        _this.set('showOffline', true);
      } else {
        var p = _this.get && _this.get('persistence');
        if(!p || !p.get || !p.get('online')) {
          _this.set('showOffline', true);
        } else {
          _this.set('showOffline', false);
        }
      }
    }, function() {
      _this.set('showOffline', false);
    });
  }),
  device: computed(function() {
    var res = {
      added_somewhere: !!this.appState.get('currentUser.preferences.progress.app_added'),
      standalone: capabilities.browserless,
      android: capabilities.system == "Android",
      ios: capabilities.system == "iOS"
    };

    res.needs_install_reminder = !res.added_somewhere || ((res.android || res.ios) && !res.standalone);
    if(res.standalone && (res.android || res.ios)) {
      res.needs_install_reminder = false;
    } else if(this.appState.get('currentUser.using_for_a_while')) {
      res.needs_install_reminder = false;
    }
    return res;
  }),
  small_needs_sync_class: computed('needs_sync', function() {
    var res = "half_size list-group-item ";
    if(!this.get('needs_sync')) {
      res = res + "subtle ";
    }
    return res;
  }),
  refreshing_class: computed('persistence.syncing', function() {
    var res = "glyphicon glyphicon-refresh ";
    if (!this || typeof this.get !== 'function') { return res; }
    var p = null;
    try { p = this.get('persistence'); } catch (e) { }
    if (!p && typeof window !== 'undefined') { p = window.persistence; }
    if(p && typeof p.get === 'function' && p.get('syncing')) {
      res = res + "spinning ";
    }
    return res;
  }),
  needs_sync_class: computed('needs_sync', function() {
    var res = "list-group-item ";
    if(!this.get('needs_sync')) {
      res = res + "subtle ";
    }
    return res;
  }),
  current_boards: computed(
    'popular_selected',
    'personal_selected',
    'suggested_selected',
    'recent_selected',
    'popularBoards',
    'personalBoards',
    'homeBoards',
    'recentOfflineBoards',
    function() {
      var res = {};
      if(this.get('popular_selected')) {
        res = this.get('popularBoards');
      } else if(this.get('personal_selected')) {
        res = this.get('personalBoards');
      } else if(this.get('suggested_selected')) {
        // filter out boards that have a style.id but not style.name
        res = this.get('homeBoards');
        if(res.filter) {
          var ids = {};
          res.forEach(function(b) {
            if(b.get('style.options')) {
              ids[b.get('style.id')] = true;
            }
          })
          res = res.filter(function(b) { return !b.get('style') || !ids[b.get('style.id')] || b.get('style.options'); }).slice(0, 12);
        }

      } else if(this.get('recent_selected')) {
        res = this.get('recentOfflineBoards');
      }
      return res;
    }
  ),
  pending_updates: computed(
    'appState.currentUser.pending_org',
    'appState.currentUser.pending_supervision_org',
    'appState.currentUser.pending_board_shares',
    'appState.currentUser.unread_messages',
    function() {
      var important = this.appState.get('currentUser.pending_org') ||
                  this.appState.get('currentUser.pending_supervision_org') ||
                  (this.appState.get('currentUser.pending_board_shares') || []).length > 0 ||
                  this.appState.get('currentUser.unread_messages');
      var normal_new = this.appState.get('currentUser.unread_messages.length') || 0;
      var unread_notifications = (this.appState.get('currentUser.parsed_notifications') || []).filter(function(n) { return n.unread; }).length;
      normal_new = normal_new + (unread_notifications || 0);

      if(normal_new && !this.appState.get('currentUser.read_notifications')) {
        return {count: normal_new};
      } else if(important) {
        return true;
      } else {
        return null;
      }
    }
  ),
  update_selected: observer('selected', 'persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var persistenceService = null;
    try { persistenceService = this.get('persistence') || this.persistence; } catch (e) { }
    if (!persistenceService && typeof window !== 'undefined') { persistenceService = window.persistence; }
    if(!persistenceService || typeof persistenceService.get !== 'function' || !persistenceService.get('online')) { return; }
    var _this = this;
    var last_browse = this.stashes.get('last_index_browse');
    var default_index = 2;
    // If a user already has a home board they're not going to care about popular boards,
    // they want to see something more useful like all the boards they own, or maybe
    // the home boards of all their supervisees, or maybe all their starred boards
    if(this.appState.get('currentUser.preferences.home_board.key')) {
      if(this.appState.get('currentUser.stats.user_boards') > 0) {
        default_index = 1;
      } else {
        default_index = 3;
      }
    }
    ['popular', 'personal', 'suggested', 'recent'].forEach(function(key, idx) {
      if(_this.get('selected') == key || (!_this.get('selected') && idx === default_index && !last_browse) || (!_this.get('selected') && last_browse == key)) {
        _this.set(key + '_selected', true);
        if(_this.get('selected')) {
          _this.stashes.persist('last_index_browse', key);
        }
        if(key == 'recent') {
          var p = _this.get && _this.get('persistence');
          if(p && typeof p.find_recent === 'function') {
            p.find_recent('board').then(function(boards) {
            if(boards && boards.slice) {
              boards = boards.slice(0, 12);
            }
            _this.set('recentOfflineBoards', boards);
          });
          }
        } else {
          var list = 'homeBoards';
          var locale = ((i18n.langs || {}).preferred || window.navigator.language || 'en').split(/-/)[0];
          if(_this.appState.get('currentUser.preferences.locale')) {
            locale = _this.appState.get('currentUser.preferences.locale').split(/-/)[0];
          }
          var opts = {public: true, starred: true, user_id: _this.appState.get('currentUser.id') || 'self', sort: 'custom_order', per_page: 20, preferred_locale: locale};
          if(key == 'personal') {
            list = 'personalBoards';
            opts = {user_id: 'self', root: true, per_page: 12};
          } else if(key == 'popular') {
            list = 'popularBoards';
            opts = {sort: 'home_popularity', per_page: 12, exclude_starred: _this.appState.get('currentUser.id') || 'self', locale: locale};
          }
          if(!(_this.get(list) || {}).length) {
            _this.set(list, {loading: true});
          }
          _this.get('store').query('board', opts).then(function(data) {
            _this.set(list, data);
            _this.checkForBlankSlate();
          }, function() {
            _this.set(list, {error: true});
          });
          _this.checkForBlankSlate();
        }
      } else {
        _this.set(key + '_selected', false);
      }
    });
  }),
  allow_logs: computed('appState.currentUser.preferences.logging', 'appState.currentUser.modeling_only', 'appState.currentUser.supporter_role', 'session.modeling_session', function() {
    return this.appState.get('currentUser.preferences.logging') && !this.appState.get('currentUser.supporter_role') && !this.appState.get('currentUser.modeling_only') && !session.get('modeling_session');
  }),
  reload_logs: observer('model.id', 'persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var model = this.get('model');
    var _this = this;
    var persistenceService = null;
    try { persistenceService = this.get('persistence') || this.persistence; } catch (e) { }
    if (!persistenceService && typeof window !== 'undefined') { persistenceService = window.persistence; }
    // Skip if user_id is 'cache' or starts with 'cache:' (from boards cache endpoint)
    var model_id = model && model.get('id');
    if(model && model_id && model_id != 'cache' && !model_id.toString().match(/^cache:/) && persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('online')) {
      var controller = this;
      var find_args = {user_id: model.get('id'), type: 'session'};
      if(model.get('supporter_role')) {
        find_args.supervisees = true;
      }
      if(!(controller.get('logs') || {}).length) {
        controller.set('logs', {loading: true});
      }
      this.get('store').query('log', find_args).then(function(list) {
        controller.set('logs', list.slice());
      }, function() {
        if(!(controller.get('logs') || {}).length) {
          controller.set('logs', {error: true});
        }
      });
      this.get('store').query('badge', {user_id: model.get('id'), recent: 1}).then(function(badges) {
        var for_users = {};
        badges.forEach(function(badge) {
          for_users[badge.get('user_id')] = for_users[badge.get('user_id')] || []
          for_users[badge.get('user_id')].push(badge);
        });
        _this.set('current_user_badges', for_users);
      }, function(err) { });
      model.load_word_activities();
    }
  }),
  best_badge: function(badges, goal_id) {
    return Badge.best_next_badge(badges, goal_id);
  },
  earned_badge: function(badges) {
    return Badge.best_earned_badge(badges);
  },
  update_current_badges: observer(
    'appState.sessionUser',
    'appState.sessionUser.known_supervisees',
    'appState.currentUser',
    'appState.currentUser.known_supervisees',
    'appState.currentUser.supervisees',
    'session.modeling_session',
    'current_user_badges',
    function() {
      var _this = this;
      var model = _this.get('model');
      var for_users = _this.get('current_user_badges') || {};
      if(model && for_users[model.get('id')]) {
        var b = _this.best_badge(for_users[model.get('id')], model.get('goal.id'));
        var eb = _this.earned_badge(for_users[model.get('id')]);
        if(!this.appState.get('sessionUser.currently_premium') || this.appState.get('sessionUser.supporter_role') || session.get('modeling_session')) {
          b = null;
        }
        // If no badge for the current user use the supervisee if there's only one
        var known_sups = this.appState.get('currentUser.known_supervisees') || this.appState.get('sessionUser.known_supervisees') || [];
        if(!b && known_sups.length == 1) {
          var sup = known_sups[0];
          if(sup.premium) {
            b = _this.best_badge(for_users[emberGet(sup, 'id')], (sup.goal || {}).id)
          }
        }
        emberSet(model, 'current_badge', b);
        emberSet(model, 'earned_badge', eb);
      }
      var sups = [];
      // Use known_supervisees from currentUser first (since that's what we check for tab visibility), then sessionUser
      var supervisees_list = this.appState.get('currentUser.known_supervisees') || this.appState.get('sessionUser.known_supervisees') || [];
      // If known_supervisees is empty, try to get from supervisees array
      if(supervisees_list.length === 0) {
        var raw_supervisees = this.appState.get('currentUser.supervisees') || this.appState.get('sessionUser.supervisees') || [];
        // known_supervisees is computed from supervisees, so if supervisees exists, known_supervisees should too
        // But if it's not computed yet, we can use supervisees directly
        supervisees_list = raw_supervisees;
      }
      supervisees_list.forEach(function(sup) {
        if(for_users[emberGet(sup, 'id')] && emberGet(sup, 'premium')) {
          var b = _this.best_badge(for_users[emberGet(sup, 'id')], (sup.goal || {}).id);
          emberSet(sup, 'current_badge', b);
          var eb = _this.earned_badge(for_users[emberGet(sup, 'id')]);
          emberSet(sup, 'earned_badge', eb);
        }
        if(LingoLinq.remote_url(sup.avatar_url) && !sup.local_avatar_url) {
          _this.persistence.find_url(sup.avatar_url, 'image').then(function(url) {
            emberSet(sup, 'local_avatar_url', url);
          }, function(err) { });
        } else if(sup.local_avatar_url && sup.local_avatar_url.match(/localhost/)) {
          emberSet(sup, 'local_avatar_url', capabilities.storage.fix_url(sup.local_avatar_url));
        }
        sups.push(sup);
      });
      // Always set to an array, even if empty
      _this.set('supervisees_with_badges', sups.length > 0 ? sups : []);
    }
  ),
  modeling_ideas_available: computed(
    'appState.sessionUser.supporter_role',
    'appState.sessionUser.currently_premium',
    function() {
      if(this.appState.get('sessionUser.currently_premium')) {
        return true;
      } else if(this.appState.get('sessionUser.supporter_role')) {
        var any_premium_supervisees = false;
        (this.appState.get('sessionUser.known_supervisees') || []).forEach(function(sup) {
          if(emberGet(sup, 'premium') || emberGet(sup, 'currently_premium')) {
            any_premium_supervisees = true;
          }
        });
        if(any_premium_supervisees) {
          return true;
        }
      }
      return false;
    }
  ),
  many_supervisees: computed('appState.currentUser.supervisees', function() {
    return (this.appState.get('currentUser.supervisees') || []).length > 5;
  }),
  some_supervisees: computed('appState.currentUser.supervisees', function() {
    return (this.appState.get('currentUser.supervisees') || []).length > 3;
  }),
  has_supervisees: computed('appState.currentUser.supervisees', 'appState.currentUser.known_supervisees', function() {
    return (this.appState.get('currentUser.supervisees') || []).length > 0 || (this.appState.get('currentUser.known_supervisees') || []).length > 0;
  }),
  show_communicators_tab: computed('appState.currentUser.supporter_role', 'appState.currentUser.supervisees', 'appState.currentUser.known_supervisees', function() {
    return this.appState.get('currentUser.supporter_role') || (this.appState.get('currentUser.supervisees') || []).length > 0 || (this.appState.get('currentUser.known_supervisees') || []).length > 0;
  }),
  supervisors_count: computed('appState.currentUser.supervisors', function() {
    return (this.appState.get('currentUser.supervisors') || []).length;
  }),
  managed_orgs: computed('appState.currentUser.organizations', function() {
    return (this.appState.get('currentUser.organizations') || []).filter(function(o) { 
      return o.type == 'manager' && o.restricted != true; 
    });
  }),
  has_management_responsibility: computed('managed_orgs', 'appState.currentUser.supporter_role', function() {
    return (this.get('managed_orgs') || []).length > 0 || this.appState.get('currentUser.supporter_role');
  }),
  manages_multiple_orgs: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 1;
  }),
  all_orgs: computed('managed_orgs', 'appState.currentUser.managing_supervision_orgs', function() {
    var manager = this.get('managed_orgs') || [];
    var supervisor = this.appState.get('currentUser.managing_supervision_orgs') || [];
    var seen = {};
    return manager.concat(supervisor).filter(function(o) {
      if(seen[o.id]) { return false; }
      seen[o.id] = true;
      return true;
    });
  }),
  multipleOrgs: computed('all_orgs.length', function() {
    return (this.get('all_orgs.length') || 0) > 1;
  }),
  // True when there are more organizations than the 4 shown on the card, so the
  // "View all organizations" button only appears when it has somewhere extra to go.
  orgsOverflow: computed('all_orgs.length', function() {
    return (this.get('all_orgs.length') || 0) > 4;
  }),
  // First 4 organizations the user manages/supervises, for the Rooms-style My
  // Organizations card tiles (mirrors roomsShown). Count shown is all_orgs.length.
  // `desc` is a "main-line" info string under the org name — the user's ROLE in
  // that org, the number of rooms they have IN that org (supervised_units matched
  // by organization_id), and the org's plan — joined with " · " to fill the tile.
  orgsShown: computed('all_orgs.[]', 'appState.currentUser.supervised_units.[]', function() {
    var units = this.get('appState.currentUser.supervised_units') || [];
    return (this.get('all_orgs') || []).slice(0, 4).map(function(o) {
      var role;
      if (o.type == 'manager') {
        role = o.admin ? i18n.t('org_admin', "Admin") : i18n.t('org_manager', "Manager");
      } else if (o.type == 'supervisor') {
        role = i18n.t('org_supervisor', "Supervisor");
      } else {
        role = i18n.t('org_member', "Member");
      }
      var bits = [role];
      var roomCount = units.filter(function(u) { return u && u.organization_id == o.id; }).length;
      if (roomCount > 0) {
        // Use i18n count-pluralization (prepends the number + picks the right
        // plural form) instead of concatenating a singular/plural ternary, so
        // locales with different plural rules / word order render correctly.
        bits.push(i18n.t('n_rooms', "room", {count: roomCount}));
      }
      if (o.premium) { bits.push(i18n.t('premium', "Premium")); }
      return { id: o.id, name: o.name, desc: bits.join(' · ') };
    });
  }),
  orgDropdownOpen: false,
  autoOpenSpeakMode: computed('appState.currentUser.preferences.auto_open_speak_mode', {
    get() {
      return this.appState.get('currentUser.preferences.auto_open_speak_mode');
    },
    set(key, value) {
      // Set the value on the model
      this.appState.set('currentUser.preferences.auto_open_speak_mode', value);
      // Trigger a save
      this.appState.get('currentUser').save().then(null, function() { });
      return value;
    }
  }),
  index_nav: computed(
    'index_nav_state',
    'model.supporter_role',
    'appState.currentUser.preference.device.last_index_nav',
    function() {
      var res = {};
      if(this.get('index_nav_state')) {
        res[this.get('index_nav_state')] = true;
      } else if(this.appState.get('currentUser.preferences.device.last_index_nav')) {
        res[this.appState.get('currentUser.preferences.device.last_index_nav')] = true;
      } else {
        if(this.get('model.supporter_role')) {
          res.main = true;
        } else {
          res.main = true;
        }
      }
      return res;
    }
  ),
  subscription_check: observer('appState.sessionUser', 'appState.logging_in', function() {
    if(this.get('appState.sessionUser') && !this.get('appState.installed_app')) {
      var progress = this.get('appState.sessionUser.preferences.progress');
      var user = this.get('appState.sessionUser');
      var needs_subscribe_modal = false;
      if(!progress || (!progress.skipped_subscribe_modal && !progress.setup_done)) {
        // TEMPORARILY DISABLED 2026-05-27: post-registration subscribe
        // modal is suppressed so newly-registered users route directly
        // into the home-page tour instead (see routes/register.js
        // `save_done` → appState.auto_open_home_tour = true, which
        // guided-tour.js observes and auto-fires).
        //
        // The subscribe modal template, component, SCSS, and the
        // `modal.open('subscribe')` mechanism are all preserved — to
        // restore the original behavior, uncomment the if/grace_period
        // block below and remove the auto_open_home_tour line in
        // routes/register.js.
        //
        // if(user.get('grace_period')) {
        //   if(modal.route) {
        //     needs_subscribe_modal = true;
        //   }
        // }
      } else if(this.get('appState.sessionUser.really_expired')) {
        // Expired-account path is UNCHANGED — existing users whose
        // trial ran out still see the subscribe modal so they can
        // renew. Only the new-registration grace_period path above
        // is suppressed.
        needs_subscribe_modal = true;
      }
      if(needs_subscribe_modal && !this.appState.get('logging_in')) {
        if(!this.get('appState.installed_app')) {
          modal.open('subscribe');
        }
      }
    }
  }),
  showSupervisorsWhenRequested: observer('appState.requestedSupervisorsView', function() {
    if(this.appState.get('requestedSupervisorsView')) {
      this.appState.set('requestedSupervisorsView', false);
      this.send('set_index_nav', 'supervisors');
      this.set('activeTab', 'supervisors');
    }
  }),
  rating_allowed: computed('appState.sessionUser', function() {
    if(capabilities.installed_app && capabilities.mobile && capabilities.subsystem != 'Kindle') {
      var progress = this.appState.get('sessionUser.preferences.progress') || {};
      if(progress.rated) {
        return false;
      }
      if(this.appState.get('sessionUser.joined') && this.appState.get('sessionUser.joined') < window.moment().add(-28, 'day')) {
        return (Math.round(this.appState.get('sessionUser.joined').getTime() / 1000 / 60 / 60 / 24 / 7) % 4) == 0;
      }
    }
    return false;
  }),
  demoMainContentBg: null,
  demoMainContentBgStyle: computed('demoMainContentBg', function() {
    var bg = this.get('demoMainContentBg');
    return bg ? htmlSafe('background: ' + bg + ';') : htmlSafe('');
  }),
  // 'off' | 'thin' | 'thick' – cycle: first toggle = thin, second = thick, third = off
  sectionBorderMode: 'off',

  // Feeds the responsive .md-pillnav-dropdown trigger, so the label it shows for
  // the home tab has to match the pill itself — supporters read "Dashboard" —
  // hence the shared homePillLabel rather than a second copy of that rule.
  // (Defaults are double-quoted per the i18n convention: a single-quoted default
  // is silently DELETED by the next i18n_generator.rb run.)
  // `has_management_responsibility` is READ below and must be a dependent key, or the
  // dropdown trigger keeps a stale label when org-manager status resolves after first
  // render (late org payload, or a role change in-session) — the pill row beside it
  // would say "Home" while this said "Dashboard", the exact disagreement homePillLabel
  // exists to prevent.
  activeTabLabel: computed('activeTab', 'appState.currentUser.supporter_role', 'appState.currentUser.has_management_responsibility', function() {
    var tab = this.get('activeTab');
    var labels = { home: homePillLabel(this.get('appState.currentUser.supporter_role'), this.get('appState.currentUser.has_management_responsibility')), boards: i18n.t('boards', "Boards"), reports: i18n.t('reports', "Reports"), extras: i18n.t('extras', "Extras"), supervisors: i18n.t('supervisors', "Supervisors") };
    return labels[tab] || labels.home;
  }),
  /** Index route @model is the logged-in user; @user is registration placeholder — use model for boards embed */
  boardsEmbedUser: computed('model', 'appState.currentUser', function() {
    return this.get('model') || this.get('appState.currentUser');
  }),
  showGettingStarted: computed('appState.currentUser.preferences.progress', function() {
    // Getting Started onboarding flow is currently DISABLED — we're
    // evaluating whether to bring it back in a later iteration. Returning
    // false here also strips the `md-grid--with-getting-started` modifier
    // from the dashboard grid (see authenticated-view.hbs), so the layout
    // doesn't reserve a hole where the card used to live. To re-enable:
    // restore the original return below AND un-comment the matching
    // article block in app/components/dashboard/authenticated-view.hbs.
    // var progress = this.appState.get('currentUser.preferences.progress');
    // return progress && !progress.setup_done;
    return false;
  }),
  gettingStartedPercent: computed('appState.currentUser.preferences.progress', function() {
    var options = ['intro_watched', 'profile_edited', 'preferences_edited', 'home_board_set', 'app_added'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 100; }
    var done = 0;
    options.forEach(function(opt) { if (progress[opt]) { done++; } });
    return options.length ? Math.round(done / options.length * 100) : 0;
  }),
  gettingStartedPercentStyle: computed('gettingStartedPercent', function() {
    return htmlSafe('width: ' + this.get('gettingStartedPercent') + '%;');
  }),
  gettingStartedStep: computed('appState.currentUser.preferences.progress', function() {
    var order = ['intro_watched', 'home_board_set', 'app_added', 'preferences_edited', 'profile_edited'];
    var progress = this.appState.get('currentUser.preferences.progress') || {};
    if (progress.setup_done) { return 5; }
    for (var i = 0; i < order.length; i++) {
      if (!progress[order[i]]) { return i + 1; }
    }
    return 5;
  }),
  boardsLoading: computed('_previewBoardsLoaded', '_fetchedPreviewBoards', function() {
    return this.get('_previewBoardsLoaded') && !this.get('_fetchedPreviewBoards');
  }),
  previewBoards: computed(
    '_fetchedPreviewBoards.[]',
    // Prefer the FULL fetched library (same pool boardCount uses) once it has
    // paginated in: filterRootBoards is first-page-sensitive, so clustering only
    // the first page leaks sub-board copies of a set into the strip. Recompute
    // when the full set (and its per-board star/name) arrives.
    '_fetchedBoards.[]',
    '_fetchedBoards.@each.starred_for_current_user',
    '_fetchedBoards.@each.name',
    // The appended 6th tile is the system Crisis Vocabulary board from the sidebar.
    'appState.sidebar_boards',
    // Re-sort the preview when a board's liked status flips or its
    // display name changes, since the new ordering rule
    // (home → liked-alpha → others-alpha) reads both per-board.
    // IMPORTANT: must depend on `starred_for_current_user`, NOT the
    // raw `starred` attribute. The boards-index endpoint that
    // populates `_fetchedPreviewBoards` doesn't pass permissions, so
    // every record has starred=undefined (see board.js:859). The
    // computed `starred_for_current_user` falls back to the user's
    // `stats.starred_board_refs` list, which is the same source the
    // template uses to render the heart icon on each tile — keeping
    // the sort partition and the heart rendering in sync.
    '_fetchedPreviewBoards.@each.starred_for_current_user',
    '_fetchedPreviewBoards.@each.name',
    'appState.referenced_user.stats.starred_board_refs.[]',
    // Re-snapshot when a board's image attrs change. The board model's
    // checkForDataURLOnChange observer sets `image_data_uri` after a
    // user visits a board (offline-caching), and `image_url` itself
    // can refresh during a record reload. Without tracking these,
    // the POJO's captured `imageUrl` stayed pointing at the original
    // (sometimes now-invalid) URL, leaving the thumb broken on return.
    '_fetchedPreviewBoards.@each.image_url',
    '_fetchedPreviewBoards.@each.image_data_uri',
    'appState.currentUser.preferences.home_board.key',
    'appState.currentUser.preferences.home_board.id',
    function() {
      var _this = this;
      // Roots only — `store.query('board', {user_id})` returns the full owned
      // library INCLUDING every sub-board copy in a copied set, so the raw pool
      // would fill the 5-tile preview with sub-boards. Cluster to root tiles the
      // same way `boardCount` (this component) and the boards page do. Prefer the
      // FULL `_fetchedBoards` pool (falling back to the first preview page until it
      // arrives): `filterRootBoards` is first-page-sensitive, so clustering only the
      // first 20 records lets sub-board copies leak through. See utils/board-roots.js
      // / LEARNINGS "visible-tile counts need root clustering".
      var pool = this.get('_fetchedBoards') || this.get('_fetchedPreviewBoards') || [];
      var fetched = filterRootBoards(pool, this.get('appState.currentUser.id'));
      var thumbClasses = ['md-thumb--a', 'md-thumb--b', 'md-thumb--c', 'md-thumb--d', 'md-thumb--e', 'md-thumb--f'];
      var seen = {};
      var ordered = [];
      // When a board's display name falls back to its key (no `name`
      // setting or no record loaded), the key has the shape
      // "user_name/board-slug" and overflows the 150px tile width.
      // Insert a zero-width space after each `/` so the browser's
      // line-breaking algorithm prefers that as the wrap point
      // (otherwise it picks the dash inside the slug and produces
      // "vocal-" / "flair-84" instead of "user_name/" / "vocal-flair-84").
      // ZWSP doesn't affect text width, copy-paste, or accessibility.
      var add = function(board, fallbackName, key, fallbackImg, isHome) {
        if (!key || seen[key]) { return; }
        seen[key] = true;
        var rawName = (board && board.get && board.get('name')) || fallbackName || key;
        var displayName = (typeof rawName === 'string' && rawName.indexOf('/') !== -1)
          ? rawName.replace(/\//g, '/​')
          : rawName;
        ordered.push({
          board: board,
          name: displayName,
          imageUrl: (board && board.get && board.get('icon_url_with_fallback')) || fallbackImg || '',
          key: key,
          languageLabel: board && board.get ? (function() {
            var locale = board.get('locale');
            var locales = board.get('locales') || [];
            if(!locale) { return null; }
            if(locales.length <= 1 && (locale === 'en' || locale === 'en-US')) { return null; }
            return i18n.readable_language(locale);
          })() : null,
          // Flag the home-board tile so the template can apply the
          // distinct outline + glow + "Home Board" badge styling
          // defined in app.scss (.md-strip__item--home).
          isHome: !!isHome
        });
      };

      // Ordering rule (per request):
      //   1. Home board first (always, when set)
      //   2. Liked / starred boards next, alphabetical by name
      //   3. Everything else, alphabetical by name
      // The "Last used board" step that previously occupied slot #2 has
      // been removed — it conflicted with the liked-first rule and the
      // last_board_name computed below still exists for other surfaces.

      // 1. Home board
      var homeKey = this.appState.get('currentUser.preferences.home_board.key');
      var homeId = this.appState.get('currentUser.preferences.home_board.id');
      if (homeKey) {
        var homeRec = null;
        if (homeId) {
          try { homeRec = this.get('store').peekRecord('board', homeId); } catch(e) { }
        }
        if (!homeRec) {
          homeRec = fetched.find(function(b) { return b.get('key') === homeKey; });
        }
        add(homeRec, this.appState.get('currentUser.preferences.home_board.name'), homeKey, null, true);
      }

      // 2 + 3. Partition the fetched pool into starred and non-starred,
      // sort each alphabetically (case-insensitive, locale-aware), then
      // emit starred first followed by the rest. seen[key] in `add`
      // already keeps the home board from being re-added.
      var alphaByName = function(a, b) {
        var an = ((a && a.get && a.get('name')) || a.get('key') || '').toLowerCase();
        var bn = ((b && b.get && b.get('name')) || b.get('key') || '').toLowerCase();
        return an.localeCompare(bn);
      };
      // Use `starred_for_current_user` (NOT raw `starred`) — see the
      // dependent-keys comment above for why.
      var starredAlpha = fetched.filter(function(b) { return b && b.get && b.get('starred_for_current_user'); }).sort(alphaByName);
      var othersAlpha  = fetched.filter(function(b) { return b && b.get && !b.get('starred_for_current_user'); }).sort(alphaByName);
      // Cap the home + middle section at 4 (home board + up to 3 favourites,
      // falling back to 3 others from the collection) so that, with the Crisis
      // board appended below, the strip shows exactly FIVE tiles total.
      starredAlpha.forEach(function(board) {
        if (ordered.length >= 4) { return; }
        add(board, board.get('name'), board.get('key'), board.get('icon_url_with_fallback'));
      });
      othersAlpha.forEach(function(board) {
        if (ordered.length >= 4) { return; }
        add(board, board.get('name'), board.get('key'), board.get('icon_url_with_fallback'));
      });

      var top = ordered.slice(0, 4);
      // Append the system "Crisis Vocabulary" board (on everyone's sidebar) as the
      // 5th/last tile — same key/name/image the sidebar uses.
      try {
        var sidebars = this.appState.get('sidebar_boards') || [];
        var crisis = null;
        for (var ci = 0; ci < sidebars.length; ci++) {
          var ck = emberGet(sidebars[ci], 'key');
          if (ck && ck.split('/').pop() === 'crisis-vocabulary') { crisis = sidebars[ci]; break; }
        }
        if (crisis) {
          var crisisKey = emberGet(crisis, 'key');
          if (!top.some(function(it) { return it.key === crisisKey; })) {
            top = top.concat([{
              board: null,
              name: emberGet(crisis, 'name') || i18n.t('crisis_vocabulary', "Crisis Vocabulary"),
              imageUrl: emberGet(crisis, 'image') || '',
              key: crisisKey,
              languageLabel: null,
              isHome: false,
              // The system Crisis/Emergency board — flagged so the strip can keep
              // showing it (alongside the home board) when the small-screen rule
              // hides the other tiles (see ≤1024px rule in app.scss).
              isEmergency: true
            }]);
          }
        }
      } catch (e) { /* crisis tile is a best-effort append — never block the strip */ }
      return top.map(function(item, idx) {
        item.thumbClass = thumbClasses[idx % thumbClasses.length];
        return item;
      });
    }
  ),
  _loadPreviewBoards: observer('appState.currentUser.id', function() {
    var _this = this;
    var user = _this.get('appState.currentUser');
    if (!user || !user.get('id')) { return; }
    if (_this.get('_previewBoardsLoaded')) { return; }
    _this.set('_previewBoardsLoaded', true);
    // Fetch preview boards (5) and total count in parallel
    // Bumped from 5 to 20 so previewBoards has enough variety to apply
    // its home → liked-alpha → others-alpha ordering rule. The preview
    // still slices to 5; the extras only serve to give the client-side
    // partition (starred vs not) something real to sort. Board count
    // follow-up (_fetchRemainingForCount) is unaffected — it just sees
    // a larger first page before paging the rest for the total count.
    _this.get('store').query('board', { user_id: user.get('id'), per_page: 20 }).then(function(boards) {
      if (_this.isDestroying || _this.isDestroyed) { return; }
      var results = boards.map(function(b) { return b; });
      _this.set('_fetchedPreviewBoards', A(results));
      var meta = _this.get('persistence').meta('board', boards);
      if (meta && meta.more) {
        _this._fetchRemainingForCount(user.get('id'), meta.next_offset, results);
      } else {
        _this.set('_fetchedBoards', A(results));
      }
    }, function() {
      if (_this.isDestroying || _this.isDestroyed) { return; }
      _this.set('_fetchedPreviewBoards', A([]));
    });
  }),
  _fetchRemainingForCount: function(userId, offset, accumulated) {
    var _this = this;
    _this.get('store').query('board', { user_id: userId, offset: offset }).then(function(boards) {
      if (_this.isDestroying || _this.isDestroyed) { return; }
      var combined = accumulated.concat(boards.map(function(b) { return b; }));
      var meta = _this.get('persistence').meta('board', boards);
      if (meta && meta.more) {
        _this._fetchRemainingForCount(userId, meta.next_offset, combined);
      } else {
        _this.set('_fetchedBoards', A(combined));
      }
    }, function() {
      if (_this.isDestroying || _this.isDestroyed) { return; }
      _this.set('_fetchedBoards', A(accumulated));
    });
  },
  /* Count of the user's CORE (root tile) boards, matching the "My
     Boards" stat on the boards page. /api/v1/boards?user_id=X returns
     every board copy in the library, so filterRootBoards clusters the
     fetched pool the same way myBoardsRoots does on the boards page.
     Prefer the pool the dashboard fetched itself; fall back to
     currentUser.my_boards if the boards page has already populated
     it. */
  boardCount: computed('_fetchedBoards.[]', 'appState.currentUser.my_boards.[]', 'appState.currentUser.id', function() {
    var user = this.get('appState.currentUser');
    if (!user) { return 0; }
    var userId = user.get('id');
    var boards = this.get('_fetchedBoards');
    if (!boards || !boards.length) {
      boards = user.get('my_boards');
    }
    if (!boards || !boards.forEach) { return 0; }
    return filterRootBoards(boards, userId).length;
  }),
  extrasItems: computed('appState.currentUser', 'appState.currentUser.permissions.delete', 'appState.currentUser.supporter_role', 'appState.feature_flags.lessons', 'appState.feature_flags.emergency_boards', 'appState.currentUser.currently_premium_or_fully_purchased', 'appState.currentUser.external_device', function() {
    var appState = this.appState;
    var user = appState.get('currentUser');
    var perms = user && user.get('permissions.delete');
    var modelingOnly = user && user.get('modeling_only');
    var externalDevice = user && user.get('external_device');
    var supporterRole = user && user.get('supporter_role');
    // Communicators keep a Reports card in Extras IN ADDITION to the pill-nav (which
    // now shows Reports for everyone — see showReportsPill), so they can reach it from
    // either place. Supporters get Reports in the pill only, not duplicated in Extras.
    var showReports = !supporterRole;
    var lessons = appState.get('feature_flags.lessons') && user && user.get('currently_premium_or_fully_purchased');
    var emergencyBoards = appState.get('feature_flags.emergency_boards');
    // NOTE: there is deliberately no Setup/Getting-Started card here. The `setup`
    // route still exists and is still reachable by its own means, but the Extras
    // page no longer advertises it to ANY user (the matching 'intro' branches in
    // `extraAction` and the card-icon switch were removed with it).
    return [
      { title_key: 'sync', title_default: 'Sync', subtitle_key: 'sync_subtitle', subtitle_default: 'Sync your data', image: 'images/pastel-logging.png', action: 'sync_details', btn_key: 'sync', btn_default: 'Sync', show: !externalDevice },
      { title_key: 'goals', title_default: 'Goals', subtitle_key: 'goals_subtitle', subtitle_default: 'Track progress', image: 'images/pastel-reports2.png', action: 'goals', btn_key: 'view', btn_default: 'View', show: !!perms },
      // Reports — surfaced here for users who don't have it in the pill-nav.
      { title_key: 'reports', title_default: 'Reports', subtitle_key: 'reports_extras_subtitle', subtitle_default: 'Usage & progress', image: 'images/pastel-reports2.png', action: 'reports', btn_key: 'view', btn_default: 'View', show: showReports },
      { title_key: 'new_note', title_default: 'New Note', subtitle_key: 'new_note_subtitle', subtitle_default: 'Add a progress note', image: 'images/pastel-chat.svg', action: 'record_note', btn_key: 'add', btn_default: 'Add', show: !modelingOnly },
      // Run Evaluation is an SLP/supporter assessment tool — hidden on a communicator's own account.
      { title_key: 'run_eval', title_default: 'Run Evaluation', subtitle_key: 'run_eval_subtitle', subtitle_default: 'Assessment tools', image: 'images/pastel-lightbulb.png', action: 'run_eval', btn_key: 'run_action', btn_default: 'Run', show: !modelingOnly && !!supporterRole },
      { title_key: 'my_account', title_default: 'My Account', subtitle_key: 'profile_and_settings', subtitle_default: 'Profile and settings', image: 'images/pastel-extras.png', action: 'account', btn_key: 'open', btn_default: 'Open', show: !!perms },
      { title_key: 'supervisors', title_default: 'Supervisors', subtitle_key: 'manage_supervisors_sub', subtitle_default: 'Who supports you', image: 'images/pastel-chat.svg', action: 'supervisors', btn_key: 'view', btn_default: 'View', show: true },
      { title_key: 'trainings', title_default: 'Trainings', subtitle_key: 'trainings_subtitle', subtitle_default: 'Continuing education', image: 'images/pastel-modeling.png', action: 'lessons', btn_key: 'start', btn_default: 'Start', show: !!lessons },
      { title_key: 'critical_access', title_default: 'Basic Access', subtitle_key: 'offline_boards_subtitle', subtitle_default: 'Offline boards', image: 'images/pastel-house.png', action: 'offline_boards', btn_key: 'access', btn_default: 'Access', show: !!emergencyBoards }
    ];
  }),

  actions: {
    // Approve / deny a pending org (or supervision) request from the home page
    // notice — same supervisor_key save the user/index controller uses, run
    // against the current user.
    approve_or_reject_org: function(decision) {
      // Acts ONLY on the session's own currentUser: pending_org /
      // pending_supervision_org are computeds on that user, so the action can
      // never target another user's relationship (ownership is enforced by
      // construction; the server re-authorizes the supervisor_key on save).
      var user = this.get('appState.currentUser');
      if(!user) { return; }
      // Prevent a double-save race from rapid clicks (Approve/Deny tapped twice).
      if(user.get('isSaving')) { return; }
      if(decision === 'user_approve' || decision === 'user_reject') {
        // Bail if the pending org cleared (e.g. resolved elsewhere) between render
        // and click, rather than firing a no-op key.
        if(!user.get('pending_org')) { return; }
        user.set('supervisor_key', decision === 'user_approve' ? 'approve-org' : 'remove_supervisor-org');
      } else if(decision === 'supervisor_approve' || decision === 'supervisor_reject') {
        // Same guard for the supervision id: bail rather than build a
        // 'remove_supervision-undefined' key the server would silently reject.
        var org_id = user.get('pending_supervision_org.id');
        if(!org_id) { return; }
        var prefix = (decision === 'supervisor_approve') ? 'approve_supervision-' : 'remove_supervision-';
        user.set('supervisor_key', prefix + org_id);
      } else {
        return;
      }
      // Don't swallow the result — an org-approval that silently fails would
      // leave the user believing the relationship was approved/denied when it
      // wasn't. Confirm success and surface failure so they can retry.
      if(user.save) {
        user.save().then(function() {
          modal.success(i18n.t('org_response_saved', "Your response was saved."));
        }, function() {
          modal.error(i18n.t('error_saving_org_response', "There was a problem saving your response. Please try again."));
        });
      }
    },
    addOrganization: function() {
      var user_name = this.appState.get('currentUser.user_name');
      if(user_name) {
        this.get('router').transitionTo('user.subscription', user_name);
      }
    },
    // Single action for the My Organizations card-as-button: open the
    // organizations list when the user has any, otherwise fall through to the
    // add-organization flow (mirrors the prior two-button behavior).
    goOrganizations: function() {
      if ((this.get('all_orgs.length') || 0) > 0) {
        this.get('router').transitionTo('organizations');
      } else {
        this.send('addOrganization');
      }
    },
    goToBoard: function(boardKey) {
      if (boardKey) {
        var parts = boardKey.split('/');
        if(parts.length === 2) {
          // Open in the user's preferred view: board-detail (modern) by default,
          // board-alt (classic) only when board_view_style === 'classic'.
          this.get('router').transitionTo(board_view_route(this.get('appState.currentUser')), parts[0], parts[1]);
        } else {
          // Canonical /key route — routes/board.js already redirects by preference.
          this.get('router').transitionTo('board', boardKey);
        }
      }
    },
    invalidateSession: function() {
      session.invalidate(true);
    },
    setDemoMainContentBg: function(color) {
      var current = this.get('demoMainContentBg');
      this.set('demoMainContentBg', current === color ? null : color);
    },
    clearDemoMainContentBg: function() {
      this.set('demoMainContentBg', null);
    },
    toggleSectionBorder: function() {
      var mode = this.get('sectionBorderMode');
      var next = mode === 'off' ? 'thin' : (mode === 'thin' ? 'thick' : 'off');
      this.set('sectionBorderMode', next);
    },
    openSearch: function() {
      this.set('isSearchOpen', true);
      // Move focus to the search field once the overlay renders (replaces the
      // `autofocus` attribute, which reduces accessibility and is unreliable in an SPA).
      runLater(function() {
        var el = document.querySelector('.md-searchOverlay__input');
        if(el) { el.focus(); }
      }, 50);
    },
    closeSearch: function() {
      this.set('isSearchOpen', false);
    },
    onSearchKeydown: function(event) {
      if (event && event.key === 'Escape') {
        if (this.get('pillnavDropdownOpen')) {
          this.set('pillnavDropdownOpen', false);
        } else {
          this.set('isSearchOpen', false);
        }
      }
    },
    goTab: function(tab) {
      if (tab === 'reports') {
        var u = this.appState.get('currentUser.user_name');
        if (u) { this.get('router').transitionTo('user.stats', u); }
        return;
      }
      if (tab === 'boards') {
        var ub = this.appState.get('currentUser.user_name');
        if (ub) {
          this.get('router').transitionTo('user.boards', ub).then(function() {
            var content = document.getElementById('content');
            if (content) { content.scrollTop = 0; }
            window.scrollTo(0, 0);
          });
        }
        return;
      }
      if (tab === 'extras') {
        var ux = this.appState.get('currentUser.user_name');
        if (ux) {
          this.get('router').transitionTo('user.extras', ux).then(function() {
            var content = document.getElementById('content');
            if (content) { content.scrollTop = 0; }
            window.scrollTo(0, 0);
          });
        }
        return;
      }
      if (tab === 'home') {
        var uh = this.appState.get('currentUser.user_name');
        var homeFrom = this.get('router.currentRouteName');
        if (uh && homeFrom !== 'user.home') {
          this.get('router').transitionTo('user.home', uh);
        } else {
          this.set('activeTab', 'home');
        }
        this.set('showNewBoardForm', false);
        return;
      }
      this.set('activeTab', tab);
    },
    togglePillnavDropdown: function() {
      this.set('pillnavDropdownOpen', !this.get('pillnavDropdownOpen'));
    },
    toggleOrgDropdown: function() {
      this.toggleProperty('orgDropdownOpen');
    },
    selectTab: function(tab) {
      this.send('goTab', tab);
      this.set('pillnavDropdownOpen', false);
    },
    go: function(dest) {
      if (dest === 'speak') {
        var user = this.appState.get('currentUser');
        var homeBoard = user && user.get('preferences.home_board');
        var lastBoard = this.stashes.get('root_board_state');
        if (!lastBoard || !lastBoard.key) {
          lastBoard = sessionHistory.last_board(user && user.get('user_name')) || lastBoard;
        }
        // Continue Speaking: prefer the user's home board; fall back to last board in board-detail
        var target = (homeBoard && homeBoard.key) ? homeBoard : ((lastBoard && lastBoard.key) ? lastBoard : null);
        if (target && target.key) {
          var parts = target.key.split('/');
          if(parts.length === 2) {
            this.get('router').transitionTo('user.board-detail', parts[0], parts[1]);
          } else {
            this.get('router').transitionTo('board', target.key);
            this.appState.toggle_mode('speak', {force: true, override_state: target});
          }
        } else if (user && user.get('user_name')) {
          this.get('router').transitionTo('user.boards', user.get('user_name')).then(function() {
            var content = document.getElementById('content');
            if (content) { content.scrollTop = 0; }
            window.scrollTo(0, 0);
          });
        }
        return;
      }
      if (dest === 'last_board') {
        var u2 = this.appState.get('currentUser');
        var lb = this.stashes.get('root_board_state');
        if (!lb || !lb.key) {
          lb = sessionHistory.last_board(u2 && u2.get('user_name')) || lb;
        }
        if (lb && lb.key) {
          var lbp = lb.key.split('/');
          if (lbp.length === 2) {
            this.get('router').transitionTo('user.board-detail', lbp[0], lbp[1]);
          } else {
            this.get('router').transitionTo('board', lb.key);
            this.appState.toggle_mode('speak', {force: true, override_state: lb});
          }
        }
        return;
      }
      if (dest === 'reports') {
        var u = this.appState.get('currentUser.user_name');
        if (u) { this.get('router').transitionTo('user.stats', u); }
        return;
      }
      if (dest === 'boards') {
        var un = this.appState.get('currentUser.user_name');
        if (un) { this.get('router').transitionTo('user.boards', un); }
        return;
      }
      if (dest === 'extras' || dest === 'supervisors') {
        var ux2 = this.appState.get('currentUser.user_name');
        if (ux2) { this.get('router').transitionTo('user.extras', ux2); }
      }
    },
    goAndCloseSearch: function(dest) {
      this.set('isSearchOpen', false);
      this.send('go', dest);
    },
    openExtrasTab: function() {
      this.set('isSearchOpen', false);
      var ue = this.appState.get('currentUser.user_name');
      if (ue) { this.get('router').transitionTo('user.extras', ue); }
    },
    openNewBoardOnBoards: function() {
      var _this = this;
      var go = function() { _this.get('router').transitionTo('create-board-new'); };
      if (this.appState.check_for_needing_purchase) {
        this.appState.check_for_needing_purchase().then(go, go);
      } else {
        go();
      }
    },
    openSupervisorsModal: function() {
      modal.open('dashboard-supervisors-modal');
    },
    closeNewBoardForm: function() {
      this.set('showNewBoardForm', false);
    },
    getting_started: function() {
      this.get('modal').open('getting-started', { progress: this.appState.get('currentUser.preferences.progress') });
    },
    // Open the Dashboard Design tour (display-style, mounted in the navbar)
    // directly on the "choose your display style" page. Prefer the DIRECT opener
    // the tour registers on appState (deterministic — no cross-component observer
    // timing/coalescing), and fall back to the appState signal (which the tour
    // also observes) if the tour component hasn't registered yet.
    editDashboard: function() {
      var opener = this.get('appState.dashboard_design_opener');
      if (opener) {
        opener('display_style_display');
      } else {
        this.get('appState').set('open_dashboard_design', 'display');
      }
    },
    extraAction: function(name) {
      var _this = this;
      var appState = this.appState;
      var user = appState.get('currentUser');
      var userName = user && user.get('user_name');
      var userId = user && user.get('id');
      // Drop focus from the activating card before running the action. Several of
      // these actions open a modal, and modal-dialog returns focus to the
      // previously-focused element when it closes (WCAG focus-return,
      // modal-dialog.js:144). That left the clicked extras card stuck showing a
      // persistent focus state after the modal closed. modal-dialog only records a
      // restore target when document.activeElement !== document.body at capture time
      // (modal-dialog.js:30), so blurring the card here means body is active when the
      // modal captures focus and nothing is restored to the card. Navigation actions
      // are unaffected (the route change moves focus regardless).
      try {
        var active = (typeof document !== 'undefined') && document.activeElement;
        if (active && active.blur && active.closest && active.closest('.md-extras-card')) {
          active.blur();
        }
      } catch(e) { }
      if (name === 'newBoard') {
        var go = function() { _this.get('router').transitionTo('create-board-new'); };
        if (this.appState.check_for_needing_purchase) {
          this.appState.check_for_needing_purchase().then(go, go);
        } else {
          go();
        }
      } else if (name === 'searchBoards') {
        this.get('router').transitionTo('search', 'any', encodeURIComponent('_'));
      } else if (name === 'sync_details') {
        var p = typeof window !== 'undefined' && window.persistence;
        var list = (p && p.get && p.get('sync_log')) ? [].concat(p.get('sync_log')).reverse() : [];
        modal.open('sync-details', { details: list });
      } else if (name === 'goals') {
        if (userName) { this.get('router').transitionTo('user.goals', userName); }
      } else if (name === 'reports') {
        if (userName) { this.get('router').transitionTo('user.stats', userName); }
      } else if (name === 'record_note') {
        if (this.appState.check_for_needing_purchase) {
          this.appState.check_for_needing_purchase().then(function() { modal.open('record-note', { note_type: 'text', user: user }); }, function() { modal.open('record-note', { note_type: 'text', user: user }); });
        } else {
          modal.open('record-note', { note_type: 'text', user: user });
        }
      } else if (name === 'run_eval') {
        this.send('run_eval', 'pick');
      } else if (name === 'account') {
        if (userName) { this.get('router').transitionTo('user', userName); }
      } else if (name === 'lessons') {
        if (userId) { this.get('router').transitionTo('user.lessons', userId); }
      } else if (name === 'offline_boards') {
        this.get('router').transitionTo('offline_boards');
      } else if (name === 'supervisors') {
        // The whole Supervisors card is now the action (no separate button),
        // so route its action through here too.
        this.send('openSupervisorsModal');
      }
    },
    recordNoteFor: function(supervisee) {
      var user = supervisee || this.appState.get('currentUser');
      if (!emberGet(user, 'avatar_url_with_fallback')) {
        emberSet(user, 'avatar_url_with_fallback', emberGet(user, 'avatar_url'));
      }
      var _this = this;
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('record-note', { note_type: 'text', user: user }).then(function() {
          runLater(function() {
            _this.appState.get('currentUser').reload().then(null, function() {});
          }, 5000);
        });
      }, function() {
        modal.open('record-note', { note_type: 'text', user: user });
      });
    },
    quickAssessmentFor: function(supervisee) {
      if (emberGet(supervisee, 'premium') || emberGet(supervisee, 'currently_premium')) {
        modal.open('quick-assessment', { user: supervisee });
      } else {
        modal.open('premium-required', { user_name: supervisee.user_name, action: 'quick_assessment', reason: 'not_currently_premium' });
      }
    },
    reload: function() {
      location.reload();
    },
    searchBoards: function() {
      this.get('router').transitionTo('search', 'any', encodeURIComponent('_'));
    },
    newBoard: function() {
      var _this = this;
      this.appState.check_for_needing_purchase().then(function() {
        _this.get('router').transitionTo('create-board-new');
      });
    },
    quick_assessment: function(user) {
      if(emberGet(user, 'premium') || emberGet(user, 'currently_premium')) {
        modal.open('quick-assessment', {user: user});
      } else {
        modal.open('premium-required', {user_name: user.user_name, action: 'quick_assessment', reason: 'not_currently_premium'});
      }
    },
    lessons: function(user) {
      if(user == 'pick') {
        if(this.appState.get('sessionUser.supporter_role') && (this.appState.get('sessionUser.known_supervisees.length') > 0 || this.appState.get('currentUser.managed_orgs.length') > 0)) {
          this.appState.get('controller').send('switch_communicators', {header: i18n.t('select_user_to_review_lessons', "Select User to Review Trainings"), stay: true, route: 'user.lessons'})
          return;
        } else {
          user = this.appState.get('currentUser');
        }
      }
      user = user || this.appState.get('currentUser');
      this.get('router').transitionTo('user.lessons', emberGet(user, 'id'));
    },
    run_eval: function(user) {
      if(user == 'pick') {
        if(this.appState.get('sessionUser.supporter_role') && (this.appState.get('sessionUser.known_supervisees.length') > 0 || this.appState.get('currentUser.managed_orgs.length') > 0)) {
          var prompt = i18n.t('select_user_for_eval', "Select User for Evaluation");
          this.appState.get('controller').send('switch_communicators', {stay: true, modeling: false, skip_me: !this.appState.get('currentUser.subscription.premium_supporter_plus_communicator'), header: prompt, eval: true});
          return;
        } else {
          user = this.appState.get('currentUser');
        }
      }
      this.appState.check_for_currently_premium(user, 'eval', false, true).then(function() {
        this.appState.set_speak_mode_user(emberGet(user, 'id'), false, false, 'obf/eval');
      }.bind(this));
    },
    remote_model: function(user) {
      if(user.premium || emberGet(user, 'currently_premium')) {
        modal.open('modals/remote-model', {user_id: user.id});
      } else {
        modal.open('premium-required', {user_name: user.user_name, action: 'evaluation', reason: 'not_currently_premium'});
      }
    },
    support: function() {
      modal.open('support');
    },
    record_note: function(user) {
      user = user || this.appState.get('currentUser');
      if(!emberGet(user, 'avatar_url_with_fallback')) {
        emberSet(user, 'avatar_url_with_fallback', emberGet(user, 'avatar_url'));
      }
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('record-note', {note_type: 'text', user: user}).then(function() {
          runLater(function() {
            this.appState.get('currentUser').reload().then(null, function() { });
          }.bind(this), 5000);
        }.bind(this));  
      }.bind(this));
    },
    sync: function() {
      var p = this.get && this.get('persistence');
      if(!p || typeof p.get !== 'function') { return; }
      if(!p.get('online') || p.get('syncing')) {
        return;
      }
      if(!p.get('syncing')) {
        console.debug('syncing because manually triggered');
        p.sync('self', true).then(null, function() { });
      } else {
        this.send('sync_details');
      }
    },
    load_reports: function() {
      var user = this.appState.get('currentUser');
      this.get('router').transitionTo('user.stats', user.get('user_name'));
    },
    hide_login: function() {
      this.appState.set('login_modal', false);
      $("html,body").css('overflow', '');
      $("#login_overlay").remove();
    },
    show_explanation: function(exp) {
      this.set('show_' + exp + '_explanation', true);
    },
    set_selected: function(selected) {
      this.set('selected', selected);
    },
    set_index_nav: function(nav) {
      if(nav == 'main' || nav == 'supervisees' || nav == 'supervisors') {
        var u = this.appState.get('currentUser');
        // Ensure preferences and preferences.device exist before setting nested value
        var preferences = u.get('preferences') || {};
        var device = preferences.device || {};
        u.set('preferences', preferences);
        u.set('preferences.device', device);
        u.set('preferences.device.last_index_nav', nav);
        u.save().then(null, function() { });
      } else if(nav == 'updates') {
        if(this.appState.get('currentUser')) {
          this.appState.set('currentUser.read_notifications', true);
          this.appState.get('currentUser').save().then(null, function() { });
        }
      }
      this.set('index_nav_state', nav);
    },
    toggle_extras: function() {
      this.set('show_main_extras', !this.get('show_main_extras'));
    },
    intro_video: function(id) {
      if(window.ga) {
        window.ga('send', 'event', 'Setup', 'video', 'Intro video opened');
      }
      modal.open('inline-video', {video: {type: 'youtube', id: id}, hide_overlay: true});
    },
    // Onboarding, with the wizard replaced by two destinations depending on WHO is
    // being set up — the split the wizard used to blur:
    //   • a specific OTHER user  -> the standalone board picker for them
    //   • a supervisor with no target -> pick the user first, then that picker
    //   • yourself -> the home page's guided tour
    // The tour is inherently about the current user's own home page, so it is only
    // right for the self case; "set up that communicator" means their board picker,
    // which mirrors setup's user_id/setup_user resolution
    // (controllers/board-picker.js:10) and is the screen the wizard's board step
    // used to show for that person.
    // NOTE: no template dispatches this action today (the Extras card that did was
    // removed), so it is retained for correctness rather than active use.
    intro: function(user_id) {
      if(window.ga) {
        window.ga('send', 'event', 'Onboarding', 'start', 'Onboarding started');
      }
      if(user_id) {
        this.get('router').transitionTo('board-picker', {queryParams: {user_id: user_id}});
      } else if(this.appState.get('currentUser.permissions.delete') && (this.appState.get('currentUser.supervisees') || []).length > 0) {
        var prompt = i18n.t('setup_which_user', "Select User to Run Setup");
        this.appState.get('controller').send('switch_communicators', {stay: true, modeling: false, setup: true, skip_me: false, header: prompt});
      } else {
        this.appState.set('auto_open_home_tour', true);
        this.appState.return_to_index();
      }
    },
    opening_index: function() {
      this.appState.set('index_view', true);
    },
    closing_index: function() {
      this.appState.set('index_view', false);
    },
    manage_supervisors: function() {
      this.send('set_index_nav', 'supervisors');
      this.set('activeTab', 'supervisors');
    },
    session_select: function() {
      if(!this.appState.get('currentUser.preferences.logging')) {
        this.send('load_reports');
      } else {
        this.send('set_index_nav', 'logging');
      }
    },
    sync_details: function() {
      var p = (this && (this.get && this.get('persistence') || this.persistence)) || (typeof window !== 'undefined' && window.persistence);
      if(!p || !p.get || !p.get('online')) {
        modal.open('sync-details', {details: []});
        return;
      }
      var list = ([].concat(p.get('sync_log') || [])).reverse();
      modal.open('sync-details', {details: list});
    },
    stats: function(user_name) {
      if(!user_name) {
        if((this.appState.get('currentUser.supervisees') || []).length > 0) {
          var prompt = i18n.t('select_user_for_reports', "Select User for Reports");
          this.appState.get('controller').send('switch_communicators', {stay: true, modeling: true, skip_me: !this.appState.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.stats', header: prompt});
          return;
        } else {
          user_name = this.appState.get('currentUser.user_name');
        }
      }
      this.get('router').transitionTo('user.stats', user_name, {queryParams: {start: null, end: null, device_id: null, location_id: null, split: null, start2: null, end2: null, devicde_id2: null, location_id2: null}});
    },
    goals: function() {
      if(this.appState.get('sessionUser.supporter_role') && (this.appState.get('sessionUser.known_supervisees.length') > 0 || this.appState.get('currentUser.managed_orgs.length') > 0)) {
        var prompt = i18n.t('select_user_for_goals', "Select User for Goals");
        this.appState.get('controller').send('switch_communicators', {stay: true, modeling: true, skip_me: !this.appState.get('currentUser.subscription.premium_supporter_plus_communicator'), route: 'user.goals', header: prompt});
        return;
      } else {
        var user_name = this.appState.get('currentUser.user_name');
        this.get('router').transitionTo('user.stats', user_name, {queryParams: {start: null, end: null, device_id: null, location_id: null, split: null, start2: null, end2: null, devicde_id2: null, location_id2: null}});
      }
    },
    new_dashboard: function() {
      var user = this.appState.get('currentUser');
      user.set('preferences.new_index', true);
      user.save().then(null, function() { });
      modal.success(i18n.t('revert_new_dashboard', "Welcome to the new, cleaner dashboard! If you're not a fan you can switch back on your Settings page."));
    },
    set_goal: function(user) {
      var _this = this;
      this.get('store').findRecord('user', user.id).then(function(user_model) {
        modal.open('new-goal', {user: user_model }).then(function(res) {
          if(res && res.get('id') && res.get('set_badges')) {
            _this.get('router').transitionTo('user.goal', user_model.get('user_name'), res.get('id'));
          } else if(res) {
            (_this.appState.get('currentUser.known_supervisees') || []).forEach(function(sup) {
              if(emberGet(sup, 'id') == user_model.get('id')) {
                emberSet(sup, 'goal', {
                  id: res.get('id'),
                  summary: res.get('summary')
                });
              }
            });
          }
        }, function() { });
      }, function(err) {
        modal.error(i18n.t('error_loading_user2', "There was an unexpected error trying to load the user"));
      });
    },
    update_evaluation: function(action) {
      modal.open('modals/eval-status', {action: action, user: this.appState.get('sessionUser')});
    },
    next_lesson: function() {
      var lesson = this.appState.get('sessionUser.first_incomplete_lesson');
      if(lesson) {
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + this.appState.get('sessionUser.lesson_share_token'), '_blank');
      }
    },
    launch_rating: function() {
      var user = this.appState.get('sessionUser');
      if(user) {
        var progress = user.get('preferences.progress') || {};

        progress.rated = (new Date()).getTime();
        user.set('preferences.progress', progress);
        user.save().then(null, function() { });
      }
      capabilities.launch_rating();
    },
    modeling_ideas: function(user_name) {
      var users = [];
      if(!user_name) {
        var knownSupervisees = this.appState.get('currentUser.known_supervisees') || [];
        if(knownSupervisees.length > 0) {
          knownSupervisees.forEach(function(u) {
            if(emberGet(u, 'premium')) {
              users.push(u);
            }
          });
        } else {
          users.push(this.appState.get('currentUser'));
        }
      } else {
        (this.appState.get('currentUser.known_supervisees') || []).forEach(function(u) {
          if(u.user_name == user_name) {
            users.push(u);
          }
        });
      }
      if(users.length > 0) {
        modal.open('modals/modeling-ideas', {users: users});
      }
    },
    homeInSpeakMode: function(board_for_user_id, keep_as_self) {
      if(board_for_user_id) {
        this.appState.set_speak_mode_user(board_for_user_id, true, keep_as_self);
      } else if((this.appState.get('currentUser.permissions.delete') && (this.appState.get('currentUser.supervisees') || []).length > 0) || this.appState.get('currentUser.communicator_in_supporter_view')) {
        var prompt = i18n.t('speak_as_which_user', "Select User to Speak As");
        if(this.appState.get('currentUser.communicator_in_supporter_view')) {
          prompt = i18n.t('speak_as_which_mode', "Select Mode and User for Session");
        }
        this.appState.set('referenced_speak_mode_user', null);
        this.appState.get('controller').send('switch_communicators', {stay: true, modeling: 'ask', skip_me: false, header: prompt});
      } else {
        this.appState.home_in_speak_mode();
      }
    },
    manual_session: function() {
      LingoLinq.Log.manual_log(this.appState.get('currentUser.id'), !!this.appState.get('currentUser.external_device'))
    },
    home_board: function(key) {
      this.get('router').transitionTo('board', key);
    }
  }
});
