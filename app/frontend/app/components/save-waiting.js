import Component from '@ember/component';
import { inject as service } from '@ember/service';

// The dialog board Save shows while a picture or sound is still uploading
// (utils/save_after_media.js opens it with {started_at}). "Back to editing" is always offered;
// "Save without it" appears once SLOW_MS has passed since the first Save click. It closes with
// 'back' or 'save_without'; it is uncloseable, so Escape and the backdrop do nothing.
//
// The reveal uses a plain setTimeout, not runLater: a run-loop timer would make every test that
// opens this dialog wait the full 15 seconds in settled(). The handle is kept and cleared in
// willDestroy, and the callback returns once the component is gone.
export const SLOW_MS = 15000;

export default Component.extend({
  modal: service('modal'),
  tagName: '',
  slow: false,

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      return function(evt) {
        if (evt && typeof evt.preventDefault === 'function') { evt.preventDefault(); }
        self.send(actionName);
      };
    };
    var modalService = this.get('modal');
    var template = 'save-waiting';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
    var started = options.started_at || Date.now();
    var remaining = SLOW_MS - (Date.now() - started);
    if (remaining <= 0) {
      this.set('slow', true);
    } else {
      this._slow_timer = window.setTimeout(function() {
        self._slow_timer = null;
        if (self.isDestroyed || self.isDestroying) { return; }
        self.set('slow', true);
      }, remaining);
    }
  },

  willDestroy() {
    if (this._slow_timer) {
      window.clearTimeout(this._slow_timer);
      this._slow_timer = null;
    }
    this._super(...arguments);
  },

  actions: {
    opening() {},
    closing() {},
    back() {
      this.get('modal').close('back');
    },
    save_without() {
      this.get('modal').close('save_without');
    }
  }
});
