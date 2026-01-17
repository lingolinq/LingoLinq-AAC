import persistence from '../utils/persistence';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),

  opening: function() {
    this.set('model', this.get('model.board'));
    this.load_charts();
  },
  using_user_names: computed('model.using_user_names', function() {
    return (this.get('model.using_user_names') || []).join(', ');
  }),
  load_charts: function() {
    var _this = this;
    _this.set('stats', null);
    if(this.persistence.get('online') && this.appState.get('currentUser')) {
      this.persistence.ajax('/api/v1/boards/' + _this.get('model.key') + '/stats', {type: 'GET'}).then(function(data) {
        _this.set('stats', data);
      }, function() {
        _this.set('stats', {error: true});
      });
    }
  }
});
