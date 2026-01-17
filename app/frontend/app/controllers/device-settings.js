import EmberObject from '@ember/object';
import modal from '../utils/modal';
import { set as emberSet, get as emberGet } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  actions: {
    remove_device: function(id) {
      var user = this.get('model');
      user.remove_device(id);
    },
    rename_device: function(id) {
      var list = [];
      this.get('model.devices').forEach(function(d) {
        emberSet(d, 'renaming', false);
        if(d.new_name) {
          emberSet(d, 'name', d.new_name);
        }
        if(d.id == id) {
          emberSet(d, 'renaming', true);
          emberSet(d, 'new_name', d.name);
        }
        list.push(d);
      });
      this.set('model.devices', list);
    },
    update_device: function() {
      var device = (this.get('model.devices') || []).findBy('renaming', true);
      if(device) {
        var user = this.get('model');
        user.rename_device(device.id, device.new_name);
        this.send('rename_device', null);
      }
    }
  }
});
