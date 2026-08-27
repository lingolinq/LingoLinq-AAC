import Service from '@ember/service';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

/* Session-scoped dismissal of the "this screen isn't ideal for this" overlays.
 *
 * Two INDEPENDENT families, because they say different things and one being wrong does
 * not make the other wrong:
 *   • `larger_screen`  — "Larger screen recommended" (board-detail; fires on the measured
 *                        rendered button size, not on orientation).
 *   • `rotate_device`  — "Landscape mode recommended" (create-board-new, and the Display
 *                        Style step, which emits its overlay on more than one step).
 *
 * WHY A SERVICE, not a plain module: the board-detail gate is an Ember `computed`, and a
 * computed cannot observe module-level state — the overlay would keep rendering until
 * something unrelated invalidated it. A service is an observable singleton, so every
 * site's gate re-evaluates the moment any one of them dismisses.
 *
 * WHY NOT app-state: this is one small responsibility and app-state is already a
 * documented hotspot.
 *
 * LIFETIME is the app session — a service instance lives until a full reload, which is
 * the lifetime asked for and the one board-detail's own flag already documented.
 * Deliberately NOT persisted to localStorage or a user preference: both messages are
 * about the CURRENT device and orientation, so a later visit (different device, phone
 * rotated, docked to a monitor) deserves to be re-evaluated. The escape is always one
 * button away on every overlay, so re-showing later is never a trap.
 */
export default Service.extend({
  appState: service('app-state'),

  /* Read by template/computed gates, so they must be real properties rather than a
     lookup in a hash — a computed cannot depend on `hash.key`. */
  larger_screen_dismissed: false,
  rotate_device_dismissed: false,

  /* User preference (Preferences -> Device Layout -> "Screen helper messages"), which
     turns the whole family off for good rather than for the session.
     Read from the LOGGED-IN user, not `referenced_user`: this is a device preference,
     and the device belongs to whoever is operating it — a therapist modelling on their
     own tablet should get their own choice, not the communicator's.
     `=== true` so an absent preference reads as "show", matching the server default. */
  helpers_disabled_by_preference: computed(
    'appState.currentUser.preferences.device.hide_screen_helpers',
    function() {
      return this.get('appState.currentUser.preferences.device.hide_screen_helpers') === true;
    }
  ),

  /* THE gates every site consults. Combining the preference and the session dismissal
     here — rather than at each of the three call sites — means a new overlay site only
     has to read one property, and the preference can never be honoured in two places
     and missed in a third. */
  larger_screen_hidden: computed('helpers_disabled_by_preference', 'larger_screen_dismissed', function() {
    return this.get('helpers_disabled_by_preference') || this.get('larger_screen_dismissed');
  }),
  rotate_device_hidden: computed('helpers_disabled_by_preference', 'rotate_device_dismissed', function() {
    return this.get('helpers_disabled_by_preference') || this.get('rotate_device_dismissed');
  }),

  _key_for: function(kind) {
    if (kind === 'larger_screen') { return 'larger_screen_dismissed'; }
    if (kind === 'rotate_device') { return 'rotate_device_dismissed'; }
    return null;
  },

  /* Latch one family as dismissed for the rest of the session. Idempotent, and a no-op
     on an unknown kind rather than silently creating a property that nothing reads. */
  dismiss: function(kind) {
    var key = this._key_for(kind);
    if (!key) { return false; }
    if (this.get(key) !== true) { this.set(key, true); }
    return true;
  },

  /* True when this family must not render — for EITHER reason. Imperative callers
     (display-style builds its overlay as an HTML string) use this; Ember gates depend on
     `larger_screen_hidden` / `rotate_device_hidden` directly so they stay reactive. */
  hidden: function(kind) {
    if (this.get('helpers_disabled_by_preference')) { return true; }
    var key = this._key_for(kind);
    return key ? !!this.get(key) : false;
  },

  /* Session dismissal only, ignoring the preference. Kept separate so a caller can tell
     "dismissed for now" from "turned off permanently" if it ever needs to. */
  dismissed: function(kind) {
    var key = this._key_for(kind);
    return key ? !!this.get(key) : false;
  },

  /* Tests only — a service singleton would otherwise carry a dismissal between tests. */
  reset: function() {
    this.set('larger_screen_dismissed', false);
    this.set('rotate_device_dismissed', false);
  }
});
