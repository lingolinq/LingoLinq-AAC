// iOS8 home screen apps are doing weird things with indexeddb, so a standalone
// (Home Screen) launch swaps window.indexedDB for the indexeddbshim WebSQL polyfill.
// The app's own database does not go through the swap: capabilities.js captures the
// native factory in indexedDBSafe before calling this, and dbman opens via
// capabilities.idb.
//
// The swap is only forced when WebSQL is really there. indexeddbshim 6.1.0 starts
// __useShim with "if (CFG.win.openDatabase !== undefined) { ... CFG.win.openDatabase
// .bind(CFG.win)" (src/setGlobalVars.js), unguarded. With WebSQL disabled, WebKit's
// window.openDatabase is a function that masquerades as undefined
// (Source/WebCore/bindings/js/JSDOMWindowCustom.cpp, JSDOMWindow::openDatabase), so it
// passes that check, has no bind, and the throw aborted app boot on iPadOS 26 Home
// Screen launches. Checking typeof on both covers that shape and any other.
//
// Keep this module a leaf: capabilities.js imports it at module load, and
// capabilities <-> dbman already import each other.
export default function useStandaloneIdbShim(win, nav) {
  if(!(nav && nav.standalone && win.shimIndexedDB)) { return false; }
  var openDatabase = win.openDatabase;
  if(typeof openDatabase !== 'function' || typeof openDatabase.bind !== 'function') { return false; }
  win.shimIndexedDB.__useShim();
  return true;
}
