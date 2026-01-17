import { inject as service } from '@ember/service';
import modal from '../utils/modal';

import LingoLinq from '../app';
import progress_tracker from '../utils/progress_tracker';
import persistence from '../utils/persistence';

export default modal.ModalController.extend({
  persistence: service(),

  opening: function() {
    this.set('status', null);
    if(this.get('model.log')) {
      this.send('download');
    }
  },
  actions: {
    download: function(type) {
      var _this = this;
      _this.set('status', {downloading: true});
      var params = _this.get('model.user') ? ("user_id=" + _this.get('model.user.id')) : ("log_id=" + _this.get('model.log.id'));
      if(type == 'obla') {
        params = params + "&anonymized=1";
      }
      this.persistence.ajax('/api/v1/logs/obl?' + params, {method: 'GET'}).then(function(data) {
        progress_tracker.track(data.progress, function(event) {
          if(event.status == 'errored') {
            _this.set('status', {errored: true});
          } else if(event.status == 'finished') {
            _this.set('status', {
              url: event.result.url,
              file_name: event.result.url.split(/\//).pop()
            });
          }
        });
      }, function(err) {
        _this.set('status', {errored: true});
      });
    }
  }
});
