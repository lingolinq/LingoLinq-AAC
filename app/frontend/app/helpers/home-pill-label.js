import { helper } from '@ember/component/helper';
import i18n from '../utils/i18n';

/**
 * Label for the primary pill-nav's pill that points at /:user/home.
 *
 * Supporters (`supporter_role` — the canonical gate; SLPs/therapists/parents/
 * teachers all collapse to it, see models/user.js:507 and User#process_params)
 * lead their nav with Caseload and read this page as an overview of their whole
 * workload, so for them the pill reads "Dashboard". Communicators keep "Home",
 * which is what the page is to them.
 *
 * Takes the BOOLEAN, not the user record, so the call site writes
 * `{{home-pill-label this.appState.currentUser.supporter_role}}` and the helper
 * recomputes when the property itself changes — a user who flips Account View in
 * preferences relabels live. Passing the user record instead would only
 * recompute when the record's identity changed.
 *
 * Exists as one shared unit because the same pill renders at four sites that
 * must not drift: components/user-pill-nav.hbs, and the desktop nav, the
 * responsive dropdown option, and `activeTabLabel` (which feeds the dropdown
 * trigger) in components/dashboard/authenticated-view.{hbs,js}. The JS site is
 * why the rule is a plain exported function and not only a template helper.
 */
export function homePillLabel(supporter_role) {
  if(supporter_role) { return i18n.t('dashboard', "Dashboard"); }
  return i18n.t('home', "Home");
}

export default helper(function([supporter_role]) {
  return homePillLabel(supporter_role);
});
