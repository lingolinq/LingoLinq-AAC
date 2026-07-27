import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import { cancel as runCancel } from '@ember/runloop';

// Guards the board-detail display-pref steppers (Shape & Border / Text Size /
// Spacing). Two regressions are covered:
//   1. JUMP — a single +/- click must move EXACTLY one level from the value the
//      UI displays. The bug: step_display_pref read the raw currentUser pref and
//      fell back to the ladder MIDPOINT when unset, while the UI (and the
//      min/max disables) fall back to 'medium'. For the 4-item text and 7-item
//      spacing ladders the midpoint isn't 'medium', so one click skipped a level.
//      Fix: step from current_display_prefs[key] (the displayed value).
//   2. REVERT — rapid clicks fired a user.save() each; an earlier save's echo
//      landing after a later click reverted the value. Fix: the persist is
//      debounced, so a click applies the live preview immediately but the save
//      is deferred/coalesced (not fired synchronously per click).
module('Unit | Controller | user/board-detail display-pref steppers', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) {
      // Cancel any debounced pref-save timer so it can't leak past the test.
      if(this.controller._display_pref_save_timer) { runCancel(this.controller._display_pref_save_timer); }
      this.controller.destroy();
      this.controller = null;
    }
  });

  // Self-owned edit session (referenced_user === currentUser), device prefs =
  // `device`, no More-Settings pending panel open. `save` is optional so most
  // tests exercise the pure stepping math without scheduling a timer.
  function selfSession(controller, device, save) {
    var prefs = { device: device || {} };
    var user = EmberObject.create(save ? { preferences: prefs, save: save } : { preferences: prefs });
    controller.set('app_state', EmberObject.create({ currentUser: user, referenced_user: user }));
    controller.set('pending_display_prefs', null);
    return user;
  }

  test('unset text steps one level up from the DISPLAYED medium (regression: no jump to huge)', function(assert) {
    var user = selfSession(this.controller, {}); // button_text unset => UI shows 'medium'
    this.controller.send('step_display_pref', 'button_text', 1);
    assert.equal(user.get('preferences.device.button_text'), 'large',
      'medium +1 = large (old midpoint-fallback bug produced huge)');
  });

  test('unset spacing steps one level up from medium, not the 7-item ladder midpoint', function(assert) {
    var user = selfSession(this.controller, {});
    this.controller.send('step_display_pref', 'button_spacing', 1);
    assert.equal(user.get('preferences.device.button_spacing'), 'large', 'medium +1 = large');
  });

  test('unset border steps one level up from medium', function(assert) {
    var user = selfSession(this.controller, {});
    this.controller.send('step_display_pref', 'button_border', 1);
    assert.equal(user.get('preferences.device.button_border'), 'large', 'medium +1 = large');
  });

  test('a set value steps exactly one level up', function(assert) {
    var user = selfSession(this.controller, { button_border: 'small' });
    this.controller.send('step_display_pref', 'button_border', 1);
    assert.equal(user.get('preferences.device.button_border'), 'medium', 'small +1 = medium');
  });

  test('stepping down moves exactly one level', function(assert) {
    var user = selfSession(this.controller, { button_text: 'large' });
    this.controller.send('step_display_pref', 'button_text', -1);
    assert.equal(user.get('preferences.device.button_text'), 'medium', 'large -1 = medium');
  });

  test('clamped at the min end (border none stays none)', function(assert) {
    var user = selfSession(this.controller, { button_border: 'none' });
    this.controller.send('step_display_pref', 'button_border', -1);
    assert.equal(user.get('preferences.device.button_border'), 'none', 'none -1 stays none');
  });

  test('clamped at the max end (text huge stays huge)', function(assert) {
    var user = selfSession(this.controller, { button_text: 'huge' });
    this.controller.send('step_display_pref', 'button_text', 1);
    assert.equal(user.get('preferences.device.button_text'), 'huge', 'huge +1 stays huge');
  });

  test('a doubled dispatch of the same click steps only ONCE (raw_events re-fire de-dupe)', function(assert) {
    var user = selfSession(this.controller, { button_border: 'small' });
    this.controller.send('step_display_pref', 'button_border', 1);
    // Simulate the AAC pointer layer re-firing the SAME physical click.
    this.controller.send('step_display_pref', 'button_border', 1);
    assert.equal(user.get('preferences.device.button_border'), 'medium',
      'two back-to-back dispatches = one level (small -> medium), not two (large)');
  });

  test('the opposite direction is NOT de-duped (a real +/- in quick succession both register)', function(assert) {
    var user = selfSession(this.controller, { button_border: 'medium' });
    this.controller.send('step_display_pref', 'button_border', 1);  // -> large
    this.controller.send('step_display_pref', 'button_border', -1); // -> medium (different step_id, allowed)
    assert.equal(user.get('preferences.device.button_border'), 'medium', '+1 then -1 nets back to medium');
  });

  test('persist is debounced: the live preview applies immediately but save is NOT fired synchronously per click', function(assert) {
    var saves = 0;
    var user = selfSession(this.controller, {}, function() { saves++; return { then: function() {} }; });
    this.controller.send('step_display_pref', 'button_border', 1);
    assert.equal(user.get('preferences.device.button_border'), 'large',
      'live preview applied immediately (medium +1 = large)');
    assert.equal(saves, 0, 'user.save() is deferred (debounced), not called on the click itself');
    assert.ok(this.controller._display_pref_save_timer, 'a debounced save was scheduled');
  });
});
