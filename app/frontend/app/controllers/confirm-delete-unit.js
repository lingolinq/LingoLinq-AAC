import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import persistence from '../utils/persistence';

export default modal.ModalController.extend({
  persistence: service(),
  modal: service(),

  opening: function() {
    this.set('status', null);
  },
  actions: {
    confirm: function() {
      var _this = this;
      var unit = this.get('model.unit');
      _this.set('status', {removing: true})
      if(this.get('model.lesson')) {
        this.persistence.ajax('/api/v1/lessons/' + _this.get('model.lesson.id') + '/unassign', {type: 'POST', data: {organization_unit_id: _this.get('model.unit.id')}}).then(function() {
          _this.set('model.lesson', null);
          this.modal.close({deleted: true});
        }, function(err) {
          _this.set('status', {error: true});
        });
      } else {
        unit.deleteRecord();
        unit.save().then(function(res) {
          this.modal.close({deleted: true});
        }, function() {
          _this.set('status', {error: true});
        });  
      }
    }
  }
});
