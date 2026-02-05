import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { later as runLater } from '@ember/runloop';
import utterance from '../utils/utterance';
import capabilities from '../utils/capabilities';
import app_state from '../utils/app_state';

/**
 * Big Button Modal Component
 *
 * Converted from modals/big-button template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/big-button';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('holding', false);
    this.set('flipped', false);
    this.set('not_scrollable', false);
    this.set('snap', null);
  },

  text_class: computed('model.text_only', 'model.text', function() {
    let size = 'normal';
    const text = (this.get('model.text') || '');
    if (this.get('model.text_only')) {
      if (text.length > 200) { size = 'small'; }
      else if (text.length > 100) { size = 'medium'; }
      else if (text.length < 20) { size = 'huge'; }
      else if (text.length < 50) { size = 'big'; }
    } else {
      if (text.length > 100) { size = 'small'; }
      else if (text.length > 50) { size = 'medium'; }
      else if (text.length < 10) { size = 'huge'; }
      else if (text.length < 25) { size = 'big'; }
    }
    return htmlSafe(size);
  }),

  snapScroll() {
    const btn = document.getElementById('full_button');
    if (btn) {
      this.set('not_scrollable', btn.scrollHeight <= btn.clientHeight);
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('holding', false);
      this.set('flipped', false);
      const _this = this;
      const snap = function() {
        _this.snapScroll();
      };
      this.set('snap', snap);
      runLater(snap);
      window.addEventListener('resize', snap);
    },
    closing() {
      const snap = this.get('snap');
      if (snap) {
        window.removeEventListener('resize', snap);
      }
    },
    speak(close) {
      if (this.get('holding')) { return; }
      utterance.vocalize_list(null, { button_triggered: true });
      if (app_state.get('currentUser.preferences.vibrate_buttons') && app_state.get('speak_mode')) {
        capabilities.vibrate();
      }
      if (close) {
        this.get('modal').close();
      }
    },
    flip() {
      this.set('flipped', !this.get('flipped'));
    },
    hold() {
      this.set('holding', !this.get('holding'));
    },
    move(direction) {
      const btn = document.getElementById('full_button');
      if (!btn) { return; }
      const interval = btn.clientHeight - 20;
      if (direction === 'up') {
        btn.scrollTop = Math.max(0, btn.scrollTop - interval);
      } else {
        btn.scrollTop = Math.min(btn.scrollHeight, btn.scrollTop + interval);
      }
    }
  }
});
