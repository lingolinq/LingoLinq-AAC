// Canonical registry of the Home-tab dashboard sections — the cards rendered
// inside `.md-grid--dashboard` on the home page. This is the SINGLE source of
// truth shared by:
//   - dashboard/authenticated-view (renders the cards, hides per preference)
//   - display-style (the "choose your display style" modal's checkbox
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
//   hero_for     — (optional) the user ROLE this section is the Focused View hero
//                  card for. Focused View promotes exactly one section to the
//                  full-width hero showcase: 'communicator' -> Speak, 'supervisor'
//                  -> My Caseload, 'admin' -> My Organizations. focusedHeroKey()
//                  resolves the winner by HERO_PRIORITY (admin > supervisor >
//                  communicator), gated on the section actually being available.
import i18n from './i18n';

var HOME_SECTIONS = [
  { key: 'boards',   cardClass: 'md-card--boards',        labelKey: 'boards',           labelDefault: "Boards",           available: function() { return true; } },
  { key: 'speak',    cardClass: 'md-card--speak',         labelKey: 'speak_mode',       labelDefault: "Speak Mode",       available: function() { return true; }, hero_for: 'communicator' },
  { key: 'extras',   cardClass: 'md-card--extras',        labelKey: 'extras',           labelDefault: "Extras",           available: function() { return true; } },
  { key: 'caseload', cardClass: 'md-card--caseload',      labelKey: 'my_caseload',      labelDefault: "My Caseload",      available: function(user) { return !!(user && user.get('supporter_role')); }, hero_for: 'supervisor' },
  { key: 'rooms',    cardClass: 'md-card--rooms',         labelKey: 'rooms',            labelDefault: "Rooms",            available: function(user) { return !!(user && user.get('supporter_role') && (user.get('supervised_units') || []).length > 0); } },
  { key: 'attention', cardClass: 'md-card--attention',    labelKey: 'communicators_need_attention', labelDefault: "Communicators Need Attention", available: function(user) { return !!(user && user.get('supporter_role') && communicatorsNeedingAttention(user).length > 0); } },
  { key: 'org',      cardClass: 'md-card--org-management', labelKey: 'my_organizations', labelDefault: "My Organizations", available: function(user) { return hasOrgManagement(user); }, hero_for: 'admin' },
  { key: 'account',  cardClass: 'md-card--account',        labelKey: 'my_account',       labelDefault: "My Account",       available: function() { return true; } },
  { key: 'createboard', cardClass: 'md-card--create-board', labelKey: 'create_a_board',   labelDefault: "Create a Board",   available: function() { return true; } },
  { key: 'reports',  cardClass: 'md-card--reports',        labelKey: 'reports',          labelDefault: "Reports",          available: function() { return true; } },
  { key: 'editdashboard', cardClass: 'md-card--edit-dashboard', labelKey: 'edit_dashboard', labelDefault: "Edit Dashboard", available: function() { return true; } }
];

// Toggleable home elements that are NOT placed by the grid engine — they render
// outside the grid but are turned on/off in the Dashboard Design modal and
// persisted in preferences.dashboard_sections exactly like the cards (so
// sectionHidden(user, key) governs them too). `gentleOnly` items only appear on
// the Gentle View layout (Focused View hides them in CSS), so their modal toggle is hidden
// when Focused View is selected. ADD a non-grid toggle here.
var EXTRA_HOME_TOGGLES = [
  { key: 'hero', cardClass: 'md-hero--dashboard', labelKey: 'home_welcome_banner', labelDefault: "Welcome banner", gentleOnly: true }
];
// i18n registration: EXTRA_HOME_TOGGLES labels are rendered via a dynamic
// i18n.t(labelKey, labelDefault), which i18n_generator.rb's literal-only scanner
// can't see. Register them here as literals so they land in the locale files:
//   i18n.t('home_welcome_banner', "Welcome banner")

// The "My Organizations" card shows only when the user actually MANAGES an organization
// (a non-restricted manager-type org). The org management tool is manager/assistant-only —
// every backing endpoint requires 'edit'. Supervisors have view-only org access and their
// work lives in their Caseload, so a pure supervisor should not see an org-management card
// (it would only lead to a view-only landing). A supporter with no manager org has nothing
// to manage here, so the card stays hidden.
function hasOrgManagement(user) {
  if(!user) { return false; }
  var orgs = user.get('organizations') || [];
  var managesOrg = orgs.some(function(o) { return o.type == 'manager' && o.restricted != true; });
  return managesOrg;
}

// Focused View hero resolution. Exactly one section becomes the full-width hero
// showcase; which one depends on the user's role. Priority is most-senior-first
// (admin > supervisor > communicator) per the product decision: an admin who
// also supervises gets the Organizations hero, a supervisor who is also a
// communicator gets the Caseload hero, everyone else gets Speak. Each candidate
// is gated on its section being AVAILABLE to the user (org only exists for org
// managers, caseload only for supporters), so the priority list resolves to the
// first section flagged `hero_for` a role the user actually has.
var HERO_PRIORITY = ['admin', 'supervisor', 'communicator'];
function focusedHeroKey(user) {
  for(var i = 0; i < HERO_PRIORITY.length; i++) {
    var role = HERO_PRIORITY[i];
    for(var j = 0; j < HOME_SECTIONS.length; j++) {
      var s = HOME_SECTIONS[j];
      if(s.hero_for === role && s.available(user)) { return s.key; }
    }
  }
  return 'speak'; // Speak is always available; safety net if no flag matched.
}

// Communicator org_status IDs that signal "needs attention": 'no-home-board' (the
// derived status for a communicator who hasn't set a home board — see json_api/user.rb),
// 'unchecked' (unset/unknown), plus the "waiting for…" and "needing support" clinical
// statuses (see LingoLinq.user_statuses). Excludes the progressing states (training-
// started / recently-implemented / making-progress). Edit this list to tune what the
// "Communicators Need Attention" card flags.
var ATTENTION_STATUS_IDS = ['no-home-board', 'unchecked', 'hourglass', 'equalizer', 'piggy-bank', 'phone', 'exclamation-sign'];

// Supervisees whose org_status falls in ATTENTION_STATUS_IDS. org_status is the hash
// {'state' => '<id>', …} the backend sends per supervisee (json_api/user.rb).
function communicatorsNeedingAttention(user) {
  if(!user) { return []; }
  return (user.get('supervisees') || []).filter(function(s) {
    var state = s && s.org_status && s.org_status.state;
    return !!(state && ATTENTION_STATUS_IDS.indexOf(state) !== -1);
  });
}

// SHORT badge label per attention status, for the caseload roster row. The full
// LingoLinq.user_statuses labels ("Waiting for Recommendation from Eval",
// "Temporary Solution, Waiting for Funding") are written to be read in a status
// PICKER and are far too long for an inline row badge, so each attention state
// gets a terse "<thing> needed" phrasing here instead. That deliberately matches
// the existing "Board needed" badge beside it, so a row carrying two badges reads
// as one family rather than two unrelated notices.
//
// 'no-home-board' is intentionally ABSENT: the row already renders a dedicated
// "Board needed" badge for exactly that condition (templates/caseload.hbs), and
// emitting both would say the same thing twice on the same row.
//
// Keys must stay a subset of ATTENTION_STATUS_IDS — anything flagged there but
// missing here simply renders no row badge (the dashboard card still lists them),
// which is why attentionBadgeFor returns null rather than falling back to the id.
// The row badge for a single supervisee, or null when nothing is needed. Reads
// `org_status.state` exactly the way communicatorsNeedingAttention does — plain
// property access, because the supervisee entries the backend sends are plain
// hashes on the user record, not Ember Data models — so the caseload row and the
// dashboard's "Communicators Need Attention" card can never disagree about who is
// flagged. Returns { label, hint } for the template to render.
//
// The i18n.t calls sit INSIDE the function, not in a module-level lookup table:
// a table would evaluate every string once at import time, before i18n has
// necessarily loaded its locale, and would then never re-translate when the user
// switches language. Same reason helpers/home-pill-label.js resolves per call.
// Written as literal key + double-quoted default calls so i18n_generator.rb's
// static scanner can extract them.
function attentionBadgeFor(supervisee) {
  var state = supervisee && supervisee.org_status && supervisee.org_status.state;
  if(!state) { return null; }
  if(ATTENTION_STATUS_IDS.indexOf(state) === -1) { return null; }
  if(state === 'unchecked') {
    return { label: i18n.t('caseload_attention_status_needed', "Status needed"),
             hint: i18n.t('caseload_attention_status_needed_hint', "This communicator has no status set yet — set one so their progress can be tracked.") };
  }
  if(state === 'hourglass') {
    return { label: i18n.t('caseload_attention_eval_needed', "Eval needed"),
             hint: i18n.t('caseload_attention_eval_needed_hint', "This communicator is waiting for an evaluation.") };
  }
  if(state === 'equalizer') {
    return { label: i18n.t('caseload_attention_results_needed', "Results needed"),
             hint: i18n.t('caseload_attention_results_needed_hint', "This communicator is waiting for a recommendation from their evaluation.") };
  }
  if(state === 'piggy-bank') {
    return { label: i18n.t('caseload_attention_funding_needed', "Funding needed"),
             hint: i18n.t('caseload_attention_funding_needed_hint', "This communicator is on a temporary solution while waiting for funding.") };
  }
  if(state === 'phone') {
    return { label: i18n.t('caseload_attention_device_needed', "Device needed"),
             hint: i18n.t('caseload_attention_device_needed_hint', "This communicator is waiting for their device.") };
  }
  if(state === 'exclamation-sign') {
    return { label: i18n.t('caseload_attention_support_needed', "Support needed"),
             hint: i18n.t('caseload_attention_support_needed_hint', "This communicator needs additional support.") };
  }
  /* 'no-home-board' normally returns null because the row's own "Board needed" badge
     (templates/caseload.hbs:134) covers it — but that badge is wrapped in
     `{{#unless supervisee.modeling_only}}`, so a MODELING-ONLY communicator with no home
     board got neither marker. They are still listed on the dashboard's "Communicators
     Need Attention" card (communicatorsNeedingAttention has no modeling_only exclusion),
     so clicking through landed on a caseload row carrying nothing — breaking the
     invariant both files document, that a communicator on that card is always flagged
     here too. Reuse the row badge's own strings so there is one wording for one state. */
  if(state === 'no-home-board' && supervisee && supervisee.modeling_only) {
    return { label: i18n.t('caseload_board_needed', "Board needed"),
             hint: i18n.t('caseload_board_needed_hint', "This communicator has no home board yet — choose one to finish setting them up.") };
  }
  return null;
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
var AREA = { boards: 'boards', speak: 'speak', extras: 'extras', org: 'org_mgmt', caseload: 'caseload', rooms: 'rooms', attention: 'attention', account: 'account', createboard: 'createboard', reports: 'reports', editdashboard: 'editdashboard' };

// ── THE LAYOUT ENGINE (ordered-list reorder model) ──────────────────────────
// The dashboard is an ORDERED LIST of section keys. The user drags cards in the
// Dashboard Design preview to reorder them; the order is saved as
// preferences.dashboard_order and read by BOTH the real home grid and the modal
// preview, so they can never drift. Layout = pack that ordered list into
// grid-template-areas: small cards fill TWO-PER-ROW; Boards is a full-width row
// wherever it sits in the order; a small card left without a row-partner spans the
// full width (and gets the fullspan treatment). This replaced the old
// swap-permutation + Boards side/raised placement — a single order supports
// inserting a card between ANY rows and moving Boards like any other block.

// Canonical default order (used when the user hasn't reordered). For a
// communicator this packs to: full-width Speak Mode, full-width Boards,
// My Account|Create a Board, Reports|Edit Dashboard, full-width Extras. Speak and
// Extras are full-width showcase rows for communicators (see dashboardLayout's
// `extraFull`), so they pick up the md-grid--fullspan-* styling overrides. The
// leading supervisor-only keys are inert for communicators (filtered out as
// unavailable) — they keep their relative slot for any user who has them.
var DEFAULT_ORDER = ['caseload', 'attention', 'rooms', 'org', 'speak', 'boards', 'account', 'createboard', 'reports', 'editdashboard', 'extras'];

// Supervisor (non-communicator) Gentle default — distinct from the communicator
// order so moving cards here never reshuffles a communicator's home. My Account and
// Create a Board pair up as a two-up row DIRECTLY under My Caseload (the top
// full-width row); the supervisor list cards (Attention/Rooms/Organizations), then
// Boards and the FULL-WIDTH Speak Mode row follow (see dashboardLayout's speak
// full-width handling for supervisors).
var SUPERVISOR_DEFAULT_ORDER = ['caseload', 'account', 'createboard', 'attention', 'rooms', 'org', 'boards', 'speak', 'editdashboard', 'reports', 'extras'];

// Focused View no longer has its own default ORDER: it now starts from the SAME
// role-aware order as Gentle View (see defaultOrderFor / heroFirst), so a card sits
// in the same relative place in both views and only the PACKING differs (Focused
// stacks full-width rows, collapses the utility cards into one row and hides
// Extras). Keeping two orders meant the same user saw two unrelated arrangements.
//
// This constant is retained only as the fallback base inside reorderForFocused()
// for the case where no explicit defaultOrder is threaded in, and as a stable
// full-order fixture for tests. It is NOT the live Focused default any more — do
// not reach for it when you want "the order Focused View starts from".
// ORG MANAGER Gentle default (2026-08-16, requested): My Organizations leads, then the
// Account + Create-a-Board two-up row, then My Caseload, then Boards — everything after
// that keeps the supervisor order it already had. An org manager's dashboard opens on the
// organization they run rather than on a caseload, which is the same reasoning that makes
// `focusedHeroKey` return 'org' for them in Focused View.
// A THIRD constant rather than a reshuffle of SUPERVISOR_DEFAULT_ORDER: a plain supervisor
// (no orgs) must keep leading with Caseload, and editing the shared array in place would
// move every SLP's dashboard too.
var ORG_DEFAULT_ORDER = ['org', 'account', 'createboard', 'caseload', 'boards', 'attention', 'rooms', 'speak', 'editdashboard', 'reports', 'extras'];

var FOCUSED_DEFAULT_ORDER = ['speak', 'boards', 'caseload', 'attention', 'rooms', 'org', 'account', 'createboard', 'reports', 'editdashboard', 'extras'];

// The Gentle View default order for a user: a supervisor (any of
// caseload/rooms/attention/org available) gets SUPERVISOR_DEFAULT_ORDER, everyone
// else DEFAULT_ORDER. Split out from defaultOrderFor so Focused View can share the
// exact same base rather than carrying a second, drifting order.
function gentleDefaultOrder(user) {
  if (!user) { return DEFAULT_ORDER; } // no user → communicator default (matches prior behavior)
  // Match the live grid's supervisor test EXACTLY: dashboardLayout keys off `vis`,
  // where vis[key] = available AND NOT sectionHidden (authenticated-view.js). Using
  // availability alone here would drift for a supervisor who has HIDDEN their
  // caseload/rooms/attention/org cards (grid → DEFAULT_ORDER, but availability →
  // SUPERVISOR_DEFAULT_ORDER), so filter out hidden sections before classifying.
  var keys = availableHomeSections(user)
    .filter(function(s) { return !sectionHidden(user, s.key); })
    .map(function(s) { return s.key; });
  var supervisor = keys.indexOf('caseload') !== -1 || keys.indexOf('rooms') !== -1 ||
                   keys.indexOf('attention') !== -1 || keys.indexOf('org') !== -1;
  // Org managers get their own order, checked BEFORE the generic supervisor branch —
  // they satisfy the supervisor test too, so the more specific case has to win.
  // `hasOrgManagement` (a real manager role on an unrestricted org), not the mere presence
  // of an org card: a user who is only a member of someone else's org is not an org
  // manager and keeps the supervisor order.
  if (hasOrgManagement(user) && keys.indexOf('org') !== -1) { return ORG_DEFAULT_ORDER; }
  return supervisor ? SUPERVISOR_DEFAULT_ORDER : DEFAULT_ORDER;
}

// Role-aware default order — the SINGLE source both the live grid (dashboardLayout,
// via its `vis`-based supervisor check) and the edit surface (display-style.js)
// resolve their default from, so they can never disagree on a supervisor's order.
// BOTH layouts now start from the same role-aware order; Focused View only pulls its
// role hero to the front so that card packs as the top full-width showcase.
function defaultOrderFor(user, layout) {
  var base = gentleDefaultOrder(user);
  // The drag preview + live grid both resolve their default here so they agree.
  if (layout === 'focused') { return heroFirst(base, focusedHeroKey(user)); }
  return base;
}

// The visible section keys in display order: start from the saved order (or the
// default), append any visible key the saved order is missing (robustness when a
// new card type ships), then drop the hidden ones.
function orderedVisible(vis, order, defaultOrder) {
  var base = defaultOrder || DEFAULT_ORDER;
  var ord = (order && order.length) ? order.slice() : base.slice();
  base.forEach(function(k) { if (ord.indexOf(k) === -1) { ord.push(k); } });
  return ord.filter(function(k) { return vis[k]; });
}

// Pack an ordered list of visible keys into area-row strings (WITHOUT the trailing
// '. sup' spacer). Small cards pair two-per-row; Boards is its own full-width row;
// a small card left without a partner spans the full width.
function packOrder(keys, extraFull) {
  var a = function(k) { return AREA[k]; };
  var rows = [], pending = null;
  // Boards is always its own full-width row; Caseload, Rooms, Attention and the
  // My Organizations card too — the supervisor hero + its room/org/attention lists
  // sit full-width at the top of the Gentle home. (Caseload gets the tall big-icon
  // Speak-style showcase via fullspan-caseload in app.scss.) `extraFull` adds more
  // full-width keys per layout (e.g. Speak Mode on the supervisor home).
  var fullWidth = function(key) {
    if (key === 'boards' || key === 'caseload' || key === 'rooms' || key === 'attention' || key === 'org') { return true; }
    return !!(extraFull && extraFull.indexOf(key) !== -1);
  };
  keys.forEach(function(key) {
    if (fullWidth(key)) {
      if (pending) { rows.push(a(pending) + ' ' + a(pending)); pending = null; }
      rows.push(a(key) + ' ' + a(key));
    } else if (pending) {
      rows.push(a(pending) + ' ' + a(key)); pending = null;
    } else {
      pending = key;
    }
  });
  if (pending) { rows.push(a(pending) + ' ' + a(pending)); }
  return rows;
}

// Wrap packed rows with the constant 0-height '. sup' spacer + matching row sizes
// (every content row 'auto', the spacer '0').
function framed(body) {
  var areas = body.concat(['. sup']);
  var rows = areas.map(function(_row, i) { return i === areas.length - 1 ? '0' : 'auto'; }).join(' ');
  return { areas: areas, rows: rows };
}

function dashboardLayout(vis, order) {
  // Supervisors (any supervisor-only section present) get their own default order
  // (Boards under Organizations) and a full-width Speak Mode row. Communicators
  // get Speak Mode AND Extras as full-width showcase rows (their prominent, always
  // full-width cards, like Boards), so both pick up the md-grid--fullspan-*
  // styling.
  var supervisor = !!(vis.caseload || vis.rooms || vis.attention || vis.org);
  /* ORG MANAGERS get their own order, checked BEFORE the supervisor branch — they satisfy
     the supervisor test too, so the more specific case has to win.
     `vis.org` IS the org-manager signal: the section's own availability gate is
     `hasOrgManagement(user)` (HOME_SECTIONS ~32), so the card is only ever visible to a
     real manager of an unrestricted org. This function receives no `user`, which is why it
     keys off `vis` — the same reasoning gentleDefaultOrder documents for its supervisor
     test.
     THIS IS THE LIVE GRID'S OWN CHOICE OF BASE ORDER. It does not call
     gentleDefaultOrder/defaultOrderFor — those serve the edit + preview surfaces — so a new
     order has to be added in BOTH places or the dashboard and its editor disagree. That is
     exactly what happened when ORG_DEFAULT_ORDER was first wired into gentleDefaultOrder
     alone: the preview reordered and the real page did not. */
  var def = vis.org ? ORG_DEFAULT_ORDER : (supervisor ? SUPERVISOR_DEFAULT_ORDER : DEFAULT_ORDER);
  var extraFull = supervisor ? ['speak'] : ['speak', 'extras'];
  return framed(packOrder(orderedVisible(vis, order, def), extraFull));
}

// The small "utility" action cards that share ONE row on Focused View.
var FOCUSED_ACTION_KEYS = ['account', 'createboard', 'reports', 'editdashboard'];

// Wrap packed N-column rows with the constant 0-height spacer ('.' ×(N-1) + 'sup',
// so the spacer row has exactly N columns like the content rows). N-wide
// generalization of framed().
function framedN(body, cols) {
  var spacer = [];
  for (var i = 0; i < cols - 1; i++) { spacer.push('.'); }
  spacer.push('sup');
  var areas = body.concat([spacer.join(' ')]);
  var rows = areas.map(function(_row, i) { return i === areas.length - 1 ? '0' : 'auto'; }).join(' ');
  return { areas: areas, rows: rows };
}

// Focused View: Speak is a full-width hero that defaults to the top (its slot in
// FOCUSED_DEFAULT_ORDER) but is REORDERABLE like any other full-width block — the
// user can drag Boards above it. Extras never shows; each NON-action card (Speak,
// Boards, and Caseload/Org for supervisors) is its own full-width row emitted at
// its position in the saved order; the visible utility cards (Account / Create a
// Board / Reports / Edit Dashboard) share ONE row. The grid widens to EXACTLY the
// number of visible utility cards (`cols`), so when some are hidden the remaining
// cards EXPAND to fill the row instead of leaving empty cells. The utility row is
// emitted at the position of the FIRST visible utility card so a whole row can be
// repositioned above or below it.
// A base order with the Focused View role hero pulled to the FRONT so it packs as
// the top full-width showcase. `heroKey` comes from focusedHeroKey(user): 'caseload'
// for supervisors, 'org' for admins, 'speak' for communicators. Already-first keys
// pass through untouched, and every other card keeps its relative order, so this is
// purely "promote the hero" on top of the shared Gentle order. The hero stays
// REORDERABLE — this only sets the default.
function heroFirst(base, heroKey) {
  if(!heroKey || base[0] === heroKey) { return base; }
  return [heroKey].concat(base.filter(function(k) { return k !== heroKey; }));
}

function focusedLayout(vis, order, heroKey) {
  // Extras is force-hidden in Focused View, and so is Speak Mode whenever Speak is
  // NOT the hero. Speak has no non-hero presentation in Focused (app.scss hides
  // .md-card--speak-as-button there unconditionally), so leaving its key in the
  // order would reserve a full-width row + grid gap for an invisible card. For a
  // supervisor the hero is Caseload and Speak is simply not part of their Focused
  // dashboard. The hero itself stays in the ordered set so it packs AT ITS SAVED
  // POSITION (default = the front, per heroFirst).
  var rest = Object.assign({}, vis, { extras: false });
  /* ORG DASHBOARDS PAIR CASELOAD + SPEAK ON ONE BOTTOM ROW (2026-08-16, requested):
     My Caseload on the left, Speak Mode on the right. Everywhere else a non-Speak hero
     drops the Speak card entirely (the line below), which is why an org dashboard used to
     render Speak with no grid area at all — it was auto-placed into invented columns and
     squashed the whole grid. Keeping it in `rest` gives it a real area again. */
  var orgPair = heroKey === 'org' && !!vis.speak && !!vis.caseload;
  if (heroKey && heroKey !== 'speak' && !orgPair) { rest.speak = false; }
  // Same base order Gentle uses, so a card sits in the same relative place in both
  // views. Classified off `vis` exactly like dashboardLayout does, because this
  // function has no `user` — using availability here instead would drift for a
  // supervisor who has hidden their supervisor cards.
  var supervisor = !!(vis.caseload || vis.rooms || vis.attention || vis.org);
  var base = supervisor ? SUPERVISOR_DEFAULT_ORDER : DEFAULT_ORDER;
  var keys = orderedVisible(rest, order, heroFirst(base, heroKey));
  var a = function(k) { return AREA[k]; };
  var actionKeys = keys.filter(function(k) { return FOCUSED_ACTION_KEYS.indexOf(k) !== -1; });
  var cols = Math.max(1, actionKeys.length);
  var fullN = function(name) { var r = []; for (var i = 0; i < cols; i++) { r.push(name); } return r.join(' '); };
  /* The pair needs an EVEN column count to split down the middle. `cols` is the visible
     utility-card count, so an odd number (1 or 3 hidden cards) cannot halve — in that case
     the pair is abandoned and both cards keep their normal full-width rows rather than
     emitting a lopsided or invalid areas string. */
  var pairKeys = (orgPair && cols % 2 === 0) ? ['caseload', 'speak'] : null;
  var halfRow = function() {
    var r = [], half = cols / 2, i;
    for (i = 0; i < half; i++) { r.push(a('caseload')); }
    for (i = 0; i < half; i++) { r.push(a('speak')); }
    return r.join(' ');
  };
  var rowsOut = [], actionEmitted = false;
  keys.forEach(function(k) {
    // Paired cards are emitted together at the END, so they are skipped here rather than
    // taking their usual per-key row.
    if (pairKeys && pairKeys.indexOf(k) !== -1) { return; }
    if (FOCUSED_ACTION_KEYS.indexOf(k) !== -1) {
      // All utility cards collapse into ONE row, emitted where the first one sits.
      if (!actionEmitted) { rowsOut.push(actionKeys.map(a).join(' ')); actionEmitted = true; }
    } else {
      // Full-width cards (Speak hero, Boards, Caseload/Org) — each at its order slot.
      rowsOut.push(fullN(a(k)));
    }
  });
  // Bottom row: Caseload left, Speak right.
  if (pairKeys) { rowsOut.push(halfRow()); }
  var built = framedN(rowsOut, cols);
  built.cols = cols;
  return built;
}

// Move srcKey to just before/after dstKey in a FULL order array (all section
// keys, including hidden ones, so a hidden card keeps its relative slot). Returns
// a new normalized full order. Drives the Dashboard Design drag-to-insert.
function reorderInsert(order, srcKey, dstKey, after, defaultOrder) {
  var base = defaultOrder || DEFAULT_ORDER;
  var full = (order && order.length) ? order.slice() : base.slice();
  base.forEach(function(k) { if (full.indexOf(k) === -1) { full.push(k); } });
  full = full.filter(function(k) { return k !== srcKey; });
  var idx = full.indexOf(dstKey);
  if (idx < 0) { full.push(srcKey); return full; }
  full.splice(idx + (after ? 1 : 0), 0, srcKey);
  return full;
}

// Derive the dashboard grid state from the visibility map + saved order: the
// card-STYLING classes still needed (with-caseload / with-org-mgmt restyle the
// Speak/Caseload cards), the boards-full + per-card fullspan flags, plus the
// computed grid-template areas/rows and a ready-to-apply inline value. `order`
// (optional) is the saved drag arrangement; `layout` selects 'focused' (Speak
// hero + no Extras) vs the default 'gentle'.
function gridLayoutState(vis, order, layout, heroKey) {
  vis = vis || {};
  var classes = [];
  if (vis.caseload) { classes.push('md-grid--with-caseload'); }
  if (vis.org) { classes.push('md-grid--with-org-mgmt'); }
  // Focused View: flag WHICH section is the role hero so the CSS can promote the
  // right card to the full-width showcase (md-grid--hero-<key>).
  if (layout === 'focused') { classes.push('md-grid--hero-' + (heroKey || 'speak')); }
  var built = (layout === 'focused') ? focusedLayout(vis, order, heroKey) : dashboardLayout(vis, order);
  var areas = built.areas, rows = built.rows;
  /* A card that is RENDERED but whose `grid-area` names no area in the template gets
     auto-placed by the browser into an implicit track, which distorts the whole grid.
     That happened to Speak on an org dashboard whose owner had hidden My Caseload:
     `orgPair` needs both, so focusedLayout dropped speak from the areas — but it works
     on a COPY of `vis`, and the card's own visibility comes from a separate path
     (authenticated-view#cardHideStyle <- sectionVisibility), so the card still rendered.
     Derived from the built areas rather than by re-deriving the condition, so it covers
     any future case of visible-but-unplaced, not just this one. */
  var speakPlaced = areas.some(function(row) { return row.split(' ').indexOf('speak') !== -1; });
  if (vis.speak && !speakPlaced) { classes.push('md-grid--speak-unplaced'); }
  // Flag when Boards spans BOTH columns (a full-width 'boards boards' row) so the
  // CSS can let the board strip shrink to fit instead of horizontally scrolling.
  if (areas.some(function(row) { var t = row.split(' '); return t.length > 1 && t.every(function(c) { return c === 'boards'; }); })) { classes.push('md-grid--boards-full'); }
  // Flag a SMALL card that spans both columns (a lone card with no row-partner
  // renders as a full-width 'X X' row). The CSS gives that wide button the page
  // (md-shell) gradient and centres its content.
  //
  // GENTLE ONLY. The fullspan showcase is a Gentle-View concept: in Focused View
  // EVERY non-action card is a full-width row by construction, so emitting these
  // would hand the showcase treatment to whichever cards happen to stack — which
  // is how Speak Mode ended up outranking the Caseload hero for supervisors.
  // Focused styles its cards through .md-card--*-focused instead. This is a no-op
  // for existing users: of the classes Focused could emit, only fullspan-speak has
  // any styling at all, and its target (.md-card--speak-as-button) is display:none
  // in Focused unless Caseload is the hero.
  if (layout !== 'focused') {
    areas.forEach(function(row) {
      var t = row.split(' ');
      if (t[0] === t[1] && t[0] !== 'boards' && t[0] !== '.' && t[0] !== 'sup') {
        var key = Object.keys(AREA).filter(function(k) { return AREA[k] === t[0]; })[0];
        if (key) { classes.push('md-grid--fullspan-' + key); }
      }
    });
  }
  var areasValue = areas.map(function(row) { return '"' + row + '"'; }).join(' ');
  // Focused View pins the column count to the visible utility-card count (so the
  // utility row fills evenly); Gentle View leaves columns to the stylesheet (null).
  var columns = built.cols ? ('repeat(' + built.cols + ', 1fr)') : null;
  // Reading-order index per section (top-to-bottom, left-to-right through the
  // areas). Emitted as `--ord-<key>` custom properties so the single-column
  // small-screen fallback can flex-`order` the cards to MATCH the large-screen
  // arrangement (incl. drag reorders) instead of a static order. Keyed by section
  // key (org_mgmt → org) so the CSS maps card class → var.
  var areaToKey = {};
  Object.keys(AREA).forEach(function(k) { areaToKey[AREA[k]] = k; });
  var orderIndices = {}, oidx = 0, seenArea = {};
  areas.forEach(function(row) {
    row.split(' ').forEach(function(tok) {
      if (tok === '.' || tok === 'sup' || seenArea[tok]) { return; }
      seenArea[tok] = true;
      var key = areaToKey[tok];
      if (key) { orderIndices[key] = oidx++; }
    });
  });
  return { classes: classes, areas: areas, rows: rows, areasValue: areasValue, columns: columns, orderIndices: orderIndices };
}

// Focused-View drag rules. A single utility card may only reorder WITHIN the
// utility row; whole rows reposition between rows. Returns a new full order, or
// null when the drop is disallowed (a utility card dragged onto a full-width row —
// "not single elements inside those rows"). Drives the constrained drag-to-reorder.
function reorderForFocused(order, srcKey, dstKey, after, defaultOrder) {
  var srcAction = FOCUSED_ACTION_KEYS.indexOf(srcKey) !== -1;
  var dstAction = FOCUSED_ACTION_KEYS.indexOf(dstKey) !== -1;
  // A utility card can't leave its row onto a full-width row.
  if (srcAction && !dstAction) { return null; }
  // A full-width row dropped onto the utility row snaps to the utility block's
  // edge, so the row lands directly above/below the WHOLE utility row (never
  // between two utility cards).
  if (!srcAction && dstAction) {
    var base = defaultOrder || FOCUSED_DEFAULT_ORDER;
    var full = (order && order.length) ? order.slice() : base.slice();
    base.forEach(function(k) { if (full.indexOf(k) === -1) { full.push(k); } });
    var actionsInOrder = full.filter(function(k) { return FOCUSED_ACTION_KEYS.indexOf(k) !== -1; });
    if (actionsInOrder.length) {
      dstKey = after ? actionsInOrder[actionsInOrder.length - 1] : actionsInOrder[0];
    }
  }
  return reorderInsert(order, srcKey, dstKey, after, defaultOrder);
}

// THE SINGLE DESCRIPTION OF A LAYOUT.
//
// Three surfaces render the home dashboard: the live page
// (dashboard/authenticated-view), the Dashboard Design modal's live clone, and the
// Display Style chooser's preview iframes. The two previews cannot simply COPY the
// live page — each shows the layout the user is NOT currently in, so every input
// that varies by layout has to be re-derived. Each surface used to re-derive them
// separately, and they drifted: the preview iframes read the saved drag order
// WITHOUT the feature-flag gate the other two apply, so a user with a stale saved
// order and `dashboard_drag_layout` off saw previews packed in an order the real
// page would never render.
//
// This is that derivation, once. Callers pass only what they alone can know: which
// user is being previewed, whether the drag flag is on, and (for the modal, whose
// checkboxes and drag state are live UI not saved prefs) explicit `vis`/`order`
// overrides. Everything layout-dependent comes back from here. Anything that varies
// by layout belongs in THIS function, not in a caller — that is what keeps the
// previews honest.
function layoutPresentation(user, layout, opts) {
  opts = opts || {};
  var name = (['gentle', 'focused'].indexOf(layout) === -1) ? 'gentle' : layout;
  var focused = name === 'focused';

  // Visibility: available to this user type AND not hidden by their saved
  // `dashboard_sections` preference — unless the caller supplies live UI state.
  var vis = {};
  if (opts.vis) {
    Object.keys(opts.vis).forEach(function(k) { vis[k] = opts.vis[k]; });
  } else {
    availableHomeSections(user).forEach(function(s) {
      vis[s.key] = !sectionHidden(user, s.key);
    });
  }
  // Focused View never shows Extras — Speak takes the focal full-width hero slot.
  // Forced here so the grid matrix and the per-card hiding agree; a card left
  // visible but unnamed in the areas lands in an implicit row of its own.
  if (focused) { vis.extras = false; }

  // Drag order, gated. `dashboard_order` is only ever SET by the flagged drag UI,
  // so with the flag off the saved value must be ignored and the canonical default
  // used instead. This gate is the one the preview iframes were missing.
  var raw = (opts.order !== undefined && opts.order !== null)
    ? opts.order
    : (user && user.get ? user.get('preferences.dashboard_order') : null);
  var order = (opts.dragEnabled && raw && raw.length) ? raw : null;

  var heroKey = focusedHeroKey(user);

  // Non-grid toggles (the welcome hero). Focused View also hides the hero in CSS,
  // so the live page needs only the saved preference; the previews additionally
  // need the gentleOnly rule expressed here because a cloned hero would otherwise
  // depend on that CSS having been carried across.
  var toggles = {};
  EXTRA_HOME_TOGGLES.forEach(function(t) {
    var on;
    if (opts.vis) {
      // Caller supplied live UI state: a key it does not offer stays UNDEFINED so the
      // caller skips it, rather than being driven from a preference its UI can't see.
      if (opts.vis[t.key] === undefined) { return; }
      on = !!opts.vis[t.key];
    } else {
      on = !sectionHidden(user, t.key);
    }
    toggles[t.key] = on && !(t.gentleOnly && focused);
  });

  return {
    layout: name,
    // Document-level: 68 rules in _focused-view.scss are scoped `body.ll-layout-focused`,
    // which is why a preview needs its own document (an iframe) rather than an
    // off-screen node in this one.
    bodyClass: focused ? 'll-layout-focused' : null,
    gridClass: 'md-grid--layout-' + name,
    shellFocused: focused,
    vis: vis,
    toggles: toggles,
    order: order,
    heroKey: heroKey,
    grid: gridLayoutState(vis, order, name, heroKey)
  };
}

export { HOME_SECTIONS, EXTRA_HOME_TOGGLES, RIGHT_SECTIONS, AREA, DEFAULT_ORDER, FOCUSED_DEFAULT_ORDER, ORG_DEFAULT_ORDER, FOCUSED_ACTION_KEYS, availableHomeSections, sectionHidden, sectionsMapFor, sectionLabel, hasOrgManagement, gridLayoutState, reorderInsert, reorderForFocused, defaultOrderFor, focusedHeroKey, layoutPresentation, ATTENTION_STATUS_IDS, communicatorsNeedingAttention, attentionBadgeFor };
export default { HOME_SECTIONS, EXTRA_HOME_TOGGLES, RIGHT_SECTIONS, AREA, DEFAULT_ORDER, FOCUSED_DEFAULT_ORDER, FOCUSED_ACTION_KEYS, availableHomeSections, sectionHidden, sectionsMapFor, sectionLabel, hasOrgManagement, gridLayoutState, reorderInsert, reorderForFocused, defaultOrderFor, focusedHeroKey, layoutPresentation, ATTENTION_STATUS_IDS, communicatorsNeedingAttention, attentionBadgeFor };
