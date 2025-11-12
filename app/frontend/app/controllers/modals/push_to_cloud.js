import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import lingoLinqExtras from '../../utils/extras';
import persistence from '../../utils/persistence';
import app_state from '../../utils/app_state';
import { later as runLater } from '@ember/runloop';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('status', null);
    var user_name = app_state.get('currentUser.user_name');
    lingoLinqExtras.storage.find_all('board').then(function(list) {
      _this.set('local_boards', list.filter(function(i) { return i.data && i.data.raw && i.data.raw.user_name == user_name; }).length);
    }, function() { _this.set('local_boards', null)});
  },
  actions: {
    push: function() {
      var _this = this;
      _this.set('status', {pushing: true});
      app_state.get('currentUser').assert_local_boards().then(function(res) {
        _this.set('status', null);
        modal.close();
        modal.success(i18n.t('records_pushed', "Local records have been successfully pushed to the cloud!"));
        runLater(function() {
          persistence.sync('self', null, null, 'push_to_cloud');
        }, 5000);
      }, function(err) {
        if(err.save_failed) {
          _this.set('status', {error: true, save_failed: true});
        }
      });
    }
  }
});
