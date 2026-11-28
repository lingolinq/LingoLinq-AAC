import i18n from './i18n';

/* THE SECTIONS OF SYSTEM SETTINGS' FEATURES PAGE (2026-11-09, requested: "sort the features into
 * their categories on the page, so they are not just showing in some random list", and "create
 * professional groupings"). The server gives each feature one fine category
 * (lib/system_feature_registry.rb, about twenty of them); the page groups those into the few
 * sections an administrator scans by. Presentation only: the categories, and the features, are
 * the server's. A category not listed here (a new one) lands in Other rather than vanishing.
 *
 * ORDER IS THE PAGE'S ORDER: what a communicator uses first, then the clinical work around it,
 * then the accounts that hold it, then the business and compliance layer, then the extras. */
const GROUPS = [
  { id: 'communication', label: () => i18n.t('system_features_group_communication', "Communication & Boards"), categories: ['Boards', 'Speak mode', 'Language', 'Media'] },
  { id: 'clinical', label: () => i18n.t('system_features_group_clinical', "Clinical & Reporting"), categories: ['Evaluations', 'Reports', 'Supervisors'] },
  { id: 'accounts', label: () => i18n.t('system_features_group_accounts', "Accounts & Organizations"), categories: ['Account', 'Signup', 'Onboarding', 'Organization', 'Admin'] },
  { id: 'billing', label: () => i18n.t('system_features_group_billing', "Billing & Compliance"), categories: ['Billing', 'Compliance'] },
  { id: 'ai', label: () => i18n.t('system_features_group_ai', "AI & Integrations"), categories: ['AI', 'Integrations'] },
  { id: 'interface', label: () => i18n.t('system_features_group_interface', "Interface & Accessibility"), categories: ['UI', 'Accessibility'] },
  { id: 'other', label: () => i18n.t('system_features_group_other', "Other"), categories: ['Other'] }
];

/* The section a category belongs to; Other for any category not listed. */
export function groupIdFor(category) {
  var group = GROUPS.find(function(g) { return g.categories.indexOf(category) !== -1; });
  return group ? group.id : 'other';
}

/* The sections that have at least one of `categories`, in page order, as { id, label }. */
export function groupsFor(categories) {
  var present = {};
  (categories || []).forEach(function(c) { present[groupIdFor(c)] = true; });
  return GROUPS.filter(function(g) { return present[g.id]; }).map(function(g) {
    return { id: g.id, label: g.label() };
  });
}

/* `features` (each with `category` and `name`) as sections, in page order, each sorted by name:
   [{ id, label, features }]. Sections with no features are left out. */
export function groupFeatures(features) {
  var byGroup = {};
  (features || []).forEach(function(f) {
    var id = groupIdFor(f.category);
    (byGroup[id] = byGroup[id] || []).push(f);
  });
  return GROUPS.filter(function(g) { return byGroup[g.id]; }).map(function(g) {
    var list = byGroup[g.id].slice().sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return { id: g.id, label: g.label(), features: list };
  });
}
