import { module, test } from 'qunit';
import useStandaloneIdbShim from 'frontend/utils/standalone_idb_shim';

// The fake shim does what indexeddbshim 6.1.0 does first inside __useShim
// (src/setGlobalVars.js: "if (CFG.win.openDatabase !== undefined) {
// shimIndexedDB.__openDatabase = CFG.win.openDatabase.bind(CFG.win);"), so a
// shape that breaks the real shim throws the same TypeError here.
function fakeWindow(openDatabase) {
  var win = { openDatabase: openDatabase, calls: 0 };
  win.shimIndexedDB = {
    __useShim: function() {
      win.calls++;
      if(win.openDatabase !== undefined) {
        win.shimIndexedDB.__openDatabase = win.openDatabase.bind(win);
      }
    }
  };
  return win;
}

module('Unit | Utility | standalone idb shim', function() {
  test('iPadOS standalone: openDatabase masquerades as undefined, so the shim is not forced', function(assert) {
    // With WebSQL disabled, WebKit returns a function that masquerades as undefined
    // (Source/WebCore/bindings/js/JSDOMWindowCustom.cpp, JSDOMWindow::openDatabase:
    // "InternalFunction::createFunctionThatMasqueradesAsUndefined"): typeof is
    // 'undefined', it is !== undefined, and it has no bind. document.all has the
    // same three properties, and this is the shape the device reported
    // ("'O.win.openDatabase.bind' is undefined").
    var win = fakeWindow(document.all);
    assert.strictEqual(typeof win.openDatabase, 'undefined');
    assert.notStrictEqual(win.openDatabase, undefined);

    var used = useStandaloneIdbShim(win, { standalone: true });
    assert.false(used);
    assert.strictEqual(win.calls, 0);
  });

  test('an openDatabase object without bind does not force the shim', function(assert) {
    var win = fakeWindow({});
    assert.false(useStandaloneIdbShim(win, { standalone: true }));
    assert.strictEqual(win.calls, 0);
  });

  test('a callable openDatabase without bind does not force the shim', function(assert) {
    var callable = function() {};
    Object.setPrototypeOf(callable, null);
    var win = fakeWindow(callable);
    assert.false(useStandaloneIdbShim(win, { standalone: true }));
    assert.strictEqual(win.calls, 0);
  });

  test('a real openDatabase function still forces the shim when standalone', function(assert) {
    var win = fakeWindow(function() {});
    assert.true(useStandaloneIdbShim(win, { standalone: true }));
    assert.strictEqual(win.calls, 1);
    assert.strictEqual(typeof win.shimIndexedDB.__openDatabase, 'function');
  });

  test('no WebSQL: the shim library stub is not called', function(assert) {
    // With openDatabase undefined, indexeddbshim still defines a stub
    // shimIndexedDB whose __useShim only warns ("This browser does not have
    // WebSQL to shim.").
    var win = { openDatabase: undefined, calls: 0 };
    win.shimIndexedDB = { __useShim: function() { win.calls++; } };
    assert.false(useStandaloneIdbShim(win, { standalone: true }));
    assert.strictEqual(win.calls, 0);
  });

  test('a browser tab never forces the shim', function(assert) {
    var win = fakeWindow(function() {});
    assert.false(useStandaloneIdbShim(win, { standalone: false }));
    assert.false(useStandaloneIdbShim(win, {}));
    assert.strictEqual(win.calls, 0);
  });

  test('without shimIndexedDB there is nothing to call', function(assert) {
    var win = { openDatabase: function() {} };
    assert.false(useStandaloneIdbShim(win, { standalone: true }));
  });

  test('capabilities routes the standalone shim call through this guard', function(assert) {
    // capabilities.js runs the call once at module load, before any test can set
    // navigator.standalone, so the wiring is checked on the module definition.
    var entry = window.requirejs.entries['frontend/utils/capabilities'];
    assert.ok(entry, 'capabilities module is registered');
    assert.ok(entry.deps.indexOf('frontend/utils/standalone_idb_shim') !== -1, 'capabilities imports the guard');
    // Comments are stripped first: capabilities.js keeps a commented-out copy of an
    // old IndexedDBShim build that mentions __useShim.
    var code = entry.callback.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.notOk(/__useShim/.test(code), 'capabilities does not call __useShim directly');
  });
});
