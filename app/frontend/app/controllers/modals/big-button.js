/*
 * ⚠️ ORPHANED MODAL CONTROLLER — NOT CURRENTLY WIRED INTO THE APP (kept for team review).
 *
 * During the component-modal migration this modal was reimplemented as the co-located
 * component `app/components/<same-name>.{js,hbs}`, which is what actually renders now
 * (via `components/modal-container.js` -> its `convertedModals` list). There is no
 * `app/templates/modals/<name>.hbs` backing this controller, and nothing imports it or
 * resolves it through `controllerFor`, so Ember never instantiates it. As of the Ember
 * 5.12 work this is dead code.
 *
 * REVIEW NEEDED: DELETE this file, OR RE-WIRE it if the team still wants the modal. If you
 * revive it, reconcile with the component version first — the two have diverged since the
 * split (fixes landed in the component, not here).
 * Context: docs/task-management/2026-07-14-ember-5-12-full-deprecation-audit.md
 */

import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    this.get('model.text');
    this.get('model.text_only');
    // figure out the correct font size to ensure all the text
    // is shown, if that's possible
    var _this = this;
    var snap = function() {
      _this.snap_scroll();
    };
    _this.set('snap', snap);
    _this.set('holding', false);
    _this.set('flipped', false);
    runLater(snap);
    window.addEventListener('resize', snap);
  },
  closing: function() {
    var _this = this;
    if(_this.get('snap')) {
      window.removeEventListener('resize', _this.get('snap'));
    }
  },
  snap_scroll: function() {
    var btn = document.getElementById('full_button');
    if(btn) {
      this.set('not_scrollable', btn.scrollHeight <= btn.clientHeight);
    }
  },
  text_class: computed('model.text_only', 'model.text', function() {
    var size = 'normal';
    var text = this.get('model.text') || "";
    if(this.get('model.text_only')) {
      if(text.length > 200) {
        size = 'small';
      } else if(text.length > 100) {
        size = 'medium';
      } else if(text.length < 20) {
        size = 'huge';
      } else if(text.length < 50) {
        size = 'big';
      }
    } else {
      if(text.length > 100) {
        size = 'small';
      } else if(text.length > 50) {
        size = 'medium';
      } else if(text.length < 10) {
        size = 'huge';
      } else if(text.length < 25) {
        size = 'big';
      }
    }
    return htmlSafe(size);
  }),
  actions: {
    speak: function(close) {
      if(this.get('holding')) { return; }
      utterance.vocalize_list(null, {button_triggered: true});
      if(app_state.get('currentUser.preferences.vibrate_buttons') && app_state.get('speak_mode')) {
        capabilities.vibrate();
      }
      if(close) {
        modal.close();
      }
    },
    flip: function() {
      this.set('flipped', !this.get('flipped'));
    },
    hold: function() {
      this.set('holding', !this.get('holding'));
    },
    move: function(direction) {
      var btn = document.getElementById('full_button');
      var interval = btn.clientHeight - 20;
      if(direction == 'up') {
        btn.scrollTop = Math.max(0, btn.scrollTop - interval);
      } else {
        btn.scrollTop = Math.min(btn.scrollHeight, btn.scrollTop + interval);
      }
    }
  }
});
