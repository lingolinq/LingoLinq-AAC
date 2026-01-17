import { inject as service } from '@ember/service';

import modal from '../utils/modal';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    var _this = this;
    _this.set('status', null);
  },
  actions: {
    delete_sound: function() {
      var sound = this.get('model.sound');
      var _this = this;
      _this.set('status', {deleting: true});
      sound.deleteRecord();
      sound.save().then(function() {
        _this.set('status', null);
        this.modal.close({deleted: true});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
