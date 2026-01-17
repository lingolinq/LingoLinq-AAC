import { inject as service } from '@ember/service';
import modal from '../utils/modal';


export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('model.error', null);
    this.set('model.updating', null);
    this.set('model.retiring', null);
    this.set('model.deleting', null);
    this.set('retirable', this.get('model.goal.active'));
  },
  actions: {
    delete_goal: function() {
      var _this = this;
      _this.set('model.updating', true);
      _this.set('model.deleting', true);
      var goal = _this.get('model.goal');
      goal.deleteRecord();
      goal.save().then(function() {
        this.modal.close({updated: true});
      }, function() {
        _this.set('model.updating', false);
        _this.set('model.deleting', false);
        _this.set('model.error', true);
      });
    },
    retire_goal: function() {
      var _this = this;
      _this.set('model.updating', true);
      _this.set('model.retiring', true);
      var goal = _this.get('model.goal');
      goal.set('active', false);
      goal.save().then(function() {
        this.modal.close({updated: true});
      }, function() {
        _this.set('model.updating', false);
        _this.set('model.retiring', false);
        _this.set('model.error', true);
      });
    }
  }
});
