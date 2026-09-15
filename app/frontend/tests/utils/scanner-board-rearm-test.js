import { module, test } from 'qunit';
import { setupTest } from '../helpers';

import EmberObject from '@ember/object';
import scanner from 'frontend/utils/scanner';
import editManager from 'frontend/utils/edit_manager';
import modal from 'frontend/utils/modal';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/*
 * A switch/eye-gaze user must not be left scanning a board with no words on it.
 *
 * THE DEFECT. `scan_content` (utils/scanner.js:571-596) takes its SHAPE from
 * `editManager.controller.model.grid` but resolves each cell with
 * `find_elem(".button[data-id=…]")`. On a cold board those lookups return nothing and
 * `start()` DISCARDS them — `if($button.length)` (:399) skips the cell, then
 * `if(row.children.length > 0)` (:408) drops the whole row. What survives is chrome only:
 * Home / Back / Backspace / Clear and the prediction tiles.
 *
 * It does not self-heal. `actively_scanning()` (:634) is
 * `interval && current_element && document.body.contains(...)`, and board-detail's `#speak`
 * is static markup that persists across board navigation — so once the scanner is cycling
 * the sentence row that stays TRUE and every later `start()` returns at :177.
 *
 * THE FIX UNDER TEST. When the grid finishes building, the route calls
 * `_rearm_scanning_after_build()`, which stops the scanner (clearing `current_element`, so
 * the re-arm actually TAKES) and re-arms on a ZERO-DELAY runLater — the pattern
 * `utils/modal.js:126-130` already uses. Ordering is then owned by the runloop rather than
 * by a guessed delay.
 *
 * WHY TEST 1 IS A GUARD AND MUST STAY GREEN. `services/app-state.js:2070-2075` guards its
 * own `stop()` with `if(scanner.interval || … || scanner.scanning)` and the comment on it
 * reads "this was breaking the 'find button' interface when you get to the second board."
 * `stop()` calls `modal.close_highlight()` and removes every `.highlight` node, and
 * `edit_manager.js:1974-1990` repaints exactly that overlay for find-a-button and the
 * `board-intro` tour. An UNGATED version of this fix erases it. Test 1 fails against the
 * ungated version and passes against the gated one — it is the whole reason for the gate.
 *
 * WEAKEST PASSING STATES (rule #0.14.2):
 *  - Test 2 asserting only "scanner.stop was called" is passed by a bare `stop()` with no
 *    re-arm — i.e. scanning permanently dead, the worst outcome for this user. So test 2
 *    asserts END STATE: a board button present in `scanner.elements` AND `scanning === true`.
 *  - Test 2 asserting only `elements.length` changed is passed by any arm over any list.
 *    It therefore looks for the board button's own data-id.
 */
module('Unit | Route | user/board-detail scanning re-arm after grid build', function(hooks) {
  setupTest(hooks);

  var GRID = { rows: 1, columns: 2, order: [['b1', 'b2']] };

  /* Every stub that can become `scanner.current_element` MUST carry a real node at index 0
     and that node must be IN document.body. `actively_scanning()` (utils/scanner.js:634) is
     `interval && current_element && document.body.contains(current_element.dom[0])` — with a
     node-less stub that is `contains(undefined)` -> false for the whole test, which silently
     makes `scanner.stop()` look unnecessary: the no-stop variant passes, while in production
     `actively_scanning()` is TRUE and a re-arm without the stop returns at `:177` as a
     complete no-op. `tests/utils/scanner-idless-dispatch-test.js:41-44` documents this exact
     trap for a different seam. */
  var realNode = function(state, cls) {
    var el = document.createElement('div');
    el.className = cls;
    document.body.appendChild(el);
    state.nodes.push(el);
    return el;
  };

  // Switchable: board buttons are unresolvable until the grid "renders".
  var findElemStub = function(state) {
    return function(str) {
      if(str === '#speak' || str === 'header #speak') {
        return { 0: realNode(state, 'speak-row'), length: 1,
                 hasClass: function() { return false; }, each: function() {},
                 add: function() { return this; },
                 find: function() { return { length: 0, each: function() {} }; } };
      }
      if(str && str.indexOf('.button[data-id=') === 0) {
        var id = str.replace(/^.*data-id='/, '').replace(/'.*$/, '');
        return state.buttons
          ? { 0: realNode(state, 'btn-' + id), length: 1, label: 'btn-' + id, data_id: id,
              sound: null, each: function() {},
              add: function() { return this; }, hasClass: function() { return false; } }
          : { length: 0, each: function() {}, add: function() { return this; },
              hasClass: function() { return false; } };
      }
      return { length: 0, elements: [], each: function() {},
               add: function(e) { this.elements.push(e); return this; },
               hasClass: function() { return false; } };
    };
  };

  var boardButtonIds = function() {
    var found = [];
    var walk = function(list) {
      (list || []).forEach(function(item) {
        if(!item) { return; }
        if(item.dom && item.dom.data_id) { found.push(item.dom.data_id); }
        if(item.data_id) { found.push(item.data_id); }
        if(item.children) { walk(item.children); }
      });
    };
    walk(scanner.elements);
    return found;
  };

  hooks.beforeEach(function() {
    scanner.stop();
    scanner.scanning = false;
    scanner.interval = null;
    scanner.current_element = null;
    scanner.elements = [];
    this.state = { buttons: false, nodes: [] };
    stub(modal, 'is_open', function() { return false; });
    stub(scanner, 'get', function(key) {
      if(key === 'appState.currentUser.preferences.device.scanning') { return true; }
      return null;
    });
    stub(editManager, 'find_button', function(id) { return { id: id, label: 'btn-' + id }; });
    editManager.controller = EmberObject.create({ model: EmberObject.create({ grid: GRID }) });
    this.route = this.owner.factoryFor('route:user/board-detail').create();
  });

  hooks.afterEach(function() {
    restoreStubs();
    editManager.controller = null;
    scanner.stop();
    // Nothing this fix adds may leak between tests — the last scanner regression here
    // passed only because a flag survived afterEach.
    scanner.scanning = false;
    scanner.interval = null;
    scanner.current_element = null;
    scanner.elements = [];
    scanner.options = null;
    if(this.route) { this.route.destroy(); this.route = null; }
    document.querySelectorAll('.highlight').forEach(function(el) { el.remove(); });
    // Remove the real nodes the find_elem stub appended, so document.body does not carry
    // them forward -- actively_scanning() reads document.body.contains, so a leaked node
    // would make the following case start from a false premise.
    (this.state && this.state.nodes || []).forEach(function(el) {
      if(el && el.parentNode) { el.parentNode.removeChild(el); }
    });
  });

  test('a guided highlight is left alone when the scanner is not running', function(assert) {
    // find-a-button / board-intro repaint this overlay around grid-build time.
    var node = document.createElement('div');
    node.className = 'highlight';
    document.body.appendChild(node);

    scanner.scanning = false;
    scanner.interval = null;

    this.route._rearm_scanning_after_build();

    assert.ok(document.querySelector('.highlight'),
      'the guided highlight survives — the scanner was not running, so nothing should be stopped');
  });

  test('an in-progress find-a-button search is not torn down, even while scanning', function(assert) {
    /* The app deliberately runs that overlay alongside scanning — modal.js:332 sends a
       `button_search` highlight to the SECONDARY outlet precisely because `scanner.scanning`
       is true, and scanner.start() refuses to rebuild in that state (:233) rather than
       stopping. `stop()` here would call close_highlight(), which nulls BOTH highlight
       settings (modal.js:377-378), and edit_manager's repaint is once-per-board
       (`_bd_highlight_resume_board`), so a second arrival at the same board kills the search. */
    var node = document.createElement('div');
    node.className = 'highlight';
    document.body.appendChild(node);
    modal.highlight_settings = { highlight_type: 'button_search' };

    scanner.scanning = true;
    scanner.interval = 1;

    this.route._rearm_scanning_after_build();

    assert.ok(document.querySelector('.highlight'),
      'the search overlay survives a re-arm that happened while it was open');
    assert.ok(scanner.scanning, 'and the scanner was not stopped out from under it');
    modal.highlight_settings = null;
  });

  test('a scanner stuck on a boardless list picks up the buttons once the grid renders', async function(assert) {
    stub(scanner, 'find_elem', findElemStub(this.state));

    // Arm for real against a grid whose buttons have not rendered.
    scanner.start({ scan_mode: 'row' });

    assert.strictEqual(boardButtonIds().length, 0,
      'precondition: the scanner armed with NO board buttons — this is the lockout');
    assert.ok(scanner.scanning, 'precondition: it is nonetheless scanning (chrome only)');

    /* Establish the REAL latch. `scan_elements` only calls `next_element` when
       `options.auto_start` is set, so a plain row-mode arm leaves `current_element` null and
       `actively_scanning()` false — under which `scanner.stop()` is unnecessary and its
       removal cannot be detected. In production the scanner IS cycling: `current_element`
       points at the sentence row, a real node that survives board navigation, so
       `actively_scanning()` is TRUE and the stop is the only thing that lets the re-arm
       take. Reproduce that, or this test cannot falsify half the fix. */
    scanner.interval = scanner.interval || 1;
    scanner.current_element = { dom: [realNode(this.state, 'speak-row-current')] };
    assert.ok(scanner.actively_scanning(),
      'precondition: actively_scanning() is TRUE — this is what blocks a naive re-arm');

    // The grid renders.
    this.state.buttons = true;

    this.route._rearm_scanning_after_build();
    /* A real tick, NOT settled(). Once re-armed the scanner owns a repeating interval, so
       the runloop never goes idle and settled() waits out its timeout instead of returning
       after the zero-delay re-arm — which left the assertions reading a torn-down state. */
    await new Promise(function(resolve) { setTimeout(resolve, 50); });

    assert.ok(boardButtonIds().length > 0,
      'the scan list now contains board buttons: ' + JSON.stringify(boardButtonIds()));
    assert.ok(scanner.scanning,
      'and it is actually scanning again — a stop() with no re-arm would leave this false');
  });
});
