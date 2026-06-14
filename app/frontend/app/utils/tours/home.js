// Home page guided tour — serves BOTH Gentle View and Focused View from one
// layout-aware builder: `buildHomeSteps(layout)`.
//
// Position- and visibility-INDEPENDENT: the per-card steps are built from the
// cards actually on screen (read from the live DOM), sorted into the order the
// user currently sees them, with each popover's placement derived from the
// card's real geometry. So the tour stays correct no matter how the user has
// dragged/reordered or hidden cards in the Dashboard Design modal, and it adapts
// to each layout automatically — Focused hides the Extras card and the Account
// nav pill, and swaps the Speak card for the full-width Speak HERO; all of that
// falls out of the DOM-driven discovery below. The ONE thing that isn't visual
// is the COPY: the Speak step reads differently in Focused (the hero is "Let's
// Communicate"), so `layout` selects that wording.
//
// The card registry (which cards exist, their CSS class) is shared with the
// dashboard renderer via utils/dashboard_sections, so tour COVERAGE can never
// silently drift from what the dashboard shows. This module only adds the
// tour-specific COPY (title/text) per section.
import i18n from '../i18n';
import { HOME_SECTIONS } from '../dashboard_sections';
import { standardButtons, decoratedTitle, tourChecklist, setIdentityDropdownOpen, visibleEl, placementForElement } from './shared';

// Selector overrides for the multi-markup cards. Speak/Caseload each render a
// `-wide-only` AND a `-narrow-only` element that share the base class; the CSS
// shows the `-narrow-only` (card-as-button) variant at every width in Gentle
// View and hides the `-wide-only`. Speak ALSO has a `-focused` hero shown only
// in Focused View. We list every candidate per card and let visibleEl() pick
// the one actually on screen (and attach the step to that resolved ELEMENT, so
// Shepherd can't grab a hidden sibling). Every other card is single-markup.
var CARD_SELECTOR = {
  speak: '.md-card--speak-narrow-only, .md-card--speak-focused',
  caseload: '.md-card--caseload-narrow-only'
};

// Tour copy per section key. Bodies are scannable CHECKLISTS (tourChecklist),
// not prose — modern product-tour style so users skim the value fast. Literal
// i18n.t(key, default) calls (inside a switch, evaluated at tour-start so the
// active locale is loaded) so i18n_generator.rb's static scanner extracts every
// key — see LEARNINGS.md on the dynamic-key gotcha. `layout` tailors the wording
// where the same element reads differently per layout (currently just Speak).
// Returns null for keys with no tour step.
function cardCopy(key, layout) {
  switch (key) {
    case 'caseload':
      return {
        title: i18n.t('home_tour_caseload_title', "Your caseload"),
        text: tourChecklist([
          i18n.t('home_tour_caseload_b1', "Jump to anyone you support"),
          i18n.t('home_tour_caseload_b2', "Add a note or quick assessment"),
          i18n.t('home_tour_caseload_b3', "Model in Speak Mode")
        ])
      };
    case 'speak':
      // Focused View: Speak is the full-width "Let's Communicate" hero — the
      // focal action of the layout. Gentle View: the compact Speak Mode card.
      if (layout === 'focused') {
        return {
          title: i18n.t('home_tour_speak_focused_title', "Open your communication board"),
          text: tourChecklist([
            i18n.t('home_tour_speak_focused_b1', "Opens your communication board"),
            i18n.t('home_tour_speak_focused_b2', "Start speaking")
          ])
        };
      }
      return {
        title: i18n.t('home_tour_speak_title', "Open Speak Mode"),
        text: tourChecklist([
          i18n.t('home_tour_speak_b1', "Opens your home communication board"),
          i18n.t('home_tour_speak_b2', "Speak Mode, ready for everyday use"),
          i18n.t('home_tour_speak_b3', "Pick up right where you left off")
        ])
      };
    case 'boards':
      return {
        title: i18n.t('home_tour_boards_title', "Manage your boards"),
        text: tourChecklist([
          i18n.t('home_tour_boards_b1', "Create & organize your boards"),
          i18n.t('home_tour_boards_b2', "Browse your whole collection")
        ])
      };
    case 'extras':
      return {
        title: i18n.t('home_tour_extras_title', "More tools in Extras"),
        text: tourChecklist([
          i18n.t('home_tour_extras_b1', "Games & lessons"),
          i18n.t('home_tour_extras_b2', "Account settings"),
          i18n.t('home_tour_extras_b3', "More helpful tools")
        ])
      };
    case 'org':
      return {
        title: i18n.t('home_tour_orgs_title', "Manage your organizations"),
        text: tourChecklist([
          i18n.t('home_tour_orgs_b1', "Manage members"),
          i18n.t('home_tour_orgs_b2', "Set up rooms"),
          i18n.t('home_tour_orgs_b3', "Assign licenses")
        ])
      };
    case 'account':
      return {
        title: i18n.t('home_tour_account_title', "Your account"),
        text: tourChecklist([
          i18n.t('home_tour_account_b1', "Update your profile"),
          i18n.t('home_tour_account_b2', "Adjust your preferences"),
          i18n.t('home_tour_account_b3', "Manage your subscription")
        ])
      };
    case 'createboard':
      return {
        title: i18n.t('home_tour_createboard_title', "Create a board"),
        text: tourChecklist([
          i18n.t('home_tour_createboard_b1', "Start from a blank board"),
          i18n.t('home_tour_createboard_b2', "Build it your way"),
          i18n.t('home_tour_createboard_b3', "Add it to your collection")
        ])
      };
    case 'reports':
      return {
        title: i18n.t('home_tour_reports_title', "Track progress with Reports"),
        text: tourChecklist([
          i18n.t('home_tour_reports_b1', "View Communication Activity"),
          i18n.t('home_tour_reports_b2', "See word usage over time"),
          i18n.t('home_tour_reports_b3', "Track progress at a glance")
        ])
      };
    case 'editdashboard':
      return {
        title: i18n.t('home_tour_editdashboard_title', "Customize this page"),
        text: tourChecklist([
          i18n.t('home_tour_editdashboard_b1', "Rearrange your cards"),
          i18n.t('home_tour_editdashboard_b2', "Show or hide sections"),
          i18n.t('home_tour_editdashboard_b3', "Make this page yours")
        ])
      };
    default:
      return null;
  }
}

// Centered intro step (no attachTo).
function welcomeStep() {
  return {
    id: 'home_tour_welcome',
    title: decoratedTitle('home_tour_welcome_title', "Welcome to LingoLinq"),
    text: tourChecklist([
      i18n.t('home_tour_welcome_b1', "Your boards & Speak Mode"),
      i18n.t('home_tour_welcome_b2', "Reports & insights"),
      i18n.t('home_tour_welcome_b3', "Account, settings & more")
    ], i18n.t('home_tour_welcome_lead', "Here's a quick look at where everything lives:")),
    // --welcome carries an extra class so ONLY the first (welcome) page can be
    // nudged higher than the shared intro/outro offset (the outro reuses
    // --intro but stays at the default position). See app.scss.
    classes: 'md-tour__step md-tour__step--intro md-tour__step--welcome',
    buttons: [
      {
        text: i18n.t('home_tour_skip', "Skip tour"),
        type: 'cancel',
        classes: 'md-tour__btn md-tour__btn--ghost'
      },
      {
        text: i18n.t('home_tour_start', "Start the tour"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ]
  };
}

// Primary nav + one explainer per visible nav pill. Nav sits at the top of the
// page so 'bottom' placement is correct at every width. On very narrow layouts
// (<= $aac-breakpoint-xs) the pill row is hidden and collapses to a single
// dropdown trigger, so the nav step targets whichever control is actually
// visible (never attach a step to a hidden element); the per-pill steps are
// added only when the pill row itself is on-screen. Keys are static literals
// (not a loop with bound keys) so i18n_generator.rb can extract them — see
// LEARNINGS.md on the static-parser gotcha.
function pushNavSteps(steps) {
  // Target the visible nav control: the full pill row when shown, else the
  // collapsed dropdown trigger. If neither is visible (no dashboard nav on this
  // page), skip the nav step entirely rather than spotlight a hidden element.
  var navEl = visibleEl('.md-pillnav') || visibleEl('.md-pillnav-dropdown__trigger') || visibleEl('.md-pillnav-dropdown');
  if (navEl) {
    steps.push({
      id: 'home_tour_pillnav',
      attachTo: { element: navEl, on: 'bottom' },
      title: i18n.t('home_tour_nav_title', "Your main navigation"),
      text: tourChecklist([
        i18n.t('home_tour_nav_b1', "Switch sections in one tap"),
        i18n.t('home_tour_nav_b2', "Home, Boards, Reports & Extras")
      ]),
      classes: 'md-tour__step',
      buttons: standardButtons()
    });
  }

  // Per-pill steps — DOM-driven so they include EVERY pill actually rendered,
  // incl. the communicator-only "Account" pill (Gentle View) the old fixed
  // nth-of-type list skipped. nth-of-type was also fragile here: Account is an
  // <a> while the others are <button>, so per-type indexing misaligns. Instead
  // resolve each pill by a STABLE hook: Reports/Account carry modifier classes;
  // the remaining plain pills are Home/Boards/Extras in DOM order. Steps are
  // sorted by live geometry so they follow the on-screen order, and each is
  // placed 'bottom' (pills sit at the top of the page at every width). Keys are
  // static literals so i18n_generator.rb can extract them. (Focused View has no
  // Account pill, so that step is simply absent — DOM-driven.)
  var visiblePills = function(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel))
      .filter(function(el) { return el.offsetParent !== null; });
  };
  var plain = visiblePills('.md-pillnav .md-pillnav__pill:not(.md-pillnav__pill--reports):not(.md-pillnav__pill--account)');
  var reports = visibleEl('.md-pillnav .md-pillnav__pill--reports');
  var account = visibleEl('.md-pillnav .md-pillnav__pill--account');
  var pills = [];
  if (plain[0]) { pills.push({ kind: 'home', el: plain[0], title: i18n.t('home_tour_page_home_title', "Home"), text: tourChecklist([
    i18n.t('home_tour_page_home_b1', "Pick up where you left off"),
    i18n.t('home_tour_page_home_b2', "Your most-used tools at a glance")
  ]) }); }
  if (plain[1]) { pills.push({ kind: 'boards', el: plain[1], title: i18n.t('home_tour_page_boards_title', "Boards"), text: tourChecklist([
    i18n.t('home_tour_page_boards_b1', "Browse & create boards"),
    i18n.t('home_tour_page_boards_b2', "Open any board to view or edit")
  ]) }); }
  if (plain[2]) { pills.push({ kind: 'extras', el: plain[2], title: i18n.t('home_tour_page_extras_title', "Extras"), text: tourChecklist([
    i18n.t('home_tour_page_extras_b1', "Games & lessons"),
    i18n.t('home_tour_page_extras_b2', "Settings & more tools")
  ]) }); }
  if (reports) { pills.push({ kind: 'reports', el: reports, title: i18n.t('home_tour_page_reports_title', "Reports"), text: tourChecklist([
    i18n.t('home_tour_page_reports_b1', "Usage & progress"),
    i18n.t('home_tour_page_reports_b2', "Word data for those you support")
  ]) }); }
  if (account) { pills.push({ kind: 'account', el: account, title: i18n.t('home_tour_page_account_title', "Account"), text: tourChecklist([
    i18n.t('home_tour_page_account_b1', "Profile & preferences"),
    i18n.t('home_tour_page_account_b2', "Manage your subscription")
  ]) }); }
  pills.sort(function(a, b) {
    var ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
    return (ra.top - rb.top) || (ra.left - rb.left);
  });
  pills.forEach(function(p) {
    steps.push({
      id: 'home_tour_pill_' + p.kind,
      attachTo: { element: p.el, on: 'bottom' },
      title: p.title,
      text: p.text,
      classes: 'md-tour__step',
      buttons: standardButtons()
    });
  });
}

// A short description for an identity-dropdown item, keyed off the link's route
// or class (its visible text is used as the step TITLE). Returns '' when there's
// no specific copy — the item's name then stands on its own (e.g. Help, Sign
// Out). Literal i18n.t keys for the generator.
function dropdownItemDesc(link) {
  var href = link.getAttribute('href') || '';
  var cls = link.className || '';
  if (cls.indexOf('dropdown-menu__company-link') !== -1) { return i18n.t('home_tour_dd_company', "Learn more about LingoLinq."); }
  if (cls.indexOf('dropdown-menu__language-link') !== -1) { return i18n.t('home_tour_dd_language', "Change your display language."); }
  if (href.indexOf('/account') !== -1) { return i18n.t('home_tour_dd_account', "View and edit your account."); }
  if (href.indexOf('/preferences') !== -1) { return i18n.t('home_tour_dd_settings', "Adjust your settings."); }
  if (href.indexOf('/boards') !== -1) { return i18n.t('home_tour_dd_boards', "See all of your boards."); }
  if (href.indexOf('/search') !== -1) { return i18n.t('home_tour_dd_find', "Find more boards to use."); }
  // Help + Sign Out are plain action links (href="#", no class) — match on their
  // visible text against the same i18n labels they render with.
  var txt = (link.textContent || '').replace(/\s+/g, ' ').trim();
  if (txt === i18n.t('help', "Help")) { return i18n.t('home_tour_dd_help', "Get help and support."); }
  if (txt === i18n.t('logout', "Sign Out")) { return i18n.t('home_tour_dd_logout', "Sign out of LingoLinq."); }
  return '';
}

// The actionable items inside the identity (account) dropdown, in menu order.
// Read live from the DOM so coverage matches exactly what's rendered for this
// user/screen — admin-only entries that aren't rendered are absent, and dividers,
// the name header, and CSS-hidden rows (theme picker, exit-boards) are filtered
// by computed display (which reflects each row's OWN rules even while the menu is
// closed). Each item's visible text becomes the step title.
function identityDropdownItems() {
  var btn = document.querySelector('#identity_button');
  var dd = btn && btn.closest('.dropdown');
  var menu = dd && dd.querySelector('.dropdown-menu');
  if (!menu) { return []; }
  var out = [];
  Array.prototype.forEach.call(menu.children, function(li) {
    if (!li || li.tagName !== 'LI') { return; }
    if (li.classList.contains('divider') || li.classList.contains('dropdown-header')) { return; }
    if (window.getComputedStyle(li).display === 'none') { return; }
    var link = li.querySelector('a, button');
    if (!link) { return; }
    var title = (link.textContent || '').replace(/\s+/g, ' ').trim();
    if (!title) { return; }
    out.push({ el: link, title: title, text: dropdownItemDesc(link) });
  });
  return out;
}

// Inner-header (top navbar) coverage: a step per VISIBLE header tool, left to
// right (brand → search → tour → display → upgrade → help → identity), then the
// identity dropdown is OPENED and each of its items is toured. Everything is
// DOM-gated so it adapts to the screen size — only items actually on-screen get a
// step (e.g. help is large-only; on small screens the whole desktop dropdown is
// replaced by the hamburger, so the identity steps are skipped).
function pushHeaderSteps(steps) {
  // (1) Whole-toolbar OVERVIEW first — a stylized, padded, rounded spotlight that
  // wraps the entire header bar edge-to-edge. Prefer the full-width #inner_header
  // (carries the surface edge to edge; it's position:fixed so offsetParent is
  // null — resolve directly + verify it's rendered, not via visibleEl). Then the
  // per-item walkthrough zooms in left-to-right.
  var headerEl = document.querySelector('#inner_header');
  if (!headerEl || !headerEl.getBoundingClientRect().width) {
    headerEl = visibleEl('.app-navbar-authenticated-inner');
  }
  if (headerEl) {
    steps.push({
      id: 'home_tour_header',
      attachTo: { element: headerEl, on: 'bottom' },
      modalOverlayOpeningPadding: 8,
      modalOverlayOpeningRadius: 18,
      matchTargetRadius: false,
      title: i18n.t('home_tour_header_title', "Your top toolbar"),
      text: tourChecklist([
        i18n.t('home_tour_header_b1', "Search your boards"),
        i18n.t('home_tour_header_b2', "Customize your dashboard"),
        i18n.t('home_tour_header_b3', "Upgrade your plan"),
        i18n.t('home_tour_header_b4', "Your account menu")
      ], i18n.t('home_tour_header_lead', "Everything up here is always one tap away:")),
      classes: 'md-tour__step md-tour__step--navbar md-tour__step--navbar-overview',
      buttons: standardButtons()
    });
  }

  // (2) Per-item header steps, ordered left-to-right by live geometry. Each gets a
  // stylized padded + rounded spotlight (matchTargetRadius:false keeps the radius
  // — guided-tour.js otherwise snaps it to a square element's 0px corners) so the
  // highlight wraps the item's outer container instead of a tight square. The
  // brand targets the logo link (inset from the left edge) — NOT .app-navbar__brand
  // (the <h1>, which spans to x=0, so the padded highlight's left rounded corner
  // clipped off-screen). The logo is inset, so the padded cutout wraps it with
  // visible margin on both sides.
  var HEADER_ITEMS = [
    { sel: '.nav-header__logo-link', title: i18n.t('home_tour_h_brand_title', "LingoLinq home"), text: i18n.t('home_tour_h_brand_text', "Tap the logo anytime to return to your home page.") },
    { sel: '#header_search', title: i18n.t('home_tour_h_search_title', "Search boards"), text: i18n.t('home_tour_h_search_text', "Search for available boards.") },
    { sel: '.md-tour__trigger', title: i18n.t('home_tour_h_tour_title', "Guided tour"), text: i18n.t('home_tour_h_tour_text', "Replay this tour whenever you'd like a refresher.") },
    { sel: '.md-display-style__trigger', title: i18n.t('home_tour_h_display_title', "Display style"), text: i18n.t('home_tour_h_display_text', "Switch between Gentle and Focused views and customize your dashboard.") },
    { sel: '.md-pillnav__upgrade-nav', title: i18n.t('home_tour_h_upgrade_title', "Upgrade"), text: i18n.t('home_tour_h_upgrade_text', "See plans and upgrade your account.") },
    // Settings gear — Gentle view only (on Focused it lives in the identity
    // dropdown, covered by those steps). visibleEl skips it when it isn't
    // rendered, so this single entry serves both views.
    { sel: '.ll-header-settings-btn', title: i18n.t('home_tour_h_settings_title', "Settings"), text: i18n.t('home_tour_h_settings_text', "Adjust your account settings and preferences.") },
    { sel: '.ll-bento-help-btn--support', title: i18n.t('home_tour_h_help_title', "Help"), text: i18n.t('home_tour_h_help_text', "Get help and support.") }
  ];
  var found = [];
  HEADER_ITEMS.forEach(function(item) {
    var el = visibleEl(item.sel);
    if (!el) { return; }
    found.push({ el: el, title: item.title, text: item.text, rect: el.getBoundingClientRect() });
  });
  found.sort(function(a, b) { return (a.rect.left - b.rect.left) || (a.rect.top - b.rect.top); });
  found.forEach(function(f, i) {
    steps.push({
      id: 'home_tour_hdr_' + i,
      attachTo: { element: f.el, on: 'bottom' },
      modalOverlayOpeningPadding: 7,
      modalOverlayOpeningRadius: 14,
      matchTargetRadius: false,
      title: f.title,
      text: tourChecklist([f.text]),
      classes: 'md-tour__step md-tour__step--navbar',
      buttons: standardButtons()
    });
  });

  // (2) Identity / account dropdown — desktop only (skipped when the avatar
  // trigger is hidden). Explain the trigger (the menu opens), then tour each item
  // inside it. beforeShowPromise opens the dropdown BEFORE Shepherd positions, so
  // the menu items are on-screen when their step attaches; guided-tour.js closes
  // the dropdown again when the tour leaves these steps or ends. Placed 'left'
  // (the menu sits top-right; the popover sits to its left, clear of the menu).
  var idBtn = visibleEl('#identity_button');
  if (!idBtn) { return; }
  var openDropdown = function() { setIdentityDropdownOpen(true); return Promise.resolve(); };
  steps.push({
    id: 'home_tour_identity',
    attachTo: { element: idBtn, on: 'left' },
    // Trigger step: just spotlight the avatar + explain — the menu stays CLOSED
    // here (guided-tour.js opens it only on the item steps below). Stylized
    // padded + rounded cutout (matchTargetRadius:false) so the highlight is a
    // clean rounded box, not the skewed oval the radius-match makes on the
    // non-square #identity_button (it includes the caret/status).
    modalOverlayOpeningPadding: 6,
    modalOverlayOpeningRadius: 14,
    matchTargetRadius: false,
    title: i18n.t('home_tour_identity_title', "Your user menu"),
    text: tourChecklist([i18n.t('home_tour_identity_text', "This is your user menu — your account, boards, settings, language, help, and sign out all live here.")]),
    classes: 'md-tour__step',
    buttons: standardButtons()
  });
  identityDropdownItems().forEach(function(it, i) {
    steps.push({
      id: 'home_tour_iddrop_' + i,
      attachTo: { element: it.el, on: 'left' },
      beforeShowPromise: openDropdown,
      title: it.title,
      text: it.text ? tourChecklist([it.text]) : '',
      classes: 'md-tour__step',
      buttons: standardButtons()
    });
  });
}

// One step per VISIBLE card, ordered by on-screen position (top-to-bottom,
// then left-to-right), with placement derived from each card's live geometry.
// Hidden cards (display:none — e.g. the Extras card in Focused View) are skipped
// via visibleEl(). Card-step ids are prefixed `home_tour_card_` so the resize
// handler can recompute only THESE placements when the viewport changes (the
// nav/intro steps stay fixed). `layout` selects per-layout copy (see cardCopy).
function pushCardSteps(steps, layout) {
  var found = [];
  HOME_SECTIONS.forEach(function(s) {
    var sel = CARD_SELECTOR[s.key] || ('.' + s.cardClass);
    var el = visibleEl(sel);
    if (!el) { return; }
    var copy = cardCopy(s.key, layout);
    if (!copy) { return; }
    found.push({ key: s.key, el: el, sel: sel, copy: copy, rect: el.getBoundingClientRect() });
  });
  found.sort(function(a, b) {
    return (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left);
  });
  found.forEach(function(f) {
    steps.push({
      id: 'home_tour_card_' + f.key,
      // Attach to the RESOLVED visible element (not the selector string): a
      // multi-variant selector would otherwise let Shepherd's querySelector
      // grab a hidden sibling. The resize handler + shape-match both accept an
      // element ref.
      attachTo: { element: f.el, on: placementForElement(f.el) },
      title: f.copy.title,
      text: f.copy.text,
      classes: 'md-tour__step',
      buttons: standardButtons()
    });
  });
}

// Modern "completion" animation for the outro — a success checkmark that draws
// in with a pop + ring burst (replaces a plain "That's the tour!" line). Pure
// CSS (animations + reduced-motion guard in app.scss: `.md-tour__done*`).
function doneCelebration() {
  return '' +
    '<div class="md-tour__done" aria-hidden="true">' +
      '<svg class="md-tour__done-svg" viewBox="0 0 52 52" width="62" height="62">' +
        '<circle class="md-tour__done-circle" cx="26" cy="26" r="24"></circle>' +
        '<path class="md-tour__done-mark" d="M16 27 l7 7 l13 -15"></path>' +
      '</svg>' +
    '</div>';
}

// Centered outro step (single Finish button — type:next on the last step
// completes the tour via Shepherd's auto-complete).
function doneStep() {
  return {
    id: 'home_tour_done',
    title: decoratedTitle('home_tour_done_title', "You're all set with the Home Page"),
    text: doneCelebration() + tourChecklist([
      i18n.t('home_tour_welcome_b1', "Your boards & Speak Mode"),
      i18n.t('home_tour_welcome_b2', "Reports & insights"),
      i18n.t('home_tour_welcome_b3', "Account, settings & more")
    ], null,
      i18n.t('home_tour_done_text', "You can return anytime from the Take a tour button at the top of the dashboard.")),
    classes: 'md-tour__step md-tour__step--intro md-tour__step--outro',
    buttons: [
      {
        text: i18n.t('home_tour_finish', "Finish"),
        type: 'next',
        classes: 'md-tour__btn md-tour__btn--primary'
      }
    ]
  };
}

// Build the full ordered step list for the home page. `layout` is 'gentle' or
// 'focused' (defaults to 'gentle'); it only affects per-layout copy — structure
// is discovered from the live DOM, so it's correct even if `layout` is omitted.
function buildHomeSteps(layout) {
  var steps = [];
  steps.push(welcomeStep());
  pushHeaderSteps(steps);
  pushNavSteps(steps);
  pushCardSteps(steps, layout);
  steps.push(doneStep());
  // Focused View: tag every step so the popover picks up the Focused-View skin
  // (Focused palette + gradient CTA) — see `.md-tour__step--focused` in app.scss.
  if (layout === 'focused') {
    steps.forEach(function(s) {
      s.classes = ((s.classes || '') + ' md-tour__step--focused').trim();
    });
  }
  return steps;
}

export { buildHomeSteps };
export default buildHomeSteps;
