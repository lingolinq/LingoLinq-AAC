import i18n from './i18n';

/* THE BASIC DASHBOARD'S SECTIONS, AS THE <=550px SECTION MENU OFFERS THEM (2026-11-10). The tab strip
 * in components/dashboard/classic-view.hbs decides which tabs it shows with template gates; the
 * section menu (components/dashboard/section-menu) shows the same sections from this list, so these
 * rules must match those gates:
 *   - Actions and Boards always;
 *   - Communicators only for someone with a caseload (`showCommunicators`) who is not modeling-only;
 *   - Updates for anyone not modeling-only, labelled with the pending count as the strip's badge is.
 * A pure function of its inputs, so the rules are pinned by tests/unit/utils/basic-dashboard-sections-test.js
 * (senior-dev review 2026-11-10: as a computed on the component they had no test). */
export function basicDashboardSections(opts) {
  var o = opts || {};
  var items = [{ id: 'main', label: i18n.t('actions', "Actions") }];
  if (!o.modelingOnly && o.showCommunicators) {
    items.push({ id: 'supervisees', label: i18n.t('communicators', "Communicators") });
  }
  items.push({ id: 'boards', label: i18n.t('boards', "Boards") });
  if (!o.modelingOnly) {
    var count = o.pendingUpdates;
    items.push({ id: 'updates', label: count ? i18n.t('classic_tab_updates_n', "Updates (%{n})", { n: count }) : i18n.t('updates', "Updates") });
  }
  return items;
}
