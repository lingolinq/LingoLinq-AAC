import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { buildHomeSteps } from 'frontend/utils/tours/home';
import { buildClassicHomeSteps } from 'frontend/utils/tours/classic-home';

/* A COMMUNICATOR'S HOME TOUR NEVER MENTIONS THE SUPPORTER TOOLBOX (requested 2026-10-12: "on the tour, make
   sure a communicator doesn't hear about Upgrade, Customize your dashboard, Logs, Reports and
   Subscription"). Every step the Modern and Basic home tours can build is put together with all their
   targets on the page, and the whole text is searched. A supporter (SLP) still hears about reports. */
var FORBIDDEN = /upgrade|customi[sz]e|display style|\blogs?\b|logging|reports?\b|subscription/i;

module('Unit | Utility | tours | a communicator hears no supporter tools', function(hooks) {
  setupTest(hooks);
  var added = [];
  function put(cls) {
    var el = document.createElement('div'); el.className = cls; el.style.height = '20px';
    document.body.appendChild(el); added.push(el); return el;
  }
  hooks.beforeEach(function() {
    put('md-grid--dashboard'); put('md-pillnav'); put('ch-rail'); put('ch-tabs');
    var grid = put('ch-grid');
    var tab = document.createElement('button'); tab.setAttribute('data-tour-tab', 'main'); added[3].appendChild(tab);
    grid.textContent = 'x';
    // The caseload targets of the supporter (SLP) tour (2026-10-12 redesign), which is where it names reports.
    put('md-card--caseload');
    var comm = document.createElement('button'); comm.setAttribute('data-tour-tab', 'supervisees'); comm.textContent = 'c'; added[3].appendChild(comm);
  });
  hooks.afterEach(function() { added.forEach(function(e) { e.remove(); }); added = []; });

  function allText(steps) {
    return steps.map(function(s) {
      var d = document.createElement('div');
      d.innerHTML = String(s.title || '') + ' ' + String(s.text || '') + ' ' + (s.buttons || []).map(function(b) { return b.text; }).join(' ');
      return d.textContent;
    }).join(' ');
  }

  test('Modern home tour, first time and replay menu', function(assert) {
    var first = allText(buildHomeSteps('gentle', {}));
    var handoff = allText(buildHomeSteps('gentle', { handoff: true }));
    var menu = allText(buildHomeSteps('gentle', { menu: true, onPickBoard: function() {} }));
    assert.strictEqual((first.match(FORBIDDEN) || [null])[0], null, 'first-time tour');
    assert.strictEqual((handoff.match(FORBIDDEN) || [null])[0], null, 'first-time tour ending at the board picker');
    assert.strictEqual((menu.match(FORBIDDEN) || [null])[0], null, 'replay menu');
  });

  test('Basic home tour', function(assert) {
    var basic = allText(buildClassicHomeSteps({}));
    assert.strictEqual((basic.match(FORBIDDEN) || [null])[0], null);
  });

  test('a supporter still hears about reports', function(assert) {
    assert.ok(/reports?/i.test(allText(buildHomeSteps('gentle', { supporter: true }))), 'Modern');
    assert.ok(/report|how communication is going/i.test(allText(buildClassicHomeSteps({ supporter: true }))), 'Basic');
  });
});
