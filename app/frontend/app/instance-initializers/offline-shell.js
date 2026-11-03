import offline_shell from '../utils/offline_shell';

// Offline app shell (utils/offline_shell.js, lib/offline_shell.rb). Registers or removes the service
// worker once the page has loaded, and when it is on, asks once for persistent storage after the first
// signed-in sync. Never blocks boot. Does nothing when the page did not set the flag (ember serve).
//
// Returns the function that stops the sync watcher, or null when none was started (for tests).
export function start(owner, win) {
  var setting = offline_shell.setting(win);
  if(!setting) { return null; }
  offline_shell.when_loaded(win, function() {
    offline_shell.sync_registration(win, win.navigator);
  });
  if(setting !== 'on') { return null; }
  var persistence = owner.lookup('service:persistence');
  var session = owner.lookup('service:session');
  if(!persistence || !session) { return null; }
  return offline_shell.persist_after_sync(persistence, session, win.navigator);
}

export default {
  name: 'offline-shell',
  initialize: function(appInstance) {
    if(typeof window === 'undefined') { return; }
    start(appInstance, window);
  }
};
