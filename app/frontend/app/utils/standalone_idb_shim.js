// iOS8 home screen apps are doing weird things with indexeddb, so a standalone
// (Home Screen) launch swaps window.indexedDB for the indexeddbshim WebSQL polyfill.
// The app's own database does not go through the swap: capabilities.js captures the
// native factory in indexedDBSafe before calling this, and dbman opens via
// capabilities.idb.
//
// Keep this module a leaf: capabilities.js imports it at module load, and
// capabilities <-> dbman already import each other.
export default function useStandaloneIdbShim(win, nav) {
  if(nav && nav.standalone && win.shimIndexedDB) {
    win.shimIndexedDB.__useShim();
    return true;
  }
  return false;
}
