// Guided-tour dispatcher. Maps the current page (route) + dashboard layout to
// the step-builder for that page's tour, so the single inner-header "Take a
// tour" button pulls a page-specific tour. Returns null when no tour exists for
// the page — the trigger uses that to hide the button (so it never appears on
// pages with no tour) and the auto-open flow uses it to skip to its handoff.
//
// The home tour is DOM-driven (builds steps from the cards actually on screen),
// so it adapts to BOTH dashboard layouts — Gentle View and Focused View — from
// one builder. `layout` selects per-view copy (e.g. the Focused Speak hero vs
// the Gentle Speak card); the returned thunk is what the trigger calls.
// Adding another page's tour: write a builder module under utils/tours/ and
// register its route here.
import { buildHomeSteps } from './home';
import { buildBoardPickerSteps } from './board-picker';
import { buildBoardDetailSteps } from './board-detail';
import { buildBoardDetailSpeakSteps } from './board-detail-speak';
import { buildCaseloadSteps } from './caseload';

// Board-detail EDIT mode is a STATE (app_state.edit_mode), not its own route —
// both `user.board-detail.index` and `user.board-detail.edit` can be in edit
// mode — so the board-detail tour is gated on `editMode`, not the route alone.
function _isBoardDetail(route) {
  return !!route && route.indexOf('user.board-detail') === 0;
}

function tourBuilderFor(route, layout, editMode) {
  if (route === 'user.home') {
    var view = (layout === 'focused') ? 'focused' : 'gentle';
    // The thunk forwards caller options (e.g. { handoff: true } when the tour
    // will hand off to the board picker) through to the step builder.
    return function(options) { return buildHomeSteps(view, options); };
  }
  // The caseload page — a SUPPORTER's home base. Registering it here is also what
  // makes the navbar "Take a tour" trigger appear there: <GuidedTour /> is already
  // mounted on this page (app-navbar-authenticated-inner.hbs gates it on
  // `empty_header`, not on route) and self-hides on `hasTour`.
  if (route === 'caseload') {
    var clView = (layout === 'focused') ? 'focused' : 'gentle';
    return function(options) { return buildCaseloadSteps(clView, options); };
  }
  if (route === 'board-picker') {
    var bpView = (layout === 'focused') ? 'focused' : 'gentle';
    return function(options) { return buildBoardPickerSteps(bpView, options); };
  }
  if (editMode && _isBoardDetail(route)) {
    var bdView = (layout === 'focused') ? 'focused' : 'gentle';
    return function(options) { return buildBoardDetailSteps(bdView, options); };
  }
  // SPEAK (use) mode on a board-detail page — the walkthrough of using the board
  // to communicate (auto-started after "Pick this Board"). Distinct from the edit
  // tour above; both share the board-detail route, split on editMode.
  if (!editMode && _isBoardDetail(route)) {
    var bdsView = (layout === 'focused') ? 'focused' : 'gentle';
    return function(options) { return buildBoardDetailSpeakSteps(bdsView, options); };
  }
  return null;
}

// Stable per-page + per-view key for the completion flag persisted in
// user.preferences.progress.guided_tours_completed (e.g. 'home_gentle',
// 'home_focused'). One key per page/view so each tour is tracked independently;
// returns null where no tour exists. Mirrors tourBuilderFor's route/layout map.
function tourKeyFor(route, layout, editMode) {
  if (route === 'user.home') {
    return 'home_' + ((layout === 'focused') ? 'focused' : 'gentle');
  }
  if (route === 'caseload') {
    return 'caseload_' + ((layout === 'focused') ? 'focused' : 'gentle');
  }
  if (route === 'board-picker') {
    return 'board_picker_' + ((layout === 'focused') ? 'focused' : 'gentle');
  }
  if (editMode && _isBoardDetail(route)) {
    return 'board_detail_edit_' + ((layout === 'focused') ? 'focused' : 'gentle');
  }
  if (!editMode && _isBoardDetail(route)) {
    return 'board_detail_speak_' + ((layout === 'focused') ? 'focused' : 'gentle');
  }
  return null;
}

export { tourBuilderFor, tourKeyFor };
export default tourBuilderFor;
