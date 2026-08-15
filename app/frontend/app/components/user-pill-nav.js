import Component from '@ember/component';
import { inject as service } from '@ember/service';

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
});
