import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { pendingUpdates, PENDING_UPDATE_KEYS } from '../utils/pending_updates';
import { is_classic } from '../utils/view_style';
import { roomsOrgId, showsRoomsPill } from '../utils/rooms_nav';

/**
 * Shared primary pill-nav for the user-level pages (Boards / Reports / the
 * Organizations directory). Mirrors the item set the home dashboard exposes —
 * Caseload · Home · Organizations · Boards · Reports · Extras · Account — so the
 * nav stays consistent across pages from ONE place (these used to be copy-pasted
 * and drift). Order is plain template source order; nothing data-driven feeds it.
 *
 * Args:
 *  @active    which page is current: "caseload" | "home" | "organizations" |
 *             "boards" | "reports" | "extras" (renders that pill as a non-link
 *             is-active span).
 *  @userName  user_name for the user.* route models (the viewed user's pages).
 *
 * Gating matches the home nav: the Caseload pill shows only for supporters
 * (supporter_role) and leads the nav for them, since the caseload is their
 * workspace and their default landing page on login (routes/index.js
 * `_land_on_default`); the Organizations pill shows only for users who manage a
 * (non-restricted) org (has_management_responsibility); Account shows for
 * non-supporters (supporters use the identity dropdown). All key off the logged-in
 * currentUser, not @userName.
 */
export default Component.extend({
  /* BASIC VIEW WEARS THE `ch-` TAB STRIP IN THIS NAV'S PLACE (requested 2026-09-23).
   *
   * The MARKUP IS NOT FORKED for the two views -- only the class names are. Every pill here
   * carries a gate (`supporter_role`, `has_management_responsibility`, the updates flag) and a
   * second copy of this nav would mean a second copy of those gates, which is exactly how two
   * navs come to offer different things. Swapping `md-pillnav`/`md-pillnav__pill` for
   * `ch-tabs`/`ch-tab` gets the Basic look from the home page's own rules -- gentle and focused
   * both, since those classes are styled for each -- with one set of destinations.
   *
   * Read through `utils/view_style#is_classic`, the single reader for this preference, against
   * `effective_view_user` so a supervisor modelling for someone gets that person's shell. */
  isClassic: computed('appState.effective_view_user.preferences.board_view_style', function() {
    return is_classic(this.get('appState.effective_view_user'));
  }),
  navClass: computed('isClassic', function() {
    return this.get('isClassic') ? 'ch-tabs ch-tabs--primary' : 'md-pillnav md-pillnav--dashboard';
  }),
  pillClass: computed('isClassic', function() {
    return this.get('isClassic') ? 'ch-tab' : 'md-pillnav__pill';
  }),
  tagName: '',
  appState: service('app-state'),

  /* Label for the COLLAPSED nav's trigger: the page the user is on, not the word "Menu"
     (2026-08-16, requested). A disclosure that names the current location tells the user
     where they are as well as offering where to go — and it matches the home dashboard's
     dropdown, which already shows its active tab.
     Mirrors the pill row's own labels exactly, so the collapsed and expanded navs never
     disagree about what a destination is called. The home pill reads "Dashboard" for every
     role (requested 2026-09-21); it read "Home" from 2026-09-02, and "Dashboard" for
     strictly-SLP users only before that.
     Falls back to "Menu" only when `@active` names nothing this nav renders — the trigger
     must always have a label. */
  /* The Updates badge count. Shares one definition with classic view's Updates tab via
     utils/pending_updates — the arithmetic used to live only on
     components/dashboard/authenticated-view.js, and a second copy here would have been free
     to drift. PENDING_UPDATE_KEYS supplies the dependent keys so this cannot watch a subset
     by accident and show a stale badge. */
  pendingUpdates: computed(
    ...PENDING_UPDATE_KEYS.map(function(k) { return 'appState.currentUser.' + k; }),
    function() {
      return pendingUpdates(this.appState.get('currentUser'));
    }
  ),

  /* The caller's `active` normalised to a PILL name. The dashboard drives this from its
     own `activeTab`, which carries a 'supervisors' state (set in
     dashboard/authenticated-view.js when the Supervisors view is opened) that has no pill
     of its own and belongs to Extras -- the dashboard's bespoke nav used to spell that
     out as an `(or ...)` in three places. Mapping it once here keeps every consumer,
     including the collapsed dropdown and the label, agreeing without repeating the rule. */
  activeKey: computed('active', function() {
    var active = this.get('active');
    return active === 'supervisors' ? 'extras' : active;
  }),

  /* ROOMS **OR** ORGANIZATIONS, never both, in the one slot right of Caseload (requested
     2026-09-23). Someone who manages an org gets Organizations and reaches rooms through it;
     someone whose only org access is the rooms they supervise gets Rooms, because for them
     `/organizations` is a page listing organisations they cannot open.
     BOTH READ utils/rooms_nav, which also supplies the gate `utils/primary_nav` uses to decide
     whether this nav renders on the rooms page at all. One reading of the user, so the pill
     that is drawn and the page that lights it cannot disagree. */
  roomsOrgId: computed('appState.currentUser.supervised_units.[]', function() {
    return roomsOrgId(this.get('appState.currentUser'));
  }),
  showRoomsPill: computed('appState.currentUser.has_management_responsibility',
                          'appState.currentUser.supervised_units.[]', function() {
    return showsRoomsPill(this.get('appState.currentUser'));
  }),

  /* WHETHER THE ONE-OF-TWO SLOT IS FILLED, which is what the `--org-menu` breakpoint is
     actually about: that modifier collapses the pill row at 550px instead of 460px because the
     menu carries an EXTRA item, and it was bound to `has_management_responsibility` back when
     Organizations was the only thing that could fill the slot. A rooms-only supervisor now
     carries Rooms in the same slot and the same six items, so they need the same breakpoint --
     bound to the pill being drawn rather than to one of the two reasons it might be. */
  hasSlotPill: computed('appState.currentUser.has_management_responsibility', 'showRoomsPill',
                        function() {
    return !!this.get('appState.currentUser.has_management_responsibility') ||
           !!this.get('showRoomsPill');
  }),

  activeLabel: computed('activeKey', function() {
    switch (this.get('activeKey')) {
      case 'home':
        return i18n.t('dashboard', "Dashboard");
      case 'caseload': return i18n.t('caseload_pill', "Caseload");
      case 'organizations': return i18n.t('organizations', "Organizations");
      case 'rooms': return i18n.t('rooms', "Rooms");
      case 'boards': return i18n.t('boards', "Boards");
      case 'extras': return i18n.t('extras', "Extras");
      case 'updates': return i18n.t('updates', "Updates");
      default: return i18n.t('menu', "Menu");
    }
  })
});
