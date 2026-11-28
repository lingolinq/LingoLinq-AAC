import LingoLinq from 'frontend/app';

/*
 * For unit tests that boot no app but run code reading the app's global services. Each app
 * instance writes its services into these globals; when an earlier test's instance is torn down
 * they are left pointing at DESTROYED services, so such a test used to run against whatever that
 * earlier test left behind (order-dependent; tests/helpers/leak-check.js fails it). This gives each
 * test its own stand-ins and puts the originals back afterwards.
 *
 *   standInGlobals(hooks, {
 *     appState: () => EmberObject.create({ feature_flags: {} }),
 *     store: () => ({ peekRecord() { return null; } })
 *   });
 *
 * Each stand-in is built fresh for every test; `this.standIns.<name>` holds it.
 */
const SLOTS = {
  appState: [[() => window, 'appState'], [() => LingoLinq, 'appState'], [() => window.LingoLinq, 'appState']],
  persistence: [[() => window, 'persistence']],
  stashes: [[() => window, 'stashes']],
  store: [[() => LingoLinq, 'store'], [() => window.LingoLinq, 'store']]
};

export function standInGlobals(hooks, factories) {
  Object.keys(factories).forEach((name) => {
    if (!SLOTS[name]) { throw new Error(`standInGlobals: unknown global "${name}" (known: ${Object.keys(SLOTS).join(', ')})`); }
  });
  let saved = [];
  hooks.beforeEach(function() {
    saved = [];
    this.standIns = {};
    Object.keys(factories).forEach((name) => {
      const value = factories[name]();
      this.standIns[name] = value;
      SLOTS[name].forEach(([holder, key]) => {
        const obj = holder();
        if (!obj) { return; }
        saved.push([obj, key, Object.prototype.hasOwnProperty.call(obj, key), obj[key]]);
        obj[key] = value;
      });
    });
  });
  hooks.afterEach(function() {
    saved.reverse().forEach(([obj, key, had, value]) => {
      if (had) { obj[key] = value; } else { delete obj[key]; }
    });
    saved = [];
  });
}
