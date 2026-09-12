import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  stub,
  restoreStubs
} from 'frontend/tests/helpers/jasmine';
import scanner from '../../utils/scanner';
import editManager from '../../utils/edit_manager';
import modal from '../../utils/modal';
import EmberObject from '@ember/object';

/*
 * COLD-BOARD SCANNING LOCKOUT — red test, written BEFORE any fix (rule #0.13).
 *
 * MECHANISM, traced in code:
 *   routes/user/board-detail.js:565-571 fires check_scanning() on a FIXED
 *   runLater(..., 500). That reaches scanner.start(), which snapshots the DOM once.
 *   scan_content (utils/scanner.js:572-590) takes its SHAPE from
 *   editManager.controller.model.grid -- which is available at model-resolve -- but
 *   resolves each cell with find_elem(".button[data-id=...]"). On a cold board the
 *   grid is built later, off _maybe_prime_caches().then() (routes:517/:525), so at
 *   500ms those lookups return nothing.
 *
 *   start() then DISCARDS them: `if($button.length)` (scanner.js:398) skips the cell
 *   and `if(row.children.length > 0)` (:410) drops the whole row. The scan list keeps
 *   only chrome (sentence bar / header) and NO vocabulary buttons.
 *
 *   Nothing re-arms it. Every scanner.start() caller is a modal open/close
 *   (utils/modal.js:130/192/441), edit_manager.js:2042, or an app-state mode change --
 *   none keyed on ordered_buttons. And a re-arm would be REFUSED anyway:
 *   actively_scanning() (scanner.js:634) is
 *   `interval && current_element && document.body.contains(current_element.dom[0])`,
 *   which is TRUE once the scanner is cycling the sentence bar, so start() early-returns
 *   at :177-179.
 *
 * WEAKEST PASSING STATE THIS TEST MUST BEAT (rule #0.14.2):
 *   The existing `start` describe block stubs scan_elements, so scanner.interval and
 *   scanner.current_element are never set and actively_scanning() returns FALSE. Under
 *   that harness a second start() rebuilds happily and a naive version of this test goes
 *   GREEN while the production lockout is untouched. So test 2 below explicitly
 *   establishes the real locked state (interval + a body-attached current_element)
 *   before attempting the re-arm. Without that setup this test is worthless.
 */
describe('scanner — cold board re-arm', function() {
  var rows = null;
  var attached = null;

  var GRID = { rows: 1, columns: 2, order: [['b1', 'b2']] };

  // A find_elem stub whose board-button lookups are switchable, so one test can move
  // from "grid not built yet" to "grid has landed" without changing anything else.
  var findElemStub = function(buttonsPresent) {
    return function(str) {
      if(str === '#speak' || str === 'header #speak') {
        return { length: 1, hasClass: function() { return false; },
                 find: function() { return { each: function() {} }; } };
      }
      if(str && str.indexOf(".button[data-id=") === 0) {
        return buttonsPresent
          ? { length: 1, label: 'btn', sound: null, each: function() {},
              add: function() { return this; } }
          : { length: 0, each: function() {}, add: function() { return this; } };
      }
      // `each` is required: scanner#reload_children calls find_elem(...).each(...) on
      // the generic result, and a stub without it dies with a TypeError that looks
      // nothing like the defect under test.
      return { length: 0, elements: [], each: function() {},
               add: function(e) { this.elements.push(e); return this; },
               hasClass: function() { return false; } };
    };
  };

  var boardButtonCount = function(rowList) {
    var n = 0;
    (rowList || []).forEach(function(row) {
      if(row && row.children) { n += row.children.length; }
      else if(row && row.dom) { n += 1; }
    });
    return n;
  };

  beforeEach(function() {
    scanner.stop();
    scanner.scanning = false;
    rows = null;
    stub(modal, 'is_open', function() { return false; });
    stub(scanner, 'get', function(key) {
      if(key === 'appState.currentUser.preferences.device.scanning') { return true; }
      return null;
    });
    editManager.controller = EmberObject.create({ model: EmberObject.create({ grid: GRID }) });
    /* scan_content calls editManager.find_button() per cell, which walks into
       board.contextualized_buttons on a real model. Stub the seam rather than deepen the
       model stub: the defect under test is about DOM lookups returning nothing, and a
       half-built model would fail for an unrelated reason that looks like the bug. */
    stub(editManager, 'find_button', function(id) { return { id: id, label: 'btn' }; });
  });

  afterEach(function() {
    if(attached && attached.parentNode) { attached.parentNode.removeChild(attached); }
    attached = null;
    editManager.controller = null;
    scanner.interval = null;
    scanner.current_element = null;
    restoreStubs();
  });

  it('drops every board row when the grid has not been built yet', function() {
    stub(scanner, 'scan_elements', function(r) { rows = r; scanner.scanning = true; });
    stub(scanner, 'find_elem', findElemStub(false));

    scanner.start({ scan_mode: 'row' });

    // Documents the broken starting state. This half PASSES today -- it is the premise,
    // not the regression guard. The guard is the test below.
    expect(boardButtonCount(rows)).toEqual(0);
  });

  it('re-arms once the grid lands, instead of staying locked on a boardless list', function() {
    // Establish the REAL locked state, not the stubbed one: a live interval plus a
    // current_element that is genuinely in document.body, which is what makes
    // actively_scanning() true and start() early-return at scanner.js:177-179.
    attached = document.createElement('div');
    document.body.appendChild(attached);
    scanner.interval = 1;
    scanner.current_element = { dom: [attached] };
    expect(scanner.actively_scanning()).toEqual(true);

    stub(scanner, 'scan_elements', function(r) { rows = r; scanner.scanning = true; });
    stub(scanner, 'find_elem', findElemStub(true));   // the grid HAS landed now

    scanner.start({ scan_mode: 'row' });

    // RED TODAY: start() refuses to rebuild while actively_scanning() is true, so
    // scan_elements is never called and `rows` stays null -- the user is left scanning
    // a list with no vocabulary buttons on it, with no way back except a modal or a
    // navigation. A fix must make the scanner pick up the buttons that now exist.
    expect(rows).not.toEqual(null);
    expect(boardButtonCount(rows)).toBeGreaterThan(0);
  });
});
