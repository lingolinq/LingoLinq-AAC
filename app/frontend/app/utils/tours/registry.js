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

function tourBuilderFor(route, layout) {
  if (route === 'user.home') {
    var view = (layout === 'focused') ? 'focused' : 'gentle';
    return function() { return buildHomeSteps(view); };
  }
  return null;
}

// Stable per-page + per-view key for the completion flag persisted in
// user.preferences.progress.guided_tours_completed (e.g. 'home_gentle',
// 'home_focused'). One key per page/view so each tour is tracked independently;
// returns null where no tour exists. Mirrors tourBuilderFor's route/layout map.
function tourKeyFor(route, layout) {
  if (route === 'user.home') {
    return 'home_' + ((layout === 'focused') ? 'focused' : 'gentle');
  }
  return null;
}

export { tourBuilderFor, tourKeyFor };
export default tourBuilderFor;
