import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import scanner from 'frontend/utils/scanner';

/*
 * Every resume goes through scanner.start(): a modal opening or closing (utils/modal.js,
 * services/modal.js), the board-detail re-arm and the reset after a selection. Those resumes pass
 * scanner.options, which stop() leaves set, so they carry the options of the last scan. board-detail
 * renders #speak in every mode, so finding #speak no longer means speak mode; outside speak mode
 * start() must stop, or closing any modal in default or edit mode restarts that scan (and with
 * auto-select on, activates buttons). No options are passed here, so start() returns right after its
 * guards whichever way they decide, and the test sees only the guard's decision.
 */
module('Unit | Utility | scanner start outside speak mode', function(hooks) {
  hooks.beforeEach(function() {
    this.stopped = 0;
    this.saved = ['find_elem', 'stop'].map((k) => [k, Object.getOwnPropertyDescriptor(scanner, k)]);
    scanner.find_elem = (sel) => (sel === '#speak' ? { length: 1 } : { length: 0 });
    scanner.stop = () => { this.stopped++; };
    this.savedAppState = scanner.get('appState');
    this.savedInterval = scanner.interval;
    this.savedLastOptions = scanner.last_options;
    scanner.interval = null;
    scanner.last_options = null;
    this.appState = (speak_mode, scanning = true) => EmberObject.create({
      speak_mode: speak_mode,
      currentUser: EmberObject.create({ preferences: { device: { scanning: scanning } } })
    });
  });
  hooks.afterEach(function() {
    this.saved.forEach(([k, d]) => { if (d) { Object.defineProperty(scanner, k, d); } else { delete scanner[k]; } });
    scanner.set('appState', this.savedAppState);
    scanner.interval = this.savedInterval;
    scanner.last_options = this.savedLastOptions;
  });

  test('it stops instead of scanning when the app is not in speak mode', function(assert) {
    scanner.set('appState', this.appState(false));
    scanner.start();
    assert.strictEqual(this.stopped, 1, 'scanning was stopped, not resumed');
  });

  test('it stops in speak mode when the user has scanning turned off', function(assert) {
    scanner.set('appState', this.appState(true, false));
    scanner.start();
    assert.strictEqual(this.stopped, 1, 'scanning was stopped, not resumed');
  });

  test('it passes the guard in speak mode for a user who scans', function(assert) {
    scanner.set('appState', this.appState(true));
    scanner.start();
    assert.strictEqual(this.stopped, 0, 'the guard let scanning continue');
  });
});
