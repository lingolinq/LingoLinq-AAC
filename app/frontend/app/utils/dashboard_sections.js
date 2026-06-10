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
  // Boards gone + three cards left WITHOUT the extras+org pair (that pair has its
  // own row via the branch above). Caseload + Speak take the top row; the remaining
  // single card spans BOTH columns instead of sitting orphaned in one — no lone
  // half-row. (The {cl,ex,og} / {sp,ex,og} threes are already full-width-top above.)
  if (!bd && cl && sp && ex && !og) { return L(['caseload speak', 'extras extras', '. sup'], 'auto auto 0'); }
  if (!bd && cl && sp && !ex && og) { return L(['caseload speak', 'org_mgmt org_mgmt', '. sup'], 'auto auto 0'); }
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

// Apply the user's saved card POSITIONS (drag-to-swap, chosen in the Getting
// Started preview) to a layout's grid-template-areas. `positions` maps a section
// key to the section key whose home-slot it should occupy (default identity); a
// swap is the pair {A: B, B: A}. We relabel the area-name tokens in place rather
// than touching per-card `grid-area`, so this rides the existing inline grid style
// and naturally no-ops on the narrow (order-based) layout.
//
// Robustness: we only relabel a CLOSED PERMUTATION over currently-visible,
// non-boards cards. If the saved map is partial/inconsistent (e.g. it references a
// now-hidden card's slot), we fall back to the untouched layout — never emitting a
// non-rectangular (invalid) template that would drop a card. Boards is excluded
// (it's the spanning hero, a different cell shape).
function applyPositions(areas, vis, positions) {
  if (!positions) { return areas; }
  var tokenMap = {}; // source area-name → target area-name
  Object.keys(positions).forEach(function(k) {
    var target = positions[k];
    if (k === 'boards' || target === 'boards') { return; }
    if (!vis[k] || !vis[target]) { return; }
    if (!AREA[k] || !AREA[target]) { return; }
    tokenMap[AREA[k]] = AREA[target];
  });
  var sources = Object.keys(tokenMap);
  if (sources.length === 0) { return areas; }
  // Must be a bijection over the SAME token set (closed permutation): every
  // target is also a source, and targets are distinct. Otherwise → identity.
  var seenTarget = {};
  var closed = sources.every(function(src) {
    var dst = tokenMap[src];
    if (seenTarget[dst] || !tokenMap.hasOwnProperty(dst)) { return false; }
    seenTarget[dst] = true;
    return true;
  });
  if (!closed) { return areas; }
  return areas.map(function(row) {
    return row.split(' ').map(function(tok) { return tokenMap[tok] || tok; }).join(' ');
  });
}

// ── Boards placement (drag-to-MOVE the hero card) ───────────────────────────
// Boards is the tall 2-row hero; unlike the equal 1×1 small cards it can't just
// trade area-name tokens. Its placement is a separate descriptor:
//   { side: 'left'|'right', raised: boolean }
// applied as STRUCTURAL transforms on the (already small-card-permuted) areas:
//   raised → swap Boards' 2-row block with the single card directly above it in
//            its column (vertical swap); columns unchanged.
//   side   → mirror: move Boards to the other column (swap the two tokens in each
//            of Boards' rows) and report `boardsRight` so the caller can swap the
//            column widths — the WIDER column follows Boards (the 55/45 'anchor').
// Default ({}/left/not-raised) is a NO-OP → byte-identical to today. Only a clean
// 2-row single-column Boards block is transformable; anything else (Boards full-
// width, 1-row, or absent) returns the layout untouched (safe fallback), so this
// can never produce an invalid template or drop a card.

// Locate Boards in an areas array: which column (0/1), the row indices it spans,
// and whether it is full-width (spans both columns in a row).
function boardsCells(areas) {
  var col = -1, rows = [], fullWidth = false;
  areas.forEach(function(row, i) {
    var t = row.split(' ');
    if (t[0] === 'boards' && t[1] === 'boards') { fullWidth = true; col = 0; rows.push(i); }
    else if (t[0] === 'boards') { col = 0; rows.push(i); }
    else if (t[1] === 'boards') { col = 1; rows.push(i); }
  });
  return { col: col, rows: rows, fullWidth: fullWidth };
}

function setCol(rowStr, c, tok) {
  var t = rowStr.split(' ');
  t[c] = tok;
  return t.join(' ');
}

// Boards is a clean, transformable 2-row single-column block.
function boardsMovable(bc) {
  return bc.col >= 0 && bc.rows.length === 2 && !bc.fullWidth && bc.rows[1] === bc.rows[0] + 1;
}

function applyBoardsPlacement(areas, boards) {
  if (!boards || (boards.side !== 'right' && !boards.raised)) {
    return { areas: areas, boardsRight: false };
  }
  var bc = boardsCells(areas);
  if (!boardsMovable(bc)) { return { areas: areas, boardsRight: false }; }
  var out = areas.slice();

  // 1) raised: swap the Boards block with the single card directly above it in the
  //    same column — only when that cell is a real single card (not '.', not Boards,
  //    not a full-width or multi-row span). Boards shifts up; the card drops to the
  //    block's old bottom cell.
  if (boards.raised) {
    var c = bc.col, top = bc.rows[0];
    if (top > 0) {
      var aboveRow = out[top - 1].split(' ');
      var aboveTok = aboveRow[c];
      var aboveSingle = aboveTok && aboveTok !== '.' && aboveTok !== 'boards' && aboveRow[0] !== aboveRow[1];
      var aboveSpans = out.filter(function(r) { return r.split(' ')[c] === aboveTok; }).length > 1;
      if (aboveSingle && !aboveSpans) {
        out[top - 1] = setCol(out[top - 1], c, 'boards');
        out[top + 1] = setCol(out[top + 1], c, aboveTok);
      }
    }
  }

  // 2) side right: mirror Boards into the other column by swapping the two tokens in
  //    each of its (possibly raised) rows. The wider column follows Boards.
  var boardsRight = false;
  if (boards.side === 'right') {
    var bc2 = boardsCells(out);
    if (boardsMovable(bc2)) {
      bc2.rows.forEach(function(i) {
        var t = out[i].split(' ');
        var tmp = t[0]; t[0] = t[1]; t[1] = tmp;
        out[i] = t.join(' ');
      });
      boardsRight = boardsCells(out).col === 1;
    }
  }
  return { areas: out, boardsRight: boardsRight };
}

// The Balanced display style: Speak is a full-width hero spanning both columns
// (and is given ~2× its Dynamic height by the `.md-grid--layout-balanced
// .md-card--speak` CSS rule), and the Extras card never shows. Everything else
// (Boards + optional Caseload/Org) reuses the canonical matrix with Speak and
// Extras removed, then we stack the full-width `speak speak` hero on top. This
// keeps Balanced a thin transform over the shared layout — adding a card type
// to the matrix benefits Balanced for free. `positions`/`boards` (drag-to-swap,
// flag-gated) apply to the non-hero remainder; the hero row is fixed.
function balancedLayout(vis, positions, boards) {
  var rest = Object.assign({}, vis, { speak: false, extras: false });
  var base = dashboardLayout(rest);
  var areas = applyPositions(base.areas, rest, positions);
  var bp = applyBoardsPlacement(areas, boards);
  areas = bp.areas;
  if (vis.speak) {
    areas = ['speak speak'].concat(areas);
  }
  var rows = vis.speak ? ('auto ' + base.rows) : base.rows;
  return { areas: areas, rows: rows, boardsRight: bp.boardsRight };
}

// Derive the dashboard grid state from the visibility map: the card-STYLING
// classes still needed (with-caseload / with-org-mgmt restyle the Speak/Caseload
// cards — they no longer drive layout) plus the computed grid-template areas/rows
// and a ready-to-apply inline `grid-template-areas` value. `positions` (optional)
// applies the small-card drag-to-swap arrangement; `boards` (optional) applies the
// Boards move. `layout` (optional) selects the display style: 'balanced' routes
// through balancedLayout (Speak hero + no Extras); anything else (default
// 'dynamic') uses the canonical matrix. Omitting all yields the canonical layout
// unchanged. When Boards is mirrored to the right, `md-grid--boards-right` is added
// so the (media-scoped) CSS can swap the column widths — never inline, so the
// mobile breakpoints are untouched.
function gridLayoutState(vis, positions, boards, layout) {
  vis = vis || {};
  var classes = [];
  if (vis.caseload) { classes.push('md-grid--with-caseload'); }
  if (vis.org) { classes.push('md-grid--with-org-mgmt'); }
  var areas, rows, boardsRight;
  if (layout === 'balanced') {
    var bl = balancedLayout(vis, positions, boards);
    areas = bl.areas; rows = bl.rows; boardsRight = bl.boardsRight;
  } else {
    var canonical = dashboardLayout(vis);
    areas = applyPositions(canonical.areas, vis, positions);
    var bp = applyBoardsPlacement(areas, boards);
    areas = bp.areas; rows = canonical.rows; boardsRight = bp.boardsRight;
  }
  if (boardsRight) { classes.push('md-grid--boards-right'); }
  // Flag when Boards spans BOTH columns (a full-width 'boards boards' row) so the
  // CSS can let the board strip shrink to fit instead of horizontally scrolling.
  if (areas.some(function(row) { return row === 'boards boards'; })) { classes.push('md-grid--boards-full'); }
  var areasValue = areas.map(function(row) { return '"' + row + '"'; }).join(' ');
  return { classes: classes, areas: areas, rows: rows, areasValue: areasValue };
}

export { HOME_SECTIONS, RIGHT_SECTIONS, AREA, availableHomeSections, sectionHidden, sectionsMapFor, sectionLabel, hasOrgManagement, gridLayoutState, applyBoardsPlacement, boardsCells };
export default { HOME_SECTIONS, RIGHT_SECTIONS, AREA, availableHomeSections, sectionHidden, sectionsMapFor, sectionLabel, hasOrgManagement, gridLayoutState, applyBoardsPlacement, boardsCells };
