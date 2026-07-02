import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Shared primary pill-nav for the user-level pages (Boards / Reports / the
 * Organizations directory). Mirrors the item set the home dashboard exposes —
 * Home · Organizations · Boards · Reports · Extras · Account — so the nav stays
 * consistent across pages from ONE place (these used to be copy-pasted and drift).
 *
 * Args:
 *  @active    which page is current: "home" | "organizations" | "boards" |
 *             "reports" | "extras" (renders that pill as a non-link is-active span).
 *  @userName  user_name for the user.* route models (the viewed user's pages).
 *
 * Gating matches the home nav: the Organizations pill shows only for users who
 * manage a (non-restricted) org (has_management_responsibility); Account shows for
 * non-supporters (supporters use the identity dropdown). Both key off the logged-in
 * currentUser, not @userName.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),
});
