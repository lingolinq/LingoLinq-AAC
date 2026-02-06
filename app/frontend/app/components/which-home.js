import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';

/**
 * Which Home board modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    toggleSpeakMode(decision) {
      this.get('appState').toggle_speak_mode(decision);
    }
  }
});
