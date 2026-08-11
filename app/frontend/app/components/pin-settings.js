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
    var self = this;
    this.set('ctrlAction', function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    });
    const modalService = this.get('modal');
    const template = 'pin-settings';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    {};
    this.set('model', options);
    // Seed the editable PIN field from the saved preference (sanitized to digits)
    // so the input shows the current value when the modal opens.
    this.set('pin_value', this._sanitize_pin(this.get('appState.currentUser.preferences.speak_mode_pin')));
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

  // True when a PIN gate is enabled but the current value isn't a full 4-digit
  // PIN. An empty/short PIN would leave the gate unable to take effect, so the
  // template surfaces a warning instead of silently saving an unusable PIN.
  pin_incomplete: computed('require_speak_mode_pin', 'require_sidebar_edit_pin', 'pin_value', function() {
    var gated = this.get('require_speak_mode_pin') || this.get('require_sidebar_edit_pin');
    return !!gated && !/^\d{4}$/.test((this.get('pin_value') || '').toString());
  }),

  // Strip everything but digits and cap at 4, so the PIN can never be persisted
  // as a non-numeric or over-length value (it gates Speak Mode exit + sidebar
  // editing). Used on seed, on change, and on close.
  _sanitize_pin(value) {
    return (value || '').toString().replace(/[^0-9]/g, '').slice(0, 4);
  },

  // Persist a single preference field to the user and save. Mirrors the
  // board-detail toggle pattern (toggle_soft_borders, etc.), but
  // SERIALIZES saves: each save is chained onto the previous in-flight one so
  // two never overlap and a stale write can't clobber a newer value when several
  // settings change in quick succession (LEARNINGS "serialize rapid model
  // saves"). The user object already holds the latest values, so every save
  // persists the current full state.
  _save_pref(field, value) {
    var _this = this;
    var user = _this.get('user');
    if(user && user.set && user.save) {
      user.set('preferences.' + field, value);
      user.set('preferences.device.updated', true);
      // Swallow a rejected save (e.g. offline) so it doesn't surface as an
      // unhandled rejection — the in-memory pref is already set and persistence
      // queues/retries. Mirrors the defensive .save() pattern used elsewhere.
      var run = function() { return user.save().then(null, function() {}); };
      _this._save_chain = _this._save_chain ? _this._save_chain.then(run, run) : run();
    }
  },

  actions: {
    close() {
      // Live-save model: the PIN persists on close too, in case the input's change
      // didn't fire before X / Escape / backdrop. Best-practice handling when the
      // entry is incomplete while a PIN gate is on (the disabled Done blocks it,
      // but the dismiss paths land here and would otherwise bypass that guard):
      //   • a valid PIN is still saved -> discard the in-progress edit, keep it;
      //   • no usable PIN anywhere     -> clear the partial and turn the gate(s)
      //     off, so we never persist an unenforceable "gate on, no PIN" (which
      //     could lock the user out or give a false sense of security).
      // The inline "Enter a 4-digit PIN." warning already surfaced the requirement
      // while editing, so no additional prompt is needed.
      var pin = this._sanitize_pin(this.get('pin_value'));
      if(pin !== (this.get('pin_value') || '').toString()) { this.set('pin_value', pin); }
      var savedPin = (this.get('user.preferences.speak_mode_pin') || '').toString();
      if(this.get('pin_incomplete') && !/^\d{4}$/.test(savedPin)) {
        if(savedPin !== '') { this._save_pref('speak_mode_pin', ''); }
        this.set('pin_value', '');
        if(this.get('require_speak_mode_pin')) { this.set('require_speak_mode_pin', false); }
        if(this.get('require_sidebar_edit_pin')) { this.set('require_sidebar_edit_pin', false); }
      } else if(this.get('pin_incomplete')) {
        this.set('pin_value', savedPin);
      } else if(pin !== savedPin) {
        this._save_pref('speak_mode_pin', pin);
      }
      this.get('modal').close();
    },
    opening() { this.get('modal').setComponent(this); },
    closing() {},
    // The PIN value persists on change (blur/enter) rather than per keystroke.
    save_pin() {
      var pin = this._sanitize_pin(this.get('pin_value'));
      this.set('pin_value', pin);
      this._save_pref('speak_mode_pin', pin);
    },
    // Clear the PIN field (and the saved PIN). If a gate is on, pin_incomplete
    // becomes true — the warning shows and Done disables until a valid PIN is
    // re-entered. Refocus the field so a new PIN can be typed immediately.
    clear_pin() {
      this.set('pin_value', '');
      this._save_pref('speak_mode_pin', '');
      var el = document.getElementById('speak_mode_pin');
      if(el) { el.focus(); }
    }
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
  }
});
