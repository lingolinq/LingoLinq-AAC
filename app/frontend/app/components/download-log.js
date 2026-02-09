import Component from '@ember/component';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import progress_tracker from '../utils/progress_tracker';
import persistence from '../utils/persistence';

/**
 * Download Log modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'download-log';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('status', null);
    if (this.get('model.log')) {
      this.send('download');
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    download(type) {
      const _this = this;
      _this.set('status', { downloading: true });
      let params = _this.get('model.user') ? ('user_id=' + _this.get('model.user.id')) : ('log_id=' + _this.get('model.log.id'));
      if (type === 'obla') {
        params = params + '&anonymized=1';
      }
      persistence.ajax('/api/v1/logs/obl?' + params, { method: 'GET' }).then(function(data) {
        progress_tracker.track(data.progress, function(event) {
          if (event.status === 'errored') {
            _this.set('status', { errored: true });
          } else if (event.status === 'finished') {
            _this.set('status', {
              url: event.result.url,
              file_name: event.result.url.split(/\//).pop()
            });
          }
        });
      }, function() {
        _this.set('status', { errored: true });
      });
    }
  }
});
