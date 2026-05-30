import { later as runLater, cancel as runCancel } from '@ember/runloop';

export function initialize(appInstance) {
  // Production (Rails-served entry point) doesn't define
  // LingoLinqHideBootOverlay — there, app-state.js:586 is the
  // authoritative remover of #loading_box, fired AFTER currentUser is
  // set up. Returning early here preserves that contract; the skeleton
  // stays visible until the destination route's data is actually
  // resolved, masking the brief index → user.home redirect window.
  if (typeof window === 'undefined' || typeof window.LingoLinqHideBootOverlay !== 'function') {
    return;
  }

  var router = appInstance.lookup('service:router');
  var hideFn = window.LingoLinqHideBootOverlay;

  if (!router) {
    hideFn();
    return;
  }

  var done = false;
  var pending = null;
  var sawRouteDidChange = false;

  function finish() {
    if (done) { return; }
    done = true;
    if (pending) { runCancel(pending); pending = null; }
    var raf = window.requestAnimationFrame;
    if (typeof raf === 'function') {
      raf(function () { raf(function () { hideFn(); }); });
    } else {
      hideFn();
    }
  }

  // Only schedule a hide AFTER routeDidChange has fired at least once. Calling
  // schedule() at boot would queue a 150ms hide that fires before the index
  // route's model resolves, exposing the partially-rendered page (white flash
  // + secondary loading state) before the real destination renders.
  function schedule() {
    if (done) { return; }
    if (!sawRouteDidChange) { return; }
    if (pending) { runCancel(pending); }
    pending = runLater(finish, 150);
  }

  router.on('routeWillChange', function () {
    if (done) { return; }
    if (pending) { runCancel(pending); pending = null; }
  });
  router.on('routeDidChange', function () {
    sawRouteDidChange = true;
    schedule();
  });
}

export default {
  name: 'boot-overlay-hide',
  after: 'session',
  initialize: initialize
};
