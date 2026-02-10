import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet } from '@ember/object';
import modal from '../utils/modal';

/**
 * Device Settings modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'device-settings';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    remove_device(id) {
      const user = this.get('model');
      user.remove_device(id);
    },
    rename_device(id) {
      const list = [];
      (this.get('model.devices') || []).forEach(function(d) {
        emberSet(d, 'renaming', false);
        if (d.new_name) {
          emberSet(d, 'name', d.new_name);
        }
        if (id != null && d.id === id) {
          emberSet(d, 'renaming', true);
          emberSet(d, 'new_name', d.name);
        }
        list.push(d);
      });
      this.set('model.devices', list);
    },
    update_device() {
      const device = (this.get('model.devices') || []).findBy('renaming', true);
      if (device) {
        const user = this.get('model');
        user.rename_device(device.id, device.new_name);
        this.send('rename_device', null);
      }
    }
  }
});
