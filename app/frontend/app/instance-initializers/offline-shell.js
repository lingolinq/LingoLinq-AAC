import offline_shell from '../utils/offline_shell';

// Offline app shell (utils/offline_shell.js, lib/offline_shell.rb). Once the page has loaded, removes the
// worker when it is off; when it is on, registers it for a trusted device's session user and removes it
// for a shared one (follow_device_trust), and asks once for persistent storage after the first signed-in
// sync on a trusted device. Never blocks boot. Does nothing when the page did not set the flag (ember serve).
//
// Returns the function that stops the watchers, or null when none was started (for tests).
export function start(owner, win) {
  var setting = offline_shell.setting(win);
  if(!setting) { return null; }
  if(setting !== 'on') {
    offline_shell.when_loaded(win, function() {
      offline_shell.sync_registration(win, win.navigator);
    });
    return null;
  }
  var appState = owner.lookup('service:app-state');
  if(!appState) { return null; }
  var stops = [];
  var stopped = false;
  offline_shell.when_loaded(win, function() {
    if(!stopped) { stops.push(offline_shell.follow_device_trust(appState, win, win.navigator)); }
  });
  var persistence = owner.lookup('service:persistence');
  var session = owner.lookup('service:session');
  if(persistence && session) {
    stops.push(offline_shell.persist_after_sync(persistence, session, win.navigator, appState));
  }
  return function() {
    stopped = true;
    stops.forEach(function(stop) { stop(); });
  };
}

export default {
  name: 'offline-shell',
  initialize: function(appInstance) {
    if(typeof window === 'undefined') { return; }
    start(appInstance, window);
  }
};
