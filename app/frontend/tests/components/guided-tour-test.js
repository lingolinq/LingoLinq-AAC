import {
  describe,
  itAsync,
  expect,
  beforeEach,
  afterEach,
  stub
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import modal from '../../utils/modal';
import article50Gate from '../../utils/article50_gate';

/*
 * Auto-opened Guided Tour vs the EU AI Act Art. 50(1) session-entry notice.
 *
 * The terms-agree confirm both opens the (uncloseable) ai-disclosure modal via
 * routes/index.js and raises appState.auto_open_home_tour. Observed live in
 * production on 2026-09-02: the Shepherd tour painted over the notice and took
 * focus, and cancelling the tour ran its board-picker handoff, whose route
 * change closed the notice with nothing acknowledged. The component must hold
 * the auto-open back while the notice is open, or due, and then run it exactly
 * once, so the board-picker handoff is never lost.
 *
 * The component calls article50Gate.* off the DEFAULT export on purpose: a
 * named import is a live binding these stubs could not reach.
 */
describe('guided-tour auto-open vs the Art. 50 notice', function() {
  var component = null;
  var extra = null;
  var runs = 0;
  var noticeOpen = false;
  var gatePending = false;

  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  async function untilRuns(max_ms) {
    var started = Date.now();
    while(runs === 0 && (Date.now() - started) < max_ms) {
      await sleep(5);
    }
  }

  beforeEach(function() {
    runs = 0;
    noticeOpen = false;
    gatePending = false;
    // init() consumes the auto-open signals itself, before this test can replace
    // _runAutoOpen. Clear both signals and create the instance as a speak host
    // (init skips the auto-open for speak/edit hosts), then un-host it.
    var appState = this.owner.lookup('service:app-state');
    appState.set('auto_open_home_tour', false);
    try { window.sessionStorage.removeItem('ll_auto_open_home_tour'); } catch(e) { /* unavailable */ }
    stub(modal, 'is_open', function(template) {
      return template === 'ai-disclosure' ? noticeOpen : false;
    });
    stub(article50Gate, 'art50Subject', function() { return null; });
    stub(article50Gate, 'sessionEntryGatePending', function() { return gatePending; });
    component = this.owner.factoryFor('component:guided-tour').create({
      speakHost: true,
      art50_tour_defer_poll_ms: 10,
      art50_tour_due_max_ms: 80
    });
    component._runAutoOpen = function() { runs++; };
    component.set('speakHost', false);
  });

  afterEach(function() {
    if(component && !component.isDestroyed) {
      component.destroy();
    }
    component = null;
    if(extra && !extra.isDestroyed) {
      extra.destroy();
    }
    extra = null;
    var appState = this.owner.lookup('service:app-state');
    appState.set('auto_open_home_tour', false);
    appState.set('auto_open_home_tour_rearmed_at', null);
    appState.set('current_route', null);
    try { window.sessionStorage.removeItem('ll_auto_open_home_tour'); } catch(e) { /* unavailable */ }
  });

  itAsync('holds the tour while the notice is open, then runs it exactly once after it closes', async function() {
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(60);
    expect(runs).toEqual(0);
    noticeOpen = false;
    await untilRuns(500);
    await sleep(40);
    expect(runs).toEqual(1);
  });

  itAsync('does not cap the wait while the notice stays open', async function() {
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(250);
    expect(runs).toEqual(0);
    noticeOpen = false;
    await untilRuns(500);
    expect(runs).toEqual(1);
  });

  itAsync('holds the tour while the notice is due but not yet open, then runs it once it opens and closes', async function() {
    // The due cap is not under test here; keep it far above the sleeps so a
    // stalled headless browser cannot expire it before the notice "opens".
    component.set('art50_tour_due_max_ms', 2000);
    gatePending = true;
    component._scheduleAutoOpen();
    await sleep(30);
    expect(runs).toEqual(0);
    noticeOpen = true;
    gatePending = false;
    await sleep(120);
    expect(runs).toEqual(0);
    noticeOpen = false;
    await untilRuns(500);
    expect(runs).toEqual(1);
  });

  itAsync('keeps holding while the gate stays pending, well past the old due cap, and runs once it clears', async function() {
    // beforeEach sets the ceiling to 80 ms; the old code released at that point.
    component.set('art50_tour_due_max_ms', 400);
    gatePending = true;
    component._scheduleAutoOpen();
    await sleep(150);
    expect(runs).toEqual(0);
    gatePending = false;
    await untilRuns(500);
    expect(runs).toEqual(1);
  });

  itAsync('a notice that opens late, after the old due cap, is still honoured', async function() {
    component.set('art50_tour_due_max_ms', 400);
    gatePending = true;
    component._scheduleAutoOpen();
    await sleep(150);
    noticeOpen = true;
    gatePending = false;
    await sleep(60);
    expect(runs).toEqual(0);
    noticeOpen = false;
    await untilRuns(500);
    expect(runs).toEqual(1);
  });

  itAsync('the default due ceiling sits above the 30 s freshness window that bounds a pending gate', async function() {
    // Cases above shrink the ceiling; this pins the shipped value. Below 30 s the
    // ceiling could fire while a session-entry notice can still open.
    extra = this.owner.factoryFor('component:guided-tour').create({ speakHost: true });
    expect(extra.get('art50_tour_due_max_ms') > 30000).toEqual(true);
  });

  itAsync('a gate stuck pending past the ceiling cancels the attempt instead of starting the tour, and never starts later', async function() {
    // Ceiling stays at the beforeEach 80 ms. In production it sits above the 30 s
    // freshness window, so this branch only fires when the predicate is stuck.
    gatePending = true;
    component._scheduleAutoOpen();
    await sleep(150);
    expect(runs).toEqual(0);
    expect(component._autoOpenDeferring).toEqual(false);
    gatePending = false;
    await sleep(60);
    expect(runs).toEqual(0);
  });

  itAsync('runs the tour on the first tick when no notice is open or due', async function() {
    component._scheduleAutoOpen();
    await untilRuns(500);
    expect(runs).toEqual(1);
  });

  itAsync('never runs the tour if the component is destroyed while waiting', async function() {
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(30);
    component.destroy();
    noticeOpen = false;
    await sleep(60);
    expect(runs).toEqual(0);
  });

  itAsync('re-arms the auto-open signal, stamped, when destroyed while waiting, so a later navbar instance can consume it', async function() {
    var appState = this.owner.lookup('service:app-state');
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(30);
    component.destroy();
    // willDestroy is a scheduled (non-eager) destructor; give the runloop a tick.
    await sleep(30);
    noticeOpen = false;
    await sleep(40);
    expect(runs).toEqual(0);
    expect(appState.get('auto_open_home_tour')).toEqual(true);
    expect(typeof appState.get('auto_open_home_tour_rearmed_at')).toEqual('number');
  });

  itAsync('does not re-arm anything when destroyed while not waiting', async function() {
    var appState = this.owner.lookup('service:app-state');
    component.destroy();
    await sleep(30);
    expect(appState.get('auto_open_home_tour')).toEqual(false);
    expect(appState.get('auto_open_home_tour_rearmed_at') || null).toEqual(null);
  });

  // The re-armed signal is consumed by the NEXT navbar instance's init. Observers
  // are synchronous in this app, so the live instance from beforeEach is parked as
  // a speak host first (its watcher returns before consuming) and the signal is
  // set before the second instance is created; create() applies the _runAutoOpen
  // override before init runs.
  async function mountWithRearmedSignal(owner, ageMs, rearmMaxMs) {
    var appState = owner.lookup('service:app-state');
    component.set('speakHost', true);
    appState.set('auto_open_home_tour_rearmed_at', Date.now() - ageMs);
    appState.set('auto_open_home_tour', true);
    expect(appState.get('auto_open_home_tour')).toEqual(true);
    extra = owner.factoryFor('component:guided-tour').create({
      art50_tour_defer_poll_ms: 10,
      art50_tour_due_max_ms: 80,
      art50_tour_rearm_max_ms: rearmMaxMs,
      _runAutoOpen: function() { runs++; }
    });
    await sleep(40);
    return appState;
  }

  itAsync('a fresh re-armed signal is consumed by the next instance, clearing the flag and the stamp', async function() {
    var appState = await mountWithRearmedSignal(this.owner, 0, 50);
    expect(runs).toEqual(1);
    expect(appState.get('auto_open_home_tour')).toEqual(false);
    expect(appState.get('auto_open_home_tour_rearmed_at') || null).toEqual(null);
  });

  itAsync('a re-armed signal older than the re-arm window is dropped instead of resurrecting the tour later', async function() {
    var appState = await mountWithRearmedSignal(this.owner, 200, 50);
    expect(runs).toEqual(0);
    expect(appState.get('auto_open_home_tour')).toEqual(false);
    expect(appState.get('auto_open_home_tour_rearmed_at') || null).toEqual(null);
  });

  itAsync('a re-armed signal does not survive an SPA sign-out (app-state#clear_user_state)', async function() {
    var appState = this.owner.lookup('service:app-state');
    component.set('speakHost', true);
    appState.set('auto_open_home_tour_rearmed_at', Date.now());
    appState.set('auto_open_home_tour', true);
    expect(appState.get('auto_open_home_tour')).toEqual(true);
    appState.clear_user_state();
    expect(appState.get('auto_open_home_tour')).toEqual(false);
    expect(appState.get('auto_open_home_tour_rearmed_at') || null).toEqual(null);
  });

  itAsync('passes the gate SUBJECT (not the appState) to sessionEntryGatePending', async function() {
    var appState = this.owner.lookup('service:app-state');
    var sentinel = { id: 'sentinel-subject' };
    var received = [];
    stub(article50Gate, 'art50Subject', function(state) { received.push({ state: state }); return sentinel; });
    stub(article50Gate, 'sessionEntryGatePending', function(subject) { received.push({ subject: subject }); return false; });
    component._scheduleAutoOpen();
    await untilRuns(500);
    expect(runs).toEqual(1);
    expect(received.length).toEqual(2);
    expect(received[0].state === appState).toEqual(true);
    expect(received[1].subject === sentinel).toEqual(true);
  });

  itAsync('when the wait ends, the real _runAutoOpen still hands a communicator with no page tour off to board-picker', async function() {
    // Back to the prototype implementation (beforeEach replaced it with a counter).
    delete component._runAutoOpen;
    // 'index' is a gate host with no tour of its own, so the no-tour handoff runs.
    this.owner.lookup('service:app-state').set('current_route', 'index');
    var transitions = [];
    stub(component.get('router'), 'transitionTo', function(name) { transitions.push(name); });
    expect(component.get('tourBuilder') || null).toEqual(null);
    expect(component.get('appState.currentUser.supporter_role') || false).toEqual(false);
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(40);
    expect(transitions).toEqual([]);
    noticeOpen = false;
    await sleep(80);
    expect(transitions).toEqual(['board-picker']);
    expect(component._autoOpenDeferring).toEqual(false);
  });

  itAsync('cancels the pending poll timer when destroyed while waiting', async function() {
    // Wrap the poll BEFORE scheduling: runLater is armed with
    // this._autoOpenAfterArt50Notice, so the timer calls this wrapper too. The
    // global backburner timer count is not usable here (other timers exist).
    var ticks = 0;
    var orig = component._autoOpenAfterArt50Notice;
    component._autoOpenAfterArt50Notice = function() { ticks++; return orig.apply(this, arguments); };
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(35);
    expect(ticks > 1).toEqual(true);
    component.destroy();
    var atDestroy = ticks;
    await sleep(80);
    expect(ticks).toEqual(atDestroy);
  });

  // Route-aware resume. The real _runAutoOpen is used; the two branch starters are
  // replaced by counters so no tour or transition is attempted.
  function useRealResume(owner, route) {
    delete component._runAutoOpen;
    var starts = { home: 0, caseload: 0 };
    component._startHomeAutoOpen = function() { starts.home++; };
    component._startCaseloadAutoOpen = function() { starts.caseload++; };
    // The shared service may hold null here, which would satisfy a cancel branch
    // for the wrong reason; set the route explicitly.
    owner.lookup('service:app-state').set('current_route', route);
    return starts;
  }

  itAsync('cancels a deferred resume when the user has left for a route outside the allowlist', async function() {
    var starts = useRealResume(this.owner, 'user.extras');
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(30);
    noticeOpen = false;
    await sleep(60);
    expect(starts.home).toEqual(0);
    expect(starts.caseload).toEqual(0);
    expect(component._autoOpenDeferring).toEqual(false);
  });

  itAsync('resumes on bento, the other session-entry gate host, with the home branch', async function() {
    var starts = useRealResume(this.owner, 'bento');
    noticeOpen = true;
    component._scheduleAutoOpen();
    await sleep(30);
    noticeOpen = false;
    await sleep(60);
    expect(starts.home).toEqual(1);
    expect(starts.caseload).toEqual(0);
  });

  itAsync('the never-held path is route-aware too: a foreign route at afterRender cancels, a gate host starts', async function() {
    var starts = useRealResume(this.owner, 'user.extras');
    component._scheduleAutoOpen();
    await sleep(30);
    expect(starts.home).toEqual(0);
    expect(component._autoOpenDeferring).toEqual(false);
    this.owner.lookup('service:app-state').set('current_route', 'user.home');
    component._scheduleAutoOpen();
    await sleep(30);
    expect(starts.home).toEqual(1);
  });

  itAsync('the resume allowlist: gate hosts for everyone, caseload only for a supporter', async function() {
    expect(component._autoOpenRouteAllowed('user.home', false)).toEqual(true);
    expect(component._autoOpenRouteAllowed('user.home', true)).toEqual(true);
    expect(component._autoOpenRouteAllowed('index', false)).toEqual(true);
    expect(component._autoOpenRouteAllowed('bento', false)).toEqual(true);
    expect(component._autoOpenRouteAllowed('caseload', true)).toEqual(true);
    expect(component._autoOpenRouteAllowed('caseload', false)).toEqual(false);
    expect(component._autoOpenRouteAllowed('user.extras', false)).toEqual(false);
    expect(component._autoOpenRouteAllowed('user.extras', true)).toEqual(false);
    expect(component._autoOpenRouteAllowed('board-picker', false)).toEqual(false);
    expect(component._autoOpenRouteAllowed(null, false)).toEqual(false);
  });

  itAsync('consuming the appState signal also clears its sessionStorage twin, so a later remount cannot re-fire', async function() {
    var appState = this.owner.lookup('service:app-state');
    try { window.sessionStorage.setItem('ll_auto_open_home_tour', '1'); } catch(e) { return; }
    appState.set('auto_open_home_tour', true);
    await untilRuns(500);
    expect(runs).toEqual(1);
    expect(window.sessionStorage.getItem('ll_auto_open_home_tour') || null).toEqual(null);
  });

  itAsync('SPA sign-out clears the sessionStorage twin as well', async function() {
    var appState = this.owner.lookup('service:app-state');
    component.set('speakHost', true);
    try { window.sessionStorage.setItem('ll_auto_open_home_tour', '1'); } catch(e) { return; }
    appState.clear_user_state();
    expect(window.sessionStorage.getItem('ll_auto_open_home_tour') || null).toEqual(null);
  });

  itAsync('a second request while one is already waiting does not start a second chain', async function() {
    noticeOpen = true;
    component._scheduleAutoOpen();
    component._scheduleAutoOpen();
    await sleep(30);
    noticeOpen = false;
    await untilRuns(500);
    await sleep(60);
    expect(runs).toEqual(1);
  });

  itAsync('a speak host never auto-opens, notice or not', async function() {
    component.set('speakHost', true);
    component._scheduleAutoOpen();
    await sleep(40);
    expect(runs).toEqual(0);
  });

  itAsync('an edit host never auto-opens, notice or not', async function() {
    component.set('editHost', true);
    component._scheduleAutoOpen();
    await sleep(40);
    expect(runs).toEqual(0);
  });
});
