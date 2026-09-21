import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import { pendingUpdates, PENDING_UPDATE_KEYS } from '../utils/pending_updates';

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
  tagName: '',
  appState: service('app-state'),

  /* Label for the COLLAPSED nav's trigger: the page the user is on, not the word "Menu"
     (2026-08-16, requested). A disclosure that names the current location tells the user
     where they are as well as offering where to go — and it matches the home dashboard's
     dropdown, which already shows its active tab.
     Mirrors the pill row's own labels exactly, so the collapsed and expanded navs never
     disagree about what a destination is called. The home pill reads "Home" for every
     role (2026-09-02); it used to read "Dashboard" for strictly-SLP users.
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

  activeLabel: computed('activeKey', function() {
    switch (this.get('activeKey')) {
      case 'home':
        return i18n.t('home_nav', "Home");
      case 'caseload': return i18n.t('caseload_pill', "Caseload");
      case 'organizations': return i18n.t('organizations', "Organizations");
      case 'boards': return i18n.t('boards', "Boards");
      case 'extras': return i18n.t('extras', "Extras");
      case 'updates': return i18n.t('updates', "Updates");
      default: return i18n.t('menu', "Menu");
    }
  })
});
