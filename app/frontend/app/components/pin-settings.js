import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

/**
 * Speak Mode PIN settings modal.
 *
 * Opened from the board-detail edit left panel (Board Actions → PIN). Edits the
 * same user preferences as the settings/preferences page
 * (require_speak_mode_pin / speak_mode_pin / hide_pin_hint), but saves LIVE —
 * each change persists to user.preferences immediately (no separate Save step).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'pin-settings';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    {};
    this.set('model', options);
    // Seed the editable PIN field from the saved preference so the input shows
    // the current value when the modal opens.
    this.set('pin_value', this.get('appState.currentUser.preferences.speak_mode_pin') || '');
  },

  user: computed('appState.currentUser', function() {
    return this.get('appState.currentUser');
  }),

  // Live-saved checkbox: require a PIN when exiting Speak Mode.
  require_speak_mode_pin: computed('user.preferences.require_speak_mode_pin', {
    get() { return !!this.get('user.preferences.require_speak_mode_pin'); },
    set(key, value) {
      this._save_pref('require_speak_mode_pin', !!value);
      return !!value;
    }
  }),

  // Live-saved checkbox: require the PIN to open the sidebar editor. Reuses the
  // same speak_mode_pin value as the speak-mode gate.
  require_sidebar_edit_pin: computed('user.preferences.require_sidebar_edit_pin', {
    get() { return !!this.get('user.preferences.require_sidebar_edit_pin'); },
    set(key, value) {
      this._save_pref('require_sidebar_edit_pin', !!value);
      return !!value;
    }
  }),

  // Live-saved checkbox: hide the forgotten-PIN hint.
  hide_pin_hint: computed('user.preferences.hide_pin_hint', {
    get() { return !!this.get('user.preferences.hide_pin_hint'); },
    set(key, value) {
      this._save_pref('hide_pin_hint', !!value);
      return !!value;
    }
  }),

  // Persist a single preference field to the user and save. Mirrors the
  // board-detail toggle pattern (toggle_shrink_labels_to_fit, etc.).
  _save_pref(field, value) {
    var _this = this;
    var user = _this.get('user');
    if(user && user.set && user.save) {
      user.set('preferences.' + field, value);
      user.set('preferences.device.updated', true);
      // Swallow a rejected save (e.g. offline) so it doesn't surface as an
      // unhandled rejection — the in-memory pref is already set and persistence
      // queues/retries. Mirrors the defensive .save() pattern used elsewhere.
      user.save().then(null, function() {});
    }
  },

  actions: {
    close() {
      // Persist the PIN on close too, in case the modal is dismissed (X /
      // Escape / backdrop) before the input's change/blur fired. Only saves
      // when it actually differs, to avoid a redundant write.
      var pin = (this.get('pin_value') || '').toString();
      if(pin !== ((this.get('user.preferences.speak_mode_pin') || '').toString())) {
        this._save_pref('speak_mode_pin', pin);
      }
      this.get('modal').close();
    },
    opening() { this.get('modal').setComponent(this); },
    closing() {},
    // The PIN value persists on change (blur/enter) rather than per keystroke.
    save_pin() {
      var pin = (this.get('pin_value') || '').toString();
      this._save_pref('speak_mode_pin', pin);
    }
  }
});
