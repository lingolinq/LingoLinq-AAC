import Component from '@ember/component';
import { inject as service } from '@ember/service';
import persistence from '../utils/persistence';
import { computed } from '@ember/object';

export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'board-stats';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('model', this.get('model.board'));
    this.load_charts();
  },

  using_user_names: computed('model.using_user_names', function() {
    return (this.get('model.using_user_names') || []).join(', ');
  }),

  load_charts() {
    var _this = this;
    _this.set('stats', null);
    if (persistence.get('online') && this.get('appState.currentUser')) {
      persistence.ajax('/api/v1/boards/' + _this.get('model.key') + '/stats', { type: 'GET' }).then(function(data) {
        _this.set('stats', data);
      }, function() {
        _this.set('stats', { error: true });
      });
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {}
  }
});
