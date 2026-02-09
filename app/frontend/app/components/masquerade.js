import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import app_state from '../utils/app_state';
import session from '../utils/session';

/**
 * Masquerade Modal Component
 *
 * Converted from modals/masquerade template/controller to component.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/masquerade';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('confirmed', false);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('confirmed', false);
    },
    closing() {},
    confirm() {
      if (!this.get('confirmed')) { return; }
      const data = session.restore();
      data.original_user_name = data.user_name;
      data.as_user_id = this.get('model.user.id');
      data.user_name = this.get('model.user.user_name');
      session.persist(data).then(function() {
        app_state.return_to_index();
        runLater(function() {
          location.reload();
        });
      });
    }
  }
});
