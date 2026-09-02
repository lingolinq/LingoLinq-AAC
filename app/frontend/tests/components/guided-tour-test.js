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

  itAsync('runs the tour anyway when a due notice never opens within the due cap, so the handoff is not lost', async function() {
    gatePending = true;
    component._scheduleAutoOpen();
    await sleep(30);
    expect(runs).toEqual(0);
    await untilRuns(500);
    expect(runs).toEqual(1);
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

  itAsync('speak and edit hosts never auto-open, notice or not', async function() {
    component.set('speakHost', true);
    component._scheduleAutoOpen();
    await sleep(40);
    expect(runs).toEqual(0);
  });
});
