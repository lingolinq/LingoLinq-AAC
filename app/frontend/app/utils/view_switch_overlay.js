import { later as runLater, cancel as cancelLater } from '@ember/runloop';
import i18n from './i18n';

/* Shared "Preparing your Board" overlay that masks the brief route
   transition between the modern (board-detail) and classic (board-alt)
   board views. Originally lived inline in `controllers/board/index.js`
   `go_to_modern` (Classic → Modern). Extracted here so the inverse
   direction (`go_to_classic` in `controllers/user/board-detail.js`,
   Modern → Classic) can reuse the exact same overlay with one
   per-direction tweak: when `accentLight` is true, the parenthesized
   clarifier in the title is painted at a lighter font-weight via the
   `--accent-light` modifier on the progress card.

   DOM:
     <div id="ll-pre-reload-overlay" class="ll-view-switch-overlay [--dark]">
       <div class="ll-view-switch-mockup [md-board-detail--dark]">    ← skeleton
         header  (nav, sentence pill, opts, avatar)                     mockup
         body    (3-card sidebar + 8×5 button grid)
       <div class="ll-premium-progress">                              ← progress
         <div class="ll-premium-progress__card [--accent-light]">       card
           h2.ll-premium-progress__title
             "Preparing your Board "
             <span.ll-premium-progress__title-accent> "(Page-Set & Vocabularies)"
           p.ll-premium-progress__sub
             "Loading the modern board layout"
           div.ll-premium-progress__bar */

export default function paint_view_switch_overlay(opts) {
  opts = opts || {};
  var routerSvc = opts.routerSvc;
  var transition = opts.transition;
  var isDark = !!opts.isDark;
  var accentLight = !!opts.accentLight;

  // Fallback: no DOM, no overlay — still run the transition.
  if(typeof document === 'undefined' || !document.body) {
    if(typeof transition === 'function') { try { transition(); } catch(e) { /* ignore */ } }
    return;
  }

  // Overlay already up (double-click, double-action). Skip the paint
  // but still trigger the transition the caller asked for.
  if(document.getElementById('ll-pre-reload-overlay')) {
    if(typeof transition === 'function') { try { transition(); } catch(e) { /* ignore */ } }
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'll-pre-reload-overlay';
  overlay.className = 'll-view-switch-overlay' + (isDark ? ' ll-view-switch-overlay--dark' : '');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-busy', 'true');
  overlay.style.zIndex = '2147483646';

  // 1) Skeleton mockup — modern board-detail speak-mode placeholder.
  var mockup = document.createElement('div');
  mockup.className = 'll-view-switch-mockup' + (isDark ? ' md-board-detail--dark' : '');
  mockup.setAttribute('aria-hidden', 'true');

  // Header: nav icon (board picker), sentence-bar pill, options icon, avatar.
  var mockHeader = document.createElement('div');
  mockHeader.className = 'll-view-switch-mockup__header';
  var mockNav = document.createElement('div');
  mockNav.className = 'll-view-switch-mockup__nav';
  var mockSentence = document.createElement('div');
  mockSentence.className = 'll-view-switch-mockup__sentence';
  var mockOpts = document.createElement('div');
  mockOpts.className = 'll-view-switch-mockup__opts';
  var mockAvatar = document.createElement('div');
  mockAvatar.className = 'll-view-switch-mockup__avatar';
  mockHeader.appendChild(mockNav);
  mockHeader.appendChild(mockSentence);
  mockHeader.appendChild(mockOpts);
  mockHeader.appendChild(mockAvatar);
  mockup.appendChild(mockHeader);

  // Body: left sidebar + button grid.
  var mockBody = document.createElement('div');
  mockBody.className = 'll-view-switch-mockup__body';
  var mockSidebar = document.createElement('aside');
  mockSidebar.className = 'll-view-switch-mockup__sidebar';
  for(var s = 0; s < 3; s++) {
    var card = document.createElement('div');
    card.className = 'll-view-switch-mockup__sidebar-card';
    mockSidebar.appendChild(card);
  }
  mockBody.appendChild(mockSidebar);
  var mockGrid = document.createElement('div');
  mockGrid.className = 'll-view-switch-mockup__grid';
  for(var i = 0; i < 40; i++) {
    var tile = document.createElement('div');
    tile.className = 'll-view-switch-mockup__tile';
    mockGrid.appendChild(tile);
  }
  mockBody.appendChild(mockGrid);
  mockup.appendChild(mockBody);
  overlay.appendChild(mockup);

  // 2) Premium progress card (same chrome as login flow). The
  // `--accent-light` modifier reduces the parenthesized clarifier's
  // font-weight; opt-in per caller (Modern→Classic uses it).
  var veil = document.createElement('div');
  veil.className = 'll-premium-progress';
  var progressCard = document.createElement('div');
  progressCard.className = 'll-premium-progress__card' + (accentLight ? ' ll-premium-progress__card--accent-light' : '');
  var title = document.createElement('h2');
  title.className = 'll-premium-progress__title';
  title.appendChild(document.createTextNode(
    i18n.t('preparing_your_board', "Preparing your Board ")
  ));
  var titleAccent = document.createElement('span');
  titleAccent.className = 'll-premium-progress__title-accent';
  titleAccent.textContent = i18n.t('page_set_and_vocabularies', "(Page-Set & Vocabularies)");
  title.appendChild(titleAccent);
  var sub = document.createElement('p');
  sub.className = 'll-premium-progress__sub';
  sub.textContent = i18n.t('loading_board_layout', "Loading the modern board layout");
  var bar = document.createElement('div');
  bar.className = 'll-premium-progress__bar';
  bar.setAttribute('aria-hidden', 'true');
  progressCard.appendChild(title);
  progressCard.appendChild(sub);
  progressCard.appendChild(bar);
  veil.appendChild(progressCard);
  overlay.appendChild(veil);

  document.body.appendChild(overlay);

  var removeOverlay = function() {
    try {
      var ov = document.getElementById('ll-pre-reload-overlay');
      if(ov && ov.parentNode) { ov.parentNode.removeChild(ov); }
    } catch(e) { /* DOM may be unavailable; ignore */ }
  };
  var pending = null;
  var safetyTimer = null;
  var listenerCleanedUp = false;
  var onRouteDidChange;
  var cleanup = function() {
    if(listenerCleanedUp) { return; }
    listenerCleanedUp = true;
    try { if(routerSvc) { routerSvc.off('routeDidChange', onRouteDidChange); } } catch(e) {}
    if(pending) { try { cancelLater(pending); } catch(e) {} pending = null; }
    if(safetyTimer) { try { cancelLater(safetyTimer); } catch(e) {} safetyTimer = null; }
  };
  var dismiss = function() {
    cleanup();
    var raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
    if(typeof raf === 'function') {
      raf(function() { raf(function() { removeOverlay(); }); });
    } else {
      removeOverlay();
    }
  };
  onRouteDidChange = function() {
    if(listenerCleanedUp) { return; }
    if(pending) { try { cancelLater(pending); } catch(e) {} }
    pending = runLater(dismiss, 150);
  };
  if(routerSvc) {
    try { routerSvc.on('routeDidChange', onRouteDidChange); } catch(e) {}
  }
  // Safety net: never trap the user behind the overlay if
  // routeDidChange somehow never fires.
  safetyTimer = runLater(dismiss, 8000);

  // Paint gate: defer the transition by one animation frame so the
  // overlay we just appended is committed to the screen BEFORE the
  // route flips. Without this, transitionTo fires synchronously in
  // the same microtask, and the browser hasn't had a chance to paint —
  // so the user briefly sees the now-unstyled source view (the
  // .board-alt-view class drops the instant the route changes). One
  // rAF closes that race window.
  var startTransition = function() {
    if(typeof transition !== 'function') { return; }
    var promise;
    try { promise = transition(); } catch(e) { dismiss(); return; }
    if(promise && typeof promise.then === 'function') {
      promise.then(null, function(err) {
        // TransitionAborted is expected if a nested redirect occurs;
        // routeDidChange still fires for the final route and dismisses.
        var errName = err && (err.name || (err.constructor && err.constructor.name));
        var errMsg = err && err.message;
        var isAborted = errName === 'TransitionAborted' ||
          (errMsg && /TransitionAborted|transition.*aborted/i.test(errMsg));
        if(isAborted) { return; }
        // Real failure: don't strand the user behind the overlay.
        dismiss();
      });
    }
  };
  if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(startTransition);
  } else {
    startTransition();
  }
}
