import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * Confirm Remove Goal Modal Component
 *
 * Converted from modals/confirm-remove-goal template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/confirm-remove-goal';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('status', null);
    this.set('auto_conclude', false);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('status', null);
      this.set('auto_conclude', false);
    },
    closing() {},
    confirm() {
      this.set('status', { saving: true });
      this.store.findRecord('unit', this.get('model.source.id')).then((unit) => {
        unit.set('goal', { remove: true, auto_conclude: this.get('auto_conclude') });
        unit.save().then(() => {
          unit.set('goal', null);
          this.get('modal').close({ confirmed: true });
        }, () => {
          this.set('status', { error: true });
        });
      }, () => {
        this.set('status', { error: true });
      });
    }
  }
});
