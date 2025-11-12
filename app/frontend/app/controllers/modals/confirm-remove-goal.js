import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import session from '../../utils/session';
import LingoLinq from '../../app';

export default modal.ModalController.extend({
  opening: function() {
    this.set('status', null);
    this.set('auto_conclude', false);
  },
  actions: {
    confirm: function() {
      var _this = this;
      _this.set('status', {saving: true});
      LingoLinq.store.findRecord('unit', _this.get('model.source.id')).then(function(unit) {
        unit.set('goal', {remove: true, auto_conclude: _this.get('auto_conclude')});
        unit.save().then(function() {
          unit.set('goal', null);
          modal.close({confirmed: true});
        }, function() {
          _this.set('status', {error: true});
        });
      }, function(err) {
        _this.set('status', {error: true});
      })
    }
  }
});
