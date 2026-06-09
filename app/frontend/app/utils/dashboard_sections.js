// Canonical registry of the Home-tab dashboard sections — the cards rendered
// inside `.md-grid--dashboard` on the home page. This is the SINGLE source of
// truth shared by:
//   - dashboard/authenticated-view (renders the cards, hides per preference)
//   - getting-started-tour (the "choose your display style" modal's checkbox
//     list + live preview toggling)
// so the two can never drift apart.
//
// Each entry knows:
//   key          — stable preference key (what we store in
//                  user.preferences.dashboard_sections)
//   cardClass    — the card's CSS class, used to toggle the matching element in
//                  the modal's live preview clone
//   labelKey/labelDefault — i18n for the checkbox label (reuse existing keys)
//   available(user) — whether this section exists for the given user type
//                     (mirrors the template's render conditions)
import i18n from './i18n';

var HOME_SECTIONS = [
  { key: 'boards',   cardClass: 'md-card--boards',        labelKey: 'boards',           labelDefault: "Boards",           available: function() { return true; } },
  { key: 'speak',    cardClass: 'md-card--speak',         labelKey: 'speak_mode',       labelDefault: "Speak Mode",       available: function() { return true; } },
  { key: 'extras',   cardClass: 'md-card--extras',        labelKey: 'extras',           labelDefault: "Extras",           available: function() { return true; } },
  { key: 'caseload', cardClass: 'md-card--caseload',      labelKey: 'my_caseload',      labelDefault: "My Caseload",      available: function(user) { return !!(user && user.get('supporter_role')); } },
  { key: 'org',      cardClass: 'md-card--org-management', labelKey: 'my_organizations', labelDefault: "My Organizations", available: function(user) { return hasOrgManagement(user); } }
];

// Mirrors authenticated-view's has_management_responsibility: a user manages
// orgs if they have a non-restricted manager-type org, OR are a supporter.
function hasOrgManagement(user) {
  if(!user) { return false; }
  if(user.get('supporter_role')) { return true; }
  var orgs = user.get('organizations') || [];
  return orgs.some(function(o) { return o.type == 'manager' && o.restricted != true; });
}

// The subset of sections that exist for this user (in display order).
function availableHomeSections(user) {
  return HOME_SECTIONS.filter(function(s) { return s.available(user); });
}

// A section is hidden ONLY when the user explicitly turned it off. Missing or
// `true` both mean visible, so any section added in the future defaults to
// visible for existing users.
function sectionHidden(user, key) {
  var map = user && user.get('preferences.dashboard_sections');
  return !!(map && (map[key] === false || map[key] === 'false'));
}

// Build the persisted visibility map from a set of currently-visible keys,
// scoped to the sections actually available to this user.
function sectionsMapFor(user, visibleKeys) {
  var map = {};
  availableHomeSections(user).forEach(function(s) {
    map[s.key] = visibleKeys.indexOf(s.key) !== -1;
  });
  return map;
}

function sectionLabel(section) {
  return i18n.t(section.labelKey, section.labelDefault);
}

// The cards that stack in the grid's RIGHT column, top-to-bottom.
var RIGHT_SECTIONS = ['speak', 'extras', 'org'];

// Grid area name per section key (`sup` is a constant 0-height bottom row).
var AREA = { boards: 'boards', speak: 'speak', extras: 'extras', org: 'org_mgmt', caseload: 'caseload' };

// ── THE LAYOUT MATRIX ──────────────────────────────────────────────────────
// Given the visibility map, return the dashboard's grid-template-areas (an array
// of row strings) + grid-template-rows. This is the SINGLE authoritative source
// for both the real home grid and the Getting Started preview — they apply it as
// an inline style, so there are no modifier-class layouts and no CSS-specificity
// management. Add a new arrangement by adding a branch below.
//
// Branches are first-match-wins, most-specific first. Cards keep their fixed
// grid-area names (see AREA); `.` is an empty cell. Two visible cards with Boards
// gone sit side-by-side in left→right priority: caseload, speak, extras, org.
function dashboardLayout(vis) {
  var cl = !!vis.caseload, sp = !!vis.speak, ex = !!vis.extras, og = !!vis.org, bd = !!vis.boards;
  var L = function(areas, rows) { return { areas: areas, rows: rows }; };

  // Boards hidden, Extras + Org both visible → Extras left of Org; the top row
  // carries whichever of Caseload/Speak remain.
  if (!bd && ex && og) {
    if (cl && sp) { return L(['caseload speak', 'extras org_mgmt', '. sup'], 'auto auto 0'); }
    if (cl) { return L(['caseload caseload', 'extras org_mgmt', '. sup'], 'auto auto 0'); }
    if (sp) { return L(['speak speak', 'extras org_mgmt', '. sup'], 'auto auto 0'); }
    return L(['extras org_mgmt', '. sup'], 'auto 0');
  }
  // Boards gone + exactly two cards left → one side-by-side row.
  if (!bd && !sp && !og && ex && cl) { return L(['caseload extras', '. sup'], 'auto 0'); }
  if (!bd && !sp && !ex && og && cl) { return L(['caseload org_mgmt', '. sup'], 'auto 0'); }
  if (!bd && !ex && !cl && sp && og) { return L(['speak org_mgmt', '. sup'], 'auto 0'); }
  // Boards visible with AT MOST two other cards → Boards spans both columns; the
  // other card(s) sit above it — one card full-width, two side-by-side (left→
  // right priority: caseload, speak, extras, org).
  if (bd) {
    var others = [];
    if (cl) { others.push('caseload'); }
    if (sp) { others.push('speak'); }
    if (ex) { others.push('extras'); }
    if (og) { others.push('org'); }
    if (others.length === 0) { return L(['boards boards', '. sup'], 'auto 0'); }
    if (others.length === 1) { return L([AREA[others[0]] + ' ' + AREA[others[0]], 'boards boards', '. sup'], 'auto auto 0'); }
    if (others.length === 2) { return L([AREA[others[0]] + ' ' + AREA[others[1]], 'boards boards', '. sup'], 'auto auto 0'); }
  }
  // Caseload + Speak + Org visible, Extras hidden (3 others) → Org slides up under
  // Speak, Boards stays the tall left card. (The no-caseload form of this is a
  // "Boards + two others" case, handled full-width above.)
  if (bd && cl && sp && og && !ex) {
    return L(['caseload speak', 'boards org_mgmt', '. sup'], 'auto auto 0');
  }
  // Speak hidden (none of the above) → drop its slot, pull the column up.
  if (!sp) {
    if (cl && og) { return L(['caseload extras', 'boards org_mgmt', '. sup'], 'auto auto 0'); }
    if (cl) { return L(['caseload caseload', 'boards extras', '. sup'], 'auto auto 0'); }
    if (og) { return L(['boards extras', 'org_mgmt org_mgmt', '. sup'], 'auto auto 0'); }
    return L(['boards extras', '. sup'], 'auto 0');
  }
  // Default arrangements (everything in its normal place).
  if (cl && og) { return L(['caseload speak', 'boards extras', 'boards org_mgmt', '. sup'], 'auto auto auto 0'); }
  if (cl) { return L(['caseload caseload', 'boards speak', 'boards extras', '. sup'], 'auto auto auto 0'); }
  if (og) { return L(['boards speak', 'boards extras', 'org_mgmt org_mgmt', '. sup'], 'auto auto auto 0'); }
  return L(['boards speak', 'boards extras', '. sup'], 'auto auto 0');
}

// Derive the dashboard grid state from the visibility map: the card-STYLING
// classes still needed (with-caseload / with-org-mgmt restyle the Speak/Caseload
// cards — they no longer drive layout) plus the computed grid-template areas/rows
// and a ready-to-apply inline `grid-template-areas` value.
function gridLayoutState(vis) {
  vis = vis || {};
  var classes = [];
  if (vis.caseload) { classes.push('md-grid--with-caseload'); }
  if (vis.org) { classes.push('md-grid--with-org-mgmt'); }
  var layout = dashboardLayout(vis);
  var areasValue = layout.areas.map(function(row) { return '"' + row + '"'; }).join(' ');
  return { classes: classes, areas: layout.areas, rows: layout.rows, areasValue: areasValue };
}

export { HOME_SECTIONS, RIGHT_SECTIONS, availableHomeSections, sectionHidden, sectionsMapFor, sectionLabel, hasOrgManagement, gridLayoutState };
export default { HOME_SECTIONS, RIGHT_SECTIONS, availableHomeSections, sectionHidden, sectionsMapFor, sectionLabel, hasOrgManagement, gridLayoutState };
